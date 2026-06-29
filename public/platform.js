/* ============================================================================
 * NOTFLIX — platform / browser detection
 * ----------------------------------------------------------------------------
 *  Detects the device family (Google TV / Android TV, Fire TV, webOS, Tizen,
 *  Apple TV, Roku, consoles, desktop, mobile…) and the browser engine, then:
 *    • adds `plat-<device>`, `br-<browser>` and `is-tv|is-mobile|is-desktop`
 *      classes to <html> so CSS + JS can adapt;
 *    • exposes window.NotflixPlatform { flags, tv, browser, name, is() }.
 *
 *  This loads before the app scripts so tv-mode.js and the player can read it.
 * ========================================================================== */
(function () {
    'use strict';

    var ua = navigator.userAgent || '';
    var root = document.documentElement;

    function has(re) { return re.test(ua); }

    // ── Device family ────────────────────────────────────────────────────
    var isFireTv      = has(/AFT[A-Z0-9]|Fire ?TV|AmazonWebAppPlatform/i);
    var isAndroidTv   = has(/Android ?TV|GoogleTV|Google TV/i);
    var isChromecast  = has(/CrKey/i);                       // Chromecast / Chromecast w/ Google TV
    var isWebOs       = has(/web ?0?s|webos/i);
    var isTizen       = has(/Tizen/i);
    var isAppleTv     = has(/AppleTV|Apple ?TV|tvOS/i);
    var isRoku        = has(/Roku/i);
    var isPlayStation = has(/PlayStation/i);
    var isXbox        = has(/Xbox/i);
    var isOtherSmartTv= has(/SmartTV|Smart-TV|SMART-TV|NetCast|HbbTV|BRAVIA|VIDAA|Hisense|Philips ?TV|NETTV|InettvBrowser|DTV|HUAWEI Vision/i);

    // Chromecast-with-Google-TV reports both CrKey and Android TV; treat as Google TV.
    var isGoogleTv = isAndroidTv || (isChromecast && has(/Android/i));

    var isMobile = !isAndroidTv && !isFireTv && has(/Mobi|iPhone|iPod|Windows Phone/i)
                 || (has(/Android/i) && has(/Mobile/i) && !isAndroidTv && !isFireTv);
    var isTablet = (has(/iPad/i) || (has(/Android/i) && !has(/Mobile/i) && !isAndroidTv && !isFireTv))
                 && !isMobile;

    // Big screen + coarse/no pointer + no touch → almost certainly a TV browser.
    var bigScreenTv = false;
    try {
        var coarse = window.matchMedia('(pointer: coarse)').matches || !window.matchMedia('(any-pointer: fine)').matches;
        var huge = Math.min(screen.width, screen.height) >= 720 && Math.max(screen.width, screen.height) >= 1280;
        var noTouch = !('ontouchstart' in window) && navigator.maxTouchPoints === 0;
        bigScreenTv = huge && noTouch && coarse && !isMobile && !isTablet;
    } catch (e) {}

    var isTv = isFireTv || isGoogleTv || isAndroidTv || isWebOs || isTizen || isAppleTv ||
               isRoku || isPlayStation || isXbox || isOtherSmartTv || bigScreenTv;

    // Pick a single primary name (most specific first) for plat-<name>.
    var name =
        isFireTv      ? 'firetv'    :
        isGoogleTv    ? 'googletv'  :
        isAndroidTv   ? 'androidtv' :
        isWebOs       ? 'webos'     :
        isTizen       ? 'tizen'     :
        isAppleTv     ? 'appletv'   :
        isRoku        ? 'roku'      :
        isPlayStation ? 'playstation' :
        isXbox        ? 'xbox'      :
        isOtherSmartTv? 'smarttv'   :
        bigScreenTv   ? 'tv'        :
        isMobile      ? 'mobile'    :
        isTablet      ? 'tablet'    : 'desktop';

    // ── Browser engine ───────────────────────────────────────────────────
    var browser =
        has(/Edg\//i)            ? 'edge'    :
        has(/OPR\/|Opera/i)      ? 'opera'   :
        has(/SamsungBrowser/i)   ? 'samsung' :
        has(/Firefox\/|FxiOS/i)  ? 'firefox' :
        has(/Chrome\/|CriOS/i)   ? 'chrome'  :
        has(/Safari/i)           ? 'safari'  : 'unknown';
    var isWebView = has(/; wv\)/i) || (has(/Android/i) && has(/Version\/\d/i) && has(/Chrome\//i));

    // ── Apply classes ────────────────────────────────────────────────────
    var classes = ['plat-' + name, 'br-' + browser, isTv ? 'is-tv' : (isMobile ? 'is-mobile' : isTablet ? 'is-tablet' : 'is-desktop')];
    if (isChromecast) classes.push('plat-chromecast');
    if (isWebView)    classes.push('br-webview');
    try { root.classList.add.apply(root.classList, classes); } catch (e) {
        // Old engines: add one at a time.
        classes.forEach(function (c) { try { root.classList.add(c); } catch (e2) {} });
    }
    try { root.setAttribute('data-platform', name); } catch (e) {}

    // ── Public API ───────────────────────────────────────────────────────
    var flags = {
        firetv: isFireTv, googletv: isGoogleTv, androidtv: isAndroidTv, chromecast: isChromecast,
        webos: isWebOs, tizen: isTizen, appletv: isAppleTv, roku: isRoku,
        playstation: isPlayStation, xbox: isXbox, smarttv: isOtherSmartTv,
        mobile: isMobile, tablet: isTablet, desktop: name === 'desktop',
    };

    window.NotflixPlatform = {
        flags: flags,
        tv: isTv,
        browser: browser,
        webview: isWebView,
        name: name,
        ua: ua,
        is: function (n) { return n === name || !!flags[n]; },
    };
})();
