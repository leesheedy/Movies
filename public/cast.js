/* ─────────────────────────────────────────────────────────────────────────
   NotflixCast — shared Google Cast (Chromecast) controller.

   Unlike the Remote Playback API, the Cast SDK loads a media URL *directly*
   onto the receiver, so it casts HLS (m3u8) and MP4 even when we play them
   locally via MSE (hls.js / Clappr). It also attaches title + poster metadata
   so the TV shows proper artwork.

   Public API (window.NotflixCast):
     ready()                       → SDK loaded & context initialised
     available()                   → at least one Cast device on the network
     connected()                   → an active Cast session exists
     castUrl({url,title,subtitle,poster,live,contentType})  → Promise
     stop()                        → end the current session
     onState(cb)                   → subscribe to state changes; returns an
                                     unsubscribe fn. cb gets one of:
                                     'no_devices' | 'idle' | 'connecting' | 'connected'
   ───────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    var ctx = null;                 // cast.framework.CastContext
    var initialised = false;
    var listeners = [];

    function emit(state) { listeners.forEach(function (cb) { try { cb(state); } catch (e) {} }); }

    function stateString() {
        if (!ctx) return 'no_devices';
        try {
            switch (ctx.getCastState()) {
                case cast.framework.CastState.NO_DEVICES_AVAILABLE: return 'no_devices';
                case cast.framework.CastState.CONNECTING:           return 'connecting';
                case cast.framework.CastState.CONNECTED:            return 'connected';
                default:                                            return 'idle';
            }
        } catch (e) { return 'no_devices'; }
    }

    function init() {
        if (initialised || !window.cast || !cast.framework || !window.chrome || !chrome.cast) return;
        try {
            // chrome.cast.media may lag the framework callback in some engines, so
            // fall back to the published default-media-receiver id / enum strings
            // rather than passing an empty id (which throws "Missing application id").
            var appId = (chrome.cast.media && chrome.cast.media.DefaultMediaReceiverAppId) || 'CC1AD845';
            var autoJoin = (chrome.cast.AutoJoinPolicy && chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED) || 'origin_scoped';
            var context = cast.framework.CastContext.getInstance();
            context.setOptions({ receiverApplicationId: appId, autoJoinPolicy: autoJoin });
            context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, function () {
                emit(stateString());
            });
            ctx = context;
            initialised = true;
            emit(stateString());
        } catch (e) {
            // Never let Cast init surface as an uncaught page error.
            if (window.console && console.debug) console.debug('[Cast] init skipped:', e && e.message);
        }
    }

    // The SDK calls this once cast_sender.js finishes loading.
    var prev = window.__onGCastApiAvailable;
    window.__onGCastApiAvailable = function (isAvailable) {
        if (typeof prev === 'function') { try { prev(isAvailable); } catch (e) {} }
        if (isAvailable) init();
    };

    function guessContentType(url, explicit) {
        if (explicit) return explicit;
        var u = (url || '').toLowerCase();
        // Proxied URLs carry the real target in a ?url= param.
        var m = u.match(/[?&]url=([^&]+)/);
        if (m) { try { u = decodeURIComponent(m[1]); } catch (e) {} }
        if (u.indexOf('.m3u8') !== -1) return 'application/x-mpegURL';
        if (u.indexOf('.mpd')  !== -1) return 'application/dash+xml';
        if (u.indexOf('.webm') !== -1) return 'video/webm';
        if (u.indexOf('.mkv')  !== -1) return 'video/x-matroska';
        return 'video/mp4';
    }

    var Cast = {
        ready: function () { return !!ctx; },
        connected: function () { return stateString() === 'connected'; },
        available: function () { var s = stateString(); return s !== 'no_devices'; },

        onState: function (cb) {
            if (typeof cb !== 'function') return function () {};
            listeners.push(cb);
            try { cb(stateString()); } catch (e) {}
            return function () { listeners = listeners.filter(function (f) { return f !== cb; }); };
        },

        stop: function () {
            try {
                var s = ctx && ctx.getCurrentSession();
                if (s) s.endSession(true);
            } catch (e) {}
        },

        // Returns a promise. Rejects with {code:'unavailable'} when the SDK
        // isn't ready, or {code:'cancel'} when the user dismisses the picker.
        castUrl: function (opts) {
            opts = opts || {};
            if (!ctx) return Promise.reject({ code: 'unavailable' });
            if (!opts.url) return Promise.reject({ code: 'no_media' });

            function loadOnSession(session) {
                var info = new chrome.cast.media.MediaInfo(opts.url, guessContentType(opts.url, opts.contentType));
                info.streamType = opts.live ? chrome.cast.media.StreamType.LIVE
                                            : chrome.cast.media.StreamType.BUFFERED;
                var meta = new chrome.cast.media.GenericMediaMetadata();
                if (opts.title)    meta.title = opts.title;
                if (opts.subtitle) meta.subtitle = opts.subtitle;
                if (opts.poster)   meta.images = [new chrome.cast.Image(opts.poster)];
                info.metadata = meta;
                var req = new chrome.cast.media.LoadRequest(info);
                return session.loadMedia(req);
            }

            var existing = ctx.getCurrentSession();
            if (existing) return loadOnSession(existing);

            return ctx.requestSession().then(function (err) {
                // Framework resolves with an error code string on failure.
                if (err) return Promise.reject({ code: err });
                var s = ctx.getCurrentSession();
                if (!s) return Promise.reject({ code: 'no_session' });
                return loadOnSession(s);
            });
        },
    };

    window.NotflixCast = Cast;

    // If the SDK script loaded before this file, initialise right away.
    if (window.cast && cast.framework) init();
})();
