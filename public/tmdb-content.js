// TMDB Content Module - Fetches trending and popular content from TMDB
function _escHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const TMDBContentModule = {
    BASE_URL: 'https://api.themoviedb.org/3',
    IMAGE_BASE: 'https://image.tmdb.org/t/p',
    SHEEDYS_PICKS_IMDB_IDS: [
        'tt2872732',
        'tt0816692',
        'tt5727208',
        'tt7939766',
        'tt15398776',
        'tt0443706',
        'tt4332232',
        'tt7131622',
        'tt0409459',
        'tt1210166',
        'tt2005151',
        'tt0118971',
        'tt0133093',
        'tt0949731',
        'tt7923220',
        'tt1711425',
        'tt26581740',
        'tt27714946',
        'tt0280590',
        'tt3011894',
        'tt2977158',
        'tt0765010',
        'tt0209144',
        'tt9495224',
        'tt0945513',
        'tt0808279',
        'tt0364569',
        'tt8228288',
        'tt7917178',
        'tt0356150',
        'tt0349903',
        'tt1392214'
    ],

    getApiKey() {
        return window.TMDBConfig?.ensureApiKey?.() || '';
    },

    // True only when a title has a known release date in the future — i.e. it
    // isn't out yet, so no streaming provider can have it. Unknown dates → false
    // (assume available) to avoid over-filtering.
    _isUnreleased(item) {
        const d = item && (item.release_date || item.first_air_date);
        if (!d) return false;
        const t = Date.parse(d);
        return !Number.isNaN(t) && t > Date.now();
    },

    normalizeMovie(item) {
        return {
            tmdb_id: item.id,
            title: item.title,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            release_date: item.release_date,
            vote_average: item.vote_average,
            original_language: item.original_language
        };
    },

    normalizeTv(item) {
        return {
            tmdb_id: item.id,
            name: item.name,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            first_air_date: item.first_air_date,
            vote_average: item.vote_average,
            original_language: item.original_language
        };
    },

    async fetchMovies(path, params = {}) {
        const apiKey = this.getApiKey();
        if (!apiKey) throw new Error('TMDB API key missing');
        const [basePath, queryString = ''] = path.split('?');
        const buildParams = (page) => {
            const p = new URLSearchParams(queryString);
            p.set('api_key', apiKey);
            p.set('page', String(page));
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
            });
            return p;
        };
        // Fetch two pages in parallel for ~40 results, deduplicated
        const [r1, r2] = await Promise.all([
            fetch(`${this.BASE_URL}${basePath}?${buildParams(1)}`),
            fetch(`${this.BASE_URL}${basePath}?${buildParams(2)}`)
        ]);
        if (!r1.ok) throw new Error(`TMDB request failed: ${r1.status}`);
        const [d1, d2] = await Promise.all([r1.json(), r2.ok ? r2.json() : Promise.resolve({ results: [] })]);
        const seen = new Set();
        return [...(d1.results || []), ...(d2.results || [])]
            .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
            .slice(0, 40)
            .map(item => ({ ...this.normalizeMovie(item), id: item.id, media_type: 'movie',
                overview: item.overview, vote_average: item.vote_average,
                genre_ids: item.genre_ids, popularity: item.popularity }));
    },

    async fetchTv(path, params = {}) {
        const apiKey = this.getApiKey();
        if (!apiKey) throw new Error('TMDB API key missing');
        const [basePath, queryString = ''] = path.split('?');
        const buildParams = (page) => {
            const p = new URLSearchParams(queryString);
            p.set('api_key', apiKey);
            p.set('page', String(page));
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
            });
            return p;
        };
        const [r1, r2] = await Promise.all([
            fetch(`${this.BASE_URL}${basePath}?${buildParams(1)}`),
            fetch(`${this.BASE_URL}${basePath}?${buildParams(2)}`)
        ]);
        if (!r1.ok) throw new Error(`TMDB request failed: ${r1.status}`);
        const [d1, d2] = await Promise.all([r1.json(), r2.ok ? r2.json() : Promise.resolve({ results: [] })]);
        const seen = new Set();
        return [...(d1.results || []), ...(d2.results || [])]
            .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
            .slice(0, 40)
            .map(item => ({ ...this.normalizeTv(item), id: item.id, media_type: 'tv',
                overview: item.overview, vote_average: item.vote_average }));
    },

    // Fetch trending movies (week)
    async getTrendingMovies() {
        return this.fetchMovies('/trending/movie/week');
    },

    // Fetch popular movies
    async getPopularMovies() {
        return this.fetchMovies('/movie/popular');
    },

    // Fetch movies currently in cinemas (Australian theatrical releases).
    async getNowPlayingMovies() {
        return this.fetchMovies('/movie/now_playing', { region: 'AU' });
    },

    // Fetch trending TV shows (week)
    async getTrendingTvShows() {
        return this.fetchTv('/trending/tv/week');
    },

    // Fetch a single title (type = 'movie' | 'tv') by TMDB id. Used to pin a
    // specific featured/recommended title in the billboard hero.
    async getTitleById(type, id) {
        const apiKey = this.getApiKey();
        if (!apiKey) throw new Error('TMDB API key missing');
        const res = await fetch(`${this.BASE_URL}/${type}/${id}?api_key=${apiKey}`);
        if (!res.ok) throw new Error(`TMDB ${type}/${id} failed: ${res.status}`);
        const item = await res.json();
        return { ...item, id: item.id, media_type: type };
    },

    // Fetch popular TV shows
    async getPopularTvShows() {
        return this.fetchTv('/tv/popular');
    },

    async getMoviesByGenre(genreIds) {
        return this.fetchMovies('/discover/movie', {
            with_genres: genreIds,
            sort_by: 'popularity.desc',
            include_adult: 'false'
        });
    },

    async getTvByGenre(genreIds) {
        return this.fetchTv('/discover/tv', {
            with_genres: genreIds,
            sort_by: 'popularity.desc',
            include_adult: 'false'
        });
    },

    // Fetch top rated TV shows
    async getTopRatedTvShows() {
        return this.fetchTv('/tv/top_rated');
    },

    // Fetch TV shows airing today
    async getAiringTodayTvShows() {
        return this.fetchTv('/tv/airing_today');
    },

    shuffleItems(items) {
        const shuffled = [...items];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    async fetchMovieByImdbId(imdbId) {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('TMDB API key missing');
        }
        const response = await fetch(`${this.BASE_URL}/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`);
        if (!response.ok) {
            throw new Error(`TMDB request failed: ${response.status}`);
        }
        const data = await response.json();
        const movie = (data.movie_results || [])[0];
        return movie ? this.normalizeMovie(movie) : null;
    },

    async fetchTrailerKey(tmdbId, type = 'movie') {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('TMDB API key missing');
        }
        const response = await fetch(`${this.BASE_URL}/${type}/${tmdbId}/videos?api_key=${apiKey}`);
        if (!response.ok) {
            throw new Error(`TMDB request failed: ${response.status}`);
        }
        const data = await response.json();
        const results = data.results || [];
        const preferred = results.find(video => video.site === 'YouTube' && video.type === 'Trailer')
            || results.find(video => video.site === 'YouTube' && video.type === 'Teaser')
            || results.find(video => video.site === 'YouTube');
        return preferred?.key || null;
    },

    async getSheedysPicks() {
        const picks = await Promise.all(
            this.SHEEDYS_PICKS_IMDB_IDS.map(async imdbId => {
                try {
                    const movie = await this.fetchMovieByImdbId(imdbId);
                    return movie || {
                        tmdb_id: null,
                        title: `IMDb ${imdbId}`,
                        poster_path: null,
                        release_date: null,
                        vote_average: null,
                        imdb_id: imdbId
                    };
                } catch (error) {
                    console.warn('Failed to fetch Sheedy pick:', imdbId, error);
                    return {
                        tmdb_id: null,
                        title: `IMDb ${imdbId}`,
                        poster_path: null,
                        release_date: null,
                        vote_average: null,
                        imdb_id: imdbId
                    };
                }
            })
        );

        return this.shuffleItems(picks);
    },

    // Fetch now playing movies
    async getNowPlayingMovies() {
        return this.fetchMovies('/movie/now_playing');
    },

    // Fetch nostalgia picks
    async getNostalgiaMovies() {
        return this.fetchMovies('/discover/movie', {
            'primary_release_date.gte': '1980-01-01',
            'primary_release_date.lte': '2005-12-31',
            sort_by: 'popularity.desc'
        });
    },

    // Fetch horror movies
    async getHorrorMovies() {
        return this.fetchMovies('/discover/movie', {
            with_genres: '27',
            sort_by: 'popularity.desc'
        });
    },

    // Fetch comedy movies
    async getComedyMovies() {
        return this.fetchMovies('/discover/movie', {
            with_genres: '35',
            sort_by: 'popularity.desc'
        });
    },

    // Fetch action & adventure movies
    async getActionAdventureMovies() {
        return this.fetchMovies('/discover/movie', {
            with_genres: '28,12',
            sort_by: 'popularity.desc'
        });
    },

    // Get poster URL
    getPosterUrl(path, size = 'w500') {
        if (!path) return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
        return `${this.IMAGE_BASE}/${size}${path}`;
    },

    // Get backdrop URL
    getBackdropUrl(path, size = 'original') {
        if (!path) return null;
        return `${this.IMAGE_BASE}/${size}${path}`;
    },

    renderRetrySection() {
        const section = document.createElement('div');
        section.className = 'netflix-section';
        section.innerHTML = `
            <div class="netflix-section-header">
                <h3 class="netflix-section-title">TMDB unavailable</h3>
            </div>
            <div style="padding: 12px 0; color: var(--text-muted);">
                Failed to load TMDB data.
                <button class="netflix-view-all" style="margin-left: 12px;" onclick="TMDBContentModule.renderAllSections(document.getElementById('catalogSections'))">Retry</button>
            </div>
        `;
        return section;
    },

    // Render a TMDB section
    renderTMDBSection(title, items, type = 'movie', endpoint = '', region = '') {
        // Hide unreleased titles — they have no streamable source yet.
        items = (items || []).filter(it => !this._isUnreleased(it));
        // English only: drop titles whose original language is known and not English.
        // (Items without a language field are kept, so nothing English is lost.)
        // This empties the foreign-language rails (Korean/Anime/Bollywood/etc.), so
        // renderTMDBSection returns null for them and they disappear.
        items = items.filter(it => !it.original_language || it.original_language === 'en');
        if (!items.length) return null;

        const section = document.createElement('div');
        section.className = 'netflix-section';

        const header = document.createElement('div');
        header.className = 'netflix-section-header';
        header.innerHTML = `
            <h3 class="netflix-section-title">${_escHtml(title)}</h3>
            <button class="netflix-view-all">View All ›</button>
        `;
        header.querySelector('.netflix-view-all').addEventListener('click', () => {
            TMDBContentModule.showFullTMDBSection(title, type, endpoint, region);
        });
        section.appendChild(header);

        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'netflix-scroll-container';

        const row = document.createElement('div');
        row.className = 'netflix-row';

        items.slice(0, 40).forEach(item => {
            const card = document.createElement('div');
            card.className = 'netflix-card tmdb-card';
            
            const itemTitle = item.title || item.name;
            const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
            const year = item.release_date || item.first_air_date;
            const yearText = year ? new Date(year).getFullYear() : '';

            card.innerHTML = `
                <img src="${this.getPosterUrl(item.poster_path)}" alt="${itemTitle}" />
                <div class="netflix-card-overlay">
                    <h4>${itemTitle}</h4>
                    <div class="tmdb-card-info">
                        <span class="tmdb-rating">⭐ ${rating}</span>
                        ${yearText ? `<span class="tmdb-year">${yearText}</span>` : ''}
                    </div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                this.showTMDBDetails(item, type);
            });

            // Netflix-style preview — a floating, animated card with a trailer.
            // On desktop it fires on hover; on a TV it fires when the card is
            // "preselected" (focused via the D-pad), matching the web version.
            let hoverTimer = null;
            const armPreview = () => {
                if (!this._hoverEnabled() && !this._focusPreviewEnabled()) return;
                clearTimeout(hoverTimer);
                hoverTimer = setTimeout(() => this._showHoverPreview(card, item, type),
                    this._focusPreviewEnabled() ? 650 : 550);
            };
            const disarmPreview = () => {
                clearTimeout(hoverTimer);
                this._hideHoverPreviewSoon();
            };
            card.addEventListener('mouseenter', armPreview);
            card.addEventListener('mouseleave', disarmPreview);
            card.addEventListener('focus', armPreview);
            card.addEventListener('blur', disarmPreview);

            row.appendChild(card);
        });

        scrollContainer.appendChild(row);
        section.appendChild(scrollContainer);

        return section;
    },

    // ── Netflix-style floating hover preview ──────────────────────────────
    _hoverEnabled() {
        try {
            if (window.isTvMode && window.isTvMode()) return false;
            return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        } catch { return false; }
    },

    // DISABLED on TV. Autoplaying trailer previews on D-pad focus spawned heavy
    // YouTube embeds (with sound) as the user navigated, which could exhaust a
    // low-memory TV browser and crash/reboot the set. Desktop hover previews are
    // unaffected. Re-enable only with a much lighter, poster-only preview.
    _focusPreviewEnabled() {
        return false;
    },

    _ensureHoverPreview() {
        if (this._hoverEl) return this._hoverEl;
        const el = document.createElement('div');
        el.className = 'nf-hover-preview';
        el.style.display = 'none';
        el.addEventListener('mouseenter', () => clearTimeout(this._hoverHideT));
        el.addEventListener('mouseleave', () => this._hideHoverPreviewSoon());
        document.body.appendChild(el);
        // Fixed-positioned → detach on scroll/resize, so just hide it. On a TV,
        // D-pad navigation scrolls constantly (scrollIntoView), so don't hide on
        // scroll there — focus/blur on the cards drives show/hide instead.
        window.addEventListener('scroll', () => { if (!this._focusPreviewEnabled()) this._hideHoverPreview(); }, true);
        window.addEventListener('resize', () => this._hideHoverPreview());
        this._hoverEl = el;
        return el;
    },

    async _showHoverPreview(card, item, type) {
        if (!this._hoverEnabled() && !this._focusPreviewEnabled()) return;
        const rect = card.getBoundingClientRect();
        if (!rect.width) return;
        const el = this._ensureHoverPreview();
        clearTimeout(this._hoverHideT);
        this._hoverItemId = item.id;

        const title    = item.title || item.name || '';
        const rating   = item.vote_average ? item.vote_average.toFixed(1) : '';
        const year     = (item.release_date || item.first_air_date || '').slice(0, 4);
        const overview = (item.overview || '').trim();
        const shortOv  = overview.length > 150 ? overview.slice(0, 150).trim() + '…' : overview;
        const backdrop = item.backdrop_path
            ? this.getBackdropUrl(item.backdrop_path, 'w780')
            : this.getPosterUrl(item.poster_path);

        el.innerHTML = `
            <div class="nf-hp-media">
                <img class="nf-hp-img" src="${backdrop}" alt="" />
                <div class="nf-hp-shade"></div>
            </div>
            <div class="nf-hp-body">
                <div class="nf-hp-actions">
                    <button class="nf-hp-btn nf-hp-play" type="button">▶ Play</button>
                    <button class="nf-hp-btn nf-hp-info" type="button">ℹ More Info</button>
                </div>
                <div class="nf-hp-meta">
                    ${rating ? `<span class="nf-hp-rating">★ ${rating}</span>` : ''}
                    ${year ? `<span>${year}</span>` : ''}
                    <span class="nf-hp-badge">${type === 'tv' ? 'TV' : 'Movie'}</span>
                </div>
                <h4 class="nf-hp-title">${_escHtml(title)}</h4>
                ${shortOv ? `<p class="nf-hp-overview">${_escHtml(shortOv)}</p>` : ''}
            </div>`;

        // Expand ~1.5× the card width, centred on the card, clamped to viewport.
        const w = Math.min(Math.max(rect.width * 1.5, 300), 440);
        let left = rect.left + rect.width / 2 - w / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
        el.style.width = w + 'px';
        el.style.left = left + 'px';
        el.style.display = 'block';
        el.classList.remove('is-visible');

        requestAnimationFrame(() => {
            const h = el.offsetHeight;
            let top = rect.top + rect.height / 2 - h / 2;
            top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
            el.style.top = top + 'px';
            requestAnimationFrame(() => el.classList.add('is-visible'));
        });

        const open = (e) => { if (e) e.stopPropagation(); this._hideHoverPreview(); this.showTMDBDetails(item, type); };
        el.querySelector('.nf-hp-play')?.addEventListener('click', open);
        el.querySelector('.nf-hp-info')?.addEventListener('click', open);
        el.querySelector('.nf-hp-img')?.addEventListener('click', open);

        // Crossfade in a looping trailer (with sound) once it loads, if still hovered.
        try {
            const key = await this.fetchTrailerKey(item.id, type === 'tv' ? 'tv' : 'movie');
            // Only inject if we're still previewing this exact item (not raced away).
            if (key && this._hoverItemId === item.id && el.style.display === 'block') {
                const media = el.querySelector('.nf-hp-media');
                const iframe = document.createElement('iframe');
                iframe.className = 'nf-hp-trailer';
                iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
                // Play with sound. (Browsers may keep it muted until the page has
                // user activation, but once you've clicked anything it plays audio.)
                iframe.src = `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&mute=0&controls=0&loop=1&playlist=${key}&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`;
                media.appendChild(iframe);
                requestAnimationFrame(() => iframe.classList.add('is-on'));
            }
        } catch { /* no trailer — poster stays */ }
    },

    _hideHoverPreviewSoon() {
        clearTimeout(this._hoverHideT);
        this._hoverHideT = setTimeout(() => this._hideHoverPreview(), 140);
    },

    _hideHoverPreview() {
        this._hoverItemId = null;
        const el = this._hoverEl;
        if (!el) return;
        el.classList.remove('is-visible');
        el.style.display = 'none';
        el.innerHTML = '';
    },

    // Show TMDB item details and search in all providers
    async showTMDBDetails(item, type, skipSearch = false) {
        const mediaType = type === 'tv' ? 'tv' : 'movie';
        if (mediaType === 'tv' && typeof window.openTMDBTvShow === 'function') {
            window.openTMDBTvShow(item);
            return;
        }
        if (typeof window.openTMDBMovie === 'function') {
            window.openTMDBMovie(item);
        }
    },
    
    // Show search results modal with Similar and Recommended sections
    async showSearchResultsModal(title, results, tmdbItem) {
        const modal = document.createElement('div');
        modal.className = 'history-modal tmdb-search-modal';
        
        const type = tmdbItem.title ? 'movie' : 'tv';
        const tmdbId = tmdbItem.id;
        
        // Fetch similar and recommended content
        let similarContent = [];
        let recommendedContent = [];
        
        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                throw new Error('TMDB API key missing');
            }
            const [similarRes, recommendedRes] = await Promise.all([
                fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/similar?api_key=${apiKey}&page=1`),
                fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/recommendations?api_key=${apiKey}&page=1`)
            ]);
            
            if (similarRes.ok) {
                const data = await similarRes.json();
                similarContent = data.results || [];
            }
            
            if (recommendedRes.ok) {
                const data = await recommendedRes.json();
                recommendedContent = data.results || [];
            }
        } catch (error) {
            console.error('Failed to fetch similar/recommended:', error);
        }
        
        if (results.length === 0) {
            modal.innerHTML = `
                <div class="history-modal-content" style="max-width: 1400px;">
                    <div class="history-modal-header">
                        <h2>${_escHtml(title)} - Not Found</h2>
                        <button class="history-close-btn js-modal-close">✕</button>
                    </div>
                    <div class="history-modal-body">
                        <p style="color: var(--text-muted); text-align: center; padding: 40px;">
                            This content is not available in any provider yet.<br>
                            Try searching manually or check back later.
                        </p>
                        ${this.renderSimilarAndRecommended(similarContent, recommendedContent, type)}
                    </div>
                </div>
            `;
        } else {
            modal.innerHTML = `
                <div class="history-modal-content" style="max-width: 1400px;">
                    <div class="history-modal-header">
                        <h2>${_escHtml(title)} - Found in ${results.length} Provider(s)</h2>
                        <button class="history-close-btn js-modal-close">✕</button>
                    </div>
                    <div class="history-modal-body">
                        ${results.map(result => `
                            <div class="tmdb-provider-section">
                                <h3 class="tmdb-provider-name">📦 ${_escHtml(result.displayName)}</h3>
                                <div class="tmdb-results-grid">
                                    ${result.posts.map(post => `
                                        <div class="tmdb-result-card" data-provider="${_escHtml(result.provider)}" data-link="${_escHtml(post.link)}">
                                            <img src="${_escHtml(post.image)}" alt="${_escHtml(post.title)}" />
                                            <div class="tmdb-result-info">
                                                <h4>${_escHtml(post.title)}</h4>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                        ${this.renderSimilarAndRecommended(similarContent, recommendedContent, type)}
                    </div>
                </div>
            `;
        }

        modal.querySelector('.js-modal-close')?.addEventListener('click', () => TMDBContentModule.closeSearchModal());
        modal.querySelectorAll('.tmdb-result-card').forEach(card => {
            card.addEventListener('click', () => {
                TMDBContentModule.closeSearchModal();
                if (typeof openPlaybackTab === 'function') openPlaybackTab(card.dataset.provider, card.dataset.link);
            });
        });
        modal.querySelectorAll('.tmdb-similar-card[data-item-id]').forEach(card => {
            const cached = TMDBContentModule._detailsCache?.[card.dataset.itemId];
            if (cached) card.addEventListener('click', () => TMDBContentModule.showTMDBDetails(cached.item, cached.type, false));
        });

        document.body.appendChild(modal);
    },
    
    closeSearchModal() {
        const modal = document.querySelector('.tmdb-search-modal');
        if (modal) modal.remove();
    },
    
    // Render Similar and Recommended sections
    renderSimilarAndRecommended(similarContent, recommendedContent, type) {
        if (!TMDBContentModule._detailsCache) TMDBContentModule._detailsCache = {};
        let html = '';

        const buildCard = (item) => {
            const itemTitle = item.title || item.name;
            const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
            const posterUrl = item.poster_path
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
            if (item.id != null) TMDBContentModule._detailsCache[item.id] = { item, type };
            return `
                <div class="tmdb-similar-card" data-item-id="${_escHtml(String(item.id ?? ''))}">
                    <img src="${posterUrl}" alt="${_escHtml(itemTitle)}" />
                    <div class="tmdb-similar-info">
                        <h4>${_escHtml(itemTitle)}</h4>
                        <span class="tmdb-rating">⭐ ${rating}</span>
                    </div>
                </div>
            `;
        };

        if (recommendedContent.length > 0) {
            html += `
                <div class="tmdb-similar-section">
                    <h3 class="tmdb-section-title">⭐ Recommended for You</h3>
                    <div class="tmdb-similar-grid">
                        ${recommendedContent.slice(0, 12).map(buildCard).join('')}
                    </div>
                </div>
            `;
        }

        if (similarContent.length > 0) {
            html += `
                <div class="tmdb-similar-section">
                    <h3 class="tmdb-section-title">🎬 Similar ${type === 'movie' ? 'Movies' : 'TV Shows'}</h3>
                    <div class="tmdb-similar-grid">
                        ${similarContent.slice(0, 12).map(buildCard).join('')}
                    </div>
                </div>
            `;
        }

        return html;
    },
    
    // Show loading overlay during provider search (disabled)
    showSearchLoadingOverlay(title) {
        this.closeSearchLoadingOverlay();
    },
    
    closeSearchLoadingOverlay() {
        const overlay = document.querySelector('.tmdb-search-loading-overlay');
        if (overlay) overlay.remove();
    },
    
    // Show full TMDB section with pagination
    async showFullTMDBSection(title, type, endpoint, region) {
        const modal = document.createElement('div');
        modal.className = 'history-modal tmdb-full-modal';
        modal.innerHTML = `
            <div class="history-modal-content" style="max-width: 1200px;">
                <div class="history-modal-header">
                    <h2>${title}</h2>
                    <button onclick="TMDBContentModule.closeTMDBModal()" class="history-close-btn">✕</button>
                </div>
                <div class="history-modal-body">
                    <div id="tmdbFullGrid" class="posts-grid"></div>
                    <div id="tmdbPagination" class="pagination"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Store current section info
        this.currentSection = { title, type, endpoint, region, page: 1 };
        
        // Load first page
        await this.loadTMDBPage(1);
    },
    
    // Load TMDB page
    async loadTMDBPage(page) {
        const grid = document.getElementById('tmdbFullGrid');
        const pagination = document.getElementById('tmdbPagination');
        if (!grid || !this.currentSection) return;
        
        grid.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Loading...</p>';
        
        try {
            let url = '';
            const { type, endpoint, region } = this.currentSection;
            if (endpoint === 'sheedys_picks') {
                const items = await this.getSheedysPicks();
                grid.innerHTML = '';
                items.forEach(item => {
                    const card = window.renderPostCard({
                        title: item.title || item.name,
                        image: this.getPosterUrl(item.poster_path),
                        link: item.tmdb_id ? item.tmdb_id.toString() : item.id?.toString()
                    }, 'tmdb');
                    
                    card.onclick = () => this.showTMDBDetails(item, type);
                    grid.appendChild(card);
                });
                if (pagination) {
                    pagination.innerHTML = '';
                }
                this.currentSection.page = 1;
                return;
            }
            
            const apiKey = this.getApiKey();
            if (!apiKey) {
                throw new Error('TMDB API key missing');
            }

            // Build URL based on endpoint
            if (endpoint === 'trending') {
                url = `${this.BASE_URL}/trending/${type}/week?api_key=${apiKey}&page=${page}`;
            } else if (endpoint === 'popular') {
                url = `${this.BASE_URL}/${type}/popular?api_key=${apiKey}${region ? `&region=${region}` : ''}&page=${page}`;
            } else if (endpoint === 'now_playing') {
                url = `${this.BASE_URL}/movie/now_playing?api_key=${apiKey}&region=${region}&page=${page}`;
            } else if (endpoint === 'top_rated') {
                url = `${this.BASE_URL}/${type}/top_rated?api_key=${apiKey}&page=${page}`;
            } else if (endpoint === 'airing_today' && type === 'tv') {
                url = `${this.BASE_URL}/tv/airing_today?api_key=${apiKey}&page=${page}`;
            }
            
            const response = await fetch(url);
            const data = await response.json();
            const items = (data.results || []).slice(0, 20).map(item => (
                type === 'tv' ? this.normalizeTv(item) : this.normalizeMovie(item)
            )).filter(it => !it.original_language || it.original_language === 'en');   // English only

            // Render items
            grid.innerHTML = '';
            items.forEach(item => {
                const card = window.renderPostCard({
                    title: item.title || item.name,
                    image: this.getPosterUrl(item.poster_path),
                    link: item.tmdb_id ? item.tmdb_id.toString() : item.id?.toString()
                }, 'tmdb');
                
                // Override click handler to search providers
                card.onclick = () => this.showTMDBDetails(item, type);
                grid.appendChild(card);
            });
            
            // Render pagination
            const totalPages = Math.min(data.total_pages || 1, 500); // TMDB limit
            this.renderTMDBPagination(pagination, page, totalPages);
            
            this.currentSection.page = page;
            
        } catch (error) {
            console.error('Failed to load TMDB page:', error);
            grid.innerHTML = '<p style="color: var(--primary-color); text-align: center;">Failed to load content</p>';
        }
    },
    
    // Render TMDB pagination
    renderTMDBPagination(container, currentPage, totalPages) {
        if (!container) return;
        
        const maxButtons = 7;
        let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }
        
        let html = '<div class="pagination-buttons">';
        
        // Previous button
        if (currentPage > 1) {
            html += `<button onclick="TMDBContentModule.loadTMDBPage(${currentPage - 1})">‹ Prev</button>`;
        }
        
        // First page
        if (startPage > 1) {
            html += `<button onclick="TMDBContentModule.loadTMDBPage(1)">1</button>`;
            if (startPage > 2) html += '<span>...</span>';
        }
        
        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            if (i === currentPage) {
                html += `<button class="active">${i}</button>`;
            } else {
                html += `<button onclick="TMDBContentModule.loadTMDBPage(${i})">${i}</button>`;
            }
        }
        
        // Last page
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += '<span>...</span>';
            html += `<button onclick="TMDBContentModule.loadTMDBPage(${totalPages})">${totalPages}</button>`;
        }
        
        // Next button
        if (currentPage < totalPages) {
            html += `<button onclick="TMDBContentModule.loadTMDBPage(${currentPage + 1})">Next ›</button>`;
        }
        
        html += '</div>';
        container.innerHTML = html;
    },
    
    closeTMDBModal() {
        const modal = document.querySelector('.tmdb-full-modal');
        if (modal) modal.remove();
        this.currentSection = null;
    },

    // Render all TMDB sections for the home page. The first rows load
    // immediately (above the fold); the rest lazy-load as they scroll into
    // view, so we can offer a huge catalogue without a big up-front API burst.
    async renderAllSections(container) {
        console.log('📺 Loading TMDB content sections...');
        container.innerHTML = '';

        // Shared dedup so the same title doesn't repeat across rows.
        const seenMovieIds = new Set();
        const seenTvIds    = new Set();
        const dedupe = (items, type) => {
            const seen = type === 'tv' ? seenTvIds : seenMovieIds;
            return (items || []).filter(it => {
                const id = it?.id ?? it?.tmdb_id;
                if (id == null || seen.has(id)) return false;
                seen.add(id);
                return true;
            });
        };

        // Row-builder thunks (fetch lazily when the row scrolls into view).
        const mg = (g) => () => this.getMoviesByGenre(g);
        const tg = (g) => () => this.getTvByGenre(g);
        const dm = (params) => () => this.fetchMovies('/discover/movie', params);
        const decade = (from, to) => dm({ 'primary_release_date.gte': from, 'primary_release_date.lte': to, sort_by: 'popularity.desc', 'vote_count.gte': '150' });

        const rows = [
            // ── above the fold (eager) ──
            { title: '🔥 Trending Now',           type: 'movie', endpoint: 'trending',      load: () => this.getTrendingMovies() },
            { title: "✨ Sheedy's Picks",           type: 'movie', endpoint: 'sheedys_picks', load: () => this.getSheedysPicks() },
            { title: '📺 Trending TV Shows',        type: 'tv',    endpoint: 'trending',      load: () => this.getTrendingTvShows() },
            { title: '🎬 Now Playing in Theaters',  type: 'movie', endpoint: 'now_playing',   load: () => this.getNowPlayingMovies() },
            { title: '⭐ Popular TV Shows',         type: 'tv',    endpoint: 'popular',       load: () => this.getPopularTvShows() },
            { title: '🍿 Popular Movies',           type: 'movie', endpoint: 'popular',       load: () => this.getPopularMovies() },
            // ── lazy ──
            { title: '⚡ Action & Adventure',       type: 'movie', endpoint: 'discover',   load: () => this.getActionAdventureMovies() },
            { title: '🏆 Top Rated TV Shows',       type: 'tv',    endpoint: 'top_rated',  load: () => this.getTopRatedTvShows() },
            { title: '🎖️ Top Rated Movies',         type: 'movie', endpoint: 'top_rated',  load: () => this.fetchMovies('/movie/top_rated') },
            { title: '🆕 New Releases',             type: 'movie', endpoint: 'discover',   load: dm({ 'primary_release_date.gte': '2024-06-01', sort_by: 'primary_release_date.desc', 'vote_count.gte': '40' }) },
            { title: '💥 Blockbusters',             type: 'movie', endpoint: 'discover',   load: dm({ sort_by: 'revenue.desc', 'vote_count.gte': '1000' }) },
            { title: '🏅 Critically Acclaimed',     type: 'movie', endpoint: 'discover',   load: dm({ 'vote_count.gte': '2000', sort_by: 'vote_average.desc' }) },
            { title: '👻 Horror After Dark',        type: 'movie', endpoint: 'discover',   load: mg('27') },
            { title: '🚀 Sci-Fi Movies',            type: 'movie', endpoint: 'discover',   load: mg('878') },
            { title: '🌌 Sci-Fi & Fantasy Shows',   type: 'tv',    endpoint: 'discover',   load: tg('10765') },
            { title: '🧙 Fantasy Adventures',       type: 'movie', endpoint: 'discover',   load: mg('14') },
            { title: '🗺️ Adventure',                type: 'movie', endpoint: 'discover',   load: mg('12') },
            { title: '🎭 Thrillers',                type: 'movie', endpoint: 'discover',   load: mg('53') },
            { title: '🔪 Crime Movies',             type: 'movie', endpoint: 'discover',   load: mg('80') },
            { title: '🔍 Crime & Mystery Shows',    type: 'tv',    endpoint: 'discover',   load: tg('80') },
            { title: '🕵️ Mystery & Suspense',       type: 'movie', endpoint: 'discover',   load: mg('9648') },
            { title: '😂 Comedy Movies',            type: 'movie', endpoint: 'discover',   load: mg('35') },
            { title: '😄 Comedy TV Shows',          type: 'tv',    endpoint: 'discover',   load: tg('35') },
            { title: '💝 Romance',                  type: 'movie', endpoint: 'discover',   load: mg('10749') },
            { title: '💘 Rom-Coms',                 type: 'movie', endpoint: 'discover',   load: dm({ with_genres: '35,10749', sort_by: 'popularity.desc' }) },
            { title: '💔 Drama Series',             type: 'tv',    endpoint: 'discover',   load: tg('18') },
            { title: '🎨 Animation Movies',         type: 'movie', endpoint: 'discover',   load: mg('16') },
            { title: '🐉 Animated Series',          type: 'tv',    endpoint: 'discover',   load: tg('16') },
            { title: '👨‍👩‍👧‍👦 Family Movies',           type: 'movie', endpoint: 'discover',   load: mg('10751') },
            { title: '🧒 Kids TV',                  type: 'tv',    endpoint: 'discover',   load: tg('10762') },
            { title: '🎥 Documentaries',            type: 'movie', endpoint: 'discover',   load: mg('99') },
            { title: '📰 Documentary Series',       type: 'tv',    endpoint: 'discover',   load: tg('99') },
            { title: '🎤 Reality TV',               type: 'tv',    endpoint: 'discover',   load: tg('10764') },
            { title: '🎖️ War Stories',              type: 'movie', endpoint: 'discover',   load: mg('10752') },
            { title: '🤠 Westerns',                 type: 'movie', endpoint: 'discover',   load: mg('37') },
            { title: '🏛️ History',                  type: 'movie', endpoint: 'discover',   load: mg('36') },
            { title: '🎵 Music & Musicals',         type: 'movie', endpoint: 'discover',   load: mg('10402') },
            { title: '🎬 2020s Hits',               type: 'movie', endpoint: 'discover',   load: decade('2020-01-01', '2029-12-31') },
            { title: '📱 2010s',                    type: 'movie', endpoint: 'discover',   load: decade('2010-01-01', '2019-12-31') },
            { title: '💿 2000s Hits',               type: 'movie', endpoint: 'discover',   load: decade('2000-01-01', '2009-12-31') },
            { title: '📟 90s Favourites',           type: 'movie', endpoint: 'discover',   load: decade('1990-01-01', '1999-12-31') },
            { title: '📼 80s Classics',             type: 'movie', endpoint: 'discover',   load: decade('1980-01-01', '1989-12-31') },
            { title: '🇰🇷 Korean Cinema',           type: 'movie', endpoint: 'discover',   load: dm({ with_original_language: 'ko', sort_by: 'popularity.desc', 'vote_count.gte': '50' }) },
            { title: '🎌 Anime Movies',             type: 'movie', endpoint: 'discover',   load: dm({ with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' }) },
            { title: '🇮🇳 Bollywood',               type: 'movie', endpoint: 'discover',   load: dm({ with_original_language: 'hi', sort_by: 'popularity.desc', 'vote_count.gte': '30' }) },
            { title: '🇫🇷 French Cinema',           type: 'movie', endpoint: 'discover',   load: dm({ with_original_language: 'fr', sort_by: 'popularity.desc', 'vote_count.gte': '40' }) },
            { title: '🇪🇸 Spanish-Language',        type: 'movie', endpoint: 'discover',   load: dm({ with_original_language: 'es', sort_by: 'popularity.desc', 'vote_count.gte': '40' }) },
            { title: '📡 Airing Today',             type: 'tv',    endpoint: 'airing_today', load: () => this.getAiringTodayTvShows() },
            { title: '🌟 Award Winners',            type: 'movie', endpoint: 'discover',   load: dm({ 'vote_count.gte': '3000', sort_by: 'vote_average.desc', 'primary_release_date.lte': '2023-12-31' }) },
        ];

        const renderRow = async (cfg, placeholder) => {
            try {
                const items = dedupe(await cfg.load(), cfg.type);
                const section = items.length
                    ? this.renderTMDBSection(cfg.title, items, cfg.type, cfg.endpoint, cfg.region || '')
                    : null;
                if (section) {
                    if (placeholder) placeholder.replaceWith(section);
                    else container.appendChild(section);
                } else if (placeholder) {
                    placeholder.remove();
                }
            } catch {
                if (placeholder) placeholder.remove();
            }
        };

        // Eager rows — fetch in parallel, render in order.
        const EAGER = 6;
        const eager = rows.slice(0, EAGER);
        const eagerData = await Promise.all(eager.map(c => c.load().catch(() => [])));
        let rendered = 0;
        eager.forEach((cfg, i) => {
            const items = dedupe(eagerData[i], cfg.type);
            if (!items.length) return;
            const section = this.renderTMDBSection(cfg.title, items, cfg.type, cfg.endpoint, cfg.region || '');
            if (section) { container.appendChild(section); rendered++; }
        });
        if (rendered === 0) { container.appendChild(this.renderRetrySection()); return; }

        // Lazy rows — placeholder + IntersectionObserver, loaded on scroll.
        const io = ('IntersectionObserver' in window)
            ? new IntersectionObserver((entries, obs) => {
                entries.forEach(e => {
                    if (e.isIntersecting) { obs.unobserve(e.target); renderRow(e.target._rowCfg, e.target); }
                });
            }, { rootMargin: '700px 0px' })
            : null;

        rows.slice(EAGER).forEach(cfg => {
            const ph = document.createElement('div');
            ph.className = 'netflix-section nf-lazy-row';
            ph.innerHTML =
                `<div class="netflix-section-header"><h3 class="netflix-section-title">${_escHtml(cfg.title)}</h3></div>` +
                `<div class="netflix-scroll-container"><div class="netflix-row">${'<div class="nf-skel-card"></div>'.repeat(8)}</div></div>`;
            ph._rowCfg = cfg;
            container.appendChild(ph);
            if (io) io.observe(ph); else renderRow(cfg, ph);
        });

        console.log(`✅ TMDB home: ${EAGER} eager + ${rows.length - EAGER} lazy rows (${rows.length} total)`);
    },

    // Render TMDB TV sections for the TV Shows page — rich genre breakdown
    async renderTvSections(container) {
        if (!container) return;
        console.log('📺 Loading TMDB TV shows sections...');

        const results = await Promise.allSettled([
            this.getTrendingTvShows(),          // 0
            this.getPopularTvShows(),           // 1
            this.getTopRatedTvShows(),          // 2
            this.getAiringTodayTvShows(),       // 3
            this.getTvByGenre('18'),            // 4  drama
            this.getTvByGenre('35'),            // 5  comedy
            this.getTvByGenre('10759'),         // 6  action & adventure
            this.getTvByGenre('80'),            // 7  crime
            this.getTvByGenre('10765'),         // 8  sci-fi & fantasy
            this.getTvByGenre('10764'),         // 9  reality
            this.getTvByGenre('16'),            // 10 animation
            this.getTvByGenre('10751'),         // 11 family
            this.getTvByGenre('99'),            // 12 documentary
            this.fetchTv('/discover/tv', { with_original_language: 'ko', sort_by: 'popularity.desc' }), // 13 K-dramas
            this.fetchTv('/discover/tv', { with_original_language: 'ja', sort_by: 'popularity.desc' }), // 14 anime / J-TV
        ]);

        const val = (i) => results[i]?.status === 'fulfilled' ? results[i].value : [];

        container.innerHTML = '';
        const sections = [
            { title: '🔥 Trending TV',              items: val(0),  genre: 'trending',     endpoint: 'trending' },
            { title: '⭐ Popular Right Now',         items: val(1),  genre: 'all',          endpoint: 'popular' },
            { title: '🏆 Top Rated Shows',           items: val(2),  genre: 'all',          endpoint: 'top_rated' },
            { title: '📡 Airing Today',              items: val(3),  genre: 'all',          endpoint: 'airing_today' },
            { title: '💔 Drama',                     items: val(4),  genre: 'drama',        endpoint: 'discover' },
            { title: '😄 Comedy',                    items: val(5),  genre: 'comedy',       endpoint: 'discover' },
            { title: '⚡ Action & Adventure',        items: val(6),  genre: 'action',       endpoint: 'discover' },
            { title: '🔍 Crime & Mystery',           items: val(7),  genre: 'crime',        endpoint: 'discover' },
            { title: '🌌 Sci-Fi & Fantasy',          items: val(8),  genre: 'scifi',        endpoint: 'discover' },
            { title: '🎭 Reality TV',                items: val(9),  genre: 'reality',      endpoint: 'discover' },
            { title: '🐉 Animation',                 items: val(10), genre: 'animation',    endpoint: 'discover' },
            { title: '👨‍👩‍👧‍👦 Kids & Family',           items: val(11), genre: 'family',       endpoint: 'discover' },
            { title: '🎥 Documentary Series',        items: val(12), genre: 'documentary',  endpoint: 'discover' },
            { title: '🇰🇷 K-Dramas',                 items: val(13), genre: 'drama',        endpoint: 'discover' },
            { title: '🇯🇵 Anime & J-TV',             items: val(14), genre: 'animation',    endpoint: 'discover' },
        ];

        const seenTvIds = new Set();
        const dedupe = (items) => (items || []).filter(item => {
            const id = item?.id ?? item?.tmdb_id;
            if (id == null || seenTvIds.has(id)) return false;
            seenTvIds.add(id);
            return true;
        });

        sections.forEach(({ title, items, genre, endpoint }) => {
            const unique = dedupe(items);
            if (!unique.length) return;
            const section = this.renderTMDBSection(title, unique, 'tv', endpoint, '');
            if (section) {
                section.dataset.tvGenre = genre;
                container.appendChild(section);
            }
        });
    },

    async renderMovieSections(container) {
        if (!container) return;
        container.innerHTML = '';

        const heroEl   = document.getElementById('moviesHero');
        const pillsEl  = document.getElementById('moviesFilterPills');

        const decade = (from, to) => this.fetchMovies('/discover/movie', {
            sort_by: 'vote_average.desc',
            'primary_release_date.gte': `${from}-01-01`,
            'primary_release_date.lte': `${to}-12-31`,
            'vote_count.gte': '200'
        });

        const fetches = [
            { title: 'Trending Now',       genre: 'all',       fn: () => this.getTrendingMovies() },
            { title: 'Popular Movies',     genre: 'all',       fn: () => this.getPopularMovies() },
            { title: 'New in Cinemas',     genre: 'new',       fn: () => this.getNowPlayingMovies() },
            { title: 'Top Rated',          genre: 'top',       fn: () => this.fetchMovies('/movie/top_rated') },
            { title: 'Action & Adventure', genre: 'action',    fn: () => this.getMoviesByGenre('28,12') },
            { title: 'Comedy',             genre: 'comedy',    fn: () => this.getMoviesByGenre('35') },
            { title: 'Horror',             genre: 'horror',    fn: () => this.getMoviesByGenre('27') },
            { title: 'Science Fiction',    genre: 'scifi',     fn: () => this.getMoviesByGenre('878') },
            { title: 'Romance',            genre: 'romance',   fn: () => this.getMoviesByGenre('10749') },
            { title: 'Animation',          genre: 'animation', fn: () => this.getMoviesByGenre('16') },
            { title: 'Crime',              genre: 'crime',     fn: () => this.getMoviesByGenre('80') },
            { title: 'Thriller',           genre: 'thriller',  fn: () => this.getMoviesByGenre('53') },
            { title: 'Documentary',        genre: 'doc',       fn: () => this.getMoviesByGenre('99') },
            { title: 'Family',             genre: 'family',    fn: () => this.getMoviesByGenre('10751') },
            { title: 'Western',            genre: 'western',   fn: () => this.getMoviesByGenre('37') },
            { title: "Best of the '90s",   genre: 'classics',  fn: () => decade(1990, 1999) },
            { title: 'Best of the 2000s',  genre: 'classics',  fn: () => decade(2000, 2009) },
            { title: 'Best of the 2010s',  genre: 'classics',  fn: () => decade(2010, 2019) },
        ];

        const genrePills = [
            { label: 'All',         key: 'all'       },
            { label: 'New',         key: 'new'       },
            { label: 'Top Rated',   key: 'top'       },
            { label: 'Action',      key: 'action'    },
            { label: 'Comedy',      key: 'comedy'    },
            { label: 'Horror',      key: 'horror'    },
            { label: 'Sci-Fi',      key: 'scifi'     },
            { label: 'Romance',     key: 'romance'   },
            { label: 'Animation',   key: 'animation' },
            { label: 'Crime',       key: 'crime'     },
            { label: 'Thriller',    key: 'thriller'  },
            { label: 'Documentary', key: 'doc'       },
            { label: 'Family',      key: 'family'    },
            { label: 'Western',     key: 'western'   },
            { label: 'Classics',    key: 'classics'  },
        ];

        if (pillsEl) {
            pillsEl.innerHTML = genrePills.map(p =>
                `<button class="nf-filter-pill${p.key === 'all' ? ' active' : ''}" data-genre="${p.key}">${p.label}</button>`
            ).join('');
            pillsEl.addEventListener('click', e => {
                const pill = e.target.closest('.nf-filter-pill');
                if (!pill) return;
                pillsEl.querySelectorAll('.nf-filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                const genre = pill.dataset.genre;
                container.querySelectorAll('.netflix-section').forEach(s => {
                    s.style.display = (genre === 'all' || s.dataset.genre === genre) ? '' : 'none';
                });
            });
        }

        const results = await Promise.allSettled(fetches.map(f => f.fn()));
        let rendered = 0;

        const trendingItems = results[0].status === 'fulfilled' ? results[0].value : [];
        if (trendingItems.length && heroEl) {
            const featured = trendingItems[Math.floor(Math.random() * Math.min(5, trendingItems.length))];
            this.renderMoviesHero(heroEl, featured);
        }

        results.forEach((result, i) => {
            const items = result.status === 'fulfilled' ? result.value : [];
            if (!items?.length) return;
            const { title, genre } = fetches[i];
            const section = this.renderTMDBSection(title, items, 'movie', 'discover', '');
            if (section) {
                section.dataset.genre = genre;
                container.appendChild(section);
                rendered++;
            }
        });

        if (rendered === 0) {
            container.appendChild(this.renderRetrySection());
        }
    },

    renderMoviesHero(heroEl, item) {
        if (!heroEl || !item) return;
        const backdrop = item.backdrop_path
            ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : '';
        const title    = item.title || item.name || 'Untitled';
        const year     = (item.release_date || '').slice(0, 4);
        const score    = item.vote_average ? Math.round(item.vote_average * 10) + '%' : '';
        const overview = (item.overview || '').slice(0, 200);
        const hasMore  = (item.overview || '').length > 200;

        heroEl.innerHTML = `
            ${backdrop ? `<div class="nf-movies-hero-bg" style="background-image:url('${backdrop}')"></div>` : ''}
            <div class="nf-movies-hero-vignette"></div>
            <div class="nf-movies-hero-content">
                <div class="nf-movies-hero-label">Featured Movie</div>
                <h2 class="nf-movies-hero-title">${title}</h2>
                <div class="nf-movies-hero-meta">
                    ${score ? `<span class="nf-movies-hero-match">${score} Match</span>` : ''}
                    ${year  ? `<span class="nf-movies-hero-year">${year}</span>` : ''}
                </div>
                ${overview ? `<p class="nf-movies-hero-overview">${overview}${hasMore ? '…' : ''}</p>` : ''}
                <div class="nf-movies-hero-actions">
                    <button class="nf-movies-hero-play">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        Play
                    </button>
                    <button class="nf-movies-hero-info">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                        More Info
                    </button>
                </div>
            </div>
        `;

        heroEl.querySelector('.nf-movies-hero-play')?.addEventListener('click', () => {
            if (typeof window.openTMDBMovie === 'function') window.openTMDBMovie({ ...item, media_type: 'movie' });
        });
        heroEl.querySelector('.nf-movies-hero-info')?.addEventListener('click', () => {
            this.showTMDBDetails(item, 'movie');
        });
    },

    async renderExpandedTvSections(container) {
        if (!container) return;
        console.log('📺 Loading expanded TMDB TV sections...');

        const fetches = [
            { title: '🔥 Trending TV', fn: () => this.getTrendingTvShows(), type: 'tv', endpoint: 'trending' },
            { title: '⭐ Popular TV', fn: () => this.getPopularTvShows(), type: 'tv', endpoint: 'popular' },
            { title: '🏆 Top Rated', fn: () => this.getTopRatedTvShows(), type: 'tv', endpoint: 'top_rated' },
            { title: '📡 Airing Today', fn: () => this.getAiringTodayTvShows(), type: 'tv', endpoint: 'airing_today' },
            { title: '😂 Comedy Shows', fn: () => this.getTvByGenre('35'), type: 'tv', endpoint: 'discover' },
            { title: '🎭 Drama Series', fn: () => this.getTvByGenre('18'), type: 'tv', endpoint: 'discover' },
            { title: '🕵️ Crime Stories', fn: () => this.getTvByGenre('80'), type: 'tv', endpoint: 'discover' },
            { title: '🧩 Mystery & Suspense', fn: () => this.getTvByGenre('9648'), type: 'tv', endpoint: 'discover' },
            { title: '🚀 Sci-Fi & Fantasy', fn: () => this.getTvByGenre('10765'), type: 'tv', endpoint: 'discover' },
            { title: '🎤 Reality TV', fn: () => this.getTvByGenre('10764'), type: 'tv', endpoint: 'discover' },
            { title: '🧒 Kids & Family', fn: () => this.getTvByGenre('10762'), type: 'tv', endpoint: 'discover' },
            { title: '🎥 Documentary Series', fn: () => this.getTvByGenre('99'), type: 'tv', endpoint: 'discover' },
        ];

        container.innerHTML = '';
        const results = await Promise.allSettled(fetches.map(f => f.fn()));
        let rendered = 0;
        results.forEach((result, i) => {
            const items = result.status === 'fulfilled' ? result.value : [];
            if (!items?.length) return;
            const { title, type, endpoint } = fetches[i];
            const section = this.renderTMDBSection(title, items, type, endpoint, '');
            if (section) { container.appendChild(section); rendered++; }
        });

        if (rendered === 0) {
            container.appendChild(this.renderRetrySection());
        }
    }
};

// Make TMDBContentModule globally accessible
window.TMDBContentModule = TMDBContentModule;
