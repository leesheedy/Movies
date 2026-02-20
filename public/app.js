// Main App State.
const state = {
    providers: [],
    selectedProvider: null,
    currentView: 'home',
    currentMeta: null,
    currentStreams: [],
    searchQuery: '',
    searchResults: [],
    searchProviderFilter: 'all',
    searchMediaFilter: 'all',
    currentPage: 1,
    currentFilter: '', // Track current filter for pagination
    retryCount: 0,
    maxRetries: 3,
    isVideoPlaying: false, // Track video playback state
    searchRequestId: 0,
    playbackProviders: [],
    pendingFullscreenRequest: false,
    fullscreenExitArmed: false,
    gamepadBackPressed: false,
    gamepadPolling: false,
    externalNavigationAllowedUntil: 0,
    cleanPlayerEnabled: false,
};

// Expose state and API_BASE globally for modules
window.state = state;

let detailsParallaxCleanup = null;
let tmdbBaseSources = [];

// API Base URL
const API_BASE = window.location.origin;
window.API_BASE = API_BASE;

const CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_MIN_LENGTH = 2;
const cacheStore = {
    catalog: new Map(),
    posts: new Map(),
    search: new Map(),
    meta: new Map(),
    streams: new Map()
};

const TMDB_IMDB_CACHE_KEY = 'tmdb_imdb_cache_v1';
const tmdbImdbCache = new Map();
const PROFILE_STORAGE_KEY = 'mitta_active_profile_v1';
const PROFILE_SETTINGS_KEY = 'mitta_profile_settings_v1';
const ADBLOCK_PROMPT_DISMISS_KEY = 'mitta_adblock_prompt_dismissed_v1';
const ADBLOCK_PROMPT_SESSION_KEY = 'mitta_adblock_prompt_session_v1';
const profiles = [
    { id: 'guest', name: 'Guest', avatar: 'G' },
    { id: 'digby', name: 'Digby', avatar: 'D' },
    { id: 'lee', name: 'Lee', avatar: 'L' },
    { id: 'ryan', name: 'Ryan', avatar: 'R' },
    { id: 'issy', name: 'Issy', avatar: 'I' },
    { id: 'renee', name: 'Renee', avatar: 'R' },
    { id: 'dom-and-isla', name: 'Dom and Isla', avatar: 'DI' }
];
const profileSettings = loadProfileSettings();
let activeProfileId = null;

function loadProfileSettings() {
    try {
        const raw = localStorage.getItem(PROFILE_SETTINGS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn('Failed to load profile settings:', error);
        return {};
    }
}

function saveProfileSettings() {
    try {
        localStorage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify(profileSettings));
    } catch (error) {
        console.warn('Failed to save profile settings:', error);
    }
}

function resolveProfile(profile) {
    const settings = profileSettings[profile.id] || {};
    return {
        ...profile,
        name: settings.name || profile.name,
        avatar: settings.avatar || profile.avatar,
        accentColor: settings.accentColor || ''
    };
}

function updateProfileAccent(profile) {
    const accent = profile.accentColor || '';
    if (accent) {
        document.documentElement.style.setProperty('--profile-accent', accent);
    } else {
        document.documentElement.style.removeProperty('--profile-accent');
    }
}

function getAestDateParts() {
    const formatter = new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Sydney',
        month: 'numeric',
        day: 'numeric'
    });
    const parts = formatter.formatToParts(new Date());
    const lookup = parts.reduce((acc, part) => {
        if (part.type !== 'literal') {
            acc[part.type] = Number(part.value);
        }
        return acc;
    }, {});
    return { month: lookup.month, day: lookup.day };
}

function resolveSeasonalTheme() {
    const { month, day } = getAestDateParts();
    if (month === 2 && day === 14) return 'valentines';
    if (month === 10 && day === 31) return 'halloween';
    if (month === 12 && day >= 24 && day <= 26) return 'christmas';
    if ((month === 12 && day === 31) || (month === 1 && day === 1)) return 'newyear';
    return null;
}

function applySeasonalTheme() {
    const theme = resolveSeasonalTheme();
    if (!document.body) return;
    if (theme) {
        document.body.setAttribute('data-theme', theme);
    } else {
        document.body.removeAttribute('data-theme');
    }
}

function loadActiveProfile() {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return profiles[0];
    const match = profiles.find(profile => profile.id === raw);
    return match || profiles[0];
}

function saveActiveProfile(profileId) {
    localStorage.setItem(PROFILE_STORAGE_KEY, profileId);
}

function applyProfile(profile) {
    const profileName = document.getElementById('profileName');
    const profileAvatar = document.getElementById('profileAvatar');
    const resolved = resolveProfile(profile);
    if (profileName) {
        profileName.textContent = resolved.name;
    }
    if (profileAvatar) {
        profileAvatar.textContent = resolved.avatar;
    }
    updateProfileAccent(resolved);
}

function renderProfileGate(profile, gate) {
    const profileList = document.getElementById('profileList');
    if (!profileList) return;
    profileList.innerHTML = '';
    profiles.forEach(item => {
        const resolved = resolveProfile(item);
        const card = document.createElement('div');
        card.className = 'profile-card';
        card.setAttribute('data-profile-id', item.id);

        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.className = 'profile-card-button';
        if (item.id === profile.id) {
            selectButton.setAttribute('aria-pressed', 'true');
        }
        selectButton.innerHTML = `
            <div class="profile-card-avatar">${resolved.avatar}</div>
            <div class="profile-card-name">${resolved.name}</div>
        `;
        selectButton.addEventListener('click', () => {
            saveActiveProfile(item.id);
            activeProfileId = item.id;
            applyProfile(item);
            gate.setAttribute('hidden', 'true');
            setSettingsTriggerVisibility(true);
        });

        card.appendChild(selectButton);
        profileList.appendChild(card);
    });
}

function openProfileSettings(profileId) {
    const modal = document.getElementById('profileSettingsModal');
    const form = document.getElementById('profileSettingsForm');
    const displayNameInput = document.getElementById('profileDisplayName');
    const avatarInput = document.getElementById('profileAvatarInput');
    const accentInput = document.getElementById('profileAccent');
    const autoplayInput = document.getElementById('profileAutoplay');
    const subtitleInput = document.getElementById('profileSubtitleSize');
    const audioInput = document.getElementById('profileAudioLang');
    const maturityInput = document.getElementById('profileMaturity');
    if (!modal || !form || !displayNameInput || !avatarInput || !accentInput || !autoplayInput) return;

    const baseProfile = profiles.find(item => item.id === profileId);
    if (!baseProfile) return;
    const resolved = resolveProfile(baseProfile);
    const settings = profileSettings[profileId] || {};

    form.setAttribute('data-profile-id', profileId);
    displayNameInput.value = resolved.name;
    avatarInput.value = resolved.avatar;
    accentInput.value = settings.accentColor || '#e50914';
    autoplayInput.value = settings.autoplay || 'on';
    if (subtitleInput) {
        subtitleInput.value = settings.subtitleSize || 'medium';
    }
    if (audioInput) {
        audioInput.value = settings.audioLang || 'en';
    }
    if (maturityInput) {
        maturityInput.value = settings.maturity || 'all';
    }

    modal.removeAttribute('hidden');
    displayNameInput.focus();
}

function closeProfileSettings() {
    const modal = document.getElementById('profileSettingsModal');
    if (modal) {
        modal.setAttribute('hidden', 'true');
    }
}

function normaliseAvatar(value, fallback) {
    const trimmed = value.trim();
    if (trimmed) {
        return trimmed.slice(0, 2).toUpperCase();
    }
    return fallback;
}

function setSettingsTriggerVisibility(visible) {
    const trigger = document.getElementById('profileSettingsTrigger');
    if (!trigger) return;
    if (visible) {
        trigger.removeAttribute('hidden');
    } else {
        trigger.setAttribute('hidden', 'true');
    }
}

function initProfileGate() {
    const gate = document.getElementById('profileGate');
    if (!gate) return;
    const activeProfile = loadActiveProfile();
    activeProfileId = activeProfile.id;
    applyProfile(activeProfile);
    renderProfileGate(activeProfile, gate);
    const hasStoredProfile = Boolean(localStorage.getItem(PROFILE_STORAGE_KEY));
    setSettingsTriggerVisibility(hasStoredProfile);
    if (!hasStoredProfile) {
        gate.removeAttribute('hidden');
    }
    const profileChip = document.getElementById('profileChip');
    const settingsTrigger = document.getElementById('profileSettingsTrigger');
    if (profileChip) {
        profileChip.addEventListener('click', () => {
            const selected = loadActiveProfile();
            applyProfile(selected);
            renderProfileGate(selected, gate);
            gate.removeAttribute('hidden');
        });
    }
    if (settingsTrigger) {
        settingsTrigger.addEventListener('click', () => {
            if (!activeProfileId) return;
            openProfileSettings(activeProfileId);
        });
    }
    gate.addEventListener('click', (event) => {
        if (event.target === gate) {
            gate.setAttribute('hidden', 'true');
        }
    });

    const modal = document.getElementById('profileSettingsModal');
    const closeButton = document.getElementById('profileSettingsClose');
    const resetButton = document.getElementById('profileSettingsReset');
    const settingsForm = document.getElementById('profileSettingsForm');

    if (closeButton) {
        closeButton.addEventListener('click', closeProfileSettings);
    }

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeProfileSettings();
            }
        });
    }

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (!settingsForm) return;
            const profileId = settingsForm.getAttribute('data-profile-id');
            if (!profileId) return;
            delete profileSettings[profileId];
            saveProfileSettings();
            const baseProfile = profiles.find(item => item.id === profileId);
            if (baseProfile && profileId === activeProfileId) {
                applyProfile(baseProfile);
            }
            const selected = loadActiveProfile();
            renderProfileGate(selected, gate);
            closeProfileSettings();
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const profileId = settingsForm.getAttribute('data-profile-id');
            if (!profileId) return;
            const baseProfile = profiles.find(item => item.id === profileId);
            if (!baseProfile) return;

            const displayNameInput = document.getElementById('profileDisplayName');
            const avatarInput = document.getElementById('profileAvatarInput');
            const accentInput = document.getElementById('profileAccent');
            const autoplayInput = document.getElementById('profileAutoplay');
            const subtitleInput = document.getElementById('profileSubtitleSize');
            const audioInput = document.getElementById('profileAudioLang');
            const maturityInput = document.getElementById('profileMaturity');

            const displayName = displayNameInput ? displayNameInput.value.trim() : '';
            const avatarValue = avatarInput ? avatarInput.value : '';
            const accentColor = accentInput ? accentInput.value : '';
            const autoplay = autoplayInput ? autoplayInput.value : 'on';
            const subtitleSize = subtitleInput ? subtitleInput.value : 'medium';
            const audioLang = audioInput ? audioInput.value : 'en';
            const maturity = maturityInput ? maturityInput.value : 'all';

            const resolvedName = displayName || baseProfile.name;
            const resolvedAvatar = normaliseAvatar(avatarValue, baseProfile.avatar);

            profileSettings[profileId] = {
                name: resolvedName,
                avatar: resolvedAvatar,
                accentColor,
                autoplay,
                subtitleSize,
                audioLang,
                maturity
            };
            saveProfileSettings();

            if (profileId === activeProfileId) {
                applyProfile(baseProfile);
            }

            const selected = loadActiveProfile();
            renderProfileGate(selected, gate);
            closeProfileSettings();
        });
    }
}

function loadTmdbImdbCache() {
    try {
        const raw = localStorage.getItem(TMDB_IMDB_CACHE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.entries(data).forEach(([tmdbId, imdbId]) => {
            tmdbImdbCache.set(tmdbId, imdbId);
        });
    } catch (error) {
        console.warn('Failed to load TMDB IMDb cache:', error);
    }
}

function saveTmdbImdbCache() {
    try {
        const payload = {};
        tmdbImdbCache.forEach((value, key) => {
            payload[key] = value;
        });
        localStorage.setItem(TMDB_IMDB_CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Failed to save TMDB IMDb cache:', error);
    }
}

function getCachedImdbId(tmdbId) {
    if (!tmdbId) return { hit: false, value: null };
    const key = String(tmdbId);
    if (!tmdbImdbCache.has(key)) {
        return { hit: false, value: null };
    }
    return { hit: true, value: tmdbImdbCache.get(key) };
}

function setCachedImdbId(tmdbId, imdbId) {
    if (!tmdbId) return;
    tmdbImdbCache.set(String(tmdbId), imdbId ?? null);
    saveTmdbImdbCache();
}

function getTmdbApiKey() {
    return window.TMDBConfig?.ensureApiKey?.() || '';
}

const TMDB_PROVIDER = {
    value: 'tmdb',
    display_name: 'TMDB',
    type: 'metadata'
};

const preferredProviders = ['tmdb'];

function isTmdbOnlyMode() {
    return state.providers.length === 1 && state.providers[0]?.value === 'tmdb';
}

function sortByPreferredProviders(list, valueGetter) {
    if (!Array.isArray(list)) return [];
    const getValue = valueGetter || ((item) => (item.value || item.provider || item).toString().toLowerCase());
    return list
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const aValue = getValue(a.item);
            const bValue = getValue(b.item);
            const aIndex = preferredProviders.indexOf(aValue);
            const bIndex = preferredProviders.indexOf(bValue);
            if (aIndex === -1 && bIndex === -1) return a.index - b.index;
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        })
        .map(({ item }) => item);
}

function getCached(map, key) {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
        map.delete(key);
        return null;
    }
    return entry.value;
}

function setCached(map, key, value) {
    map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
}

function scheduleIdleTask(task) {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(() => task());
        return;
    }
    setTimeout(task, 60);
}

function prefetchMetaForPosts(provider, posts = [], limit = 6) {
    const items = Array.isArray(posts) ? posts.slice(0, limit) : [];
    if (items.length === 0) return;
    scheduleIdleTask(() => {
        items.forEach(post => {
            if (post?.link) {
                fetchMeta(provider, post.link).catch(() => {});
            }
        });
    });
}

function allowExternalNavigation(durationMs = 1200) {
    state.externalNavigationAllowedUntil = Date.now() + durationMs;
}

function consumeExternalNavigationAllowance() {
    if (Date.now() > state.externalNavigationAllowedUntil) return false;
    state.externalNavigationAllowedUntil = 0;
    return true;
}

function openExternalUrl(url, options = {}) {
    if (!url) return null;
    allowExternalNavigation();
    const target = options.target || '_blank';
    const features = options.features;
    return window.open(url, target, features);
}

function detectAdBlocker() {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') {
            resolve(false);
            return;
        }
        const bait = document.createElement('div');
        bait.className = 'adsbygoogle adblock-bait';
        bait.style.cssText = 'position:absolute;left:-999px;top:-999px;height:10px;width:10px;';
        document.body.appendChild(bait);
        requestAnimationFrame(() => {
            setTimeout(() => {
                const style = window.getComputedStyle(bait);
                const blocked = bait.offsetHeight === 0 || bait.offsetParent === null || style.display === 'none' || style.visibility === 'hidden';
                bait.remove();
                resolve(blocked);
            }, 60);
        });
    });
}

function shouldShowAdblockPrompt() {
    if (localStorage.getItem(ADBLOCK_PROMPT_DISMISS_KEY)) return false;
    if (sessionStorage.getItem(ADBLOCK_PROMPT_SESSION_KEY)) return false;
    return true;
}

function dismissAdblockPrompt() {
    localStorage.setItem(ADBLOCK_PROMPT_DISMISS_KEY, '1');
    sessionStorage.setItem(ADBLOCK_PROMPT_SESSION_KEY, '1');
    const prompt = document.getElementById('adblockPrompt');
    if (prompt) {
        prompt.hidden = true;
    }
}

async function maybeShowAdblockPrompt() {
    if (!shouldShowAdblockPrompt()) return;
    const prompt = document.getElementById('adblockPrompt');
    if (!prompt) return;
    const blocked = await detectAdBlocker();
    if (blocked) return;
    sessionStorage.setItem(ADBLOCK_PROMPT_SESSION_KEY, '1');
    prompt.hidden = false;
}

function buildCleanEmbedUrl(sourceUrl) {
    if (!sourceUrl) return '';
    return `${API_BASE}/api/proxy/clean-embed?url=${encodeURIComponent(sourceUrl)}`;
}

function setCleanPlayerEnabled(enabled) {
    if (state.cleanPlayerEnabled === enabled) return;
    state.cleanPlayerEnabled = enabled;
    updateTmdbPlayerToolbar();
    if (tmdbBaseSources.length) {
        renderTmdbIframe(tmdbBaseSources);
    }
}

function updateTmdbPlayerToolbar() {
    const toolbar = document.getElementById('tmdbPlayerToolbar');
    const directBtn = document.getElementById('tmdbDirectBtn');
    const cleanBtn = document.getElementById('tmdbCleanBtn');
    if (!toolbar) return;
    const hasSources = tmdbBaseSources.length > 0;
    toolbar.hidden = !hasSources;
    if (!hasSources) return;
    if (directBtn) {
        directBtn.classList.toggle('is-active', !state.cleanPlayerEnabled);
    }
    if (cleanBtn) {
        cleanBtn.classList.toggle('is-active', state.cleanPlayerEnabled);
    }
}

// Utility Functions
function showLoading(show = true, message = 'Loading...') {
    const loadingEl = document.getElementById('loading');
    if (show) {
        loadingEl.querySelector('p').textContent = message;
        loadingEl.style.display = 'block';
    } else {
        loadingEl.style.display = 'none';
    }
}

const blockedTitlePattern = /\b(hindi|dubbed|dual audio)\b/i;

function isBlockedTitle(title = '') {
    return blockedTitlePattern.test(title);
}

function filterBlockedPosts(posts) {
    if (!Array.isArray(posts)) return [];
    return posts.filter(post => !isBlockedTitle(post?.title || post?.name || ''));
}

function normalizeSearchTitle(title = '') {
    return title
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeSearchQuery(query = '') {
    return normalizeSearchTitle(query).slice(0, 120);
}

function scoreSearchResult(title, normalizedQuery) {
    if (!normalizedQuery) return 0;
    const normalizedTitle = normalizeSearchTitle(title);
    if (!normalizedTitle) return 0;
    if (normalizedTitle === normalizedQuery) return 120;
    if (normalizedTitle.startsWith(normalizedQuery)) return 100;
    if (normalizedTitle.includes(normalizedQuery)) return 80;
    const queryTokens = normalizedQuery.split(' ').filter(Boolean);
    if (queryTokens.length === 0) return 0;
    const matchCount = queryTokens.filter(token => normalizedTitle.includes(token)).length;
    return 50 + matchCount * 5;
}

function selectExactMatchResults(results, normalizedQuery) {
    if (!Array.isArray(results) || !normalizedQuery) return [];
    const exactMatches = results.filter(result => normalizeSearchTitle(result.title) === normalizedQuery);
    if (exactMatches.length === 0) return [];

    exactMatches.sort((a, b) => {
        const mediaBoostA = a.media_type === 'tv' ? 1 : 0;
        const mediaBoostB = b.media_type === 'tv' ? 1 : 0;
        if (mediaBoostA !== mediaBoostB) {
            return mediaBoostB - mediaBoostA;
        }

        const popularityA = Number(a.popularity) || 0;
        const popularityB = Number(b.popularity) || 0;
        if (popularityA !== popularityB) {
            return popularityB - popularityA;
        }

        const voteCountA = Number(a.vote_count) || 0;
        const voteCountB = Number(b.vote_count) || 0;
        if (voteCountA !== voteCountB) {
            return voteCountB - voteCountA;
        }

        return 0;
    });

    return [exactMatches[0]];
}

function applySearchProviderFilter(results) {
    if (!Array.isArray(results)) return [];
    if (state.searchMediaFilter === 'movie') {
        return results.filter(result => result.media_type === 'movie');
    }
    if (state.searchMediaFilter === 'tv') {
        return results.filter(result => result.media_type === 'tv');
    }
    return results;
}

function renderSearchProviderFilters() {
    const filtersEl = document.getElementById('searchProviderFilters');
    if (!filtersEl) return;
    filtersEl.innerHTML = '';

    const filters = [
        { id: 'all', label: 'All' },
        { id: 'movie', label: 'Movies' },
        { id: 'tv', label: 'TV Shows' }
    ];

    filters.forEach(filter => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'provider-filter-btn';
        if (state.searchMediaFilter === filter.id) {
            button.classList.add('is-active');
        }
        button.textContent = filter.label;
        button.addEventListener('click', () => {
            state.searchMediaFilter = filter.id;
            renderSearchProviderFilters();
            renderSearchResults(state.searchResults);
        });
        filtersEl.appendChild(button);
    });
}

