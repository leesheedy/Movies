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
    const CARD_SEL = '.nf-card,.cinematic-tile,.nf-live-card,.nf-ep-card,.nf-source-chip,.movie-card,.poster-card,.nf-result-card,.nf-search-result,.card';

    let navStarted = false;
    let cardObserver = null;
    let keyListenerBound = false;
    function startSpatialNav() {
        if (navStarted) return;
        navStarted = true;

        // Make clickable cards focusable so native focus + geometry nav works.
        const tagCards = (scope) => (scope || document).querySelectorAll
            ? (scope || document).querySelectorAll(CARD_SEL).forEach(c => {
                if (!c.hasAttribute('tabindex')) c.setAttribute('tabindex', '0');
            }) : null;
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

    function focusables() {
        return [...document.querySelectorAll(FOCUS_SEL)].filter(e =>
            isVisible(e) && !e.closest('[hidden]') && e.offsetParent !== null);
    }

    function focusFirst() {
        if (document.activeElement && document.activeElement !== document.body && isVisible(document.activeElement)) return;
        const list = focusables();
        if (list.length) { list[0].focus(); scrollTo(list[0]); }
    }

    function scrollTo(elm) {
        try { elm.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } catch { /* ignore */ }
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

    function onKeyDown(e) {
        if (!tvOn) return;
        const t = e.target;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        const k = e.key;
        const isArrow = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';

        // In the player view, app.js owns the arrow keys (prev/next episode &
        // its own cinematic-tile nav). Defer to it entirely so they don't both fire.
        const inPlayer = window.state && window.state.currentView === 'player';

        if (!typing && !inPlayer && isArrow) {
            const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
            // tv-mode is the SOLE arrow handler outside the player: always swallow
            // the event (even when there's nowhere to move) so app.js's own
            // focusClosestCinematicTile handler can't double-fire.
            e.preventDefault();
            e.stopImmediatePropagation();
            move(dir);
            return;
        }
        if (k === 'Enter' && t && t !== document.body && !typing) {
            // Let native button/link activation happen; for tagged cards, click.
            if (t.matches(CARD_SEL) && t.tagName !== 'BUTTON' && t.tagName !== 'A') {
                e.preventDefault();
                t.click();
            }
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

    /* ─── boot ────────────────────────────────────────────────────────── */
    function boot() { applyTvMode(detectTv(), false); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
