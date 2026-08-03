// ── Custom Sources ─────────────────────────────────────────────────────────
// Lets you add your own playback sources at runtime without editing code.
//
// Two kinds:
//  1. Custom provider — an embed URL *template* that applies to every title.
//     Use placeholders: {tmdbId} {imdbId} {season} {episode}
//     e.g.  https://my-player.example/embed/movie/{tmdbId}
//  2. Per-title source — a specific embed URL pinned to ONE movie/show by its
//     IMDB id (tt1234567) or TMDB id. Paste the exact embed and it shows up as
//     a source only for that title. Templates work here too for TV.
//
// Everything is stored locally in the browser (localStorage), nothing is sent
// anywhere. Exposed as window.NotflixCustomSources.
(function () {
    'use strict';

    const STORAGE_KEY = 'notflix.customSources.v1';

    // ── storage (defensive: TV webviews can throw on localStorage) ──────────
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(STORAGE_KEY); } catch (_) { /* ignore */ }
        if (!raw) return { providers: [], overrides: {} };
        try {
            const data = JSON.parse(raw);
            return {
                providers: Array.isArray(data.providers) ? data.providers : [],
                overrides: (data.overrides && typeof data.overrides === 'object') ? data.overrides : {},
            };
        } catch (_) {
            return { providers: [], overrides: {} };
        }
    }

    function save(data) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) { /* ignore */ }
    }

    let store = load();

    // ── helpers ─────────────────────────────────────────────────────────────
    function slug(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'src';
    }

    // Normalise a title key: keep IMDB ids as-is (tt…), strip everything else to
    // a plain string so TMDB numeric ids match too.
    function normKey(raw) {
        const v = String(raw || '').trim();
        const imdb = v.match(/tt\d{6,}/i);
        if (imdb) return imdb[0].toLowerCase();
        const num = v.match(/\d{2,}/);
        return num ? num[0] : v.toLowerCase();
    }

    function fillTemplate(tpl, ctx) {
        return String(tpl || '')
            .replace(/\{tmdbId\}/g, ctx.tmdbId != null ? ctx.tmdbId : '')
            .replace(/\{imdbId\}/g, ctx.imdbId != null ? ctx.imdbId : '')
            .replace(/\{season\}/g, ctx.season != null ? ctx.season : '')
            .replace(/\{episode\}/g, ctx.episode != null ? ctx.episode : '');
    }

    function isHttpUrl(u) {
        try {
            const p = new URL(u);
            return p.protocol === 'http:' || p.protocol === 'https:';
        } catch (_) { return false; }
    }

    // ── public API consumed by app.js ────────────────────────────────────────

    // Returns STREAM_PROVIDERS-shaped objects for every enabled custom provider,
    // so app.js can merge them straight into activeStreamProviders().
    function getProviders() {
        return store.providers
            .filter(p => p.enabled !== false && (p.movie || p.tv))
            .map(p => ({
                id: 'custom-' + slug(p.id || p.label),
                label: p.label || 'Custom',
                enabled: true,
                custom: true,
                movie: (ctx) => p.movie ? fillTemplate(p.movie, ctx) : '',
                tv: (ctx) => p.tv ? fillTemplate(p.tv, ctx) : '',
            }));
    }

    // Per-title pinned sources → [{ url, label, id }], shown first for that title.
    function getOverrides(ctx) {
        const keys = [normKey(ctx.imdbId), normKey(ctx.tmdbId)].filter(Boolean);
        const seen = new Set();
        const out = [];
        keys.forEach(k => {
            (store.overrides[k] || []).forEach((o, i) => {
                const url = fillTemplate(o.url, ctx);
                if (!url || seen.has(url)) return;
                seen.add(url);
                out.push({ url, label: o.label || 'My source', id: 'pinned-' + k + '-' + i });
            });
        });
        return out;
    }

    // ── mutations (used by the settings UI) ──────────────────────────────────
    function addProvider({ label, movie, tv }) {
        store.providers.push({ id: slug(label) + '-' + Date.now().toString(36), label, movie, tv, enabled: true });
        save(store);
    }
    function removeProvider(id) {
        store.providers = store.providers.filter(p => p.id !== id);
        save(store);
    }
    function toggleProvider(id, enabled) {
        const p = store.providers.find(x => x.id === id);
        if (p) { p.enabled = enabled; save(store); }
    }
    function addOverride(rawKey, { label, url }) {
        const k = normKey(rawKey);
        if (!k) return false;
        if (!store.overrides[k]) store.overrides[k] = [];
        store.overrides[k].push({ label, url });
        save(store);
        return true;
    }
    function removeOverride(key, index) {
        if (!store.overrides[key]) return;
        store.overrides[key].splice(index, 1);
        if (store.overrides[key].length === 0) delete store.overrides[key];
        save(store);
    }
    function updateProvider(id, patch) {
        const p = store.providers.find(x => x.id === id);
        if (!p) return;
        if (patch.label != null) p.label = patch.label;
        if (patch.movie != null) p.movie = patch.movie;
        if (patch.tv != null) p.tv = patch.tv;
        save(store);
    }
    // Edit a pinned source in place, moving it if its title id changed.
    function updateOverride(oldKey, index, { key, label, url }) {
        if (!store.overrides[oldKey] || !store.overrides[oldKey][index]) return false;
        const newKey = normKey(key);
        if (!newKey || !url) return false;
        if (newKey === oldKey) {
            store.overrides[oldKey][index] = { label, url };
        } else {
            store.overrides[oldKey].splice(index, 1);
            if (store.overrides[oldKey].length === 0) delete store.overrides[oldKey];
            if (!store.overrides[newKey]) store.overrides[newKey] = [];
            store.overrides[newKey].push({ label, url });
        }
        save(store);
        return true;
    }

    // ── settings UI ───────────────────────────────────────────────────────────
    let modal = null;

    function injectStyles() {
        if (document.getElementById('customSourcesStyles')) return;
        const s = document.createElement('style');
        s.id = 'customSourcesStyles';
        s.textContent = `
        #customSourcesModal{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.92);display:flex;align-items:stretch;justify-content:center}
        #customSourcesModal[hidden]{display:none}
        #customSourcesModal *{box-sizing:border-box}
        #customSourcesModal .cs-modal{background:#141414;width:100%;max-width:640px;height:100%;display:flex;flex-direction:column}
        #customSourcesModal .cs-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.1);flex:0 0 auto}
        #customSourcesModal .cs-head h3{margin:0;font-size:1.15rem;font-weight:700}
        #customSourcesModal .cs-close{background:rgba(255,255,255,.1);border:none;color:#fff;width:38px;height:38px;border-radius:50%;font-size:1.5rem;line-height:1;cursor:pointer;flex:0 0 auto}
        #customSourcesModal .cs-body{flex:1 1 auto;display:flex;flex-direction:column;gap:30px;overflow-y:auto;padding:18px 18px calc(48px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
        #customSourcesModal .cs-section-title{font-size:.82rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.7;margin:0 0 8px}
        #customSourcesModal .cs-hint{font-size:.82rem;line-height:1.45;opacity:.65;margin:0 0 14px;overflow-wrap:anywhere}
        #customSourcesModal .cs-hint code{background:rgba(255,255,255,.12);padding:1px 5px;border-radius:4px;font-size:.78rem;overflow-wrap:anywhere}
        #customSourcesModal .cs-fields{display:flex;flex-direction:column;gap:10px}
        #customSourcesModal .cs-input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#fff;border-radius:10px;padding:13px 14px;font-size:16px}
        #customSourcesModal .cs-input::placeholder{color:rgba(255,255,255,.4)}
        #customSourcesModal .cs-input:focus{outline:none;border-color:#e50914}
        #customSourcesModal .cs-btn{width:100%;background:#e50914;color:#fff;border:none;border-radius:10px;padding:14px 16px;font-weight:600;cursor:pointer;font-size:.95rem}
        #customSourcesModal .cs-list{display:flex;flex-direction:column;gap:12px;margin-top:16px}
        #customSourcesModal .cs-card{display:flex;flex-direction:column;gap:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:13px}
        #customSourcesModal .cs-card .cs-input{background:rgba(255,255,255,.06);padding:11px 12px}
        #customSourcesModal .cs-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;opacity:.5;margin:2px 0 -3px}
        #customSourcesModal .cs-card-actions{display:flex;align-items:center;gap:8px;margin-top:4px}
        #customSourcesModal .cs-toggle-wrap{display:flex;align-items:center;gap:8px;margin-right:auto;font-size:.85rem;opacity:.85}
        #customSourcesModal input.cs-toggle{width:22px;height:22px;accent-color:#e50914;flex:0 0 auto}
        #customSourcesModal .cs-mini{flex:0 0 auto;width:auto;border:none;border-radius:9px;padding:10px 16px;font-weight:600;font-size:.85rem;cursor:pointer}
        #customSourcesModal .cs-save{background:#e50914;color:#fff}
        #customSourcesModal .cs-del{background:rgba(229,9,20,.14);color:#ff7a7a;border:1px solid rgba(229,9,20,.4)}
        #customSourcesModal .cs-empty{font-size:.82rem;opacity:.45;padding:6px 2px}
        @media(min-width:560px){
          #customSourcesModal{align-items:center;padding:20px}
          #customSourcesModal .cs-modal{height:auto;max-height:88vh;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.7)}
        }
        `;
        document.head.appendChild(s);
    }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    // small labelled input for edit cards
    function field(labelText, value, placeholder) {
        const wrap = document.createElement('div');
        if (labelText) wrap.appendChild(el('div', 'cs-label', labelText));
        const input = el('input', 'cs-input');
        input.value = value || '';
        if (placeholder) input.placeholder = placeholder;
        wrap.appendChild(input);
        return { wrap, input };
    }

    function renderLists(body) {
        // ── custom providers ──
        const provList = body.querySelector('#csProvList');
        provList.innerHTML = '';
        if (store.providers.length === 0) {
            provList.appendChild(el('div', 'cs-empty', 'No custom providers yet.'));
        }
        store.providers.forEach(p => {
            const card = el('div', 'cs-card');
            const name = field('Name', p.label, 'Name');
            const movie = field('Movie template', p.movie, 'https://…/{tmdbId}');
            const tv = field('TV template', p.tv, 'https://…/{tmdbId}/{season}/{episode}');

            const actions = el('div', 'cs-card-actions');
            const toggleWrap = el('label', 'cs-toggle-wrap');
            const cb = el('input', 'cs-toggle');
            cb.type = 'checkbox';
            cb.checked = p.enabled !== false;
            cb.onchange = () => toggleProvider(p.id, cb.checked);
            toggleWrap.append(cb, document.createTextNode('Enabled'));

            const save = el('button', 'cs-mini cs-save', 'Save');
            save.onclick = () => {
                const label = name.input.value.trim();
                const mv = movie.input.value.trim();
                const tvv = tv.input.value.trim();
                if (!label) return toast('Give the provider a name.', 'error');
                if (!mv && !tvv) return toast('Add at least a movie or TV template.', 'error');
                if (mv && !isHttpUrl(mv.replace(/\{[^}]+\}/g, '1'))) return toast('Movie template is not a valid URL.', 'error');
                if (tvv && !isHttpUrl(tvv.replace(/\{[^}]+\}/g, '1'))) return toast('TV template is not a valid URL.', 'error');
                updateProvider(p.id, { label, movie: mv, tv: tvv });
                toast('Saved.', 'success');
            };
            const del = el('button', 'cs-mini cs-del', 'Delete');
            del.onclick = () => { removeProvider(p.id); renderLists(body); };

            actions.append(toggleWrap, save, del);
            card.append(name.wrap, movie.wrap, tv.wrap, actions);
            provList.appendChild(card);
        });

        // ── per-title pinned sources ──
        const ovList = body.querySelector('#csOvList');
        ovList.innerHTML = '';
        const keys = Object.keys(store.overrides);
        if (keys.length === 0) {
            ovList.appendChild(el('div', 'cs-empty', 'No pinned sources yet.'));
        }
        keys.forEach(k => {
            store.overrides[k].forEach((o, i) => {
                const card = el('div', 'cs-card');
                const idF = field('IMDB / TMDB id', k, 'tt1234567 or TMDB id');
                const labelF = field('Label', o.label, 'Label (optional)');
                const urlF = field('Embed URL', o.url, 'Paste embed URL');

                const actions = el('div', 'cs-card-actions');
                const spacer = el('div', 'cs-toggle-wrap'); // pushes buttons right
                const save = el('button', 'cs-mini cs-save', 'Save');
                save.onclick = () => {
                    const key = idF.input.value.trim();
                    const label = labelF.input.value.trim();
                    const url = urlF.input.value.trim();
                    if (!key) return toast('Enter an IMDB or TMDB id.', 'error');
                    if (!url) return toast('Paste an embed URL.', 'error');
                    if (!isHttpUrl(url.replace(/\{[^}]+\}/g, '1'))) return toast('That embed URL is not valid.', 'error');
                    updateOverride(k, i, { key, label, url });
                    renderLists(body); // key may have changed, re-render
                    toast('Saved.', 'success');
                };
                const del = el('button', 'cs-mini cs-del', 'Delete');
                del.onclick = () => { removeOverride(k, i); renderLists(body); };

                actions.append(spacer, save, del);
                card.append(idF.wrap, labelF.wrap, urlF.wrap, actions);
                ovList.appendChild(card);
            });
        });
    }

    function toast(msg, type) {
        if (typeof window.showToast === 'function') { window.showToast(msg, type || 'info', 2600); }
        else { console.log('[custom-sources]', msg); }
    }

    function build() {
        injectStyles();
        modal = el('div', 'nf-modal-backdrop');
        modal.id = 'customSourcesModal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.hidden = true;
        modal.innerHTML = `
          <div class="cs-modal">
            <div class="cs-head">
              <h3>Custom sources</h3>
              <button class="cs-close" type="button" aria-label="Close" id="csClose">×</button>
            </div>
            <div class="cs-body">
              <div>
                <div class="cs-section-title">Add a provider (applies to everything)</div>
                <p class="cs-hint">Paste an embed URL template. Use <code>{tmdbId}</code>, <code>{imdbId}</code>, <code>{season}</code>, <code>{episode}</code> as placeholders.</p>
                <div class="cs-fields">
                  <input class="cs-input" id="csProvLabel" placeholder="Name (e.g. My Player)" />
                  <input class="cs-input" id="csProvMovie" placeholder="Movie template — https://…/{tmdbId}" />
                  <input class="cs-input" id="csProvTv" placeholder="TV template (optional) — https://…/{tmdbId}/{season}/{episode}" />
                  <button class="cs-btn" id="csAddProv">Add provider</button>
                </div>
                <div class="cs-list" id="csProvList"></div>
              </div>
              <div>
                <div class="cs-section-title">Pin a source to one title</div>
                <p class="cs-hint">Enter the title's IMDB id (<code>tt1234567</code>) or TMDB id, then paste the exact embed. Shows as a source for that title only.</p>
                <div class="cs-fields">
                  <input class="cs-input" id="csOvId" placeholder="tt1234567 or TMDB id" inputmode="text" />
                  <input class="cs-input" id="csOvLabel" placeholder="Label (optional)" />
                  <input class="cs-input" id="csOvUrl" placeholder="Paste embed URL" />
                  <button class="cs-btn" id="csAddOv">Pin source</button>
                </div>
                <div class="cs-list" id="csOvList"></div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);

        const body = modal;
        modal.querySelector('#csClose').onclick = close;
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

        // On mobile the on-screen keyboard can cover the focused field. Scroll it
        // to the middle once the keyboard has had time to animate in.
        const scroller = modal.querySelector('.cs-body');
        scroller.addEventListener('focusin', (e) => {
            const t = e.target;
            if (t && t.classList && t.classList.contains('cs-input')) {
                setTimeout(() => { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }, 280);
            }
        });

        modal.querySelector('#csAddProv').onclick = () => {
            const label = modal.querySelector('#csProvLabel').value.trim();
            const movie = modal.querySelector('#csProvMovie').value.trim();
            const tv = modal.querySelector('#csProvTv').value.trim();
            if (!label) return toast('Give the provider a name.', 'error');
            if (!movie && !tv) return toast('Add at least a movie or TV template.', 'error');
            if (movie && !isHttpUrl(movie.replace(/\{[^}]+\}/g, '1'))) return toast('Movie template is not a valid URL.', 'error');
            if (tv && !isHttpUrl(tv.replace(/\{[^}]+\}/g, '1'))) return toast('TV template is not a valid URL.', 'error');
            addProvider({ label, movie, tv });
            modal.querySelector('#csProvLabel').value = '';
            modal.querySelector('#csProvMovie').value = '';
            modal.querySelector('#csProvTv').value = '';
            renderLists(body);
            toast('Provider added.', 'success');
        };

        modal.querySelector('#csAddOv').onclick = () => {
            const id = modal.querySelector('#csOvId').value.trim();
            const label = modal.querySelector('#csOvLabel').value.trim();
            const url = modal.querySelector('#csOvUrl').value.trim();
            if (!id) return toast('Enter an IMDB or TMDB id.', 'error');
            if (!url) return toast('Paste an embed URL.', 'error');
            if (!isHttpUrl(url.replace(/\{[^}]+\}/g, '1'))) return toast('That embed URL is not valid.', 'error');
            addOverride(id, { label, url });
            modal.querySelector('#csOvId').value = '';
            modal.querySelector('#csOvLabel').value = '';
            modal.querySelector('#csOvUrl').value = '';
            renderLists(body);
            toast('Source pinned.', 'success');
        };

        renderLists(body);
    }

    function open() {
        if (!modal) build();
        // Close the profile settings modal if it launched us, so they don't stack.
        const profile = document.getElementById('profileSettingsModal');
        if (profile && !profile.hidden) profile.hidden = true;
        renderLists(modal);
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }
    function close() {
        if (modal) modal.hidden = true;
        document.body.style.overflow = '';
    }

    // Launcher: add a button into the profile settings modal if present,
    // otherwise a discreet floating button.
    function mountLauncher() {
        const form = document.getElementById('profileSettingsForm');
        if (form && !document.getElementById('csOpenFromSettings')) {
            const row = el('div', 'nf-settings-field');
            row.style.gridColumn = '1 / -1';
            const btn = el('button', 'nf-settings-input', 'Manage custom sources');
            btn.id = 'csOpenFromSettings';
            btn.type = 'button';
            btn.style.cssText = 'cursor:pointer;text-align:left;background:rgba(255,255,255,.08)';
            btn.onclick = open;
            row.appendChild(btn);
            form.appendChild(row);
            return;
        }
        if (!document.getElementById('csFloatBtn')) {
            const fb = el('button', null, 'Sources');
            fb.id = 'csFloatBtn';
            fb.type = 'button';
            fb.title = 'Custom sources';
            fb.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:9000;background:#e50914;color:#fff;border:none;border-radius:20px;padding:9px 16px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4);opacity:.85';
            fb.onclick = open;
            document.body.appendChild(fb);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountLauncher);
    } else {
        mountLauncher();
    }

    window.NotflixCustomSources = {
        getProviders,
        getOverrides,
        open,
        close,
        _store: () => store,
    };
})();