function getTmdbPosterUrl(path) {
    if (!path) {
        return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
    }
    if (window.TMDBContentModule?.getPosterUrl) {
        return window.TMDBContentModule.getPosterUrl(path);
    }
    return `https://image.tmdb.org/t/p/w500${path}`;
}

function renderSearchResults(results) {
    const resultsContainer = document.getElementById('searchMenuResults');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '';
    resultsContainer.className = 'posts-grid search-results-grid';

    const filteredResults = applySearchProviderFilter(results, state.searchProviderFilter);
    if (!filteredResults || filteredResults.length === 0) {
        resultsContainer.innerHTML = '<p class="search-empty-state">No results found. Try another search.</p>';
        return;
    }

    filteredResults.forEach(result => {
        const cardData = {
            title: result.title,
            image: getTmdbPosterUrl(result.poster_path),
            link: String(result.tmdb_id),
            tmdbId: result.tmdb_id,
            release_date: result.release_date,
            first_air_date: result.first_air_date,
            poster_path: result.poster_path,
            media_type: result.media_type,
            provider: 'tmdb'
        };
        resultsContainer.appendChild(renderPostCard(cardData, 'tmdb', { animateOnSelect: true, searchSource: 'menu' }));
    });
}

function handleSearchSelection({ provider, link, tmdbItem, source = 'menu', card }) {
    const transitionDuration = 150;
    const searchMenu = document.getElementById('searchMenu');
    const searchView = document.getElementById('searchView');

    if (card) {
        card.classList.add('is-selected');
    }

    if (source === 'menu' && searchMenu) {
        searchMenu.classList.add('is-transitioning');
    }

    if (source === 'page' && searchView) {
        searchView.classList.add('is-transitioning');
    }

    setTimeout(() => {
        if (searchMenu) {
            closeSearchMenu();
            searchMenu.classList.remove('is-transitioning');
        }

        if (searchView) {
            searchView.classList.remove('is-transitioning');
        }

        queueFullscreenRequest();
        if (tmdbItem) {
            const mediaType = tmdbItem.media_type === 'tv' ? 'tv' : 'movie';
            if (mediaType === 'tv' && typeof openTMDBTvShow === 'function') {
                openTMDBTvShow(tmdbItem);
            } else {
                openTMDBMovie(tmdbItem);
            }
        } else {
            loadPlaybackDetails(provider, link, { autoPlay: true });
        }
    }, transitionDuration);
}

function openSearchMenu(query = '') {
    const menu = document.getElementById('searchMenu');
    if (!menu) return null;
    showView('home');
    updateNavLinks('home');
    menu.hidden = false;
    menu.classList.add('is-open');
    const title = document.getElementById('searchMenuTitle');
    if (title) {
        title.textContent = query ? `Search Results for "${query}"` : 'Search Results';
    }
    if (!query) {
        resetSearchMenu();
    }
    return menu;
}

function closeSearchMenu() {
    const menu = document.getElementById('searchMenu');
    if (menu) {
        menu.classList.remove('is-open');
        menu.classList.remove('is-transitioning');
        menu.hidden = true;
    }
}

function resetSearchMenu(options = {}) {
    const resultsContainer = document.getElementById('searchMenuResults');
    const summaryEl = document.getElementById('searchSummary');
    const filtersEl = document.getElementById('searchProviderFilters');
    const { keepSummary = false } = options;
    if (resultsContainer) {
        resultsContainer.innerHTML = '<p class="search-empty-state">Start typing to search TMDB.</p>';
    }
    if (summaryEl && !keepSummary) {
        summaryEl.textContent = 'Search is ready. Type a title and we will fetch results instantly.';
    }
    if (filtersEl) {
        filtersEl.innerHTML = '';
    }
}

function createSearchProviderSection(provider) {
    const section = document.createElement('div');
    section.className = 'search-provider-section horizontal';
    section.id = `search-provider-${provider.value}`;
    section.innerHTML = `
        <div class="search-provider-header">
            <h3>${provider.display_name}</h3>
            <span class="result-count loading">Loading...</span>
        </div>
        <div class="search-provider-carousel">
            <div class="provider-loading">Fetching results...</div>
        </div>
    `;
    return section;
}

function updateSearchProviderSection(providerValue, posts) {
    const section = document.getElementById(`search-provider-${providerValue}`);
    if (!section) return;
    
    const countEl = section.querySelector('.result-count');
    const carousel = section.querySelector('.search-provider-carousel');
    if (!carousel) return;
    
    countEl?.classList.remove('loading');
    carousel.innerHTML = '';
    
    const safePosts = Array.isArray(posts) ? posts : [];
    if (safePosts.length === 0) {
        if (countEl) countEl.textContent = 'No results';
        carousel.innerHTML = '<div class="provider-empty">No titles found for this provider.</div>';
        return;
    }
    
    if (countEl) {
        countEl.textContent = `${safePosts.length} result${safePosts.length === 1 ? '' : 's'}`;
    }
    
    safePosts.forEach(post => {
        carousel.appendChild(renderPostCard({ ...post, provider: providerValue }, providerValue));
    });
}

function showSearchProviderError(providerValue, message) {
    const section = document.getElementById(`search-provider-${providerValue}`);
    if (!section) return;
    
    const countEl = section.querySelector('.result-count');
    const carousel = section.querySelector('.search-provider-carousel');
    countEl?.classList.remove('loading');
    if (countEl) countEl.textContent = 'Error';
    if (carousel) {
        carousel.innerHTML = `<div class="provider-error">${message || 'Failed to fetch results.'}</div>`;
    }
}

function showToast(message, type = 'info', duration = 1000) {
    // Create toast container if not exists
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.style.cssText = `
        background: ${type === 'error' ? '#e50914' : type === 'success' ? '#4CAF50' : '#333'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        min-width: 250px;
        max-width: 400px;
        animation: slideInRight 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    
    const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    toast.innerHTML = `<span style="font-size: 18px;">${icon}</span><span style="flex: 1;">${message}</span>`;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function buildPlaybackUrl(provider, link) {
    const url = new URL(window.location.href);
    url.searchParams.set('provider', provider);
    url.searchParams.set('link', link);
    url.searchParams.set('autoplay', '1');
    return url.toString();
}

function openPlaybackTab(provider, link) {
    if (!provider || !link) return;
    const url = buildPlaybackUrl(provider, link);
    const popup = window.open(url, '_blank', 'noopener');
    if (!popup) {
        window.location.href = url;
        showToast('Popup blocked. Opening playback in this tab.', 'info', 2500);
    }
}

window.openPlaybackTab = openPlaybackTab;

function buildVidplusTvEmbedUrl(tvId, season, episode) {
    return `https://player.vidplus.to/embed/tv/${tvId}/${season}/${episode}?autoplay=true&autonext=true`;
}

function buildVidsrcTvFallbackUrl(tvId, season, episode) {
    return `https://dl.vidsrc.vip/tv/${tvId}/${season}/${episode}`;
}

function buildVidplusMovieEmbedUrl(movieId) {
    return `https://player.vidplus.pro/embed/movie/${movieId}?autoplay=true`;
}

function buildVidsrcMovieFallbackUrl(movieId) {
    return `https://dl.vidsrc.vip/movie/${movieId}`;
}

function buildVidsrcImdbMovieFallbackUrl(imdbId) {
    return `https://dl.vidsrc.vip/movie/${imdbId}`;
}

function build2EmbedTmdbMovieFallbackUrl(movieId) {
    return `https://www.2embed.cc/embed/tmdb/movie?id=${movieId}`;
}

function build2EmbedImdbMovieFallbackUrl(imdbId) {
    return `https://www.2embed.cc/embed/imdb/movie?id=${imdbId}`;
}

function renderTmdbIframe(embedUrl) {
    const tmdbMessage = document.getElementById('tmdbPlayerMessage');
    const tmdbIframeContainer = document.getElementById('tmdbIframeContainer');
    const baseSources = Array.isArray(embedUrl) ? embedUrl.filter(Boolean) : [embedUrl].filter(Boolean);
    tmdbBaseSources = baseSources;
    updateTmdbPlayerToolbar();

    const cleanSources = state.cleanPlayerEnabled ? baseSources.map(buildCleanEmbedUrl).filter(Boolean) : [];
    const sources = state.cleanPlayerEnabled ? [...cleanSources, ...baseSources] : baseSources;

    if (tmdbIframeContainer) {
        tmdbIframeContainer.innerHTML = '';
    }

    if (sources.length === 0) {
        if (tmdbMessage) {
            tmdbMessage.textContent = 'Source unavailable';
        }
        return;
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    iframe.setAttribute('loading', 'lazy');
    iframe.addEventListener('pointerdown', () => {
        window.registerEmbedInteraction?.();
    });

    let fallbackTimeout = null;
    let currentIndex = 0;

    const showFallback = () => {
        if (tmdbMessage) {
            tmdbMessage.textContent = 'Playback failed to load. Please try again later.';
        }
    };

    const handleFailure = () => {
        if (currentIndex < sources.length - 1) {
            if (tmdbMessage) {
                tmdbMessage.textContent = 'Trying alternate source...';
            }
            loadSource(currentIndex + 1);
            return;
        }
        showFallback();
    };

    const loadSource = (index) => {
        currentIndex = index;
        const nextUrl = sources[index];
        if (!nextUrl) return;
        iframe.src = nextUrl;
        if (tmdbMessage) {
            const usingClean = state.cleanPlayerEnabled && index < cleanSources.length;
            tmdbMessage.textContent = usingClean ? 'Loading clean player (beta)...' : 'Loading player...';
        }
        if (fallbackTimeout) {
            clearTimeout(fallbackTimeout);
        }
        fallbackTimeout = setTimeout(handleFailure, 8000);
    };

    iframe.addEventListener('load', () => {
        if (tmdbMessage) {
            tmdbMessage.textContent = '';
        }
        if (fallbackTimeout) {
            clearTimeout(fallbackTimeout);
        }
    });

    iframe.addEventListener('error', handleFailure);

    if (tmdbIframeContainer) {
        tmdbIframeContainer.appendChild(iframe);
    }
    loadSource(0);
}

const adBlockConfig = {
    hostKeywords: [
        'doubleclick',
        'googlesyndication',
        'googleadservices',
        'adservice',
        'adsystem',
        'adnxs',
        'adzerk',
        'taboola',
        'outbrain',
        'popads',
        'propellerads',
        'mgid',
        'zedo',
        'adsrvr',
        'criteo',
        'adroll',
        'openx',
        'rubiconproject',
        'smartadserver',
        'casalemedia',
        'scorecardresearch',
        'revcontent'
    ],
    elementSelectors: [
        '[id^="ad-"]',
        '[id^="ads-"]',
        '[id$="-ad"]',
        '[id$="-ads"]',
        '[id*="-ad-"]',
        '[id*="-ads-"]',
        '[id*="sponsor"]',
        '[class^="ad-"]',
        '[class^="ads-"]',
        '[class$="-ad"]',
        '[class$="-ads"]',
        '[class*=" ad-"]',
        '[class*=" ads-"]',
        '[class*="-ad-"]',
        '[class*="-ads-"]',
        '[class~="ad"]',
        '[class~="ads"]',
        '[class*="sponsor"]',
        '[class*="banner"]',
        '[class*="promo"]',
        '.adsbox',
        '.ad-banner',
        '.ad-container',
        '.banner-ad',
        '.sponsored',
        '.sponsor',
        'iframe[src*="ads"]',
        'iframe[src*="adservice"]',
        'script[src*="ads"]'
    ],
    filterRules: [
        '||doubleclick.net^',
        '||googlesyndication.com^',
        '||googleadservices.com^',
        '||adservice.google.com^',
        '||adnxs.com^',
        '||adzerk.net^',
        '||taboola.com^',
        '||outbrain.com^',
        '||popads.net^',
        '||propellerads.com^',
        '||mgid.com^',
        '||zedo.com^',
        '||adsrvr.org^',
        '||criteo.com^',
        '||adroll.com^',
        '||openx.net^',
        '||rubiconproject.com^',
        '||smartadserver.com^',
        '||casalemedia.com^',
        '||scorecardresearch.com^',
        '||revcontent.com^',
        '*/ads/*',
        '*/adservice/*',
        '*/banner/*',
        '*/sponsor/*',
        '*/sponsored/*',
        '*/analytics/*'
    ],
    allowRules: [
        '@@||stripe.com^',
        '@@||js.stripe.com^',
        '@@||maps.googleapis.com^'
    ]
};

function isAdHost(hostname) {
    if (!hostname) return false;
    const host = hostname.toLowerCase();
    return adBlockConfig.hostKeywords.some(keyword => host.includes(keyword));
}

function normalizeUrlForMatching(url) {
    if (!url) return '';
    try {
        return new URL(url, window.location.href).toString();
    } catch (error) {
        return String(url);
    }
}

function tokenizeRule(rule) {
    const isAllow = rule.startsWith('@@');
    const rawRule = isAllow ? rule.slice(2) : rule;
    const startsWithDomain = rawRule.startsWith('||');
    const cleaned = rawRule.replace(/^\|\|/, '');
    return { isAllow, startsWithDomain, rule: cleaned };
}

function matchRule(rule, url) {
    const { startsWithDomain, rule: cleaned } = tokenizeRule(rule);
    if (!cleaned) return false;
    if (startsWithDomain) {
        try {
            const parsed = new URL(url, window.location.href);
            const host = parsed.hostname.toLowerCase();
            const domain = cleaned.replace(/\^$/, '').toLowerCase();
            if (!domain) return false;
            return host === domain || host.endsWith(`.${domain}`);
        } catch (error) {
            return false;
        }
    }
    const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped.replace(/\\\*/g, '.*').replace(/\\\^/g, '(?:$|[\\/?#:&=])'), 'i');
    return regex.test(url);
}

function matchesFilterRules(url) {
    const normalized = normalizeUrlForMatching(url);
    if (!normalized) return false;
    const allowMatch = adBlockConfig.allowRules.some((rule) => matchRule(rule, normalized));
    if (allowMatch) return false;
    return adBlockConfig.filterRules.some((rule) => matchRule(rule, normalized));
}

function isAdUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url, window.location.href);
        return isAdHost(parsed.hostname) || matchesFilterRules(parsed.toString());
    } catch (error) {
        return matchesFilterRules(url);
    }
}

function hideAdElement(element) {
    if (!element || element.dataset?.adblocked) return;
    element.dataset.adblocked = 'true';
    element.style.setProperty('display', 'none', 'important');
    element.setAttribute('aria-hidden', 'true');
}

function blockAdElements(root = document) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(adBlockConfig.elementSelectors.join(',')).forEach(hideAdElement);
    root.querySelectorAll('[src],[href]').forEach((node) => {
        const url = node.getAttribute('src') || node.getAttribute('href');
        if (isAdUrl(url)) {
            hideAdElement(node);
        }
    });
}

function initAdBlocker() {
    if (window.__adBlockEnabled) return;
    window.__adBlockEnabled = true;

    let lastEmbedInteractionAt = 0;
    window.registerEmbedInteraction = () => {
        lastEmbedInteractionAt = Date.now();
    };

    const isSameOrigin = (url) => {
        try {
            return new URL(url, window.location.href).origin === window.location.origin;
        } catch (error) {
            return false;
        }
    };

    const isExternalUrl = (url) => {
        if (!url) return false;
        return !isSameOrigin(url);
    };

    const softenPopup = (popup) => {
        if (!popup) return;
        try {
            popup.blur?.();
            window.focus?.();
        } catch (error) {
            console.warn('Adblock: unable to blur popup', error);
        }
        setTimeout(() => {
            try {
                popup.close?.();
            } catch (error) {
                console.warn('Adblock: unable to close popup', error);
            }
        }, 800);
    };

    const style = document.createElement('style');
    style.id = 'adblock-style';
    style.textContent = `
        ${adBlockConfig.elementSelectors.join(',')} {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
    `;
    document.head.appendChild(style);

    const guardNavigation = (url, context) => {
        const normalizedUrl = typeof url === 'string' ? url.trim() : '';
        if (!normalizedUrl) return { allowed: false, normalizedUrl };
        if (normalizedUrl === 'about:blank' || isAdUrl(normalizedUrl)) {
            console.warn(`🛑 Adblock: blocked ${context}`, normalizedUrl);
            return { allowed: false, normalizedUrl };
        }
        if (isExternalUrl(normalizedUrl)) {
            const allowedByUser = consumeExternalNavigationAllowance();
            const fromEmbed = Date.now() - lastEmbedInteractionAt < 1500;
            if (fromEmbed) {
                console.warn(`🛑 Adblock: blocked embed ${context}`, normalizedUrl);
                return { allowed: false, normalizedUrl, soften: context === 'popup' };
            }
            if (!allowedByUser) {
                console.warn(`🛑 Adblock: blocked external ${context}`, normalizedUrl);
                return { allowed: false, normalizedUrl, soften: fromEmbed && context === 'popup' };
            }
        }
        return { allowed: true, normalizedUrl, soften: false };
    };

    const originalOpen = window.open;
    window.open = function (url, target, features) {
        const { allowed, normalizedUrl, soften } = guardNavigation(url, 'popup');
        if (!allowed) return null;
        const popup = originalOpen.call(window, normalizedUrl, target, features);
        if (soften || !isSameOrigin(normalizedUrl)) {
            softenPopup(popup);
        }
        return popup;
    };

    const patchLocation = () => {
        const locationPrototype = Object.getPrototypeOf(window.location);
        if (!locationPrototype) return;

        const originalAssign = locationPrototype.assign?.bind(window.location);
        if (originalAssign) {
            try {
                locationPrototype.assign = function (url) {
                    const { allowed, normalizedUrl } = guardNavigation(url, 'redirect');
                    if (!allowed) return;
                    return originalAssign(normalizedUrl);
                };
            } catch (error) {
                console.warn('Adblock: unable to override location.assign', error);
            }
        }

        const originalReplace = locationPrototype.replace?.bind(window.location);
        if (originalReplace) {
            try {
                locationPrototype.replace = function (url) {
                    const { allowed, normalizedUrl } = guardNavigation(url, 'redirect');
                    if (!allowed) return;
                    return originalReplace(normalizedUrl);
                };
            } catch (error) {
                console.warn('Adblock: unable to override location.replace', error);
            }
        }

        const hrefDescriptor = Object.getOwnPropertyDescriptor(locationPrototype, 'href');
        if (hrefDescriptor?.set && hrefDescriptor?.configurable) {
            try {
                Object.defineProperty(locationPrototype, 'href', {
                    get: hrefDescriptor.get?.bind(window.location),
                    set: (url) => {
                        const { allowed, normalizedUrl } = guardNavigation(url, 'redirect');
                        if (!allowed) return;
                        hrefDescriptor.set.call(window.location, normalizedUrl);
                    }
                });
            } catch (error) {
                console.warn('Adblock: unable to override location.href', error);
            }
        }
    };
    patchLocation();

    document.addEventListener('click', (event) => {
        const anchor = event.target?.closest?.('a');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        const { allowed } = guardNavigation(href, 'link');
        if (!allowed) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);

    document.addEventListener('submit', (event) => {
        const form = event.target;
        if (!form || !form.getAttribute) return;
        const action = form.getAttribute('action');
        const { allowed } = guardNavigation(action, 'form redirect');
        if (!allowed) {
            event.preventDefault();
            event.stopPropagation();
        }
    }, true);

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                blockAdElements(node);
            });
        });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    blockAdElements(document);

    const shouldBlockRequest = (url, context) => {
        const normalizedUrl = normalizeUrlForMatching(url);
        if (!normalizedUrl) return false;
        if (matchesFilterRules(normalizedUrl) || isAdUrl(normalizedUrl)) {
            console.warn(`🛑 Adblock: blocked ${context}`, normalizedUrl);
            return true;
        }
        return false;
    };

    const originalFetch = window.fetch?.bind(window);
    if (originalFetch) {
        window.fetch = (input, init) => {
            const url = typeof input === 'string' ? input : input?.url;
            if (shouldBlockRequest(url, 'fetch')) {
                return Promise.reject(new Error('Blocked by adblock'));
            }
            return originalFetch(input, init);
        };
    }

    const originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        if (shouldBlockRequest(url, 'xhr')) {
            this.abort();
            return;
        }
        return originalXhrOpen.call(this, method, url, ...rest);
    };

    const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
    if (originalSendBeacon) {
        navigator.sendBeacon = (url, data) => {
            if (shouldBlockRequest(url, 'beacon')) return false;
            return originalSendBeacon(url, data);
        };
    }

    const patchAttribute = (prototype, attribute, context) => {
        if (!prototype) return;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, attribute);
        if (!descriptor?.set) return;
        Object.defineProperty(prototype, attribute, {
            get: descriptor.get,
            set: function (value) {
                if (shouldBlockRequest(value, context)) {
                    this.removeAttribute?.(attribute);
                    return;
                }
                descriptor.set.call(this, value);
            }
        });
    };

    patchAttribute(HTMLImageElement.prototype, 'src', 'image');
    patchAttribute(HTMLIFrameElement.prototype, 'src', 'iframe');
    patchAttribute(HTMLScriptElement.prototype, 'src', 'script');
    patchAttribute(HTMLLinkElement.prototype, 'href', 'link');
}

