/* ============================================================================
 * NOTFLIX — TV / 10-foot mode
 * ----------------------------------------------------------------------------
 *  • Detects Smart TVs, game consoles, set-top boxes and very large screens.
 *  • Adds a `tv-mode` class to <html> so the CSS switches to a 10-foot layout.
 *  • Adds spatial D-pad navigation (arrow keys + gamepad stick/d-pad) so the
 *    whole UI is drivable from a TV remote or controller, OK/A to select,
 *    Back/B to go back.
 *  • Auto-detection can be overridden with ?tv=1 / ?tv=0 or window.toggleTvMode().
 * ========================================================================== */
(function () {
    'use strict';

    const STORE_KEY = 'notflix_tv_mode';
    const root = document.documentElement;
    // localStorage can throw (Safari private mode, blocked cookies) — never let
    // a storage error break TV detection.
    const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
    const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

    /* ─── detection ───────────────────────────────────────────────────── */
    function detectTv() {
        const ua = navigator.userAgent || '';
        // Explicit override via URL or saved preference wins.
        const params = new URLSearchParams(location.search);
        if (params.get('tv') === '1') return true;
        if (params.get('tv') === '0') return false;
        const saved = safeGet(STORE_KEY);
        if (saved === 'on') return true;
        if (saved === 'off') return false;

        // Known TV / console / set-top user agents.
        const tvUA = /\b(SmartTV|Smart-TV|SMART-TV|Tizen|Web0S|WebOS|webOS|NetCast|HbbTV|CrKey|DLNADOC|AppleTV|Apple TV|GoogleTV|Google TV|Android ?TV|AFT[A-Z]|AFT[BS]|BRAVIA|VIDAA|Roku|PlayStation|Xbox|HUAWEI Vision|Hisense|Philips ?TV|POV_TV|InettvBrowser|NETTV|DTV)\b/i;
        if (tvUA.test(ua)) return true;

        // Big screen + no fine pointer (mouse) + not a phone/tablet → very likely a TV browser.
        try {
            const coarse = window.matchMedia('(pointer: coarse)').matches || !window.matchMedia('(any-pointer: fine)').matches;
            const huge = Math.min(window.screen.width, window.screen.height) >= 720 &&
                         Math.max(window.screen.width, window.screen.height) >= 1280;
            const noTouch = !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
            if (huge && noTouch && coarse) return true;
        } catch { /* ignore */ }

        return false;
    }

    let tvOn = false;
    function applyTvMode(on, persist) {
        tvOn = on;
        root.classList.toggle('tv-mode', on);
        if (persist) safeSet(STORE_KEY, on ? 'on' : 'off');
        if (on) {
            startSpatialNav();
            requestAnimationFrame(() => focusFirst());
        } else if (cardObserver) {
            // Stop tagging cards with tabindex while TV mode is off.
            cardObserver.disconnect();
            cardObserver = null;
            navStarted = false;
        }
        window.dispatchEvent(new CustomEvent('tvmodechange', { detail: { on } }));
    }

    window.toggleTvMode = function () { applyTvMode(!tvOn, true); };
    window.isTvMode = () => tvOn;

    // A gamepad connecting strongly implies a 10-foot context — auto-enable.
    window.addEventListener('gamepadconnected', () => { if (!tvOn) applyTvMode(true, false); });

    /* ─── spatial navigation ──────────────────────────────────────────── */
    const FOCUS_SEL = [
        'a[href]', 'button:not([disabled])', 'input:not([disabled])',
        'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    // Every clickable content tile across the app. These are mostly plain
    // <div>s with click handlers (not <a>/<button>), so they aren't natively
    // focusable — we tag them with tabindex so the D-pad can land on them.
    // Keep this in sync when new tile classes are added.
    const CARD_SEL = [
        '.nf-card', '.cinematic-tile', '.cinematic-poster-card',
        '.netflix-card', '.movie-card', '.poster-card',
        '.nf-live-card', '.nf-ep-card', '.nf-source-chip',
        '.nf-result-card', '.nf-search-result',
        '.tmdb-card', '.tmdb-result-card', '.tmdb-similar-card', '.tmdb-rec-card',
        '.bollywood-card', '.genre-card', '.genre-movie-card',
        '.star-movie-card', '.star-credit-card', '.popular-star-card', '.view-all-star-card',
        '.history-full-card', '.post-card', '.episode-card',
        '.card',
    ].join(',');

    let navStarted = false;
    let cardObserver = null;
    let keyListenerBound = false;
    function startSpatialNav() {
        if (navStarted) return;
        navStarted = true;

        // Make clickable cards focusable so native focus + geometry nav works.
        // Tag both descendants AND the scope node itself — when a single card
        // is inserted directly, querySelectorAll wouldn't include it.
        const tag = (c) => { if (c.nodeType === 1 && !c.hasAttribute('tabindex')) c.setAttribute('tabindex', '0'); };
        const tagCards = (scope) => {
            scope = scope || document;
            if (!scope.querySelectorAll) return;
            if (scope.matches && scope.matches(CARD_SEL)) tag(scope);
            scope.querySelectorAll(CARD_SEL).forEach(tag);
        };
        tagCards(document);
        cardObserver = new MutationObserver(muts => {
            muts.forEach(m => m.addedNodes && m.addedNodes.forEach(n => { if (n.nodeType === 1) tagCards(n); }));
        });
        cardObserver.observe(document.body, { childList: true, subtree: true });

        // Bind the key + gamepad loop once; both self-guard on tvOn.
        if (!keyListenerBound) {
            keyListenerBound = true;
            document.addEventListener('keydown', onKeyDown, true);
            pollGamepad();
        }
    }

    function isVisible(elm) {
        if (!elm) return false;
        const r = elm.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
        const s = getComputedStyle(elm);
        return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    }

    // D-pad candidate filter. Allows elements up to one screen outside the
    // viewport in any direction — so the row below the full-screen hero and
    // cards scrolled just off a row are reachable — WITHOUT scanning the whole
    // DOM every keypress (that makes nav laggy on low-power TVs). move() scrolls
    // the chosen element into view. Cheap rect maths run before getComputedStyle
    // so the style read only happens for the bounded in-band set.
    function isRendered(elm) {
        if (!elm) return false;
        const r = elm.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) return false;
        if (r.bottom < -innerHeight || r.top > innerHeight * 2) return false;
        if (r.right < -innerWidth || r.left > innerWidth * 2) return false;
        const s = getComputedStyle(elm);
        return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    }

    function focusables() {
        // When the live-player modal is open, keep navigation inside it so the
        // D-pad can't wander onto the page behind the overlay.
        const liveModal = document.body.classList.contains('nf-live-modal-open')
            ? document.getElementById('livePlayerModal') : null;
        const scope = (liveModal && !liveModal.hidden) ? liveModal : document;
        return [...scope.querySelectorAll(FOCUS_SEL)].filter(e =>
            isRendered(e) && !e.closest('[hidden]') && e.offsetParent !== null);
    }

    function focusFirst() {
        if (document.activeElement && document.activeElement !== document.body && isVisible(document.activeElement)) return;
        const list = focusables();
        if (list.length) { list[0].focus(); scrollTo(list[0]); }
    }

    function scrollTo(elm) {
        // Instant, not smooth — smooth scroll animation janks badly on low-power
        // TV browsers and is the main source of "laggy" D-pad navigation.
        try { elm.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch { /* ignore */ }
    }

    // Pick the nearest focusable in a given direction from the current element.
    function move(dir) {
        const cur = document.activeElement;
        const list = focusables();
        if (!list.length) return false;
        if (!cur || cur === document.body || !isVisible(cur)) { list[0].focus(); scrollTo(list[0]); return true; }

        const a = cur.getBoundingClientRect();
        const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        let best = null, bestScore = Infinity;

        for (const cand of list) {
            if (cand === cur) continue;
            const b = cand.getBoundingClientRect();
            const bx = b.left + b.width / 2, by = b.top + b.height / 2;
            const dx = bx - ax, dy = by - ay;

            let primary, cross;
            if (dir === 'left') { if (dx > -8) continue; primary = -dx; cross = Math.abs(dy); }
            else if (dir === 'right') { if (dx < 8) continue; primary = dx; cross = Math.abs(dy); }
            else if (dir === 'up') { if (dy > -8) continue; primary = -dy; cross = Math.abs(dx); }
            else { if (dy < 8) continue; primary = dy; cross = Math.abs(dx); }

            // Heavily penalise drifting off-axis so rows/columns feel natural.
            const score = primary + cross * 2.4;
            if (score < bestScore) { bestScore = score; best = cand; }
        }
        if (best) { best.focus(); scrollTo(best); return true; }
        return false;
    }

    // Move focus from the search box into the first result. Results may still be
    // loading (search is debounced / async), so poll briefly until one appears.
    function focusSearchResults() {
        let tries = 0;
        const tryFocus = () => {
            const c = document.getElementById('searchMenuResults') || document.getElementById('searchResults');
            const first = c && c.querySelector(CARD_SEL + ', a[href], button:not([disabled])');
            if (first) {
                if (!first.hasAttribute('tabindex')) first.setAttribute('tabindex', '0');
                first.focus();
                scrollTo(first);
                return;
            }
            if (++tries < 12) setTimeout(tryFocus, 120); // up to ~1.4s
        };
        tryFocus();
    }

    function onKeyDown(e) {
        if (!tvOn) return;
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        const k = e.key;
        const isArrow = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';

        // Search box: don't trap the user inside it. Enter (search) or Down jumps
        // straight to the results so they can browse them with the D-pad. Other
        // keys type normally.
        if (typing && t && (t.id === 'searchInputHeader' || (t.classList && t.classList.contains('nf-search-input')))) {
            // Let OK/Enter and the on-screen keyboard work natively (intercepting
            // Enter blocked the webOS keyboard from opening). Only Down jumps from
            // the field to the results so the user isn't trapped in the box.
            if (k === 'ArrowDown') {
                e.preventDefault();
                e.stopImmediatePropagation();
                focusSearchResults();
            }
            return;
        }

        // In the player, app.js owns arrows for episode/cinematic-tile nav — but
        // the cinema overlay controls (server chips + Back row) need spatial nav
        // too, otherwise Left/Right won't move between servers and Down can't
        // reach the video. Drive those ourselves; defer everything else in-player.
        const inPlayer = window.state && window.state.currentView === 'player';
        const onCinemaControl = !!(t && t.closest &&
            (t.closest('#tmdbPlayerToolbar') || t.closest('.nf-player-topbar')
                || (t.id === 'tmdbVideoSurface')));

        if (!typing && isArrow && (!inPlayer || onCinemaControl)) {
            const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
            // tv-mode is the SOLE arrow handler here: always swallow the event
            // (even when there's nowhere to move) so app.js's own
            // focusClosestCinematicTile handler can't double-fire.
            e.preventDefault();
            e.stopImmediatePropagation();
            move(dir);
            return;
        }
        if (k === 'Enter' && t && t !== document.body && !typing) {
            // TV browsers don't reliably synthesise a click from OK/Enter on the
            // focused element (this is why "Who's watching?" felt stuck), so do it
            // explicitly. preventDefault stops any second native activation.
            e.preventDefault();
            e.stopImmediatePropagation();
            t.click();
        }
    }

    /* ─── gamepad: d-pad / stick movement + A to select ───────────────── */
    const GP_COOLDOWN = 160;
    const gpState = {}; // per-controller edge-detection state, keyed by pad.index
    function pollGamepad() {
        if (tvOn) {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            const now = performance.now();
            for (const pad of pads) {
                if (!pad) continue;
                const st = gpState[pad.index] || (gpState[pad.index] = { last: 0, aPrev: false });
                const ax = pad.axes || [];
                const x = ax[0] || 0, y = ax[1] || 0;
                const b = pad.buttons || [];
                const up = (b[12] && b[12].pressed) || y < -0.5;
                const down = (b[13] && b[13].pressed) || y > 0.5;
                const left = (b[14] && b[14].pressed) || x < -0.5;
                const right = (b[15] && b[15].pressed) || x > 0.5;

                if (now - st.last > GP_COOLDOWN && (up || down || left || right)) {
                    st.last = now;
                    move(up ? 'up' : down ? 'down' : left ? 'left' : 'right');
                }
                // A button (0) = activate focused element.
                const aPressed = !!(b[0] && b[0].pressed);
                if (aPressed && !st.aPrev) {
                    const el = document.activeElement;
                    if (el && el !== document.body) el.click();
                }
                st.aPrev = aPressed;
            }
        }
        requestAnimationFrame(pollGamepad);
    }

    // Re-focus the first element whenever the visible view changes.
    window.addEventListener('hashchange', () => tvOn && requestAnimationFrame(focusFirst));

    /* ─── LG webOS: exit the app when Back is pressed at the home screen ── */
    const IS_WEBOS = /web ?0?s|webos/i.test(navigator.userAgent) ||
        new URLSearchParams(location.search).get('webos') === '1';
    if (IS_WEBOS) {
        document.addEventListener('keydown', (e) => {
            // 461 = LG Magic Remote BACK. Also handle the named variants.
            if (e.keyCode === 461 || e.key === 'GoBack' || e.key === 'BrowserBack') {
                const view = window.state && window.state.currentView;
                const atRoot = !view || view === 'home';
                if (atRoot) {
                    // Nothing to go back to in-app → leave the app cleanly.
                    try {
                        if (window.webOSSystem && window.webOSSystem.platformBack) window.webOSSystem.platformBack();
                        else if (window.webOS && window.webOS.platformBack) window.webOS.platformBack();
                        else window.close();
                    } catch { try { window.close(); } catch {} }
                }
                // Otherwise let the app's own Back handler navigate within the SPA.
            }
        });
    }

    /* ─── Magic Remote pointer edge-scroll ─────────────────────────────────
     * LG Magic Remote users drive an on-screen cursor (shake the remote or roll
     * the OK wheel to summon it). When that cursor nears the TOP/BOTTOM of the
     * screen we scroll the page; when it nears the LEFT/RIGHT of the horizontal
     * movie row under it, that row scrolls. This is what the wheel often can't do
     * inside a TV app webview, so it's the reliable pointer-scroll path. TV only. */
    const HSCROLL_SEL = '.netflix-row, .explore-collection-scroll, .nf-filter-pills, .nf-source-chips, [data-hscroll]';
    let ptrX = -1, ptrY = -1, edgeRaf = null, vAccum = 0, hAccum = 0;

    // The horizontal movie row whose vertical band the pointer is over — found by
    // Y, NOT by what's directly under the cursor, so it still works when the cursor
    // is in the row's side padding / at the very left/right edge of the screen.
    function rowUnderPointerY(y) {
        const rows = document.querySelectorAll(HSCROLL_SEL);
        for (let i = 0; i < rows.length; i++) {
            const el = rows[i];
            if (el.scrollWidth <= el.clientWidth + 4) continue;       // nothing to scroll
            const r = el.getBoundingClientRect();
            if (r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
            if (y >= r.top - 12 && y <= r.bottom + 12) return el;
        }
        return null;
    }

    // Ease-in (quadratic): gentle as the cursor enters the zone, fast at the edge.
    function edgeSpeed(into, zone, max) {
        const t = Math.min(1, Math.max(0, into / zone));
        return max * t * t;
    }

    function edgeStep() {
        // Don't fight the cinema player / live modal — nothing to scroll there.
        const inPlayer = window.state && window.state.currentView === 'player';
        if (!tvOn || ptrX < 0 || inPlayer) { edgeRaf = null; vAccum = hAccum = 0; return; }
        let active = false;

        // Vertical page scroll — wide band, fast, sub-pixel accumulated so it's smooth.
        const vZone = 140, vMax = 56;
        let vSpeed = 0;
        if (ptrY < vZone) vSpeed = -edgeSpeed(vZone - ptrY, vZone, vMax);
        else if (ptrY > innerHeight - vZone) vSpeed = edgeSpeed(ptrY - (innerHeight - vZone), vZone, vMax);
        if (vSpeed) {
            vAccum += vSpeed;
            const whole = vAccum | 0;                 // truncate toward zero
            if (whole) { window.scrollBy(0, whole); vAccum -= whole; }
            active = true;
        } else vAccum = 0;

        // Horizontal row scroll — triggered by the cursor being on the LEFT/RIGHT
        // side of the screen while it's vertically over a scrollable row.
        const row = rowUnderPointerY(ptrY);
        if (row) {
            const hZone = Math.max(150, innerWidth * 0.16), hMax = 50;
            let hSpeed = 0;
            if (ptrX < hZone) hSpeed = -edgeSpeed(hZone - ptrX, hZone, hMax);
            else if (ptrX > innerWidth - hZone) hSpeed = edgeSpeed(ptrX - (innerWidth - hZone), hZone, hMax);
            if (hSpeed) {
                hAccum += hSpeed;
                const whole = hAccum | 0;
                if (whole) { row.scrollLeft += whole; hAccum -= whole; }
                active = true;
            } else hAccum = 0;
        } else hAccum = 0;

        edgeRaf = active ? requestAnimationFrame(edgeStep) : null;
    }

    document.addEventListener('mousemove', (e) => {
        ptrX = e.clientX; ptrY = e.clientY;
        if (tvOn && edgeRaf === null) edgeRaf = requestAnimationFrame(edgeStep);
    }, { passive: true });

    /* ─── boot ────────────────────────────────────────────────────────── */
    function boot() { applyTvMode(detectTv(), false); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
