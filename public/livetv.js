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
    // WatchFooty API — direct match data + per-match streams. We play the streams
    // in a real HLS player (Clappr), so there is NO embed iframe = no pop-under
    // ads / "verify you're human" gate, and it bypasses the DNS-blocked embed.st.
    const WF_BASE = 'https://api.watchfooty.st';
    const WF = WF_BASE + '/api/v1';
    // SportSRC — same catalog on a DIFFERENT embed host (embed.streamapi.cc), used
    // as fallback servers so a blocked WatchFooty host isn't a dead end.
    const SPORTSRC = 'https://api.sportsrc.org';
    const wfImg = (p) => (p ? (/^https?:/i.test(p) ? p : WF_BASE + p) : '');
    const wfIsLive = (m) => {
        if (!m) return false;
        const s = String(m.status || '').toLowerCase();
        if (/^(pre|post|post-final|postponed|cancell?ed|final|ft)$/.test(s)) return false;
        // WatchFooty marks in-progress games "in"; period labels ("3rd quarter",
        // "1st half", "break time", …) are live too.
        return s === 'in' || (typeof m.currentMinuteNumber === 'number' && m.currentMinuteNumber >= 0)
            || /quarter|half|period|inning|set\b|break|overtime|extra|interrupt|live/.test(s);
    };

    const live = {
        tab: 'sports',
        sports: { loaded: false, matches: [], categories: [], filter: 'live' },
        // Default the live-TV country to Australia (this app's home region).
        channels: { loaded: false, all: [], country: 'au', category: 'all', query: '' },
        player: { source: 'sports', servers: [], index: 0 },
    };

    // Infer a rough genre/category for a channel from its name (there's no EPG
    // category in the feed). Used to power the "TV guide" quick-select.
    // Strong keywords (sport/news/movie/kids/music) match as substrings so
    // plurals and prefixes work ("Fox Sports", "9News", "ABC Kids"); short
    // ambiguous abbreviations keep \b boundaries to avoid false positives.
    const CATEGORY_RULES = [
        ['sports',   /(sport|espn|bein|dazn|\bnba\b|\bnfl\b|\bnhl\b|\bmlb\b|\bufc\b|\bwwe\b|golf|tennis|cricket|rugby|eurosport|boxing|kayo|footy|motogp|\bf1\b)/i],
        ['news',     /(news|cnn|msnbc|jazeera|bloomberg|cnbc|euronews)/i],
        ['movies',   /(movie|cinema|cinemax|\bhbo\b|starz|showtime|\bfilm|\bmgm\b|\btcm\b|epix)/i],
        ['kids',     /(kids|cartoon|disney|nick|junior|boomerang|cbeebies|cartoonito|baby)/i],
        ['music',    /(music|\bmtv\b|vevo|\bvh1\b|\bcmt\b|trace)/i],
        ['docs',     /(discovery|history|nat ?geo|geographic|animal ?planet|documentary|smithsonian)/i],
        ['ent',      /(comedy|drama|bravo|\btlc\b|lifetime|\bfx\b|\bamc\b|peacock|hallmark|syfy|reality)/i],
    ];
    function inferCategory(name) {
        const n = String(name || '');
        for (const [cat, re] of CATEGORY_RULES) if (re.test(n)) return cat;
        return 'general';
    }
    const CATEGORY_LABELS = {
        all: '📺 All', sports: '⚽ Sports', news: '📰 News', movies: '🎬 Movies',
        ent: '🎭 Entertainment', kids: '🧒 Kids', music: '🎵 Music', docs: '🌍 Docs', general: '📡 General',
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
        initLiveCast();
    }

    /* ─── cast / AirPlay for the live player ──────────────────────────── */
    function initLiveCast() {
        const btn = $('livePlayerCast');
        const panel = $('livePlayerCastPanel');
        if (!btn || !panel || btn._wired) return;
        btn._wired = true;
        const toast = (m) => { if (window.showToast) window.showToast(m, 'info', 2400); };
        const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
        // Use the app's allowance-aware opener so the built-in pop-up blocker
        // doesn't mistake this user-initiated cast for an ad pop-up.
        const openExt = (url) => { if (window.openExternalUrl) return window.openExternalUrl(url); return window.open(url, '_blank', 'noopener'); };

        // A direct HLS stream (Clappr) can be cast/AirPlayed; embeds can't.
        const isDirect = () => live.player.castKind === 'hls' && !!live.player.currentUrl;
        const clapprVideo = () => document.querySelector('#clapprMount video');

        // Reflect Cast session state + reveal AirPlay only when a target exists.
        const airBtn = $('liveCastAirplay');
        if (window.NotflixCast) {
            NotflixCast.onState(s => btn.classList.toggle('casting', s === 'connected'));
        }
        // Wire AirPlay availability against whichever <video> Clappr mounts.
        function wireAirplayAvailability(v) {
            if (!v || v._airWired || typeof v.webkitShowPlaybackTargetPicker !== 'function') return;
            v._airWired = true;
            v.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
                btn.classList.toggle('casting', !!v.webkitCurrentPlaybackTargetIsWireless);
            });
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = panel.hidden;
            panel.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
            if (open) {
                const url = live.player.currentUrl || '';
                const qr = $('liveCastQr');
                if (qr && url) qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=ffffff&bgcolor=1a1a1a&data=${encodeURIComponent(url)}`;
                wireAirplayAvailability(clapprVideo());
            }
        });
        document.addEventListener('click', (e) => {
            if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) close();
        });

        $('liveCastNewTab')?.addEventListener('click', () => {
            if (live.player.currentUrl) openExt(live.player.currentUrl);
            close();
        });
        $('liveCastCopy')?.addEventListener('click', async () => {
            const url = live.player.currentUrl;
            if (url) {
                try { await navigator.clipboard.writeText(url); toast('Stream link copied'); }
                catch { openExt(url); }
            }
            close();
        });

        $('liveCastChromecast')?.addEventListener('click', async () => {
            close();
            const url = live.player.currentUrl;
            if (!url) return;

            // Already casting → stop.
            if (window.NotflixCast && NotflixCast.connected()) { NotflixCast.stop(); toast('Stopped casting'); return; }

            // Direct HLS → load straight onto the Chromecast as a LIVE stream.
            if (window.NotflixCast && NotflixCast.ready() && isDirect()) {
                const title = $('livePlayerTitle')?.textContent || 'Live';
                const subtitle = $('livePlayerSubtitle')?.textContent || '';
                try {
                    await NotflixCast.castUrl({ url, title, subtitle, live: true });
                    toast('Casting to your TV');
                    return;
                } catch (err) {
                    if (err && err.code === 'cancel') return;
                    console.warn('[LiveCast] Cast SDK:', err);
                }
            }
            // Embed stream (cross-origin iframe) — open standalone so the user can
            // use the player's own cast control.
            if (isDirect()) toast('No Cast device found — check it\'s on the same Wi‑Fi');
            else { toast('Opening the stream so you can cast from the player'); openExt(url); }
        });

        $('liveCastAirplay')?.addEventListener('click', () => {
            close();
            const v = clapprVideo();
            if (isDirect() && v && typeof v.webkitShowPlaybackTargetPicker === 'function') {
                try { v.webkitShowPlaybackTargetPicker(); return; }
                catch (e) { console.warn('[LiveCast] AirPlay:', e); }
            }
            // Embeds / no native control → open standalone for Safari's AirPlay.
            toast('Tap the AirPlay icon inside the player that opens');
            if (live.player.currentUrl) openExt(live.player.currentUrl);
        });
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
            const [all, sports] = await Promise.all([
                getJSON(`${WF}/matches/all`).catch(() => []),
                getJSON(`${WF}/sports`).catch(() => []),
            ]);
            live.sports.matches = Array.isArray(all) ? all : [];
            live.sports.categories = (Array.isArray(sports) ? sports : [])
                .map(s => ({ id: s.name, label: s.displayName || cap(s.name) }));
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
        const liveCount = live.sports.matches.filter(wfIsLive).length;
        const chips = [
            { id: 'live', label: `🔴 Live Now${liveCount ? ` (${liveCount})` : ''}` },
            { id: 'all', label: 'All Events' },
            ...live.sports.categories.map(c => ({ id: c.id, label: c.label })),
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
        if (live.sports.filter === 'live') list = list.filter(wfIsLive);
        else if (live.sports.filter !== 'all') list = list.filter(m => m.sport === live.sports.filter);

        // Live first, then nearest start time.
        const now = Date.now();
        list.sort((a, b) => (wfIsLive(b) - wfIsLive(a))
            || Math.abs((a.timestamp || 0) - now) - Math.abs((b.timestamp || 0) - now));

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
        const liveNow = wfIsLive(m);
        const poster = wfImg(m.poster);
        const homeLogo = wfImg(m.teams && m.teams.home && m.teams.home.logoUrl);
        const awayLogo = wfImg(m.teams && m.teams.away && m.teams.away.logoUrl);

        let media;
        if (homeLogo || awayLogo) {
            media = `<div class="nf-live-card-media nf-live-card-media--teams">
                ${homeLogo ? `<img loading="lazy" src="${esc(homeLogo)}" alt="" onerror="this.style.visibility='hidden'">` : '<span></span>'}
                <span class="nf-live-vs">VS</span>
                ${awayLogo ? `<img loading="lazy" src="${esc(awayLogo)}" alt="" onerror="this.style.visibility='hidden'">` : '<span></span>'}
            </div>`;
        } else if (poster) {
            media = `<div class="nf-live-card-media"><img loading="lazy" src="${esc(poster)}" alt="" onerror="this.style.display='none'"></div>`;
        } else {
            media = `<div class="nf-live-card-media nf-live-card-media--plain"><span>${esc((m.sport || 'LIVE').toUpperCase())}</span></div>`;
        }
        const meta = liveNow
            ? `<span class="nf-live-pill">● LIVE${m.currentMinute && m.currentMinute.trim() ? ' ' + esc(m.currentMinute.trim()) : ''}</span>`
            : esc(timeLabel(m.timestamp));
        card.innerHTML = `
            ${media}
            <div class="nf-live-card-body">
                <span class="nf-live-card-cat">${esc(m.league || m.sport || 'sport')}</span>
                <span class="nf-live-card-title">${esc(m.title || 'Live event')}</span>
                <span class="nf-live-card-meta">${meta}</span>
            </div>`;
        card.addEventListener('click', () => openSportsMatch(m));
        return card;
    }

    // Pull a playable URL out of a WatchFooty stream object (its exact shape can't
    // be inspected off-air, so check every likely field), then tag it HLS (played
    // directly in Clappr — no iframe, no popup) vs an embed page (iframe fallback).
    function wfStreamToServer(st, i) {
        if (!st) return null;
        const url = typeof st === 'string' ? st
            : (st.url || st.streamUrl || st.m3u8 || st.hls || st.file || st.src || st.embedUrl || st.link || st.iframe || st.source || '');
        if (!url || !/^https?:\/\//i.test(url)) return null;
        const isHls = /\.m3u8(\?|#|$)/i.test(url) || /m3u8/i.test(url) || st.type === 'hls' || st.format === 'hls';
        return {
            url, kind: isHls ? 'hls' : 'iframe',
            label: (typeof st === 'object' && (st.name || st.server || st.title || st.quality)) || `Server ${i + 1}`,
            sub: (typeof st === 'object' && (st.language || (st.hd ? 'HD' : ''))) || '',
        };
    }

    // Significant words of a title (drop "vs"/short connectors) for fuzzy matching.
    function titleWords(t) {
        return String(t || '').toLowerCase()
            .replace(/\b(vs?|at|the|and)\b/g, ' ')
            .replace(/[^a-z0-9 ]+/g, ' ')
            .split(/\s+/).filter(w => w.length > 2);
    }

    // Find the SAME match on SportSRC (by sport + title) and return its streams on
    // the embed.streamapi.cc host as fallback servers. Best-effort; [] on any miss.
    async function fetchSportsrcFallback(m) {
        const sport = m.sport;
        const want = titleWords(m.title);
        if (!sport || want.length < 2) return [];
        let list = [];
        try {
            const r = await getJSON(`${SPORTSRC}/?data=matches&category=${encodeURIComponent(sport)}`);
            list = (r && (r.data || r)) || [];
        } catch (e) { return []; }
        if (!Array.isArray(list) || !list.length) return [];
        let best = null, bestScore = 0;
        list.forEach(sm => {
            const words = new Set(titleWords(sm.title));
            const score = want.filter(w => words.has(w)).length;
            if (score > bestScore) { bestScore = score; best = sm; }
        });
        if (!best || bestScore < 2) return [];        // need >=2 shared words (team names)
        let detail = null;
        try { detail = await getJSON(`${SPORTSRC}/?data=detail&category=${encodeURIComponent(sport)}&id=${encodeURIComponent(best.id)}`); } catch (e) { return []; }
        const d = detail && (detail.data || detail);
        const sources = (d && Array.isArray(d.sources)) ? d.sources : [];
        return sources.map((st, i) => {
            const url = st.embedUrl || st.url || '';
            if (!url || !/^https?:\/\//i.test(url)) return null;
            const isHls = /\.m3u8(\?|#|$)/i.test(url) || /m3u8/i.test(url);
            return {
                url, kind: isHls ? 'hls' : 'iframe',
                label: `Alt ${cap(st.source || ('Server ' + (i + 1)))}${st.hd ? ' HD' : ''}`,
                sub: st.language || '',
            };
        }).filter(Boolean);
    }

    async function openSportsMatch(m) {
        openLivePlayer({ title: m.title || 'Live event', subtitle: (m.league || m.sport || '').toUpperCase(), source: 'sports' });
        setServerMessage('Finding streams…');
        // Pull WatchFooty streams and the SportSRC fallback (different host) together.
        const [detail, srcServers] = await Promise.all([
            getJSON(`${WF}/match/${m.matchId}`).catch(() => null),
            fetchSportsrcFallback(m).catch(() => []),
        ]);
        const streams = (detail && Array.isArray(detail.streams)) ? detail.streams : [];
        const servers = streams.map(wfStreamToServer).filter(Boolean).concat(srcServers || []);
        if (!servers.length) {
            setServerMessage(wfIsLive(m)
                ? 'No stream available for this match yet — refresh shortly.'
                : 'Streams appear once the match goes live.');
            return;
        }
        // Gate the first load behind a tap so HLS audio starts with sound.
        setServers(servers, { gate: true });
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
            }).map(c => ({ ...c, _cat: inferCategory(c.channel_name) }));
            // If Australia has no channels, fall back to showing all countries.
            const auCount = live.channels.all.filter(c => (c.channel_code || '').toLowerCase() === 'au').length;
            if (live.channels.country === 'au' && auCount === 0) live.channels.country = 'all';
            live.channels.loaded = true;
            renderCategoryFilters();
            renderCountryFilters();
            renderChannels();
        } catch (e) {
            if (grid) grid.innerHTML = '';
            showEmpty('liveChannelsEmpty', '📡', 'Channels are unavailable', 'The live-TV proxy isn’t reachable right now.');
        }
    }

    // Category quick-select — the "TV guide" rail.
    function renderCategoryFilters() {
        const row = $('liveChannelCategories');
        if (!row) return;
        // Count categories within the current country scope.
        const scope = live.channels.country === 'all'
            ? live.channels.all
            : live.channels.all.filter(c => (c.channel_code || '').toLowerCase() === live.channels.country);
        const counts = {};
        scope.forEach(c => { counts[c._cat] = (counts[c._cat] || 0) + 1; });
        const order = ['all', 'sports', 'news', 'movies', 'ent', 'kids', 'music', 'docs', 'general'];
        const cats = order.filter(k => k === 'all' || counts[k]);
        row.innerHTML = '';
        cats.forEach(k => {
            const n = k === 'all' ? scope.length : counts[k];
            const b = el('button', 'nf-live-chip' + (live.channels.category === k ? ' is-active' : ''),
                `${esc(CATEGORY_LABELS[k] || k)}${n ? ` <span class="nf-live-chip-count">${n}</span>` : ''}`);
            b.type = 'button';
            b.addEventListener('click', () => { live.channels.category = k; renderCategoryFilters(); renderChannels(); });
            row.appendChild(b);
        });
    }

    function renderCountryFilters() {
        const row = $('liveChannelCountries');
        if (!row) return;
        const counts = {};
        live.channels.all.forEach(c => { const k = (c.channel_code || 'xx').toLowerCase(); counts[k] = (counts[k] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k]) => k);
        // Always offer Australia up front (this app's home region).
        if (!top.includes('au') && counts['au']) top.unshift('au');
        const chips = [{ code: 'all', label: '🌐 All' }, ...top.map(c => ({ code: c, label: `${flag(c)} ${c.toUpperCase()}` }))];
        row.innerHTML = '';
        chips.forEach(c => {
            const b = el('button', 'nf-live-chip' + (live.channels.country === c.code ? ' is-active' : ''), esc(c.label));
            b.type = 'button';
            b.addEventListener('click', () => {
                live.channels.country = c.code;
                live.channels.category = 'all';
                renderCategoryFilters(); renderCountryFilters(); renderChannels();
            });
            row.appendChild(b);
        });
    }

    function renderChannels() {
        const grid = $('liveChannelsGrid');
        if (!grid) return;
        let list = live.channels.all;
        if (live.channels.country !== 'all') list = list.filter(c => (c.channel_code || '').toLowerCase() === live.channels.country);
        if (live.channels.category !== 'all') list = list.filter(c => c._cat === live.channels.category);
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
        releaseLiveFrame();
        $('livePlayerServers').innerHTML = '';
        setServerMessage('');
        modal.hidden = false;
        document.body.classList.add('nf-live-modal-open');
        // On a TV (D-pad, no pointer) nothing inside the modal is focused yet, so
        // the first OK/Back press would land on the card behind the overlay. Park
        // focus on the Close button until a server chip / play-gate takes over.
        requestAnimationFrame(() => {
            try {
                ($('livePlayerServers')?.querySelector('button') || $('livePlayerClose'))?.focus();
            } catch (e) { /* ignore */ }
        });
    }

    // Fully release the live embed: blank its src so old webOS Chromium tears the
    // HLS/MSE decoder + sockets down promptly (innerHTML='' alone can leave them
    // lingering toward OOM), then drop the node and cancel any pending nudge timer.
    function releaseLiveFrame() {
        destroyClappr();
        const wrap = $('livePlayerFrameWrap');
        if (wrap) {
            const f = wrap.querySelector('iframe');
            if (f) { try { f.src = 'about:blank'; } catch (e) { /* ignore */ } f.remove(); }
            wrap.innerHTML = '';
        }
        clearTimeout(frameTimer);
        frameTimer = null;
    }

    function closeLivePlayer() {
        const modal = $('livePlayerModal');
        if (!modal) return;
        modal.hidden = true;
        releaseLiveFrame();
        const castPanel = $('livePlayerCastPanel');
        if (castPanel) castPanel.hidden = true;
        document.body.classList.remove('nf-live-modal-open');
    }

    function setServers(servers, opts) {
        live.player.servers = servers;
        renderServerChips();
        playServer(0, opts);
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
    function playServer(i, opts) {
        const s = live.player.servers[i];
        if (!s) return;
        live.player.index = i;
        live.player.currentUrl = s.url;
        live.player.castKind = s.kind;   // 'hls' = direct stream we can cast; else iframe embed
        renderServerChips();
        const wrap = $('livePlayerFrameWrap');
        if (!wrap) return;
        // AUDIO: sports embeds (embed.st) use an autostart player. Browsers only
        // allow a cross-origin iframe to autoplay WITH SOUND when the iframe is
        // created during a live user gesture. Sports servers are fetched async,
        // so by the time we get here the click that opened the player has
        // expired → the embed is forced to play muted. Gating the first load
        // behind a "Tap to play" button means the iframe is created from that
        // tap's own gesture, so the stream keeps its audio. Channels and server
        // switches already run inside a live click, so they load immediately.
        if (opts && opts.gate) showPlayGate(wrap, s);
        else playByKind(wrap, s);
    }

    // HLS streams play in Clappr (no iframe → no pop-under / robot gate); embed
    // pages fall back to the iframe.
    function playByKind(wrap, s) {
        if (s && s.kind === 'hls') loadHls(wrap, s);
        else loadFrame(wrap, s);
    }

    /* ─── Clappr direct (HLS) player ──────────────────────────────────────── */
    let clapprPlayer = null;
    let clapprLoading = null;
    function destroyClappr() {
        if (clapprPlayer) { try { clapprPlayer.destroy(); } catch (e) { /* ignore */ } clapprPlayer = null; }
    }
    function ensureClappr() {
        if (window.Clappr) return Promise.resolve(window.Clappr);
        if (clapprLoading) return clapprLoading;
        clapprLoading = new Promise((resolve, reject) => {
            const sc = document.createElement('script');
            sc.src = 'https://cdn.jsdelivr.net/npm/clappr@0.4.7/dist/clappr.min.js';
            sc.async = true;
            sc.onload = () => resolve(window.Clappr);
            sc.onerror = () => { clapprLoading = null; reject(new Error('Clappr load failed')); };
            document.head.appendChild(sc);
        });
        return clapprLoading;
    }
    async function loadHls(wrap, s) {
        setServerMessage('Loading stream…');
        destroyClappr();
        const old = wrap.querySelector('iframe');
        if (old) { try { old.src = 'about:blank'; } catch (e) { /* ignore */ } old.remove(); }
        wrap.innerHTML = '<div id="clapprMount" style="width:100%;height:100%"></div>';
        clearTimeout(frameTimer);
        let played = false;
        frameTimer = setTimeout(() => {
            if (!played) setServerMessage(live.player.servers.length > 1
                ? 'Slow to start? Try another server above.' : 'Stream may be offline.');
        }, 12000);
        try {
            const Clappr = await ensureClappr();
            if ($('livePlayerModal')?.hidden) { destroyClappr(); return; }   // closed mid-load
            clapprPlayer = new Clappr.Player({
                source: s.url,
                parentId: '#clapprMount',
                width: '100%', height: '100%',
                autoPlay: true, mute: false, hideMediaControlDelay: 1500,
            });
            const onPlay = () => { played = true; clearTimeout(frameTimer); setServerMessage(''); };
            clapprPlayer.on(Clappr.Events.PLAYER_PLAY, onPlay);
            clapprPlayer.on(Clappr.Events.PLAYER_ERROR, () => {
                setServerMessage(live.player.servers.length > 1
                    ? 'This stream failed — try another server above.' : 'Stream unavailable.');
            });
        } catch (e) {
            setServerMessage('Player failed to load — check your connection.');
        }
    }

    function loadFrame(wrap, s) {
        // The stream URL comes from aggregated third-party feeds we don't control.
        // Only ever frame http(s) — a javascript:/data: src would be a script-exec /
        // instability vector on the permissive old-Chromium webOS engine.
        if (!s || !/^https?:\/\//i.test(s.url || '')) { setServerMessage('Stream unavailable.'); return; }
        setServerMessage('Loading stream…');
        // Release the outgoing embed before mounting the next (one media element at
        // a time is an LG hard limit).
        const old = wrap.querySelector('iframe');
        if (old) { try { old.src = 'about:blank'; } catch (e) { /* ignore */ } old.remove(); }
        wrap.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('referrerpolicy', 'origin');
        // Keep the cross-origin embed OUT of the D-pad focus path. When it grabs
        // focus it swallows the remote, so the user can't switch servers or go Back
        // (the same focus war the cinema player fixes at app.js:1249-1259). Bounded
        // so an aggressive embed can't cause a refocus loop.
        iframe.tabIndex = -1;
        let refocusTries = 0;
        iframe.addEventListener('focus', () => {
            if (!(window.isTvMode && window.isTvMode()) || $('livePlayerModal')?.hidden) return;
            if (refocusTries++ > 8) return;
            const ctrl = document.querySelector('#livePlayerServers .nf-source-chip')
                || $('livePlayerClose');
            if (ctrl) setTimeout(() => { try { ctrl.focus(); } catch (e) { /* ignore */ } }, 0);
        });
        iframe.src = s.url;
        iframe.addEventListener('load', () => { clearTimeout(frameTimer); setServerMessage(''); });
        clearTimeout(frameTimer);
        // If it never loads, nudge the user. With one server (a channel) there's no
        // "try another above", so tell them it may be offline rather than going silent.
        frameTimer = setTimeout(() => {
            if (live.player.servers.length > 1) setServerMessage('Slow to load? Try another server above.');
            else setServerMessage('Stream may be offline — try another channel.');
        }, 9000);
        wrap.appendChild(iframe);
    }

    // One-tap "play" overlay. The tap is the user gesture that lets the embedded
    // player start with sound (see playServer).
    function showPlayGate(wrap, s) {
        clearTimeout(frameTimer);
        setServerMessage('');
        wrap.innerHTML = '';
        const gate = el('button', 'nf-live-playgate');
        gate.type = 'button';
        gate.innerHTML =
            '<span class="nf-live-playgate-circle">▶</span>' +
            '<span class="nf-live-playgate-label">Tap to play with sound</span>';
        gate.addEventListener('click', () => playByKind(wrap, s));
        wrap.appendChild(gate);
        // On a TV there's no pointer — focus the gate so OK plays it (otherwise
        // OK lands on whatever's behind the modal and the stream never starts).
        requestAnimationFrame(() => { try { gate.focus(); } catch (e) { /* ignore */ } });
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

    // Close the live player on Escape / remote Back. The LG Magic Remote Back is
    // keyCode 461 (e.key is usually '' or 'GoBack' — NOT 'Backspace'/'BrowserBack'),
    // so it must be matched explicitly or the physical Back button can't exit the
    // live stream (leaving the cross-origin iframe decoding in the background — a
    // memory/reboot risk on webOS). Mirrors app.js:2786-2787.
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack'
                || e.key === 'GoBack' || e.keyCode === 461) &&
            !$('livePlayerModal')?.hidden) {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            e.stopPropagation();
            closeLivePlayer();
        }
    }, true);
})();