async function resolveImdbId(tmdbId) {
    const cached = getCachedImdbId(tmdbId);
    if (cached.hit) {
        return cached.value;
    }

    const apiKey = getTmdbApiKey();
    if (!apiKey) {
        return null;
    }

    try {
        const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${apiKey}`);
        if (!response.ok) {
            throw new Error(`TMDB external_ids failed: ${response.status}`);
        }
        const data = await response.json();
        const imdbId = data.imdb_id || null;
        setCachedImdbId(tmdbId, imdbId);
        return imdbId;
    } catch (error) {
        console.error('Failed to resolve IMDb ID:', error);
        return null;
    }
}

function updateImdbRoute(imdbId) {
    if (!imdbId) return;
    const newUrl = `/movie/${imdbId}`;
    window.history.pushState({ imdbId }, '', newUrl);
}

function renderTmdbPlayer({ title, posterPath, releaseDate, imdbId, tmdbId }) {
    const playerMeta = document.getElementById('playerMeta');
    const videoPlayer = document.getElementById('videoPlayer');
    const tmdbContainer = document.getElementById('tmdbPlayerContainer');
    const tmdbMessage = document.getElementById('tmdbPlayerMessage');
    const providerSelector = document.getElementById('providerSelector');
    const streamSelector = document.getElementById('streamSelector');
    const playerEpisodes = document.getElementById('playerEpisodes');
    const tmdbTvControls = document.getElementById('tmdbTvControls');

    if (videoPlayer) {
        videoPlayer.pause?.();
        videoPlayer.style.display = 'none';
    }
    if (providerSelector) providerSelector.innerHTML = '';
    if (streamSelector) streamSelector.innerHTML = '';
    if (playerEpisodes) playerEpisodes.innerHTML = '';

    if (tmdbTvControls) {
        tmdbTvControls.hidden = true;
    }
    resetTmdbTvState();

    if (playerMeta) {
        playerMeta.innerHTML = `
            <h1>${title || 'Movie'}</h1>
            <p>${releaseDate ? `Release: ${releaseDate}` : ''}</p>
        `;
    }

    if (tmdbContainer) {
        tmdbContainer.style.display = 'block';
    }
    const embedSources = [
        tmdbId ? buildVidplusMovieEmbedUrl(tmdbId) : null,
        tmdbId ? build2EmbedTmdbMovieFallbackUrl(tmdbId) : null,
        tmdbId ? buildVidsrcMovieFallbackUrl(tmdbId) : null,
        imdbId ? build2EmbedImdbMovieFallbackUrl(imdbId) : null,
        imdbId ? buildVidsrcImdbMovieFallbackUrl(imdbId) : null
    ].filter(Boolean);

    if (tmdbMessage && embedSources.length === 0) {
        tmdbMessage.textContent = 'Source unavailable';
    }
    renderTmdbIframe(embedSources);

    attemptPlayerFullscreen();
}

function resetTmdbTvState() {
    tmdbTvState.tvId = null;
    tmdbTvState.title = '';
    tmdbTvState.seasons = [];
    tmdbTvState.seasonNumber = null;
    tmdbTvState.episodes = [];
    tmdbTvState.episodeNumber = null;
    if (tmdbTvState.messageHandler) {
        window.removeEventListener('message', tmdbTvState.messageHandler);
        tmdbTvState.messageHandler = null;
    }
}

function updateTmdbTvControlsVisibility(visible) {
    const tmdbTvControls = document.getElementById('tmdbTvControls');
    if (tmdbTvControls) {
        tmdbTvControls.hidden = !visible;
    }
}

function updateTmdbTvMeta() {
    const titleEl = document.getElementById('tmdbTvTitle');
    const metaEl = document.getElementById('tmdbTvEpisodeMeta');
    if (titleEl) {
        titleEl.textContent = tmdbTvState.title || 'TV Show';
    }
    if (metaEl) {
        const seasonText = tmdbTvState.seasonNumber != null ? `Season ${tmdbTvState.seasonNumber}` : '';
        const episode = tmdbTvState.episodes.find(item => item.episode_number === tmdbTvState.episodeNumber);
        const episodeText = tmdbTvState.episodeNumber != null ? `Episode ${tmdbTvState.episodeNumber}` : '';
        const titleText = episode?.name ? `• ${episode.name}` : '';
        const baseText = [seasonText, episodeText].filter(Boolean).join(' ');
        metaEl.textContent = `${baseText} ${titleText}`.trim();
    }
}

function updateTmdbEpisodeButtons() {
    const prevBtn = document.getElementById('tmdbPrevEpisode');
    const nextBtn = document.getElementById('tmdbNextEpisode');
    if (!prevBtn || !nextBtn) return;

    const episodeIndex = tmdbTvState.episodes.findIndex(
        item => item.episode_number === tmdbTvState.episodeNumber
    );
    const hasPrevEpisode = episodeIndex > 0;
    const hasNextEpisode = episodeIndex >= 0 && episodeIndex < tmdbTvState.episodes.length - 1;
    const currentSeasonIndex = tmdbTvState.seasons.findIndex(
        season => season.season_number === tmdbTvState.seasonNumber
    );
    const hasPrevSeason = currentSeasonIndex > 0;
    const hasNextSeason = currentSeasonIndex >= 0 && currentSeasonIndex < tmdbTvState.seasons.length - 1;

    prevBtn.disabled = !(hasPrevEpisode || hasPrevSeason);
    nextBtn.disabled = !(hasNextEpisode || hasNextSeason);
}

function populateTmdbSeasonSelect() {
    const seasonSelect = document.getElementById('tmdbSeasonSelect');
    if (!seasonSelect) return;
    seasonSelect.innerHTML = '';

    tmdbTvState.seasons.forEach(season => {
        const option = document.createElement('option');
        option.value = String(season.season_number);
        option.textContent = season.name || `Season ${season.season_number}`;
        if (season.episode_count) {
            option.textContent += ` (${season.episode_count} eps)`;
        }
        seasonSelect.appendChild(option);
    });

    if (tmdbTvState.seasonNumber != null) {
        seasonSelect.value = String(tmdbTvState.seasonNumber);
    }
}

function populateTmdbEpisodeSelect() {
    const episodeSelect = document.getElementById('tmdbEpisodeSelect');
    if (!episodeSelect) return;
    episodeSelect.innerHTML = '';

    tmdbTvState.episodes.forEach(episode => {
        const option = document.createElement('option');
        option.value = String(episode.episode_number);
        option.textContent = `E${episode.episode_number} · ${episode.name || 'Episode'}`;
        episodeSelect.appendChild(option);
    });

    if (tmdbTvState.episodeNumber != null) {
        episodeSelect.value = String(tmdbTvState.episodeNumber);
    }
}

function playTmdbEpisode() {
    if (!tmdbTvState.tvId || tmdbTvState.seasonNumber == null || tmdbTvState.episodeNumber == null) {
        return;
    }
    const embedSources = [
        buildVidplusTvEmbedUrl(
            tmdbTvState.tvId,
            tmdbTvState.seasonNumber,
            tmdbTvState.episodeNumber
        ),
        buildVidsrcTvFallbackUrl(
            tmdbTvState.tvId,
            tmdbTvState.seasonNumber,
            tmdbTvState.episodeNumber
        )
    ];
    renderTmdbIframe(embedSources);
    updateTmdbTvMeta();
    populateTmdbEpisodeSelect();
    updateTmdbEpisodeButtons();
}

async function fetchTmdbTvDetails(tvId) {
    const apiKey = getTmdbApiKey();
    if (!apiKey) {
        throw new Error('TMDB API key missing');
    }
    const response = await fetch(`https://api.themoviedb.org/3/tv/${tvId}?api_key=${apiKey}`);
    if (!response.ok) {
        throw new Error(`TMDB TV details failed: ${response.status}`);
    }
    return response.json();
}

async function fetchTmdbSeasonDetails(tvId, seasonNumber) {
    const apiKey = getTmdbApiKey();
    if (!apiKey) {
        throw new Error('TMDB API key missing');
    }
    const response = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNumber}?api_key=${apiKey}`);
    if (!response.ok) {
        throw new Error(`TMDB season details failed: ${response.status}`);
    }
    return response.json();
}

async function loadTmdbSeason(tvId, seasonNumber, options = {}) {
    const seasonData = await fetchTmdbSeasonDetails(tvId, seasonNumber);
    tmdbTvState.episodes = Array.isArray(seasonData.episodes) ? seasonData.episodes : [];
    tmdbTvState.seasonNumber = seasonNumber;
    if (tmdbTvState.episodes.length === 0) {
        renderTmdbIframe('');
        const tmdbMessage = document.getElementById('tmdbPlayerMessage');
        if (tmdbMessage) {
            tmdbMessage.textContent = 'No episodes available for this season yet.';
        }
        populateTmdbSeasonSelect();
        populateTmdbEpisodeSelect();
        updateTmdbEpisodeButtons();
        return;
    }
    const desiredEpisode = options.episodeNumber;
    const hasDesired = tmdbTvState.episodes.some(
        episode => episode.episode_number === desiredEpisode
    );
    tmdbTvState.episodeNumber = hasDesired
        ? desiredEpisode
        : (tmdbTvState.episodes[0]?.episode_number ?? null);
    populateTmdbSeasonSelect();
    populateTmdbEpisodeSelect();
    playTmdbEpisode();
}

async function nextTmdbEpisode() {
    const currentIndex = tmdbTvState.episodes.findIndex(
        item => item.episode_number === tmdbTvState.episodeNumber
    );
    if (currentIndex >= 0 && currentIndex < tmdbTvState.episodes.length - 1) {
        tmdbTvState.episodeNumber = tmdbTvState.episodes[currentIndex + 1].episode_number;
        playTmdbEpisode();
        return;
    }

    const seasonIndex = tmdbTvState.seasons.findIndex(
        season => season.season_number === tmdbTvState.seasonNumber
    );
    if (seasonIndex >= 0 && seasonIndex < tmdbTvState.seasons.length - 1) {
        const nextSeason = tmdbTvState.seasons[seasonIndex + 1];
        await loadTmdbSeason(tmdbTvState.tvId, nextSeason.season_number);
    }
}

async function prevTmdbEpisode() {
    const currentIndex = tmdbTvState.episodes.findIndex(
        item => item.episode_number === tmdbTvState.episodeNumber
    );
    if (currentIndex > 0) {
        tmdbTvState.episodeNumber = tmdbTvState.episodes[currentIndex - 1].episode_number;
        playTmdbEpisode();
        return;
    }

    const seasonIndex = tmdbTvState.seasons.findIndex(
        season => season.season_number === tmdbTvState.seasonNumber
    );
    if (seasonIndex > 0) {
        const prevSeason = tmdbTvState.seasons[seasonIndex - 1];
        await loadTmdbSeason(tmdbTvState.tvId, prevSeason.season_number, {
            episodeNumber: prevSeason.episode_count
        });
    }
}

function attachTmdbTvListeners() {
    const seasonSelect = document.getElementById('tmdbSeasonSelect');
    const episodeSelect = document.getElementById('tmdbEpisodeSelect');
    const prevBtn = document.getElementById('tmdbPrevEpisode');
    const nextBtn = document.getElementById('tmdbNextEpisode');

    if (seasonSelect) {
        seasonSelect.onchange = () => {
            const newSeason = Number(seasonSelect.value);
            if (Number.isNaN(newSeason)) return;
            loadTmdbSeason(tmdbTvState.tvId, newSeason);
        };
    }

    if (episodeSelect) {
        episodeSelect.onchange = () => {
            const newEpisode = Number(episodeSelect.value);
            if (Number.isNaN(newEpisode)) return;
            tmdbTvState.episodeNumber = newEpisode;
            playTmdbEpisode();
        };
    }

    if (prevBtn) {
        prevBtn.onclick = () => prevTmdbEpisode();
    }

    if (nextBtn) {
        nextBtn.onclick = () => nextTmdbEpisode();
    }
}

function setupTmdbTvMessageListener() {
    if (tmdbTvState.messageHandler) {
        window.removeEventListener('message', tmdbTvState.messageHandler);
    }
    tmdbTvState.messageHandler = (event) => {
        const data = event?.data;
        if (!data) return;
        const eventType = data.event || data.type || data.action;
        if (eventType === 'ended' || eventType === 'videoEnded' || eventType === 'episodeEnded') {
            nextTmdbEpisode();
        }
    };
    window.addEventListener('message', tmdbTvState.messageHandler);
}

async function renderTmdbTvPlayer({ tmdbId, title, firstAirDate }) {
    const playerMeta = document.getElementById('playerMeta');
    const videoPlayer = document.getElementById('videoPlayer');
    const tmdbContainer = document.getElementById('tmdbPlayerContainer');
    const providerSelector = document.getElementById('providerSelector');
    const streamSelector = document.getElementById('streamSelector');
    const playerEpisodes = document.getElementById('playerEpisodes');

    if (videoPlayer) {
        videoPlayer.pause?.();
        videoPlayer.style.display = 'none';
    }
    if (providerSelector) providerSelector.innerHTML = '';
    if (streamSelector) streamSelector.innerHTML = '';
    if (playerEpisodes) playerEpisodes.innerHTML = '';

    if (playerMeta) {
        playerMeta.innerHTML = `
            <h1>${title || 'TV Show'}</h1>
            <p>${firstAirDate ? `First Air Date: ${firstAirDate}` : ''}</p>
        `;
    }

    if (tmdbContainer) {
        tmdbContainer.style.display = 'block';
    }

    resetTmdbTvState();
    tmdbTvState.tvId = tmdbId;
    tmdbTvState.title = title || 'TV Show';

    const details = await fetchTmdbTvDetails(tmdbId);
    const seasons = Array.isArray(details.seasons) ? details.seasons : [];
    tmdbTvState.seasons = seasons
        .filter(season => season.season_number !== null && season.episode_count)
        .sort((a, b) => a.season_number - b.season_number);

    const initialSeason = tmdbTvState.seasons.find(season => season.season_number > 0)
        || tmdbTvState.seasons[0];

    updateTmdbTvControlsVisibility(true);
    populateTmdbSeasonSelect();
    attachTmdbTvListeners();
    setupTmdbTvMessageListener();

    if (initialSeason) {
        await loadTmdbSeason(tmdbId, initialSeason.season_number);
    } else {
        renderTmdbIframe('');
        const tmdbMessage = document.getElementById('tmdbPlayerMessage');
        if (tmdbMessage) {
            tmdbMessage.textContent = 'No episodes available for this show yet.';
        }
    }

    attemptPlayerFullscreen();
}

function resetTmdbPlayer() {
    const tmdbContainer = document.getElementById('tmdbPlayerContainer');
    const tmdbMessage = document.getElementById('tmdbPlayerMessage');
    const tmdbIframeContainer = document.getElementById('tmdbIframeContainer');
    const videoPlayer = document.getElementById('videoPlayer');
    const tmdbTvControls = document.getElementById('tmdbTvControls');
    const tmdbToolbar = document.getElementById('tmdbPlayerToolbar');

    if (tmdbContainer) {
        tmdbContainer.style.display = 'none';
    }
    if (tmdbMessage) {
        tmdbMessage.textContent = '';
    }
    if (tmdbIframeContainer) {
        tmdbIframeContainer.innerHTML = '';
    }
    if (tmdbToolbar) {
        tmdbToolbar.hidden = true;
    }
    if (tmdbTvControls) {
        tmdbTvControls.hidden = true;
    }
    tmdbBaseSources = [];
    resetTmdbTvState();
    if (videoPlayer) {
        videoPlayer.style.display = 'block';
    }
}

async function openTMDBMovie(item) {
    const tmdbId = item?.tmdb_id || item?.id;
    if (!tmdbId) return;
    showLoading(true, 'Resolving IMDb ID...');
    const imdbId = await resolveImdbId(tmdbId);
    showLoading(false);
    state.currentMeta = null;
    updateImdbRoute(imdbId);
    renderTmdbPlayer({
        title: item?.title || item?.name || 'Movie',
        posterPath: item?.poster_path,
        releaseDate: item?.release_date,
        imdbId,
        tmdbId
    });
    showView('player');
}

async function openTMDBTvShow(item) {
    const tmdbId = item?.tmdb_id || item?.id;
    if (!tmdbId) return;
    showLoading(true, 'Loading TV show...');
    try {
        state.currentMeta = null;
        await renderTmdbTvPlayer({
            tmdbId,
            title: item?.title || item?.name || 'TV Show',
            firstAirDate: item?.first_air_date || item?.release_date || ''
        });
        showView('player');
    } catch (error) {
        console.error('Failed to load TMDB TV show:', error);
        showError('Failed to load TV show: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function openImdbRoute(imdbId) {
    if (!imdbId) return;
    state.currentMeta = null;
    renderTmdbPlayer({
        title: `IMDb ${imdbId}`,
        posterPath: null,
        releaseDate: null,
        imdbId,
        tmdbId: null
    });
    showView('player');
}

window.openTMDBMovie = openTMDBMovie;
window.openTMDBTvShow = openTMDBTvShow;

function syncHeaderSearchInput(value) {
    const searchInputHeader = document.getElementById('searchInputHeader');
    if (searchInputHeader && searchInputHeader.value !== value) {
        searchInputHeader.value = value;
    }
    updateHeaderSearchState(value);
}

function updateHeaderSearchState(valueOverride = null) {
    const searchInputHeader = document.getElementById('searchInputHeader');
    const container = document.querySelector('.search-icon-container');
    const clearBtn = document.getElementById('searchClearHeader');
    const value = valueOverride !== null ? valueOverride : (searchInputHeader?.value || '');
    const hasQuery = value.trim().length > 0;
    if (container) {
        container.classList.toggle('has-query', hasQuery);
    }
    if (clearBtn) {
        clearBtn.setAttribute('aria-hidden', hasQuery ? 'false' : 'true');
    }
}

function showError(message, downloadLink = null) {
    const errorEl = document.getElementById('errorMessage');
    
    // Clear previous content
    errorEl.innerHTML = '';
    
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.style.whiteSpace = 'pre-wrap';
    messageDiv.textContent = message;
    errorEl.appendChild(messageDiv);
    
    // Add download button if link provided
    if (downloadLink) {
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '⬇️ Download File';
        downloadBtn.style.cssText = 'margin-top: 10px; padding: 8px 16px; background: #e50914; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 14px;';
        downloadBtn.onclick = () => {
            console.log('Opening download link:', downloadLink);
            openExternalUrl(downloadLink, { target: '_blank' });
        };
        errorEl.appendChild(downloadBtn);
    }
    
    errorEl.style.display = 'block';
    
    // Also show toast
    showToast(message.split('\n')[0], 'error', downloadLink ? 10000 : 2000);
    
    // Auto-hide  (longer for errors with download links)
    setTimeout(() => {
        errorEl.style.display = 'none';
    }, downloadLink ? 15000 : 2000);
}

function hideAllViews() {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
}

function isFullscreenActive() {
    return Boolean(document.fullscreenElement);
}

function queueFullscreenRequest() {
    state.pendingFullscreenRequest = true;
}

function requestFullscreenForElement(element) {
    if (!element || !element.requestFullscreen) return false;
    element.requestFullscreen().catch((error) => {
        console.warn('Fullscreen request failed:', error);
    });
    return true;
}

function requestPlayerFullscreen() {
    const tmdbContainer = document.getElementById('tmdbPlayerContainer');
    const tmdbIframeContainer = document.getElementById('tmdbIframeContainer');
    const video = document.getElementById('videoPlayer');
    if (tmdbContainer && tmdbContainer.style.display !== 'none' && tmdbIframeContainer?.children.length) {
        return requestFullscreenForElement(tmdbContainer);
    }
    if (video) {
        return requestFullscreenForElement(video);
    }
    return false;
}

function attemptPlayerFullscreen() {
    if (!state.pendingFullscreenRequest) return;
    state.pendingFullscreenRequest = false;
    requestPlayerFullscreen();
}

function handleBackAction() {
    if (isFullscreenActive()) {
        document.exitFullscreen().catch((error) => {
            console.warn('Failed to exit fullscreen:', error);
        });
        state.fullscreenExitArmed = true;
        return;
    }

    if (state.fullscreenExitArmed) {
        state.fullscreenExitArmed = false;
        if (state.selectedProvider) {
            loadHomePage();
            updateNavLinks('home');
        }
        return;
    }
}

function initBackNavigationHandlers() {
    document.addEventListener('keydown', (event) => {
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
        }
        const key = event.key;
        if (key === 'ArrowLeft' && focusClosestCinematicTile('left')) {
            event.preventDefault();
            return;
        }
        if (key === 'ArrowRight' && focusClosestCinematicTile('right')) {
            event.preventDefault();
            return;
        }
        if (key === 'ArrowUp' && focusClosestCinematicTile('up')) {
            event.preventDefault();
            return;
        }
        if (key === 'ArrowDown' && focusClosestCinematicTile('down')) {
            event.preventDefault();
            return;
        }
        if (key === 'Escape' || key === 'BrowserBack' || key === 'Backspace') {
            handleBackAction();
        }
    });

    const pollGamepad = () => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gamepad of gamepads) {
            if (!gamepad) continue;
            const backButton = gamepad.buttons?.[1];
            const isPressed = Boolean(backButton && backButton.pressed);
            if (isPressed && !state.gamepadBackPressed) {
                state.gamepadBackPressed = true;
                handleBackAction();
            } else if (!isPressed && state.gamepadBackPressed) {
                state.gamepadBackPressed = false;
            }
        }
        window.requestAnimationFrame(pollGamepad);
    };

    window.addEventListener('gamepadconnected', () => {
        if (!state.gamepadPolling) {
            state.gamepadPolling = true;
            pollGamepad();
        }
    });
}

function showView(viewName) {
    hideAllViews();
    
    // Clear error messages when navigating away from player
    if (state.currentView === 'player' && viewName !== 'player') {
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            errorEl.style.display = 'none';
            errorEl.innerHTML = '';
        }
        resetTmdbPlayer();
    }
    
    const viewMap = {
        home: 'homeView',
        search: 'searchView',
        details: 'detailsView',
        player: 'playerView',
        explore: 'exploreView',
        movies: 'moviesView',
        tvshows: 'tvShowsView',
        history: 'historyView',
    };
    const viewId = viewMap[viewName];
    if (viewId) {
        document.getElementById(viewId).style.display = 'block';
    }
    state.currentView = viewName;
    if (viewName !== 'player') {
        state.fullscreenExitArmed = false;
    }

    const playerView = document.getElementById('playerView');
    if (playerView) {
        if (viewName === 'player') {
            maybeShowAdblockPrompt();
            playerView.classList.remove('is-visible');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    playerView.classList.add('is-visible');
                });
            });
        } else {
            playerView.classList.remove('is-visible');
        }
    }
}

function getImdbIdFromPath() {
    const match = window.location.pathname.match(/^\/movie\/(tt\d+)/);
    return match ? match[1] : null;
}

// API Calls
async function fetchProviders() {
    const providers = [TMDB_PROVIDER];
    const orderedProviders = sortByPreferredProviders(providers);
    state.providers = orderedProviders;
    return orderedProviders;
}

async function fetchCatalog(provider) {
    const cacheKey = `${provider}`;
    const cached = getCached(cacheStore.catalog, cacheKey);
    if (cached) return cached;
    const fetchPromise = fetch(`${API_BASE}/api/${provider}/catalog`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch catalog');
            return response.json();
        })
        .then(data => setCached(cacheStore.catalog, cacheKey, data))
        .catch(error => {
            cacheStore.catalog.delete(cacheKey);
            throw error;
        });
    setCached(cacheStore.catalog, cacheKey, fetchPromise);
    return fetchPromise;
}

async function fetchPosts(provider, filter = '', page = 1) {
    const cacheKey = `${provider}:${filter}:${page}`;
    const cached = getCached(cacheStore.posts, cacheKey);
    if (cached) return cached;
    const fetchPromise = fetch(`${API_BASE}/api/${provider}/posts?filter=${encodeURIComponent(filter)}&page=${page}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch posts');
            return response.json();
        })
        .then(data => {
            if (Array.isArray(data)) {
                return {
                    posts: data,
                    hasNextPage: false
                };
            }
            if (data && typeof data === 'object') {
                return data;
            }
            return {
                posts: [],
                hasNextPage: false
            };
        })
        .then(data => setCached(cacheStore.posts, cacheKey, data))
        .catch(error => {
            cacheStore.posts.delete(cacheKey);
            throw error;
        });
    setCached(cacheStore.posts, cacheKey, fetchPromise);
    return fetchPromise;
}

