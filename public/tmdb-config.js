window.TMDBConfig = (() => {
    function getEnvValue() {
        return (window.__ENV__ && typeof window.__ENV__.VITE_TMDB_KEY === 'string')
            ? window.__ENV__.VITE_TMDB_KEY.trim()
            : '';
    }

    function getApiKey() {
        return getEnvValue();
    }

    function ensureApiKey() {
        const key = getApiKey();
        if (!key) {
            console.warn('TMDB API key missing. Set VITE_TMDB_KEY in your environment.');
        }
        return key;
    }

    return {
        getApiKey,
        ensureApiKey
    };
})();
