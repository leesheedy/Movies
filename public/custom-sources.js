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

    // ── settings UI ───────────────────────────────────────────────────────────
    let modal = null;

    function injectStyles() {
        if (document.getElementById('customSourcesStyles')) return;
        const s = document.createElement('style');
        s.id = 'customSourcesStyles';
        s.textContent = `
        #customSourcesModal{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.9);display:flex;align-items:flex-end;justify-content:center}
        #customSourcesModal[hidden]{display:none}
        #customSourcesModal *{box-sizing:border-box}
        #customSourcesModal .cs-modal{background:#141414;width:100%;max-width:640px;max-height:92vh;border-radius:16px 16px 0 0;display:flex;flex-direction:column;box-shadow:0 -8px 40px rgba(0,0,0,.7)}
        #customSourcesModal .cs-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.1);flex:0 0 auto}
        #customSourcesModal .cs-head h3{margin:0;font-size:1.15rem;font-weight:700}
        #customSourcesModal .cs-close{background:rgba(255,255,255,.1);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:1.4rem;line-height:1;cursor:pointer;flex:0 0 auto}
        #customSourcesModal .cs-body{display:flex;flex-direction:column;gap:28px;overflow:auto;padding:18px;-webkit-overflow-scrolling:touch}
        #customSourcesModal .cs-section-title{font-size:.82rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.7;margin:0 0 8px}
        #customSourcesModal .cs-hint{font-size:.82rem;line-height:1.45;opacity:.65;margin:0 0 14px;overflow-wrap:anywhere}
        #customSourcesModal .cs-hint code{background:rgba(255,255,255,.12);padding:1px 5px;border-radius:4px;font-size:.78rem;overflow-wrap:anywhere}
        #customSourcesModal .cs-fields{display:flex;flex-direction:column;gap:10px}
        #customSourcesModal .cs-input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#fff;border-radius:10px;padding:13px 14px;font-size:16px}
        #customSourcesModal .cs-input::placeholder{color:rgba(255,255,255,.4)}
        #customSourcesModal .cs-input:focus{outline:none;border-color:#e50914}
        #customSourcesModal .cs-btn{width:100%;background:#e50914;color:#fff;border:none;border-radius:10px;padding:14px 16px;font-weight:600;cursor:pointer;font-size:.95rem}
        #customSourcesModal .cs-list{display:flex;flex-direction:column;gap:8px;margin-top:14px}
        #customSourcesModal .cs-item{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:11px 13px}
        #customSourcesModal .cs-item .cs-meta{flex:1;min-width:0}
        #customSourcesModal .cs-item .cs-name{font-weight:600;font-size:.9rem;overflow-wrap:anywhere}
        #customSourcesModal .cs-item .cs-url{font-size:.74rem;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #customSourcesModal .cs-x{background:none;border:none;color:#fff;opacity:.65;cursor:pointer;font-size:1.5rem;padding:2px 10px;flex:0 0 auto}
        #customSourcesModal .cs-x:active{opacity:1;color:#e50914}
        #customSourcesModal .cs-empty{font-size:.82rem;opacity:.45;padding:6px 2px}
        #customSourcesModal input.cs-toggle{width:22px;height:22px;accent-color:#e50914;flex:0 0 auto}
        @media(min-width:560px){
          #customSourcesModal{align-items:center}
          #customSourcesModal .cs-modal{border-radius:16px;max-height:86vh}
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

    function renderLists(body) {
        // providers
        const provList = body.querySelector('#csProvList');
        provList.innerHTML = '';
        if (store.providers.length === 0) {
            provList.appendChild(el('div', 'cs-empty', 'No custom providers yet.'));
        }
        store.providers.forEach(p => {
            const item = el('div', 'cs-item');
            const cb = el('input', 'cs-toggle');
            cb.type = 'checkbox';
            cb.checked = p.enabled !== false;
            cb.title = 'Enable / disable';
            cb.onchange = () => toggleProvider(p.id, cb.checked);
            const meta = el('div', 'cs-meta');
            meta.appendChild(el('div', 'cs-name', p.label));
            meta.appendChild(el('div', 'cs-url', p.movie || p.tv || ''));
            const x = el('button', 'cs-x', '×');
            x.title = 'Remove';
            x.onclick = () => { removeProvider(p.id); renderLists(body); };
            item.append(cb, meta, x);
            provList.appendChild(item);
        });

        // per-title overrides
        const ovList = body.querySelector('#csOvList');
        ovList.innerHTML = '';
        const keys = Object.keys(store.overrides);
        if (keys.length === 0) {
            ovList.appendChild(el('div', 'cs-empty', 'No pinned sources yet.'));
        }
        keys.forEach(k => {
            store.overrides[k].forEach((o, i) => {
                const item = el('div', 'cs-item');
                const meta = el('div', 'cs-meta');
                meta.appendChild(el('div', 'cs-name', (o.label || 'My source') + '  ·  ' + k));
                meta.appendChild(el('div', 'cs-url', o.url));
                const x = el('button', 'cs-x', '×');
                x.title = 'Remove';
                x.onclick = () => { removeOverride(k, i); renderLists(body); };
                item.append(meta, x);
                ovList.appendChild(item);
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