async function searchPosts(provider, query, page = 1) {
    try {
        const normalizedQuery = normalizeSearchQuery(query);
        const cacheKey = `${provider}:${normalizedQuery}:${page}`;
        const cached = getCached(cacheStore.search, cacheKey);
        if (cached) return cached;

        const fetchPromise = fetch(`${API_BASE}/api/${provider}/search?query=${encodeURIComponent(query)}&page=${page}`)
            .then(response => {
                if (!response.ok) {
                    console.warn(`Search failed for provider ${provider} with status ${response.status}`);
                    return {
                        posts: [],
                        hasNextPage: false,
                        provider: provider
                    };
                }
                return response.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    return {
                        posts: data,
                        hasNextPage: false,
                        provider: provider
                    };
                }
                if (data && typeof data === 'object') {
                    return {
                        ...data,
                        provider: provider
                    };
                }
                return {
                    posts: [],
                    hasNextPage: false,
                    provider: provider
                };
            })
            .then(result => setCached(cacheStore.search, cacheKey, result))
            .catch(error => {
                cacheStore.search.delete(cacheKey);
                throw error;
            });
        setCached(cacheStore.search, cacheKey, fetchPromise);
        return fetchPromise;
    } catch (error) {
        console.warn(`Search failed for provider ${provider}:`, error);
        // Return empty structure instead of throwing error
        return {
            posts: [],
            hasNextPage: false,
            provider: provider
        };
    }
}

async function fetchMeta(provider, link) {
    const cacheKey = `${provider}:${link}`;
    const cached = getCached(cacheStore.meta, cacheKey);
    if (cached) return cached;
    const fetchPromise = fetch(`${API_BASE}/api/${provider}/meta?link=${encodeURIComponent(link)}`)
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch metadata');
            return response.json();
        })
        .then(data => setCached(cacheStore.meta, cacheKey, data))
        .catch(error => {
            cacheStore.meta.delete(cacheKey);
            throw error;
        });
    setCached(cacheStore.meta, cacheKey, fetchPromise);
    return fetchPromise;
}

