/* ============================================================================
 * NOTFLIX — Live TV & Sports
 * ----------------------------------------------------------------------------
 *  Sports      → streamed.pk public API (sends CORS:* — fetched directly).
 *  Live TV     → ntv.cx channel directory (~1,800 channels), relayed through
 *                our /api/live proxy (ntv.cx sends no CORS of its own) and
 *                played via the cdnlivetv.tv embed.
 *  Both share one fullscreen live player with a server switcher.
 * ========================================================================== */
(function () {
    'use strict';

    const API = (window.API_BASE || window.location.origin);
    const STREAMED = 'https://streamed.pk';

    const live = {
        tab: 'sports',
        sports: { loaded: false, matches: [], categories: [], filter: 'live' },
        channels: { loaded: false, all: [], country: 'all', query: '' },
        player: { source: 'sports', servers: [], index: 0 },
    };

    /* ─── helpers ─────────────────────────────────────────────────────── */
    const $ = (id) => document.getElementById(id);
    const el = (tag, cls, html) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    };
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // 2-letter ISO country code → flag emoji.
    function flag(code) {
        if (!code || code.length !== 2) return '🌐';
        const cc = code.toUpperCase();
        if (!/^[A-Z]{2}$/.test(cc)) return '🌐';
        return String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
    }

    function timeLabel(ms) {
        if (!ms) return '';
        try {
            const d = new Date(ms);
            const now = Date.now();
            const diff = ms - now;
            if (diff > 0 && diff < 36e5) return `in ${Math.round(diff / 6e4)} min`;
            return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    }
    const isLiveNow = (m) => {
        const t = m.date || 0;
        return t && Math.abs(Date.now() - t) < 3 * 36e5; // within 3h window
    };

    // Older Smart-TV browsers (Tizen / webOS) may lack AbortSignal.timeout —
    // fall back to a manual AbortController so fetches still time out safely.
    function timeoutSignal(ms) {
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
            try { return AbortSignal.timeout(ms); } catch { /* fall through */ }
        }
        if (typeof AbortController !== 'undefined') {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), ms);
            return ctrl.signal;
        }
        return undefined;
    }

    async function getJSON(url, opts) {
        const res = await fetch(url, { signal: timeoutSignal(12000), ...(opts || {}) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    /* ─── view + tab management ───────────────────────────────────────── */
    function loadLiveTvPage() {
        if (window.showView) window.showView('livetv');
        if (window.updateNavLinks) window.updateNavLinks('livetv');
        window.scrollTo(0, 0);
        bindTabs();
        switchTab(live.tab);
    }

    let tabsBound = false;
    function bindTabs() {
        if (tabsBound) return;
        tabsBound = true;
        document.querySelectorAll('.nf-live-tab').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.livetab));
        });
        const search = $('liveChannelSearch');
        if (search) {
            let t;
            search.addEventListener('input', () => {
                clearTimeout(t);
                t = setTimeout(() => { live.channels.query = search.value.trim().toLowerCase(); renderChannels(); }, 180);
            });
        }
        $('livePlayerClose')?.addEventListener('click', closeLivePlayer);
        $('livePlayerBackdrop')?.addEventListener('click', closeLivePlayer);
    }

    function switchTab(tab) {
        live.tab = tab;
        document.querySelectorAll('.nf-live-tab').forEach(b => b.classList.toggle('active', b.dataset.livetab === tab));
        const sports = $('liveSportsPanel'), channels = $('liveChannelsPanel');
        if (sports) sports.hidden = tab !== 'sports';
        if (channels) channels.hidden = tab !== 'channels';
        if (tab === 'sports') ensureSports();
        else ensureChannels();
    }

    /* ─── SPORTS ──────────────────────────────────────────────────────── */
    async function ensureSports() {
        if (live.sports.loaded) { renderSportsFilters(); renderSports(); return; }
        const grid = $('liveSportsGrid');
        if (grid) grid.innerHTML = skeletons(10);
        try {
            const [all, cats] = await Promise.all([
                getJSON(`${STREAMED}/api/matches/all`).catch(() => []),
                getJSON(`${STREAMED}/api/sports`).catch(() => []),
            ]);
            live.sports.matches = Array.isArray(all) ? all : [];
            live.sports.categories = Array.isArray(cats) ? cats : [];
            live.sports.loaded = true;
            renderSportsFilters();
            renderSports();
        } catch (e) {
            if (grid) grid.innerHTML = '';
            showEmpty('liveSportsEmpty', '⚠️', 'Could not load sports right now', 'Please try again in a moment.');
        }
    }

    function renderSportsFilters() {
        const row = $('liveSportsFilters');
        if (!row) return;
        const cats = live.sports.categories;
        const liveCount = live.sports.matches.filter(isLiveNow).length;
        const chips = [
            { id: 'live', label: `🔴 Live Now${liveCount ? ` (${liveCount})` : ''}` },
            { id: 'all', label: 'All Events' },
            ...cats.map(c => ({ id: c.id, label: c.name })),
        ];
        row.innerHTML = '';
        chips.forEach(c => {
            const b = el('button', 'nf-live-chip' + (live.sports.filter === c.id ? ' is-active' : ''), esc(c.label));
            b.type = 'button';
            b.addEventListener('click', () => { live.sports.filter = c.id; renderSportsFilters(); renderSports(); });
            row.appendChild(b);
        });
    }

    function renderSports() {
        const grid = $('liveSportsGrid');
        if (!grid) return;
        let list = live.sports.matches.slice();
        if (live.sports.filter === 'live') list = list.filter(isLiveNow);
        else if (live.sports.filter !== 'all') list = list.filter(m => m.category === live.sports.filter);

        // Live first, then by start time.
        list.sort((a, b) => (isLiveNow(b) - isLiveNow(a)) || (a.date || 0) - (b.date || 0));

        if (!list.length) {
            grid.innerHTML = '';
            showEmpty('liveSportsEmpty', '📅', 'Nothing on right now', 'Check “All Events” for upcoming matches.');
            return;
        }
        hideEmpty('liveSportsEmpty');
        grid.innerHTML = '';
        list.slice(0, 120).forEach(m => grid.appendChild(sportsCard(m)));
    }

    function sportsCard(m) {
        const card = el('button', 'nf-live-card nf-live-card--sport');
        card.type = 'button';
        const liveNow = isLiveNow(m);
        const posterUrl = m.poster ? (STREAMED + m.poster) : '';
        const homeBadge = m.teams?.home?.badge ? `${STREAMED}/api/images/badge/${m.teams.home.badge}.webp` : '';
        const awayBadge = m.teams?.away?.badge ? `${STREAMED}/api/images/badge/${m.teams.away.badge}.webp` : '';

        let media;
        if (posterUrl) {
            media = `<div class="nf-live-card-media"><img loading="lazy" src="${esc(posterUrl)}" alt="" onerror="this.style.display='none'"></div>`;
        } else if (homeBadge || awayBadge) {
            media = `<div class="nf-live-card-media nf-live-card-media--teams">
                ${homeBadge ? `<img loading="lazy" src="${esc(homeBadge)}" alt="">` : '<span></span>'}
                <span class="nf-live-vs">VS</span>
                ${awayBadge ? `<img loading="lazy" src="${esc(awayBadge)}" alt="">` : '<span></span>'}
            </div>`;
        } else {
            media = `<div class="nf-live-card-media nf-live-card-media--plain"><span>${esc((m.category || 'LIVE').toUpperCase())}</span></div>`;
        }

        card.innerHTML = `
            ${media}
            <div class="nf-live-card-body">
                <span class="nf-live-card-cat">${esc(m.category || 'sport')}</span>
                <span class="nf-live-card-title">${esc(m.title || 'Live event')}</span>
                <span class="nf-live-card-meta">${liveNow ? '<span class="nf-live-pill">● LIVE</span>' : esc(timeLabel(m.date))}</span>
            </div>`;
        card.addEventListener('click', () => openSportsMatch(m));
        return card;
    }

    async function openSportsMatch(m) {
        openLivePlayer({ title: m.title || 'Live event', subtitle: (m.category || '').toUpperCase(), source: 'sports' });
        setServerMessage('Finding servers…');
        const sources = Array.isArray(m.sources) ? m.sources : [];
        const servers = [];
        // Each "source" can expose several numbered streams.
        const lists = await Promise.all(sources.map(s =>
            getJSON(`${STREAMED}/api/stream/${s.source}/${s.id}`).catch(() => [])
        ));
        lists.forEach((streams, i) => {
            const src = sources[i];
            (Array.isArray(streams) ? streams : []).forEach(st => {
                if (st.embedUrl) servers.push({
                    url: st.embedUrl,
                    label: `${cap(src.source)} ${st.streamNo}${st.hd ? ' HD' : ''}`,
                    sub: st.language || '',
                });
            });
        });
        if (!servers.length) { setServerMessage('No live servers available for this event yet.'); return; }
        setServers(servers);
    }

    /* ─── LIVE CHANNELS ───────────────────────────────────────────────── */
    async function ensureChannels() {
        if (live.channels.loaded) { renderCountryFilters(); renderChannels(); return; }
        const grid = $('liveChannelsGrid');
        if (grid) grid.innerHTML = skeletons(12);
        try {
            const data = await getJSON(`${API}/api/live?resource=channels`);
            const arr = Array.isArray(data) ? data : (data.channels || data.data || []);
            // De-dupe by name+code, keep entries that have a playable URL.
            const seen = new Set();
            live.channels.all = arr.filter(c => {
                if (!c.channel_url) return false;
                const k = (c.channel_name || '') + '|' + (c.channel_code || '');
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
            live.channels.loaded = true;
            renderCountryFilters();
            renderChannels();
        } catch (e) {
            if (grid) grid.innerHTML = '';
            showEmpty('liveChannelsEmpty', '📡', 'Channels are unavailable', 'The live-TV proxy isn’t reachable right now.');
        }
    }

    function renderCountryFilters() {
        const row = $('liveChannelCountries');
        if (!row) return;
        const counts = {};
        live.channels.all.forEach(c => { const k = (c.channel_code || 'xx').toLowerCase(); counts[k] = (counts[k] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k]) => k);
        const chips = [{ code: 'all', label: '🌐 All' }, ...top.map(c => ({ code: c, label: `${flag(c)} ${c.toUpperCase()}` }))];
        row.innerHTML = '';
        chips.forEach(c => {
            const b = el('button', 'nf-live-chip' + (live.channels.country === c.code ? ' is-active' : ''), esc(c.label));
            b.type = 'button';
            b.addEventListener('click', () => { live.channels.country = c.code; renderCountryFilters(); renderChannels(); });
            row.appendChild(b);
        });
    }

    function renderChannels() {
        const grid = $('liveChannelsGrid');
        if (!grid) return;
        let list = live.channels.all;
        if (live.channels.country !== 'all') list = list.filter(c => (c.channel_code || '').toLowerCase() === live.channels.country);
        if (live.channels.query) list = list.filter(c => (c.channel_name || '').toLowerCase().includes(live.channels.query));

        if (!list.length) {
            grid.innerHTML = '';
            showEmpty('liveChannelsEmpty', '🔍', 'No channels found', 'Try a different search or country.');
            return;
        }
        hideEmpty('liveChannelsEmpty');
        grid.innerHTML = '';
        list.slice(0, 300).forEach(c => grid.appendChild(channelCard(c)));
    }

    function channelCard(c) {
        const card = el('button', 'nf-live-card nf-live-card--channel');
        card.type = 'button';
        const img = c.channel_image
            ? `<img loading="lazy" src="${esc(c.channel_image)}" alt="" onerror="this.parentNode.classList.add('is-fallback');this.remove();">`
            : '';
        card.innerHTML = `
            <div class="nf-live-chan-logo">${img}<span class="nf-live-chan-fallback">${esc((c.channel_name || '?').slice(0, 2).toUpperCase())}</span></div>
            <div class="nf-live-chan-body">
                <span class="nf-live-chan-name">${esc(c.channel_name || 'Channel')}</span>
                <span class="nf-live-chan-meta">${flag(c.channel_code)} ${esc((c.channel_code || '').toUpperCase())}</span>
            </div>`;
        card.addEventListener('click', () => openChannel(c));
        return card;
    }

    function openChannel(c) {
        openLivePlayer({ title: c.channel_name || 'Live channel', subtitle: `${flag(c.channel_code)} ${(c.channel_code || '').toUpperCase()} · ${cap(c.server || 'live')}`, source: 'channel' });
        setServers([{ url: c.channel_url, label: cap(c.server || 'Server 1'), sub: '' }]);
    }

    /* ─── SHARED LIVE PLAYER ──────────────────────────────────────────── */
    function openLivePlayer({ title, subtitle, source }) {
        const modal = $('livePlayerModal');
        if (!modal) return;
        live.player = { source, servers: [], index: 0 };
        $('livePlayerTitle').textContent = title || 'Live';
        $('livePlayerSubtitle').textContent = subtitle || '';
        $('livePlayerFrameWrap').innerHTML = '';
        $('livePlayerServers').innerHTML = '';
        setServerMessage('');
        modal.hidden = false;
        document.body.classList.add('nf-live-modal-open');
    }

    function closeLivePlayer() {
        const modal = $('livePlayerModal');
        if (!modal) return;
        modal.hidden = true;
        $('livePlayerFrameWrap').innerHTML = '';
        document.body.classList.remove('nf-live-modal-open');
    }

    function setServers(servers) {
        live.player.servers = servers;
        renderServerChips();
        playServer(0);
    }

    function renderServerChips() {
        const wrap = $('livePlayerServers');
        if (!wrap) return;
        wrap.innerHTML = '';
        live.player.servers.forEach((s, i) => {
            const b = el('button', 'nf-source-chip' + (i === live.player.index ? ' is-active' : ''));
            b.type = 'button';
            b.innerHTML = `<span class="nf-source-chip-label">${esc(s.label)}${s.sub ? ` · ${esc(s.sub)}` : ''}</span>`;
            b.addEventListener('click', () => playServer(i));
            wrap.appendChild(b);
        });
    }

    let frameTimer = null;
    function playServer(i) {
        const s = live.player.servers[i];
        if (!s) return;
        live.player.index = i;
        renderServerChips();
        const wrap = $('livePlayerFrameWrap');
        if (!wrap) return;
        setServerMessage('Loading stream…');
        wrap.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('referrerpolicy', 'origin');
        iframe.src = s.url;
        iframe.addEventListener('load', () => { clearTimeout(frameTimer); setServerMessage(''); });
        clearTimeout(frameTimer);
        // If it never loads, nudge the user toward another server.
        frameTimer = setTimeout(() => {
            if (live.player.servers.length > 1) setServerMessage('Slow to load? Try another server above.');
            else setServerMessage('');
        }, 9000);
        wrap.appendChild(iframe);
    }

    function setServerMessage(msg) {
        const m = $('livePlayerMessage');
        if (!m) return;
        m.textContent = msg || '';
        m.style.display = msg ? 'flex' : 'none';
    }

    /* ─── tiny UI utils ───────────────────────────────────────────────── */
    function skeletons(n) {
        let s = '';
        for (let i = 0; i < n; i++) s += '<div class="nf-live-card nf-live-skel"></div>';
        return s;
    }
    function showEmpty(id, icon, title, sub) {
        const e = $(id);
        if (!e) return;
        e.hidden = false;
        e.innerHTML = `<div class="nf-live-empty-icon">${icon}</div><p class="nf-live-empty-title">${esc(title)}</p><p class="nf-live-empty-sub">${esc(sub || '')}</p>`;
    }
    function hideEmpty(id) { const e = $(id); if (e) e.hidden = true; }
    const cap = (s) => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

    /* ─── exports ─────────────────────────────────────────────────────── */
    window.loadLiveTvPage = loadLiveTvPage;
    window.closeLivePlayer = closeLivePlayer;

    // Close the live player on Escape / remote Back.
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') &&
            !$('livePlayerModal')?.hidden) {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            closeLivePlayer();
        }
    }, true);
})();