async function fetchEpisodes(provider, url) {
    const response = await fetch(`${API_BASE}/api/${provider}/episodes?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error('Failed to fetch episodes');
    return response.json();
}

async function fetchStream(provider, link, type = 'movie') {
    const cacheKey = `${provider}:${type}:${link}`;
    const cached = getCached(cacheStore.streams, cacheKey);
    if (cached) return cached;
    const url = `${API_BASE}/api/${provider}/stream?link=${encodeURIComponent(link)}&type=${type}`;
    console.log('🎥 Fetching stream:', {provider, link, type, url});
    const fetchPromise = fetch(url)
        .then(response => {
            console.log('🎥 Stream response status:', response.status);
            if (!response.ok) throw new Error('Failed to fetch stream');
            return response.json();
        })
        .then(rawStreams => {
            const streams = Array.isArray(rawStreams)
                ? rawStreams
                : Array.isArray(rawStreams?.streams)
                    ? rawStreams.streams
                    : Array.isArray(rawStreams?.data)
                        ? rawStreams.data
                        : [];
            console.log('✅ Streams received:', streams.length, 'options');
            streams.forEach((s, i) => {
                const linkPreview = s?.link ? `${s.link.substring(0, 80)}...` : '[missing link]';
                console.log(`  Stream ${i}:`, {
                    server: s?.server,
                    type: s?.type,
                    quality: s?.quality,
                    requiresExtraction: s?.requiresExtraction,
                    linkPreview
                });
            });
            return setCached(cacheStore.streams, cacheKey, streams);
        })
        .catch(error => {
            cacheStore.streams.delete(cacheKey);
            throw error;
        });
    setCached(cacheStore.streams, cacheKey, fetchPromise);
    return fetchPromise;
}

// UI Rendering Functions
function renderProviderSelect(providers) {
    const select = document.getElementById('providerSelect');
    select.innerHTML = '';

    if (providers.length <= 1) {
        const provider = providers[0];
        const option = document.createElement('option');
        option.value = provider?.value || '';
        option.textContent = provider?.display_name || 'Vidsrc (IMDB)';
        select.appendChild(option);
        select.value = provider?.value || '';
        select.style.display = 'none';
        return;
    }

    select.style.display = '';
    select.innerHTML = '<option value="">Select Provider...</option>';
    providers.forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.value;
        option.textContent = `${provider.display_name} (${provider.type})`;
        select.appendChild(option);
    });
}

function getProviderLabel(providerValue) {
    const provider = state.providers.find(item => item.value === providerValue);
    return provider?.display_name || providerValue;
}

function renderProviderSelectorLoading() {
    const container = document.getElementById('providerSelector');
    if (!container) return;
    container.innerHTML = '<div class="provider-loading">Loading Vidsrc...</div>';
}

function renderProviderSelector(providers, activeProvider) {
    const container = document.getElementById('providerSelector');
    if (!container) return;
    if (!Array.isArray(providers) || providers.length === 0) {
        container.innerHTML = '<div class="provider-empty">No Vidsrc streams available for this title.</div>';
        return;
    }

    container.innerHTML = `
        <div class="provider-selector-header">
            <h3 class="provider-selector-title">Available Source</h3>
            <span class="provider-selector-note">Select a source to load streams.</span>
        </div>
        <div class="provider-selector-options">
            ${providers.map(provider => `
                <button class="provider-selector-btn ${provider.provider === activeProvider ? 'is-active' : ''}" data-provider="${provider.provider}" type="button">
                    ${provider.displayName || provider.provider}
                </button>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.provider-selector-btn').forEach(button => {
        button.addEventListener('click', () => {
            const providerValue = button.getAttribute('data-provider');
            if (providerValue) {
                selectPlaybackProvider(providerValue);
            }
        });
    });
}

function setActivePlaybackProvider(providerValue) {
    const container = document.getElementById('providerSelector');
    if (!container) return;
    container.querySelectorAll('.provider-selector-btn').forEach(button => {
        button.classList.toggle('is-active', button.getAttribute('data-provider') === providerValue);
    });
}

function buildProviderQueue(preferredProvider, providers = state.playbackProviders) {
    if (!Array.isArray(providers)) return [];
    const selected = providers.find(item => item.provider === preferredProvider);
    const remaining = providers.filter(item => item.provider !== preferredProvider);
    return selected ? [selected, ...remaining] : providers;
}

async function loadAvailableProviders(meta, primaryProvider, primaryLink) {
    renderProviderSelectorLoading();
    const title = meta?.title || meta?.name || '';
    let providerResults = [];

    if (title) {
        providerResults = await searchInAllProviders(title);
    }

    const orderedResults = sortByPreferredProviders(providerResults, (item) => item.provider);
    const vidsrcResult = orderedResults.find((result) => result.provider === 'vidsrc');
    const preferredPrimary = vidsrcResult ? 'vidsrc' : primaryProvider;

    const providers = [];
    const seen = new Set();
    const addProvider = (providerValue, link, displayName) => {
        if (!providerValue || !link || seen.has(providerValue)) return;
        seen.add(providerValue);
        providers.push({
            provider: providerValue,
            link,
            displayName: displayName || getProviderLabel(providerValue)
        });
    };

    if (preferredPrimary === 'vidsrc' && vidsrcResult?.posts?.[0]?.link) {
        addProvider('vidsrc', vidsrcResult.posts[0].link, vidsrcResult.displayName);
    }

    if (primaryProvider !== 'vidsrc') {
        addProvider(primaryProvider, primaryLink, getProviderLabel(primaryProvider));
    } else if (!vidsrcResult?.posts?.[0]?.link) {
        addProvider(primaryProvider, primaryLink, getProviderLabel(primaryProvider));
    }

    orderedResults.forEach(result => {
        const link = result?.posts?.[0]?.link;
        addProvider(result?.provider, link, result?.displayName);
    });

    state.playbackProviders = providers;
    renderProviderSelector(providers, preferredPrimary);
    return providers;
}

async function attemptProviderPlaybackQueue(queue, options = {}) {
    const { initialMeta, initialProvider } = options;

    for (const candidate of queue) {
        const label = candidate.displayName || candidate.provider;
        showLoading(true, `Loading streams from ${label}...`);
        let meta = null;
        try {
            meta = (initialMeta && candidate.provider === initialProvider)
                ? initialMeta
                : await fetchMeta(candidate.provider, candidate.link);
        } catch (error) {
            console.warn(`Failed to load details from ${candidate.provider}`, error);
        }

        if (!meta) {
            showToast(`${label} details unavailable. Trying another provider...`, 'info', 2000);
            continue;
        }

        state.currentMeta = { meta, provider: candidate.provider, link: candidate.link };
        renderPlayerMeta(meta);
        renderPlayerEpisodes(meta.linkList, candidate.provider, meta.type);
        showView('player');
        setActivePlaybackProvider(candidate.provider);

        const success = await attemptAutoPlay(meta, candidate.provider, { suppressErrors: true });
        if (success) {
            showToast(`Loaded from ${label}.`, 'success', 1200);
            return true;
        }

        showToast(`${label} unavailable. Trying another provider...`, 'info', 2000);
    }

    showError('No streams available from any provider. Try another title or provider.');
    return false;
}

async function selectPlaybackProvider(providerValue) {
    const queue = buildProviderQueue(providerValue);
    if (queue.length === 0) return;
    await attemptProviderPlaybackQueue(queue);
}

function getPostTitle(post) {
    if (!post) return 'Untitled';
    return (
        post.title ||
        post.name ||
        post.displayName ||
        post.display_name ||
        post.label ||
        'Untitled'
    );
}

function getPostImage(post) {
    if (!post) return getTmdbPosterUrl();

    const normalizedTitle = String(getPostTitle(post) || '').trim().toLowerCase();
    const normalizedOriginalTitle = String(post.original_title || post.original_name || '').trim().toLowerCase();
    if (normalizedTitle.includes('rookie') || normalizedOriginalTitle.includes('rookie')) {
        return 'https://i.imgur.com/YP5Gdeu.jpeg';
    }

    if (post.image) return post.image;
    if (post.poster) return post.poster;
    if (post.poster_path) return getTmdbPosterUrl(post.poster_path);
    if (post.posterPath) return getTmdbPosterUrl(post.posterPath);
    return getTmdbPosterUrl();
}

function formatCinematicRuntime(minutes) {
    if (!minutes || !Number.isFinite(minutes)) return '1h 48m';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
}

function createCinematicTile(item, options = {}) {
    const { large = false, metadata = false } = options;
    const card = document.createElement('article');
    card.className = `cinematic-poster-card${large ? ' cinematic-poster-card-large' : ''}`;
    card.tabIndex = 0;

    const title = item.title || item.name || 'Untitled';
    const poster = getPostImage(item);
    const yearValue = item.release_date || item.first_air_date;
    const year = yearValue ? new Date(yearValue).getFullYear() : '2024';
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'PG';
    const mediaType = item.media_type === 'tv' || item.name ? 'Show' : 'Movie';

    card.innerHTML = `
        <img src="${poster}" alt="${title}" loading="lazy" />
        ${metadata ? `
            <div class="cinematic-meta">
                <div class="cinematic-tags">
                    <span>${mediaType}</span>
                    <span>Comedy</span>
                    <span>${year}</span>
                    <span>${formatCinematicRuntime(item.runtime || 106)}</span>
                    <span>★ ${rating}</span>
                </div>
                <p class="cinematic-description">A misadventure in the wilderness leads to life-changing discoveries and an unforgettable journey.</p>
            </div>
        ` : ''}
    `;

    card.addEventListener('click', () => {
        const payload = {
            tmdb_id: item.tmdb_id || item.id,
            title: item.title || item.name,
            poster_path: item.poster_path || null,
            release_date: item.release_date || null,
            first_air_date: item.first_air_date || null,
            media_type: item.media_type || (item.name ? 'tv' : 'movie')
        };
        if (payload.media_type === 'tv') {
            openTMDBTvShow(payload);
        } else {
            openTMDBMovie(payload);
        }
    });

    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            card.click();
        }
    });

    return card;
}

function buildCinematicRow(title, items) {
    const section = document.createElement('section');
    section.className = 'cinematic-content-row';
    section.innerHTML = `<h2>${title}</h2>`;
    const rail = document.createElement('div');
    rail.className = 'cinematic-rail';
    items.slice(0, 14).forEach((item) => {
        rail.appendChild(createCinematicTile(item));
    });
    section.appendChild(rail);
    return section;
}

async function renderCinematicHome(container) {
    container.innerHTML = '';

    const [trendingMovies, topShows, nowPlaying, comedyMovies] = await Promise.all([
        window.TMDBContentModule.getTrendingMovies(),
        window.TMDBContentModule.getTopRatedTvShows(),
        window.TMDBContentModule.getNowPlayingMovies(),
        window.TMDBContentModule.getComedyMovies()
    ]);

    const shell = document.createElement('section');
    shell.className = 'cinematic-home-shell';

    shell.innerHTML = `
        <div class="cinematic-ambient"></div>
        <div class="cinematic-hero-row">
            <div class="cinematic-hero-left"></div>
            <div class="cinematic-hero-right"></div>
        </div>
    `;

    const heroLeft = shell.querySelector('.cinematic-hero-left');
    const heroRight = shell.querySelector('.cinematic-hero-right');
    const focusMovie = trendingMovies[0] || nowPlaying[0];

    if (focusMovie) {
        heroLeft.appendChild(createCinematicTile(focusMovie, { large: true, metadata: true }));
    }

    [...trendingMovies.slice(1, 7), ...topShows.slice(0, 2)].forEach((item) => {
        heroRight.appendChild(createCinematicTile(item));
    });

    container.appendChild(shell);
    container.appendChild(buildCinematicRow('Award-Winning TV Shows', topShows));
    container.appendChild(buildCinematicRow('Now Playing', nowPlaying));
    container.appendChild(buildCinematicRow('Comedy Picks', comedyMovies));
}

function focusClosestCinematicTile(direction) {
    if (state.currentView !== 'home') return false;
    const tiles = Array.from(document.querySelectorAll('.cinematic-poster-card'));
    if (!tiles.length) return false;
    const active = document.activeElement;
    if (!active || !active.classList.contains('cinematic-poster-card')) {
        tiles[0].focus();
        return true;
    }

    const currentRect = active.getBoundingClientRect();
    const currentX = currentRect.left + currentRect.width / 2;
    const currentY = currentRect.top + currentRect.height / 2;

    const scored = tiles
        .filter((tile) => tile !== active)
        .map((tile) => {
            const rect = tile.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const dx = x - currentX;
            const dy = y - currentY;

            if (direction === 'left' && dx >= -8) return null;
            if (direction === 'right' && dx <= 8) return null;
            if (direction === 'up' && dy >= -8) return null;
            if (direction === 'down' && dy <= 8) return null;

            const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
            const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
            return { tile, score: primary * 3 + secondary };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score);

    if (!scored.length) return false;
    scored[0].tile.focus();
    scored[0].tile.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    return true;
}

function renderPostCard(post, provider, options = {}) {
    const card = document.createElement('div');
    card.className = 'post-card';
    
    // Use the provider from the post object if available (for search results)
    const displayProvider = post.provider || provider;
    const postTitle = getPostTitle(post);
    const postImage = getPostImage(post);
    const mediaType = post.media_type || post.mediaType;
    const providerLabel = displayProvider === 'tmdb' && mediaType
        ? `TMDB • ${mediaType === 'tv' ? 'TV' : 'Movie'}`
        : displayProvider;
    
    card.innerHTML = `
        <img src="${postImage}" alt="${postTitle}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'" />
        <div class="post-card-content">
            <h3>${postTitle}</h3>
            <span class="provider-badge">${providerLabel}</span>
        </div>
    `;
    
    card.addEventListener('click', () => {
        // Use the provider from the post object if available (for search results)
        const targetProvider = post.provider || provider;
        const isTmdb = targetProvider === 'tmdb' || Boolean(post.tmdbId);
        if (options.animateOnSelect) {
            handleSearchSelection({
                provider: targetProvider,
                link: post.link,
                tmdbItem: isTmdb ? {
                    tmdb_id: post.tmdbId || post.link,
                    title: postTitle,
                    poster_path: post.poster_path || null,
                    release_date: post.release_date || null,
                    first_air_date: post.first_air_date || null,
                    media_type: mediaType || null
                } : null,
                source: options.searchSource || 'page',
                card
            });
            return;
        }
        if (isTmdb) {
            queueFullscreenRequest();
            const tmdbPayload = {
                tmdb_id: post.tmdbId || post.link,
                title: postTitle,
                poster_path: post.poster_path || null,
                release_date: post.release_date || null,
                first_air_date: post.first_air_date || null,
                media_type: mediaType || null
            };
            if (mediaType === 'tv' && typeof openTMDBTvShow === 'function') {
                openTMDBTvShow(tmdbPayload);
            } else {
                openTMDBMovie(tmdbPayload);
            }
            return;
        }
        queueFullscreenRequest();
        loadPlaybackDetails(targetProvider, post.link, { autoPlay: true });
    });
    
    return card;
}

function renderPosts(posts, containerId, provider, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('renderPosts: container not found', containerId);
        return;
    }
    
    container.innerHTML = '';
    
    if (!Array.isArray(posts) || posts.length === 0) {
        container.innerHTML = '<p style="color: #b3b3b3;">No results found.</p>';
        return;
    }
    
    const { groupByProvider = false, providerLabelMap = {} } = options;
    
    if (!groupByProvider) {
        const animateOnSelect = containerId === 'searchResults';
        posts.forEach(post => {
            container.appendChild(renderPostCard(post, provider, { animateOnSelect }));
        });
        return;
    }
    
    const grouped = posts.reduce((acc, post) => {
        const providerKey = post.provider || provider || 'unknown';
        if (!acc[providerKey]) {
            acc[providerKey] = [];
        }
        acc[providerKey].push(post);
        return acc;
    }, {});
    
    Object.entries(grouped).forEach(([providerKey, providerPosts]) => {
        const section = document.createElement('div');
        section.className = 'search-provider-section';
        
        const header = document.createElement('div');
        header.className = 'search-provider-header';
        const displayName = providerLabelMap[providerKey] || providerKey;
        header.innerHTML = `<h3>${displayName}</h3><span class="result-count">${providerPosts.length} result${providerPosts.length === 1 ? '' : 's'}</span>`;
        section.appendChild(header);
        
        const grid = document.createElement('div');
        grid.className = 'posts-grid';
        providerPosts.forEach(post => {
            grid.appendChild(renderPostCard(post, providerKey, { animateOnSelect: containerId === 'searchResults' }));
        });
        section.appendChild(grid);
        
        container.appendChild(section);
    });
}

function renderPagination(containerOrId, currentPage, hasNext, callbackPrefix) {
    // Accept either an element or an ID
    const container = typeof containerOrId === 'string' 
        ? document.getElementById(containerOrId) 
        : containerOrId;
    
    if (container) {
        container.innerHTML = `
            <button ${currentPage === 1 ? 'disabled' : ''} onclick="${callbackPrefix}${currentPage - 1})">Previous</button>
            <span class="page-info">Page ${currentPage}</span>
            <button ${!hasNext ? 'disabled' : ''} onclick="${callbackPrefix}${currentPage + 1})">Next</button>
        `;
    } else {
        console.warn(`Pagination container not found:`, containerOrId);
    }
}

// Updated function to render a full catalog section with pagination
async function renderCatalogSection(provider, catalogItem, page = 1) {
    try {
        showLoading();
        const data = await fetchPosts(provider, catalogItem.filter, page);
        
        // Handle different response formats
        let posts, hasNext;
        
        // Check if data is an array (direct Post[] response)
        if (Array.isArray(data)) {
            posts = data;
            hasNext = false; // Default to false for array responses
        } 
        // Check if data has posts property (object with posts and pagination)
        else if (data && typeof data === 'object') {
            posts = data.posts || data;
            hasNext = data.hasNextPage || (Array.isArray(posts) && posts.length >= 20);
        } 
        // Fallback for unexpected response format
        else {
            posts = [];
            hasNext = false;
        }
        
        const section = document.createElement('div');
        section.className = 'catalog-section';
        section.innerHTML = `
            <div class="section-header">
                <h2>${catalogItem.title}</h2>
                <button class="view-all-btn" onclick="loadFullCatalog('${provider}', '${catalogItem.filter}', '${catalogItem.title}')">View All</button>
            </div>
        `;
        
        const grid = document.createElement('div');
        grid.className = 'posts-grid';
        
        if (!Array.isArray(posts) || posts.length === 0) {
            grid.innerHTML = '<p style="color: #b3b3b3; grid-column: 1 / -1;">No content available in this section.</p>';
        } else {
            // Show more posts (increased from 12 to 20)
            posts.slice(0, 20).forEach(post => {
                grid.appendChild(renderPostCard(post, provider, { animateOnSelect: containerId === 'searchResults' }));
            });
        }
        
        section.appendChild(grid);
        
        // Add pagination if needed
        // Only show pagination if we have posts and either:
        // 1. The response explicitly indicates there's a next page, or
        // 2. We have 20 or more posts (assuming this indicates more available)
        if (Array.isArray(posts) && posts.length > 0 && (hasNext || posts.length >= 20)) {
            const paginationContainer = document.createElement('div');
            paginationContainer.className = 'section-pagination';
            paginationContainer.id = `pagination-${catalogItem.title.replace(/\s+/g, '-')}-${page}`;
            section.appendChild(paginationContainer);
            
            // Create a unique identifier for this catalog item
            const catalogItemId = `catalog-${provider}-${catalogItem.title.replace(/\s+/g, '-')}`;
            
            // Store the catalog item data in a global object for access in the pagination function
            if (!window.catalogItems) window.catalogItems = {};
            window.catalogItems[catalogItemId] = catalogItem;
            
            // Pass the element directly instead of ID since section isn't in DOM yet
            renderPagination(
                paginationContainer,  // Pass element instead of ID
                page, 
                hasNext, 
                `reloadCatalogSection('${provider}', '${catalogItemId}', `
            );
        }
        
        showLoading(false);
        return section;
    } catch (error) {
        console.error(`Error rendering section ${catalogItem.title}:`, error);
        showLoading(false);
        return null;
    }
}

// Function to reload a catalog section with a specific page
async function reloadCatalogSection(provider, catalogItemId, page) {
    // Retrieve the catalog item data from the global object
    if (!window.catalogItems || !window.catalogItems[catalogItemId]) {
        console.error(`Catalog item with id '${catalogItemId}' not found`);
        return;
    }
    
    const catalogItem = window.catalogItems[catalogItemId];
    const sectionId = `section-${catalogItem.title.replace(/\s+/g, '-')}`;
    const container = document.getElementById('catalogSections');
    
    // Find and replace the section
    const newSection = await renderCatalogSection(provider, catalogItem, page);
    if (newSection) {
        newSection.id = sectionId;
        const oldSection = document.getElementById(sectionId);
        if (oldSection) {
            container.replaceChild(newSection, oldSection);
        } else {
            container.appendChild(newSection);
        }
    }
}

function formatRuntime(value) {
    if (!value) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        const hours = Math.floor(value / 60);
        const minutes = Math.round(value % 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
    if (typeof value === 'string') return value;
    return null;
}

function getDetailsMetaPieces(meta) {
    const pieces = [];
    const year = meta?.year || (meta?.releaseDate ? new Date(meta.releaseDate).getFullYear() : null);
    if (year) pieces.push(String(year));
    if (meta?.type) pieces.push(meta.type === 'tv' ? 'TV Series' : 'Movie');
    const runtime = formatRuntime(meta?.runtime || meta?.duration);
    if (runtime) pieces.push(runtime);
    if (meta?.rating) pieces.push(`★ ${meta.rating}`);
    return pieces;
}

function setupDetailsHeroParallax(hero) {
    if (detailsParallaxCleanup) {
        detailsParallaxCleanup();
        detailsParallaxCleanup = null;
    }
    if (!hero) return;
    let rafId = null;
    const update = () => {
        const rect = hero.getBoundingClientRect();
        const progress = rect.top / Math.max(window.innerHeight, 1);
        const offset = Math.max(-10, Math.min(10, -progress * 10));
        hero.style.setProperty('--details-backdrop-shift', `${50 + offset}%`);
        rafId = null;
    };
    const onScroll = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    detailsParallaxCleanup = () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (rafId) cancelAnimationFrame(rafId);
    };
}

function setupSynopsisToggle(container) {
    const wrap = container.querySelector('.details-synopsis-wrap');
    const synopsis = container.querySelector('.details-synopsis');
    const toggle = container.querySelector('.details-synopsis-toggle');
    if (!wrap || !synopsis || !toggle) return;

    const updateToggleVisibility = () => {
        const shouldShow = synopsis.scrollHeight > synopsis.clientHeight + 8;
        toggle.style.display = shouldShow ? 'inline-flex' : 'none';
    };

    toggle.addEventListener('click', () => {
        const isExpanded = wrap.classList.toggle('is-expanded');
        toggle.textContent = isExpanded ? 'Show less' : 'More';
        requestAnimationFrame(updateToggleVisibility);
    });

    requestAnimationFrame(updateToggleVisibility);
}

async function renderDetails(meta, provider) {
    const container = document.getElementById('detailsContent');
    const backdropUrl = meta?.backdrop || meta?.background || meta?.image || '';
    const metaPieces = getDetailsMetaPieces(meta);

    container.innerHTML = `
        <section class="details-hero" style="--details-backdrop: url('${backdropUrl}')">
            <div class="details-hero-content">
                <div class="details-poster-card">
                    <img class="details-poster" src="${meta.image}" alt="${meta.title}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22450%22%3E%3Crect width=%22300%22 height=%22450%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Poster%3C/text%3E%3C/svg%3E'" />
                </div>
                <div class="details-info">
                    <h1 class="details-title">${meta.title}</h1>
                    ${metaPieces.length ? `
                        <div class="details-meta-row">
                            ${metaPieces.map(item => `<span class="meta-item">${item}</span>`).join('')}
                        </div>
                    ` : ''}
                    <div class="details-actions">
                        <button class="details-btn details-btn-play" type="button" id="detailsPlayBtn">
                            <span class="details-btn-icon">▶</span>
                            Play
                        </button>
                        <button class="details-btn details-btn-ghost" type="button" aria-label="Add to list">
                            <span aria-hidden="true">＋</span>
                        </button>
                        <button class="details-btn details-btn-ghost" type="button" aria-label="Like">
                            <span aria-hidden="true">❤</span>
                        </button>
                        <button class="details-btn details-btn-ghost" type="button" aria-label="Share">
                            <span aria-hidden="true">⤴</span>
                        </button>
                    </div>
                    <div class="details-synopsis-wrap">
                        <p class="details-synopsis">${meta.synopsis || 'No synopsis available.'}</p>
                        <button class="details-synopsis-toggle" type="button">More</button>
                    </div>
                    ${meta.tags && meta.tags.length > 0 ? `
                        <div class="details-tags">
                            ${meta.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                    ${meta.cast && meta.cast.length > 0 ? `
                        <div class="details-cast">
                            <h3>Cast</h3>
                            <p>${meta.cast.join(', ')}</p>
                        </div>
                    ` : ''}
                    <div id="seasonSelector"></div>
                </div>
            </div>
        </section>
        <div id="tmdbRecommendations" class="details-section"></div>
    `;

    const playBtn = container.querySelector('#detailsPlayBtn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (state.currentMeta?.link) {
                loadPlaybackDetails(provider, state.currentMeta.link, { autoPlay: true });
            }
        });
    }

    setupDetailsHeroParallax(container.querySelector('.details-hero'));
    setupSynopsisToggle(container);
    
    // Render seasons/episodes (TV only)
    if (meta.type !== 'movie' && meta.linkList && meta.linkList.length > 0) {
        renderSeasonSelector(meta.linkList, provider, meta.type);
    }
    
    // Load TMDB recommendations and similar content
    loadTMDBRecommendationsForDetails(meta.title, meta.type);
}

function renderPlayerMeta(meta) {
    resetTmdbPlayer();
    const container = document.getElementById('playerMeta');
    if (!container) return;
    container.innerHTML = `
        <h1>${meta.title}</h1>
        <p>${meta.synopsis || 'No synopsis available.'}</p>
    `;
}

function renderPlayerEpisodes(linkList, provider, type) {
    const container = document.getElementById('playerEpisodes');
    if (!container) return;
    if (type === 'movie' || !Array.isArray(linkList) || linkList.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = `
        <div class="season-selector">
            <h3>Select Season/Quality:</h3>
            <select id="playerSeasonSelect">
                ${linkList.map((item, index) => `
                    <option value="${index}">${item.title} ${item.quality ? `(${item.quality})` : ''}</option>
                `).join('')}
            </select>
            <div id="playerEpisodesList" class="episodes-list"></div>
        </div>
    `;
    const select = document.getElementById('playerSeasonSelect');
    select.addEventListener('change', (e) => {
        const selectedIndex = e.target.value;
        renderEpisodes(linkList[selectedIndex], provider, type, 'playerEpisodesList');
    });
    renderEpisodes(linkList[0], provider, type, 'playerEpisodesList');
}

function renderSeasonSelector(linkList, provider, type) {
    const container = document.getElementById('seasonSelector');
    if (!container) return;
    if (type === 'movie') {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <div class="season-selector">
            <h3>Select Season/Quality:</h3>
            <select id="seasonSelect">
                ${linkList.map((item, index) => `
                    <option value="${index}">${item.title} ${item.quality ? `(${item.quality})` : ''}</option>
                `).join('')}
            </select>
            <div id="episodesList" class="episodes-list"></div>
        </div>
    `;
    
    const select = document.getElementById('seasonSelect');
    select.addEventListener('change', (e) => {
        const selectedIndex = e.target.value;
        renderEpisodes(linkList[selectedIndex], provider, type);
    });
    
    // Render first season by default
    renderEpisodes(linkList[0], provider, type);
}

async function renderEpisodes(linkItem, provider, type, containerId = 'episodesList') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<p style="color: #b3b3b3;">Loading episodes...</p>';
    
    try {
        let episodes = [];
        
        // Check if we have direct links or need to fetch episodes
        if (linkItem.directLinks && linkItem.directLinks.length > 0) {
            episodes = linkItem.directLinks;
        } else if (linkItem.episodesLink) {
            episodes = await fetchEpisodes(provider, linkItem.episodesLink);
        }
        
        if (episodes.length === 0) {
            container.innerHTML = '<p style="color: #b3b3b3;">No episodes available.</p>';
            return;
        }
        
        container.innerHTML = '';
        episodes.forEach(episode => {
            const card = document.createElement('div');
            card.className = 'episode-card';
            card.innerHTML = `
                <h4>${episode.title}</h4>
                ${linkItem.quality ? `<span class="quality">${linkItem.quality}</span>` : ''}
            `;
            
            card.addEventListener('click', () => {
                loadPlayer(provider, episode.link, episode.type || type);
            });
            
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading episodes:', error);
        container.innerHTML = '<p style="color: #e50914;">Failed to load episodes.</p>';
    }
}

function renderStreamSelector(streams, provider) {
    console.log('🎬 renderStreamSelector called', {streams, provider, streamCount: streams.length});
    const container = document.getElementById('streamSelector');
    if (!container) {
        console.warn('⚠️ Stream selector container not found');
        return;
    }
    
    if (streams.length === 0) {
        console.warn('⚠️ No streams available');
        container.innerHTML = '<p style="color: #b3b3b3;">No streams available.</p>';
        return;
    }
    
    console.log('✅ Rendering', streams.length, 'stream options');
    container.innerHTML = `
        <h3>Available Streams:</h3>
        <p style="color: #b3b3b3; font-size: 14px; margin-bottom: 10px;">
            💡 If a stream doesn't play, try another one below or use the download button.
        </p>
        <div class="stream-options"></div>
    `;
    
    const optionsContainer = container.querySelector('.stream-options');
    streams.forEach((stream, index) => {
        console.log(`📺 Processing stream ${index}:`, {
            server: stream.server,
            link: stream.link,
            type: stream.type,
            quality: stream.quality,
            requiresExtraction: stream.requiresExtraction
        });
        
        const option = document.createElement('div');
        option.className = `stream-option ${index === 0 ? 'active' : ''}`;
        
        // Check if MKV FIRST before using the variable
        const isMKV = stream.link.toLowerCase().includes('.mkv');
        console.log(`  - Is MKV: ${isMKV}`);
        
        // Add indicators for special streams
        let indicator = '';
        if (stream.requiresExtraction) {
            indicator = '<span style="font-size: 11px; color: #ffa500;">⚠️ Needs extraction</span>';
            console.log('  - Marked for extraction');
        } else if (isMKV) {
            indicator = '<span style="font-size: 11px; color: #4CAF50;">✓ Direct link</span>';
            console.log('  - Direct MKV link detected');
        }
        
        option.innerHTML = `
            <h4>${stream.server}</h4>
            ${stream.quality ? `<span class="quality">${stream.quality}p</span>` : ''}
            <span class="quality">${stream.type}</span>
            ${indicator}
            <div class="stream-option-buttons">
                <button class="stream-option-button stream-play-btn">
                    <span class="icon">▶️</span>
                    <span>Play</span>
                </button>
                <button class="stream-option-button stream-external-btn">
                    <span class="icon">📺</span>
                    <span>External</span>
                </button>
                ${isMKV || stream.requiresExtraction ? `
                    <button class="stream-option-button stream-download-btn">
                        <span class="icon">⬇️</span>
                        <span>Download</span>
                    </button>
                ` : ''}
            </div>
        `;
        
        const playBtn = option.querySelector('.stream-play-btn');
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.stream-option').forEach(el => el.classList.remove('active'));
            option.classList.add('active');
            playStream(stream);
        });
        
        const externalBtn = option.querySelector('.stream-external-btn');
        externalBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await openExternalPlayer(stream);
        });
        
        const downloadBtn = option.querySelector('.stream-download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                let downloadUrl = stream.link;
                
                // Only extract if needed
                if (stream.requiresExtraction) {
                    showLoading();
                    try {
                        const response = await fetch(`${API_BASE}/api/proxy/stream?url=${encodeURIComponent(stream.link)}`);
                        if (response.ok) {
                            const data = await response.json();
                            downloadUrl = data.streamUrl;
                        } else {
                            showError('Could not extract download link. The URL might already be direct.');
                        }
                    } catch (error) {
                        console.error('Extraction error:', error);
                        showError('Extraction failed. Opening original link...');
                    }
                    showLoading(false);
                }
                
                // Open download in new tab
                console.log('Opening download URL:', downloadUrl);
                openExternalUrl(downloadUrl, { target: '_blank' });
            });
        }
        
        optionsContainer.appendChild(option);
    });
}

const MOVIE_INTRO_URL = 'https://i.imgur.com/ObhxmmP.mp4';
const MOVIE_INTRO_PLAYBACK_RATE = 2;
const MOVIE_INTRO_FADE_MS = 800;

function isMoviePlayback() {
    return state.currentMeta?.meta?.type === 'movie';
}

async function playMovieIntro() {
    const overlay = document.getElementById('movieIntroOverlay');
    const introVideo = document.getElementById('movieIntroVideo');
    if (!overlay || !introVideo) return;
    if (overlay.dataset.playing === 'true') return;

    overlay.dataset.playing = 'true';
    overlay.classList.remove('fade-out');
    overlay.classList.add('is-visible');

    introVideo.pause();
    introVideo.src = MOVIE_INTRO_URL;
    introVideo.currentTime = 0;
    introVideo.playbackRate = MOVIE_INTRO_PLAYBACK_RATE;

    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        introVideo.addEventListener('ended', finish, { once: true });
        introVideo.addEventListener('error', finish, { once: true });
        introVideo.addEventListener('abort', finish, { once: true });

        const playAttempt = introVideo.play();
        if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => finish());
        }
    });

    await new Promise((resolve) => {
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            overlay.classList.remove('is-visible', 'fade-out');
            overlay.dataset.playing = 'false';
            introVideo.pause();
            introVideo.removeAttribute('src');
            introVideo.load();
            resolve();
        };
        overlay.classList.add('fade-out');
        overlay.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, MOVIE_INTRO_FADE_MS + 200);
    });
}

async function playStream(stream) {
    const streamLink = stream?.link;
    if (!streamLink) {
        console.error('❌ playStream called without a valid stream link:', stream);
        showError('Stream link missing. Please try another source.');
        return;
    }
    console.log('▶️ playStream called with:', {
        server: stream.server,
        type: stream.type,
        quality: stream.quality,
        requiresExtraction: stream.requiresExtraction,
        linkPreview: streamLink.substring(0, 100)
    });
    
    // Clear any previous error messages
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.innerHTML = '';
    }
    
    const video = document.getElementById('videoPlayer');
    console.log('📺 Video element:', video ? 'Found' : 'NOT FOUND');

    // Mark video as playing
    state.isVideoPlaying = true;

    try {
        if (isMoviePlayback()) {
            await playMovieIntro();
        }

        let streamUrl = streamLink;
        
        // Check if stream needs extraction
        if (stream.requiresExtraction) {
            showLoading();
            console.log(`⚠️ Stream requires extraction: ${stream.extractionService}`);
            
            try {
                const extractUrl = `${API_BASE}/api/proxy/stream?url=${encodeURIComponent(streamLink)}`;
                console.log('🔄 Calling extraction endpoint:', extractUrl);
                const response = await fetch(extractUrl);
                console.log('🔄 Extraction response status:', response.status);
                if (!response.ok) {
                    throw new Error('Failed to extract stream URL');
                }
                const data = await response.json();
                streamUrl = data.streamUrl;
                console.log('✅ Extracted stream URL:', streamUrl);
            } catch (extractError) {
                console.error('❌ Extraction error:', extractError);
                console.log('ℹ️ Extraction failed - user can try another stream');
                showLoading(false);
                return;
            }
            showLoading(false);
        }

        // Check if stream has custom headers - use proxy for those
        let useProxy = false;
        if (stream.headers && Object.keys(stream.headers).length > 0) {
            console.log('🔐 Stream has custom headers, using video proxy:', Object.keys(stream.headers));
            const headersParam = encodeURIComponent(JSON.stringify(stream.headers));
            streamUrl = `${API_BASE}/api/proxy/video?url=${encodeURIComponent(streamUrl)}&headers=${headersParam}`;
            useProxy = true;
        }
        
        console.log('🎯 Attempting to play:', useProxy ? '[via proxy]' : '[direct]', streamUrl.substring(0, 100));
        
        // Check file type
        const isMKV = streamUrl.toLowerCase().includes('.mkv');
        const isMP4 = streamUrl.toLowerCase().includes('.mp4');
        const isM3U8 = stream.type === 'm3u8' || streamUrl.includes('.m3u8');
        
        console.log('📊 Stream analysis:', {isMKV, isMP4, isM3U8, streamUrl: streamUrl.substring(0, 100)});
        
        if (isMKV) {
            console.log('⚠️ MKV format detected - prompting user');
            // MKV files often don't play in browsers - offer download immediately
            const tryPlay = confirm('MKV format detected. This format usually doesn\'t play in browsers.\n\nClick OK to try playing anyway, or Cancel to download the file.');
            if (!tryPlay) {
                console.log('📥 User chose to download MKV');
                openExternalUrl(streamUrl, { target: '_blank' });
                return;
            }
            console.log('🎬 User chose to try playing MKV');
        }
        
        // Clear previous content
        console.log('🧹 Clearing previous video content');
        video.innerHTML = '';
        video.src = '';
        
        // Check if HLS stream
        if (isM3U8) {
            console.log('🎬 HLS stream detected, initializing hls.js');
            if (Hls.isSupported()) {
                console.log('✅ HLS.js is supported');
                if (window.currentHls) {
                    console.log('🧹 Destroying previous HLS instance');
                    window.currentHls.destroy();
                }
                
                const hls = new Hls({
                    enableWorker: true,
                    maxBufferLength: 30,
                    maxMaxBufferLength: 600,
                });
                
                console.log('🔗 Loading HLS source:', streamUrl.substring(0, 100));
                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log('✅ HLS manifest parsed successfully');
                    video.play().then(() => {
                        attemptPlayerFullscreen();
                    }).catch(e => {
                        console.error('❌ HLS play error:', e);
                        showError('Failed to start playback: ' + e.message);
                    });
                });
                
                // Track video progress for HLS
                video.addEventListener('timeupdate', () => {
                    if (state.currentMeta && window.HistoryModule) {
                        const progress = video.currentTime;
                        const duration = video.duration;
                        if (duration > 0 && progress > 5) { // Only track after 5 seconds
                            window.HistoryModule.updateProgress(state.currentMeta.link, progress, duration);
                        }
                    }
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error('❌ HLS error:', data);
                    if (data.fatal) {
                        console.error('🛑 Fatal HLS error detected:', data.type);
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                console.error('🌐 Network error:', data.details);
                                showError('Network error while loading stream. Check your connection or try another source.');
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                console.error('🎥 Media error:', data.details);
                                showError('Media error. Try another quality or source.');
                                hls.recoverMediaError();
                                break;
                            default:
                                console.error('❓ Unknown HLS error:', data);
                                showError('Fatal playback error. Try another source.');
                                break;
                        }
                    }
                });
                
                window.currentHls = hls;
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                video.src = streamUrl;
                video.addEventListener('loadedmetadata', () => {
                    video.play().then(() => {
                        attemptPlayerFullscreen();
                    }).catch(e => {
                        console.error('Play error:', e);
                        showError('Failed to start playback: ' + e.message);
                    });
                });
            } else {
                showError('HLS playback not supported in this browser.');
                return;
            }
        } else {
            // Direct video file
            console.log('🎬 Direct video playback mode');
            console.log('🔗 Setting video source:', streamUrl.substring(0, 100));
            video.src = streamUrl;
            
            // Track video progress
            video.addEventListener('timeupdate', () => {
                if (state.currentMeta && window.HistoryModule) {
                    const progress = video.currentTime;
                    const duration = video.duration;
                    if (duration > 0 && progress > 5) { // Only track after 5 seconds
                        window.HistoryModule.updateProgress(state.currentMeta.link, progress, duration);
                    }
                }
            });
            
            video.addEventListener('error', (e) => {
                console.error('❌ Video error event:', e);
                console.error('🚨 Video error object:', video.error);
                
                if (video.error) {
                    console.error('🐞 Error code:', video.error.code, 'Message:', video.error.message);
                    
                    switch (video.error.code) {
                            case MediaError.MEDIA_ERR_ABORTED:
                                console.error('⏹️ MEDIA_ERR_ABORTED - Video loading was aborted');
                                break;
                            case MediaError.MEDIA_ERR_NETWORK:
                                console.error('🌐 MEDIA_ERR_NETWORK - Network error while loading video');
                                break;
                            case MediaError.MEDIA_ERR_DECODE:
                                console.error('🐛 MEDIA_ERR_DECODE - Video format not supported or corrupted');
                                break;
                            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                                if (isMKV) {
                                    console.log('ℹ️ MKV format detected, not supported in browser');
                                } else {
                                    console.error('🚫 MEDIA_ERR_SRC_NOT_SUPPORTED - Video format not supported');
                                }
                                break;
                            default:
                                console.error('❓ Unknown video error:', video.error);
                                break;
                        }
                    }
                
                // Don't show error to user - just log to console
                console.log('ℹ️ Video error silently handled - user can try another stream');
            }, { once: true });
            
            console.log('▶️ Attempting to play video...');
            video.play().then(() => {
                attemptPlayerFullscreen();
            }).catch(e => {
                console.error('❌ Direct play error:', e);
                console.error('Error name:', e.name, 'Message:', e.message);
                // Don't show error to user - they can try another stream
                console.log('ℹ️ Playback error silently handled');
            });
        }
        
        // Add subtitles if available
        if (stream.subtitles && stream.subtitles.length > 0) {
            console.log('📑 Adding', stream.subtitles.length, 'subtitle tracks');
            stream.subtitles.forEach((subtitle, index) => {
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = subtitle.title || subtitle.language;
                track.srclang = subtitle.language || 'en';
                track.src = subtitle.uri;
                if (index === 0) track.default = true;
                video.appendChild(track);
                console.log(`  - Subtitle ${index}:`, subtitle.language, subtitle.title);
            });
        }
    } catch (error) {
        console.error('❌ Stream playback error:', error);
        console.error('Error stack:', error.stack);
        // Don't show error to user - they can try another stream
        console.log('ℹ️ Stream error silently handled');
    }
}

async function openExternalPlayer(stream) {
    const streamLink = stream?.link;
    if (!streamLink) {
        console.error('❌ openExternalPlayer called without a valid stream link:', stream);
        showError('Stream link missing. Please try another source.');
        return;
    }
    console.log('🖥️ openExternalPlayer called with:', {
        server: stream.server,
        type: stream.type,
        quality: stream.quality,
        requiresExtraction: stream.requiresExtraction,
        linkPreview: streamLink.substring(0, 100)
    });

    showLoading(true, 'Preparing external player...');
    try {
        let streamUrl = streamLink;

        if (stream.requiresExtraction) {
            console.log('🔄 External player extraction required');
            try {
                const extractUrl = `${API_BASE}/api/proxy/stream?url=${encodeURIComponent(streamLink)}`;
                console.log('🔄 Calling extraction endpoint for external playback:', extractUrl);
                const response = await fetch(extractUrl);
                if (!response.ok) {
                    throw new Error('Failed to extract stream link for external playback');
                }
                const data = await response.json();
                streamUrl = data.streamUrl;
                console.log('✅ Extraction complete for external playback');
            } catch (extractError) {
                console.error('❌ External extraction failure:', extractError);
                showError('Could not prepare stream for external playback. Try downloading instead.');
                return;
            }
        }

        if (stream.headers && Object.keys(stream.headers).length > 0) {
            console.log('🔐 Stream requires headers. Using proxy for external playback');
            const headersParam = encodeURIComponent(JSON.stringify(stream.headers));
            streamUrl = `${API_BASE}/api/proxy/video?url=${encodeURIComponent(streamUrl)}&headers=${headersParam}`;
        }

        const isM3U8 = stream.type === 'm3u8' || streamUrl.includes('.m3u8');
        const isMKV = streamUrl.toLowerCase().includes('.mkv');

        const bridge = window.appBridge;
        const metaTitle = state.currentMeta?.meta?.title || state.currentMeta?.meta?.name || stream.title || stream.server;

        if (bridge?.openExternalPlayer) {
            console.log('🛤️ Attempting to launch external player via Electron bridge');
            try {
                const result = await bridge.openExternalPlayer({
                    url: streamUrl,
                    title: metaTitle,
                });
                console.log('🔁 External player IPC result:', result);

                if (result?.ok) {
                    if (result.player) {
                        const playerName = result.player.split(/[\\\/]/).pop() || result.player;
                        showToast(`Opening stream in ${playerName}.`, 'success', 3000);
                    } else if (result?.fallback === 'browser') {
                        showToast('No external player detected. Opened stream in default browser.', 'info', 4000);
                    } else {
                        showToast('External player launched.', 'success', 3000);
                    }
                    return;
                }

                console.warn('⚠️ External player handler returned failure, falling back to manual method:', result);
            } catch (ipcError) {
                console.error('❌ External player IPC error:', ipcError);
                showToast('External player launch failed. Falling back to manual method.', 'error', 3000);
            }
        }

        let clipboardCopied = false;
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(streamUrl);
                clipboardCopied = true;
                console.log('📋 Stream link copied to clipboard');
            } catch (clipboardError) {
                console.warn('⚠️ Failed to copy link to clipboard:', clipboardError);
            }
        }

        let opened = false;
        try {
            const newWindow = openExternalUrl(streamUrl, { target: '_blank', features: 'noopener' });
            if (newWindow) {
                opened = true;
                console.log('🪟 External stream opened in new tab');
            }
        } catch (popupError) {
            console.warn('⚠️ Popup blocked while opening external link:', popupError);
        }

        let message = 'External stream link ready.';
        if (clipboardCopied) {
            message += ' Link copied to clipboard.';
        }
        if (!opened) {
            message += ' Paste it into your external player.';
        }
        showToast(message, 'info', 4000);

        if (isM3U8) {
            showToast('Tip: In VLC, use Media → Open Network Stream and paste the copied link.', 'info', 4000);
        } else if (isMKV) {
            showToast('MKV files may download in-browser. Use the copied link in VLC or Media Player.', 'info', 4000);
        }
    } catch (error) {
        console.error('❌ Failed to prepare external player link:', error);
        showError('Failed to prepare external player link: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Event Handlers
async function loadHomePage() {
    console.log('🏠 loadHomePage called, provider:', state.selectedProvider);
    const provider = state.selectedProvider;
    if (!provider) {
        document.getElementById('catalogSections').innerHTML = '<p style="color: #b3b3b3;">Please select a provider to browse content.</p>';
        return;
    }
    
    showLoading();
    try {
        const catalogContainer = document.getElementById('catalogSections');
        catalogContainer.innerHTML = '';

        if (provider === 'tmdb') {
            if (window.TMDBContentModule) {
                await renderCinematicHome(catalogContainer);
            }
            showView('home');
            return;
        }

        const catalogData = await fetchCatalog(provider);
        
        // Render Hero Banner
        await renderHeroBanner(provider, catalogData);
        
        // Render Continue Watching section from history
        if (window.HistoryModule) {
            const historySection = window.HistoryModule.renderHistorySection();
            if (historySection) {
                catalogContainer.appendChild(historySection);
            }
        }
        
        // Render TMDB content sections
        if (window.TMDBContentModule) {
            await window.TMDBContentModule.renderAllSections(catalogContainer);
        }
        
        // Separate Movies and TV Shows sections
        const moviesSections = [];
        const tvShowsSections = [];
        const otherSections = [];
        
        if (catalogData.catalog && catalogData.catalog.length > 0) {
            catalogData.catalog.forEach(item => {
                const title = String(item?.title || item?.name || '').toLowerCase();
                if (title.includes('movie') || title.includes('film')) {
                    moviesSections.push(item);
                } else if (title.includes('tv') || title.includes('show') || title.includes('series')) {
                    tvShowsSections.push(item);
                } else {
                    otherSections.push(item);
                }
            });
        }
        
        // Render Movies Section
        if (moviesSections.length > 0) {
            const moviesHeader = document.createElement('div');
            moviesHeader.className = 'category-header';
            moviesHeader.innerHTML = '<h2 class="category-title">🎬 Movies</h2>';
            catalogContainer.appendChild(moviesHeader);
            
            const movieSections = await Promise.all(
                moviesSections.map(item => renderNetflixSection(provider, item))
            );
            movieSections.filter(Boolean).forEach(section => catalogContainer.appendChild(section));
        }
        
        // Render TV Shows Section
        if (tvShowsSections.length > 0) {
            const tvHeader = document.createElement('div');
            tvHeader.className = 'category-header';
            tvHeader.innerHTML = '<h2 class="category-title">📺 TV Shows</h2>';
            catalogContainer.appendChild(tvHeader);
            
            const tvSections = await Promise.all(
                tvShowsSections.map(item => renderNetflixSection(provider, item))
            );
            tvSections.filter(Boolean).forEach(section => catalogContainer.appendChild(section));
        }
        
        // Render Other Sections
        const otherRenderedSections = await Promise.all(
            otherSections.map(item => renderNetflixSection(provider, item))
        );
        otherRenderedSections.filter(Boolean).forEach(section => catalogContainer.appendChild(section));
        
        // Render genres at the bottom if available
        if (catalogData.genres && catalogData.genres.length > 0) {
            const genresSection = document.createElement('div');
            genresSection.className = 'catalog-section';
            genresSection.innerHTML = '<h2>Browse by Genre</h2>';
            
            const genresGrid = document.createElement('div');
            genresGrid.className = 'genres-grid';
            
            catalogData.genres.forEach(genre => {
                const genreBtn = document.createElement('button');
                genreBtn.className = 'genre-btn';
                genreBtn.textContent = genre.title;
                genreBtn.addEventListener('click', async () => {
                    loadFullCatalog(provider, genre.filter, genre.title);
                });
                genresGrid.appendChild(genreBtn);
            });
            
            genresSection.appendChild(genresGrid);
            catalogContainer.appendChild(genresSection);
        }
        
        showView('home');
    } catch (error) {
        showError('Failed to load catalog: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Function to load a full catalog with pagination
async function loadFullCatalog(provider, filter, title) {
    showLoading();
    try {
        state.currentFilter = filter;
        const data = await fetchPosts(provider, filter, 1);
        const posts = data.posts || data;
        const hasNext = data.hasNextPage || (Array.isArray(posts) && posts.length >= 20);
        
        document.getElementById('searchTitle').textContent = title;
        renderPosts(posts, 'searchResults', provider);
        renderPagination('searchPagination', 1, hasNext, 'changeCatalogPage(');
        state.currentPage = 1;
        showView('search');
    } catch (error) {
        showError('Failed to load catalog content: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function performSearch(queryOverride = '', options = {}) {
    const searchInput = document.getElementById('searchInputHeader');
    const query = (queryOverride || searchInput?.value || '').trim();
    const normalizedQuery = normalizeSearchQuery(query);
    const { silent = false, source = 'header' } = options;
    
    if (!query) {
        if (!silent) {
            showError('Please enter a search query.');
        }
        closeSearchMenu();
        resetSearchMenu();
        return;
    }

    if (normalizedQuery.length < SEARCH_MIN_LENGTH) {
        openSearchMenu(query);
        const summaryEl = document.getElementById('searchSummary');
        if (summaryEl) {
            summaryEl.textContent = `Keep typing… at least ${SEARCH_MIN_LENGTH} characters to search.`;
        }
        resetSearchMenu({ keepSummary: true });
        return;
    }
    
    openSearchMenu(query);
    showLoading();
    try {
        const requestId = ++state.searchRequestId;
        const resultsContainer = document.getElementById('searchMenuResults');
        const paginationEl = document.getElementById('searchPagination');
        const summaryEl = document.getElementById('searchSummary');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<p class="search-empty-state search-loading-state">Loading...</p>';
        }
        if (paginationEl) paginationEl.innerHTML = '';
        if (summaryEl) summaryEl.textContent = 'Searching TMDB...';
        
        const searchTitle = document.getElementById('searchMenuTitle');
        if (searchTitle) {
            searchTitle.textContent = `Search Results for "${query}"`;
        }
        
        state.searchQuery = query;
        state.currentPage = 1;
        state.currentFilter = '';
        state.searchProviderFilter = 'all';
        const apiKey = getTmdbApiKey();
        if (!apiKey) {
            throw new Error('TMDB API key missing');
        }
        const [movieResponse, tvResponse] = await Promise.allSettled([
            fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`),
            fetch(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}`)
        ]);

        const movieResults = [];
        const movieOk = movieResponse.status === 'fulfilled' && movieResponse.value.ok;
        if (movieOk) {
            const data = await movieResponse.value.json();
            (data.results || []).slice(0, 20).forEach(item => {
                movieResults.push({
                    tmdb_id: item.id,
                    title: item.title,
                    poster_path: item.poster_path,
                    release_date: item.release_date,
                    popularity: item.popularity,
                    vote_count: item.vote_count,
                    media_type: 'movie'
                });
            });
        }

        const tvResults = [];
        const tvOk = tvResponse.status === 'fulfilled' && tvResponse.value.ok;
        if (tvOk) {
            const data = await tvResponse.value.json();
            (data.results || []).slice(0, 20).forEach(item => {
                tvResults.push({
                    tmdb_id: item.id,
                    title: item.name,
                    poster_path: item.poster_path,
                    release_date: item.first_air_date,
                    first_air_date: item.first_air_date,
                    popularity: item.popularity,
                    vote_count: item.vote_count,
                    media_type: 'tv'
                });
            });
        }

        if (!movieOk && !tvOk) {
            throw new Error('TMDB search failed: request error');
        }

        const combined = [...movieResults, ...tvResults]
            .map(result => ({
                ...result,
                score: scoreSearchResult(result.title, normalizedQuery)
            }))
            .sort((a, b) => b.score - a.score);

        const exactMatchResults = selectExactMatchResults(combined, normalizedQuery);
        const results = exactMatchResults.length > 0 ? exactMatchResults : combined.slice(0, 30);

        if (requestId !== state.searchRequestId) {
            return;
        }

        state.searchResults = results;
        state.searchMediaFilter = 'all';

        if (summaryEl) {
            const movieCount = results.filter(result => result.media_type === 'movie').length;
            const tvCount = results.filter(result => result.media_type === 'tv').length;
            summaryEl.textContent = `${results.length} result${results.length === 1 ? '' : 's'} found on TMDB.`;
            summaryEl.textContent += ` ${movieCount} movie${movieCount === 1 ? '' : 's'}, ${tvCount} TV show${tvCount === 1 ? '' : 's'}.`;
            if (source === 'header') {
                summaryEl.textContent += ' Results update as you type.';
            }
        }

        renderSearchProviderFilters();
        renderSearchResults(results);
    } catch (error) {
        showError('Search failed: ' + error.message);
        const resultsContainer = document.getElementById('searchMenuResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="search-empty-state">
                    TMDB search failed.
                    <button class="netflix-view-all" style="margin-left: 12px;" onclick="performSearch('${query.replace(/'/g, "\\'")}')">Retry</button>
                </div>
            `;
        }
    } finally {
        showLoading(false);
    }
}

// Utility function to shuffle array (Fisher-Yates algorithm)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Updated pagination functions
async function changePage(newPage) {
    const provider = state.selectedProvider;
    if (!provider) return;
    
    showLoading();
    try {
        const results = await searchPosts(provider, state.searchQuery, newPage);
        renderPosts(results, 'searchResults', provider);
        renderPagination('searchPagination', newPage, results.length >= 20, 'changePage(');
        state.currentPage = newPage;
        window.scrollTo(0, 0);
    } catch (error) {
        showError('Failed to load page: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function changeCatalogPage(newPage) {
    const provider = state.selectedProvider;
    if (!provider || !state.currentFilter) return;
    
    showLoading();
    try {
        const data = await fetchPosts(provider, state.currentFilter, newPage);
        const posts = data.posts || data;
        const hasNext = data.hasNextPage || (Array.isArray(posts) && posts.length >= 20);
        
        renderPosts(posts, 'searchResults', provider);
        renderPagination('searchPagination', newPage, hasNext, 'changeCatalogPage(');
        state.currentPage = newPage;
        window.scrollTo(0, 0);
    } catch (error) {
        showError('Failed to load page: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function loadDetails(provider, link, options = {}) {
    const { autoPlay = false } = options;
    if (autoPlay) {
        queueFullscreenRequest();
    }
    showLoading();
    try {
        const meta = await fetchMeta(provider, link);
        state.currentMeta = { meta, provider, link };
        
        // Add to history when viewing details
        if (window.HistoryModule && meta) {
            window.HistoryModule.addToHistory({
                title: meta.title,
                image: meta.image,
                provider: provider,
                link: link
            });
        }
        
        renderDetails(meta, provider);
        showView('details');
        if (autoPlay) {
            setTimeout(() => {
                attemptAutoPlay(meta, provider);
            }, 200);
        }
    } catch (error) {
        showError('Failed to load details: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function loadPlaybackDetails(provider, link, options = {}) {
    const { autoPlay = true } = options;
    if (autoPlay) {
        queueFullscreenRequest();
    }
    renderProviderSelectorLoading();
    showLoading();
    try {
        const meta = await fetchMeta(provider, link);
        state.currentMeta = { meta, provider, link };
        if (window.HistoryModule && meta) {
            window.HistoryModule.addToHistory({
                title: meta.title,
                image: meta.image,
                provider: provider,
                link: link
            });
        }
        renderPlayerMeta(meta);
        renderPlayerEpisodes(meta.linkList, provider, meta.type);
        showView('player');
        const providers = await loadAvailableProviders(meta, provider, link);
        if (autoPlay) {
            const preferredProvider = providers.find(item => item.provider === 'vidsrc')?.provider || provider;
            const queue = buildProviderQueue(preferredProvider, providers);
            await attemptProviderPlaybackQueue(queue, { initialMeta: meta, initialProvider: provider });
        }
    } catch (error) {
        showError('Failed to load details: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function attemptAutoPlay(meta, provider, options = {}) {
    const { suppressErrors = false } = options;
    if (!meta || state.isVideoPlaying) return false;

    try {
        const linkList = Array.isArray(meta.linkList) ? meta.linkList : [];
        if (linkList.length > 0) {
            const firstLinkItem = linkList[0];

            if (Array.isArray(firstLinkItem?.directLinks) && firstLinkItem.directLinks.length > 0) {
                const firstDirect = firstLinkItem.directLinks[0];
                return await loadPlayer(provider, firstDirect.link, firstDirect.type || meta.type, { suppressErrors });
            }

            if (firstLinkItem?.link) {
                return await loadPlayer(provider, firstLinkItem.link, firstLinkItem.type || meta.type, { suppressErrors });
            }

            if (firstLinkItem?.episodesLink) {
                const episodes = await fetchEpisodes(provider, firstLinkItem.episodesLink);
                const firstEpisode = Array.isArray(episodes) ? episodes[0] : null;
                if (firstEpisode?.link) {
                    return await loadPlayer(provider, firstEpisode.link, firstEpisode.type || meta.type, { suppressErrors });
                }
            }
        }

        if (meta.link) {
            return await loadPlayer(provider, meta.link, meta.type, { suppressErrors });
        }
    } catch (error) {
        console.warn('Autoplay attempt failed:', error);
        if (!suppressErrors) {
            showToast('Autoplay unavailable. Select a stream to play.', 'info', 1500);
        }
    }
    return false;
}

async function loadPlayer(provider, link, type, options = {}) {
    const { suppressErrors = false } = options;
    console.log('🎬 loadPlayer called:', {provider, link, type});
    showLoading(true, 'Loading streams...');
    try {
        console.log('⏳ Fetching streams...');
        const streams = await fetchStream(provider, link, type);
        const validStreams = Array.isArray(streams)
            ? streams.filter(stream => stream && stream.link)
            : [];
        state.currentStreams = validStreams;
        console.log('📊 State updated with', validStreams.length, 'streams');
        
        if (validStreams.length === 0) {
            console.error('❌ No streams available');
            if (!suppressErrors) {
                showError('No streams available for this content. This could mean:\n- The content is temporarily unavailable\n- Try another episode or quality');
            }
            return false;
        }
        
        console.log('🎨 Rendering stream selector...');
        renderStreamSelector(validStreams, provider);
        console.log('🖥️ Switching to player view');
        showView('player');
        
        // Auto-play first stream
        console.log('▶️ Auto-playing first stream:', validStreams[0]);
        await playStream(validStreams[0]);
        showToast('Stream loaded successfully!', 'success', 1000);
        return true;
    } catch (error) {
        console.error('❌ loadPlayer error:', error);
        console.error('Error stack:', error.stack);
        
        // Retry logic for network errors
        if (state.retryCount < state.maxRetries && error.message.includes('Failed to fetch')) {
            state.retryCount++;
            showToast(`Retrying... (${state.retryCount}/${state.maxRetries})`, 'info', 2000);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return loadPlayer(provider, link, type, options);
        }
        
        state.retryCount = 0;
        if (!suppressErrors) {
            showError('Failed to load streams: ' + error.message + '\n\nTips:\n- Check your internet connection\n- Try refreshing the page\n- Select a different quality or episode');
        }
        return false;
    } finally {
        showLoading(false);
    }
}

// Initialize App
async function init() {
    console.log('🎬 Vega Providers Web Player Initialized');

    applySeasonalTheme();
    initAdBlocker();
    loadTmdbImdbCache();
    initProfileGate();
    initBackNavigationHandlers();

    const adblockInstallBtn = document.getElementById('adblockInstallBtn');
    if (adblockInstallBtn) {
        adblockInstallBtn.addEventListener('click', () => {
            openExternalUrl('https://ublockorigin.com/');
        });
    }

    const adblockBraveBtn = document.getElementById('adblockBraveBtn');
    if (adblockBraveBtn) {
        adblockBraveBtn.addEventListener('click', () => {
            openExternalUrl('https://brave.com/download/');
        });
    }

    const adblockDismissBtn = document.getElementById('adblockDismissBtn');
    if (adblockDismissBtn) {
        adblockDismissBtn.addEventListener('click', () => {
            dismissAdblockPrompt();
        });
    }

    const tmdbDirectBtn = document.getElementById('tmdbDirectBtn');
    if (tmdbDirectBtn) {
        tmdbDirectBtn.addEventListener('click', () => {
            setCleanPlayerEnabled(false);
        });
    }

    const tmdbCleanBtn = document.getElementById('tmdbCleanBtn');
    if (tmdbCleanBtn) {
        tmdbCleanBtn.addEventListener('click', () => {
            setCleanPlayerEnabled(true);
        });
    }
    
    // Load providers
    showLoading();
    const providers = await fetchProviders();
    renderProviderSelect(providers);
    showLoading(false);
    
    if (providers.length === 0) {
        showError('No providers available. Please build the project first: npm run build');
        return;
    }
    
    // Auto-select preferred provider
    if (providers.length > 0) {
        const preferred = providers.find(provider => provider.value === 'tmdb') || providers[0];
        state.selectedProvider = preferred.value;
        document.getElementById('providerSelect').value = preferred.value;
        const params = new URLSearchParams(window.location.search);
        const deepProvider = params.get('provider');
        const deepLink = params.get('link');
        const autoPlay = params.get('autoplay') !== '0';
        const routeImdbId = getImdbIdFromPath();
        if (routeImdbId) {
            await openImdbRoute(routeImdbId);
        } else if (deepProvider && deepLink) {
            const providerMatch = providers.find(p => p.value === deepProvider);
            if (providerMatch) {
                state.selectedProvider = deepProvider;
                document.getElementById('providerSelect').value = deepProvider;
            }
            await loadPlaybackDetails(state.selectedProvider, deepLink, { autoPlay });
        } else {
            loadHomePage();
        }
    }
    
    // Event Listeners
    document.getElementById('providerSelect').addEventListener('change', (e) => {
        state.selectedProvider = e.target.value;
        if (e.target.value) {
            loadHomePage();
        }
    });
    
    // Logo click handler
    const logoContainer = document.querySelector('.logo-container');
    if (logoContainer) {
        logoContainer.addEventListener('click', () => {
            if (state.selectedProvider) {
                loadHomePage();
                updateNavLinks('home');
            }
        });
    }
    
    // Back buttons
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (state.selectedProvider) {
                loadHomePage();
                updateNavLinks('home');
            }
        });
    }
    
    const playerBackBtn = document.getElementById('playerBackBtn');
    if (playerBackBtn) {
        playerBackBtn.addEventListener('click', () => {
            stopVideo();
            if (state.currentMeta) {
                renderDetails(state.currentMeta.meta, state.currentMeta.provider);
                showView('details');
            } else if (state.selectedProvider) {
                loadHomePage();
            }
        });
    }

    window.addEventListener('popstate', () => {
        const imdbId = getImdbIdFromPath();
        if (imdbId) {
            openImdbRoute(imdbId);
            return;
        }
        if (state.selectedProvider) {
            loadHomePage();
        }
    });
    
    // Navigation buttons
    const exploreBtn = document.getElementById('exploreBtn');
    if (exploreBtn) {
        exploreBtn.addEventListener('click', () => {
            loadExplorePage();
        });
    }
    
    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            if (state.selectedProvider) {
                loadHomePage();
                updateNavLinks('home');
            }
        });
    }
    
    const exploreBackBtn = document.getElementById('exploreBackBtn');
    if (exploreBackBtn) {
        exploreBackBtn.addEventListener('click', () => {
            if (state.selectedProvider) {
                loadHomePage();
                updateNavLinks('home');
            }
        });
    }
    
    const moviesBtn = document.getElementById('moviesBtn');
    if (moviesBtn) {
        moviesBtn.addEventListener('click', () => {
            loadMoviesPage();
        });
    }
    
    const moviesBackBtn = document.getElementById('moviesBackBtn');
    if (moviesBackBtn) {
        moviesBackBtn.addEventListener('click', () => {
            if (state.selectedProvider) {
                loadHomePage();
                updateNavLinks('home');
            }
        });
    }
    
    const tvShowsBtn = document.getElementById('tvShowsBtn');
    if (tvShowsBtn) {
        tvShowsBtn.addEventListener('click', () => {
            loadTVShowsPage();
        });
    }
    
    const tvShowsBackBtn = document.getElementById('tvShowsBackBtn');
    if (tvShowsBackBtn) {
        tvShowsBackBtn.addEventListener('click', () => {
            if (state.selectedProvider) {
                loadHomePage();
                updateNavLinks('home');
            }
        });
    }
    
    // History button
    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            if (window.loadHistoryPage) {
                loadHistoryPage();
            }
        });
    }
    
    const historyBackBtn = document.getElementById('historyBackBtn');
    if (historyBackBtn) {
        historyBackBtn.addEventListener('click', () => {
            if (state.selectedProvider) {
                loadHomePage();
                updateNavLinks('home');
            }
        });
    }

    // Header search input
    const searchInputHeader = document.getElementById('searchInputHeader');
    if (searchInputHeader) {
        searchInputHeader.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
        searchInputHeader.addEventListener('input', debounce(() => {
            const query = searchInputHeader.value.trim();
            updateHeaderSearchState(query);
            if (!query) {
                closeSearchMenu();
                resetSearchMenu();
                return;
            }
            performSearch(query, { source: 'header', silent: true });
        }, 250));
        updateHeaderSearchState(searchInputHeader.value);
    }

    const searchClearHeader = document.getElementById('searchClearHeader');
    if (searchClearHeader) {
        searchClearHeader.addEventListener('click', () => {
            if (!searchInputHeader) return;
            searchInputHeader.value = '';
            updateHeaderSearchState('');
            closeSearchMenu();
            resetSearchMenu();
            searchInputHeader.focus();
        });
    }
    
    // Search icon button
    const searchToggle = document.getElementById('searchToggle');
    if (searchToggle) {
        searchToggle.addEventListener('click', () => {
            const query = searchInputHeader.value.trim();
            if (!query) {
                openSearchMenu();
                return;
            }
            performSearch(query);
        });
    }
}

// Function to update navigation link states
function updateNavLinks(active) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const navMap = {
        home: 'homeBtn',
        explore: 'exploreBtn',
        movies: 'moviesBtn',
        tvshows: 'tvShowsBtn',
        history: 'historyBtn'
    };
    
    if (navMap[active]) {
        const btn = document.getElementById(navMap[active]);
        if (btn) {
            btn.classList.add('active');
        }
    }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Store TMDB data for pagination
const tmdbDetailsData = {
    tmdbId: null,
    searchType: null,
    recommendedPage: 1,
    similarPage: 1,
    recommendedTotal: 0,
    similarTotal: 0
};

const tmdbTvState = {
    tvId: null,
    title: '',
    seasons: [],
    seasonNumber: null,
    episodes: [],
    episodeNumber: null,
    messageHandler: null
};

// Load TMDB recommendations for details page
async function loadTMDBRecommendationsForDetails(title, contentType) {
    const container = document.getElementById('tmdbRecommendations');
    if (!container) return;
    
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Loading recommendations...</p>';
    
    try {
        const TMDB_API_KEY = getTmdbApiKey();
        if (!TMDB_API_KEY) {
            throw new Error('TMDB API key missing');
        }
        const BASE_URL = 'https://api.themoviedb.org/3';
        
        // Search for the content on TMDB
        const searchType = contentType === 'movie' ? 'movie' : 'tv';
        const searchRes = await fetch(`${BASE_URL}/search/${searchType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`);
        
        if (!searchRes.ok) {
            container.innerHTML = '';
            return;
        }
        
        const searchData = await searchRes.json();
        if (!searchData.results || searchData.results.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        const tmdbId = searchData.results[0].id;
        
        // Store for pagination
        tmdbDetailsData.tmdbId = tmdbId;
        tmdbDetailsData.searchType = searchType;
        tmdbDetailsData.recommendedPage = 1;
        tmdbDetailsData.similarPage = 1;
        
        // Fetch similar and recommended
        const [similarRes, recommendedRes] = await Promise.all([
            fetch(`${BASE_URL}/${searchType}/${tmdbId}/similar?api_key=${TMDB_API_KEY}&page=1`),
            fetch(`${BASE_URL}/${searchType}/${tmdbId}/recommendations?api_key=${TMDB_API_KEY}&page=1`)
        ]);
        
        let html = '';
        
        // Recommendations only (TMDB)
        
        // Recommended section
        if (recommendedRes.ok) {
            const recData = await recommendedRes.json();
            tmdbDetailsData.recommendedTotal = recData.total_pages || 0;
            if (recData.results && recData.results.length > 0) {
                html += renderTMDBSectionWithPagination('⭐ Recommended for You', recData.results, searchType, 'tmdb-recommended', 1, recData.total_pages);
            }
        }
        
        // Similar section
        if (similarRes.ok) {
            const simData = await similarRes.json();
            tmdbDetailsData.similarTotal = simData.total_pages || 0;
            if (simData.results && simData.results.length > 0) {
                html += renderTMDBSectionWithPagination(`🎬 Similar ${searchType === 'movie' ? 'Movies' : 'TV Shows'}`, simData.results, searchType, 'tmdb-similar', 1, simData.total_pages);
            }
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Failed to load TMDB recommendations:', error);
        container.innerHTML = '';
    }
}

// Search in all providers
async function searchInAllProviders(title) {
    const providers = state.providers || [];
    if (providers.length === 0) return [];

    const orderedProviders = sortByPreferredProviders(providers);

    const searchPromises = orderedProviders.map(async (provider) => {
        try {
            const providerValue = provider.value || provider;
            const providerName = provider.display_name || provider.value || provider;
            
            const response = await fetch(`${API_BASE}/api/${providerValue}/search?query=${encodeURIComponent(title)}`);
            if (!response.ok) return null;
            
            const data = await response.json();
            const posts = Array.isArray(data) ? data : (data.posts || []);
            const filteredPosts = filterBlockedPosts(posts);
            
            if (filteredPosts.length > 0) {
                return {
                    provider: providerValue,
                    displayName: providerName,
                    posts: filteredPosts
                };
            }
            return null;
        } catch (error) {
            return null;
        }
    });
    
    const results = await Promise.all(searchPromises);
    return results.filter(r => r !== null);
}

async function openBestMatchForTitle(title, options = {}) {
    const { fallbackToSearch = true } = options;
    const query = (title || '').trim();
    if (!query) return false;

    showLoading(true, `Searching Vidsrc for "${query}"...`);
    try {
        const results = await searchInAllProviders(query);
        const match = results.find(result => Array.isArray(result.posts) && result.posts.length > 0);
        if (match) {
            const post = match.posts[0];
            if (post?.link) {
                openPlaybackTab(match.provider, post.link);
                return true;
            }
        }
        showToast(`No results found for "${query}".`, 'info', 3000);
        if (fallbackToSearch) {
            openSearchMenu(query);
            performSearch(query, { source: 'header' });
        }
        return false;
    } catch (error) {
        console.error('Failed to find provider match:', error);
        showToast('Search failed. Try again.', 'error', 3000);
        return false;
    } finally {
        showLoading(false);
    }
}

// Render TMDB section with pagination support
function renderTMDBSectionWithPagination(title, items, type, sectionId, currentPage, totalPages) {
    if (!items || items.length === 0) return '';
    
    return `
        <div class="details-section" id="${sectionId}">
            <h2 class="section-title">${title}</h2>
            <div class="tmdb-recommendations-grid" id="${sectionId}-grid">
                ${items.map(item => renderTMDBCard(item, type)).join('')}
            </div>
            ${currentPage < totalPages ? `
                <div class="load-more-container">
                    <button class="load-more-btn" onclick="loadMoreTMDBPage('${sectionId}', '${type}', ${currentPage + 1}, ${totalPages})">
                        Load More (Page ${currentPage + 1} of ${totalPages})
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// Render individual TMDB card
function renderTMDBCard(item, type) {
    const itemTitle = item.title || item.name;
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    const posterUrl = item.poster_path 
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
    
    return `
        <div class="tmdb-rec-card" onclick='TMDBContentModule.showTMDBDetails(${JSON.stringify(item).replace(/'/g, "&apos;")}, "${type}", false)'>
            <img src="${posterUrl}" alt="${itemTitle}" />
            <div class="tmdb-rec-info">
                <h4>${itemTitle}</h4>
                <span class="tmdb-rating">⭐ ${rating}</span>
            </div>
        </div>
    `;
}

// Load more TMDB recommendations from API
async function loadMoreTMDBPage(sectionId, type, nextPage, totalPages) {
    const grid = document.getElementById(`${sectionId}-grid`);
    const loadMoreContainer = document.querySelector(`#${sectionId} .load-more-container`);
    const button = loadMoreContainer?.querySelector('.load-more-btn');
    
    if (!grid || !button) return;
    
    // Show loading state
    button.disabled = true;
    button.textContent = 'Loading...';
    
    try {
        const TMDB_API_KEY = getTmdbApiKey();
        if (!TMDB_API_KEY) {
            throw new Error('TMDB API key missing');
        }
        const BASE_URL = 'https://api.themoviedb.org/3';
        
        // Determine endpoint based on section
        let endpoint = '';
        if (sectionId === 'tmdb-recommended') {
            endpoint = `${BASE_URL}/${tmdbDetailsData.searchType}/${tmdbDetailsData.tmdbId}/recommendations`;
            tmdbDetailsData.recommendedPage = nextPage;
        } else if (sectionId === 'tmdb-similar') {
            endpoint = `${BASE_URL}/${tmdbDetailsData.searchType}/${tmdbDetailsData.tmdbId}/similar`;
            tmdbDetailsData.similarPage = nextPage;
        }
        
        const response = await fetch(`${endpoint}?api_key=${TMDB_API_KEY}&page=${nextPage}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch more items');
        }
        
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            // Add new items to grid
            data.results.forEach(item => {
                const cardHTML = renderTMDBCard(item, type);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = cardHTML;
                grid.appendChild(tempDiv.firstElementChild);
            });
            
            // Update or remove load more button
            if (nextPage >= totalPages) {
                loadMoreContainer.remove();
            } else {
                button.disabled = false;
                button.setAttribute('onclick', `loadMoreTMDBPage('${sectionId}', '${type}', ${nextPage + 1}, ${totalPages})`);
                button.textContent = `Load More (Page ${nextPage + 1} of ${totalPages})`;
            }
        } else {
            loadMoreContainer.remove();
        }
        
    } catch (error) {
        console.error('Failed to load more:', error);
        button.disabled = false;
        button.textContent = 'Load More (Try Again)';
    }
}

// Function to stop video playback
function stopVideo() {
    if (state.isVideoPlaying) {
        const video = document.getElementById('videoPlayer');
        if (video) {
            video.pause();
            video.src = '';
            video.innerHTML = '';
            console.log('⏹️ Video stopped');
        }
        
        // Destroy HLS instance if exists
        if (window.currentHls) {
            window.currentHls.destroy();
            window.currentHls = null;
            console.log('🧹 HLS instance destroyed');
        }
        
        state.isVideoPlaying = false;
    }
    resetTmdbPlayer();
}

// Function to load explore page
async function loadExplorePage() {
    showLoading(true, 'Loading Explore...');
    try {
        // Initialize explore module if not already done
        if (window.ExploreModule && state.providers.length > 0) {
            await window.ExploreModule.init(state.providers);
            window.ExploreModule.renderExplorePage();
            showView('explore');
            updateNavLinks('explore');
        } else {
            showError('Explore module not available. Please refresh the page.');
        }
    } catch (error) {
        showError('Failed to load explore page: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Function to load movies page
async function loadMoviesPage() {
    showLoading(true, 'Loading Movies...');
    try {
        if (isTmdbOnlyMode()) {
            showError('Movies is unavailable in TMDB-only mode. Use Home or Search instead.');
            return;
        }
        if (window.MoviesModule && state.providers.length > 0) {
            await window.MoviesModule.init(state.providers);
            window.MoviesModule.renderMoviesPage();
            showView('movies');
            updateNavLinks('movies');
        } else {
            showError('Movies module not available. Please refresh the page.');
        }
    } catch (error) {
        showError('Failed to load movies page: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Function to load TV shows page
async function loadTVShowsPage() {
    showLoading(true, 'Loading TV Shows...');
    try {
        if (isTmdbOnlyMode()) {
            const tvContainer = document.getElementById('tvShowsContent');
            if (!tvContainer) {
                showError('TV Shows module not available. Please refresh the page.');
                return;
            }
            if (window.TMDBContentModule?.renderTvSections) {
                await window.TMDBContentModule.renderTvSections(tvContainer);
                showView('tvshows');
                updateNavLinks('tvshows');
                return;
            }
            showError('TV Shows is unavailable in TMDB-only mode. Use Home or Search instead.');
            return;
        }
        if (window.TVShowsModule && state.providers.length > 0) {
            await window.TVShowsModule.init(state.providers);
            window.TVShowsModule.renderTVShowsPage();
            showView('tvshows');
            updateNavLinks('tvshows');
        } else {
            showError('TV Shows module not available. Please refresh the page.');
        }
    } catch (error) {
        showError('Failed to load TV shows page: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Render Hero Banner with TMDB High Quality Images
async function renderHeroBanner(provider, catalogData) {
    const container = document.getElementById('catalogSections');
    const TMDB_API_KEY = getTmdbApiKey();
    
    try {
        // Get first catalog item to fetch posts
        const firstFilter = catalogData.catalog && catalogData.catalog.length > 0 
            ? catalogData.catalog[0].filter 
            : '';
        
        const data = await fetchPosts(provider, firstFilter, 1);
        const posts = Array.isArray(data) ? data : (data.posts || []);
        
        if (posts.length > 0) {
            // Select a random post from available posts
            const randomIndex = Math.floor(Math.random() * Math.min(posts.length, 10));
            const featuredPost = posts[randomIndex];
            
            const heroBanner = document.createElement('div');
            heroBanner.className = 'hero-banner';
            heroBanner.style.backgroundColor = '#1a1a1a'; // Loading background
            
            const featuredTitle = getPostTitle(featuredPost);
            console.log('🎬 Original title:', featuredTitle);
            console.log('📦 Post data:', featuredPost);
            
            // Check if we have IMDB ID in the post data
            let imdbId = null;
            if (featuredPost.imdbId) {
                imdbId = featuredPost.imdbId;
            } else if (featuredPost.imdb_id) {
                imdbId = featuredPost.imdb_id;
            } else if (featuredPost.link && featuredPost.link.includes('imdb.com/title/')) {
                const match = featuredPost.link.match(/imdb\.com\/title\/(tt\d+)/);
                if (match) imdbId = match[1];
            }
            
            // Smart title extraction
            let cleanTitle = featuredTitle;
            
            // Method 1: Extract title before year (most reliable)
            const yearMatch = cleanTitle.match(/^(.*?)\s*[\(\[]?\s*(19\d{2}|20\d{2})\s*[\)\]]?/);
            if (yearMatch && yearMatch[1]) {
                cleanTitle = yearMatch[1].trim();
            } else {
                // Method 2: Extract title before season info
                const seasonMatch = cleanTitle.match(/^(.*?)\s*[\(\[]?\s*(Season|S\d+)/i);
                if (seasonMatch && seasonMatch[1]) {
                    cleanTitle = seasonMatch[1].trim();
                } else {
                    // Method 3: Take everything before quality indicators
                    const qualityMatch = cleanTitle.match(/^(.*?)\s*(480p|720p|1080p|2160p|4K|WEB-?DL|BluRay|HDRip|HDTC)/i);
                    if (qualityMatch && qualityMatch[1]) {
                        cleanTitle = qualityMatch[1].trim();
                    }
                }
            }
            
            // Remove common prefixes
            cleanTitle = cleanTitle
                .replace(/^(Download|Watch)\s+/i, '')
                .replace(/\[.*?\]/g, '') // Remove brackets
                .replace(/\(.*?\)/g, '') // Remove parentheses
                .replace(/\{.*?\}/g, '') // Remove curly braces
                .replace(/[\[\]{}()]/g, '') // Remove any remaining brackets
                .replace(/[_\.\-]+/g, ' ') // Replace separators with space
                .replace(/\s+/g, ' ') // Normalize spaces
                .trim();
            
            // If still too short or has garbage, take first 3-5 words
            if (cleanTitle.length < 3 || cleanTitle.split(/\s+/).length > 8) {
                const words = featuredTitle.split(/\s+/);
                cleanTitle = words.slice(0, Math.min(5, words.length)).join(' ')
                    .replace(/\[.*?\]/g, '')
                    .replace(/\(.*?\)/g, '')
                    .trim();
            }
            
            console.log('🔍 Cleaned title for search:', cleanTitle);
            if (imdbId) console.log('🆔 Found IMDB ID:', imdbId);
            
            // Add content immediately
            heroBanner.innerHTML = `
                <div class="hero-content">
                    <h1 class="hero-title">${featuredTitle}</h1>
                    <div class="hero-buttons">
                        <button class="hero-btn hero-btn-play" onclick="openPlaybackTab('${provider}', '${featuredPost.link.replace(/'/g, "\\'")}')">▶ Play</button>
                        <button class="hero-btn hero-btn-info" onclick="openPlaybackTab('${provider}', '${featuredPost.link.replace(/'/g, "\\'")}')">ℹ More Info</button>
                    </div>
                </div>
            `;
            
            container.appendChild(heroBanner);
            prefetchMetaForPosts(provider, [featuredPost], 1);
            
            // Add Genre Browser Section right after banner
            
            // Fetch TMDB image asynchronously
            (async () => {
                try {
                    if (!TMDB_API_KEY) {
                        console.warn('TMDB API key missing, skipping hero backdrop fetch.');
                        return;
                    }
                    let tmdbId = null;
                    let mediaType = null;
                    
                    // Try to find using IMDB ID first (more accurate)
                    if (imdbId) {
                        console.log('🔍 Searching TMDB by IMDB ID:', imdbId);
                        const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
                        const findResponse = await fetch(findUrl);
                        const findData = await findResponse.json();
                        
                        if (findData.movie_results && findData.movie_results.length > 0) {
                            tmdbId = findData.movie_results[0].id;
                            mediaType = 'movie';
                            console.log('✅ Found movie on TMDB via IMDB ID:', findData.movie_results[0].title, 'ID:', tmdbId);
                        } else if (findData.tv_results && findData.tv_results.length > 0) {
                            tmdbId = findData.tv_results[0].id;
                            mediaType = 'tv';
                            console.log('✅ Found TV show on TMDB via IMDB ID:', findData.tv_results[0].name, 'ID:', tmdbId);
                        }
                    }
                    
                    // If IMDB search failed or no IMDB ID, search by title
                    if (!tmdbId) {
                        console.log('🔍 Searching TMDB by title:', cleanTitle);
                        const searchUrl = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(cleanTitle)}&api_key=${TMDB_API_KEY}`;
                        const searchResponse = await fetch(searchUrl);
                        const searchData = await searchResponse.json();
                        
                        if (searchData.results && searchData.results.length > 0) {
                            tmdbId = searchData.results[0].id;
                            mediaType = searchData.results[0].media_type; // 'movie' or 'tv'
                            console.log('✅ Found on TMDB:', searchData.results[0].title || searchData.results[0].name, 'ID:', tmdbId);
                        }
                    }
                    
                    if (tmdbId && mediaType) {
                        let backdropUrl = null;
                        
                        // First, try to get backdrop from movie/TV details (faster)
                        try {
                            const detailsUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
                            const detailsResponse = await fetch(detailsUrl);
                            const detailsData = await detailsResponse.json();
                            
                            if (detailsData.backdrop_path) {
                                backdropUrl = `https://image.tmdb.org/t/p/original${detailsData.backdrop_path}`;
                                console.log('🖼️ Using backdrop from details:', backdropUrl);
                            }
                        } catch (detailsError) {
                            console.warn('Failed to fetch details, trying images endpoint');
                        }
                        
                        // If no backdrop from details, try images endpoint
                        if (!backdropUrl) {
                            const imagesUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/images?api_key=${TMDB_API_KEY}&include_image_language=en,null`;
                            const imagesResponse = await fetch(imagesUrl);
                            const imagesData = await imagesResponse.json();
                            
                            if (imagesData.backdrops && imagesData.backdrops.length > 0) {
                                // Sort backdrops by resolution (highest first)
                                const sortedBackdrops = imagesData.backdrops.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                                
                                // Get the highest quality backdrop (original size)
                                const bestBackdrop = sortedBackdrops[0];
                                backdropUrl = `https://image.tmdb.org/t/p/original${bestBackdrop.file_path}`;
                                
                                console.log('🖼️ Using TMDB backdrop from images:', backdropUrl, `(${bestBackdrop.width}x${bestBackdrop.height})`);
                            }
                        }
                        
                        // If we have a backdrop URL, load it
                        if (backdropUrl) {
                            // Preload image before setting
                            const img = new Image();
                            img.onload = () => {
                                heroBanner.style.backgroundImage = `url('${backdropUrl}')`;
                                console.log('✅ TMDB image loaded successfully');
                            };
                            img.onerror = () => {
                                console.warn('❌ Failed to load TMDB image, using fallback');
                                heroBanner.style.backgroundImage = `url('${featuredPost.image}')`;
                            };
                            img.src = backdropUrl;
                        } else {
                            console.log('⚠️ No backdrops found, using original image');
                            heroBanner.style.backgroundImage = `url('${featuredPost.image}')`;
                        }
                    } else {
                        console.log('⚠️ Not found on TMDB, using original image');
                        heroBanner.style.backgroundImage = `url('${featuredPost.image}')`;
                    }
                } catch (tmdbError) {
                    console.warn('❌ TMDB fetch error:', tmdbError);
                    heroBanner.style.backgroundImage = `url('${featuredPost.image}')`;
                }
            })();
        }
    } catch (error) {
        console.warn('Failed to render hero banner:', error);
    }
}

function enableEdgeScroll(container, options = {}) {
    if (!container || container.dataset.edgeScroll === 'true') return;

    const state = {
        direction: 0,
        rafId: null,
        speed: options.speed || 12
    };

    container.dataset.edgeScroll = 'true';

    const getEdgeZone = () => Math.min(120, container.clientWidth * 0.18);

    const stopScroll = () => {
        state.direction = 0;
        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = null;
        }
    };

    const startScroll = () => {
        if (state.rafId) return;
        const step = () => {
            if (!state.direction) {
                state.rafId = null;
                return;
            }
            container.scrollLeft += state.direction * state.speed;
            state.rafId = requestAnimationFrame(step);
        };
        state.rafId = requestAnimationFrame(step);
    };

    const handlePointerMove = (event) => {
        if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        if (container.scrollWidth <= container.clientWidth) return;

        const rect = container.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const edgeZone = getEdgeZone();
        let nextDirection = 0;

        if (offsetX < edgeZone) {
            nextDirection = -1;
        } else if (offsetX > rect.width - edgeZone) {
            nextDirection = 1;
        }

        if (nextDirection !== state.direction) {
            state.direction = nextDirection;
            if (state.direction === 0) {
                stopScroll();
            } else {
                startScroll();
            }
        }
    };

    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerleave', stopScroll);
    container.addEventListener('pointerup', stopScroll);
    container.addEventListener('pointercancel', stopScroll);
}

// Render Netflix-style horizontal scrolling section
async function renderNetflixSection(provider, catalogItem) {
    try {
        const data = await fetchPosts(provider, catalogItem.filter, 1);
        const posts = Array.isArray(data) ? data : (data.posts || []);
        
        if (!posts || posts.length === 0) return null;
        
        const section = document.createElement('div');
        section.className = 'netflix-section';
        
        const header = document.createElement('div');
        header.className = 'netflix-section-header';
        header.innerHTML = `
            <h3 class="netflix-section-title">${catalogItem.title}</h3>
            <button class="netflix-view-all" onclick="loadFullCatalog('${provider}', '${catalogItem.filter}', '${catalogItem.title}')">View All ›</button>
        `;
        section.appendChild(header);
        
        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'netflix-scroll-container';
        enableEdgeScroll(scrollContainer);
        
        const row = document.createElement('div');
        row.className = 'netflix-row';
        
        const previewPosts = posts.slice(0, 20);
        prefetchMetaForPosts(provider, previewPosts, 6);
        previewPosts.forEach(post => {
            const postTitle = getPostTitle(post);
            const postImage = getPostImage(post);
            const card = document.createElement('div');
            card.className = 'netflix-card';
            card.innerHTML = `
                <img src="${postImage}" alt="${postTitle}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'" />
                <div class="netflix-card-overlay">
                    <h4>${postTitle}</h4>
                </div>
            `;
            card.addEventListener('click', () => {
                queueFullscreenRequest();
                loadPlaybackDetails(provider, post.link, { autoPlay: true });
            });
            row.appendChild(card);
        });
        
        scrollContainer.appendChild(row);
        section.appendChild(scrollContainer);
        
        return section;
    } catch (error) {
        console.error(`Error rendering section ${catalogItem.title}:`, error);
        return null;
    }
}

// Make functions global for pagination buttons
window.changePage = changePage;
window.changeCatalogPage = changeCatalogPage;
window.loadFullCatalog = loadFullCatalog;
window.stopVideo = stopVideo;
window.loadExplorePage = loadExplorePage;
window.reloadCatalogSection = reloadCatalogSection;
window.renderHeroBanner = renderHeroBanner;
window.renderNetflixSection = renderNetflixSection;
window.openBestMatchForTitle = openBestMatchForTitle;
window.enableEdgeScroll = enableEdgeScroll;
