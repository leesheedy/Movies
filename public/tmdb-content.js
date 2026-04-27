// TMDB Content Module - Fetches trending and popular content from TMDB
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

    normalizeMovie(item) {
        return {
            tmdb_id: item.id,
            title: item.title,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            release_date: item.release_date,
            vote_average: item.vote_average
        };
    },

    normalizeTv(item) {
        return {
            tmdb_id: item.id,
            name: item.name,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            first_air_date: item.first_air_date,
            vote_average: item.vote_average
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
                overview: item.overview, vote_average: item.vote_average }));
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

    // Fetch trending TV shows (week)
    async getTrendingTvShows() {
        return this.fetchTv('/trending/tv/week');
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
        if (!items || items.length === 0) return null;

        const section = document.createElement('div');
        section.className = 'netflix-section';

        const header = document.createElement('div');
        header.className = 'netflix-section-header';
        header.innerHTML = `
            <h3 class="netflix-section-title">${title}</h3>
            <button class="netflix-view-all" onclick="TMDBContentModule.showFullTMDBSection('${title}', '${type}', '${endpoint}', '${region}')">View All ›</button>
        `;
        section.appendChild(header);

        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'netflix-scroll-container';

        const row = document.createElement('div');
        row.className = 'netflix-row';

        items.slice(0, 20).forEach(item => {
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

            let hoverTimer = null;
            card.addEventListener('mouseenter', () => {
                hoverTimer = setTimeout(async () => {
                    try {
                        const apiKey = this.getApiKey();
                        if (!apiKey || !card.matches(':hover')) return;
                        const mediaType = type === 'tv' ? 'tv' : 'movie';
                        const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${item.id}/videos?api_key=${apiKey}`);
                        const data = await res.json();
                        const trailer = (data.results || []).find(v => v.site === 'YouTube' && v.type === 'Trailer')
                            || (data.results || []).find(v => v.site === 'YouTube');
                        if (!trailer || !card.matches(':hover')) return;
                        const existing = card.querySelector('.nf-card-trailer');
                        if (existing) return;
                        const img = card.querySelector('img');
                        if (img) img.style.opacity = '0';
                        const iframe = document.createElement('iframe');
                        iframe.className = 'nf-card-trailer';
                        iframe.src = `https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${trailer.key}&modestbranding=1&rel=0`;
                        iframe.allow = 'autoplay; encrypted-media';
                        iframe.setAttribute('allowfullscreen', '');
                        card.insertBefore(iframe, card.querySelector('.netflix-card-overlay'));
                    } catch (e) {}
                }, 5000);
            });
            card.addEventListener('mouseleave', () => {
                clearTimeout(hoverTimer);
                hoverTimer = null;
                const iframe = card.querySelector('.nf-card-trailer');
                if (iframe) iframe.remove();
                const img = card.querySelector('img');
                if (img) img.style.opacity = '';
            });

            row.appendChild(card);
        });

        scrollContainer.appendChild(row);
        section.appendChild(scrollContainer);

        return section;
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
                        <h2>"${title}" - Not Found</h2>
                        <button onclick="TMDBContentModule.closeSearchModal()" class="history-close-btn">✕</button>
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
                        <h2>"${title}" - Found in ${results.length} Provider(s)</h2>
                        <button onclick="TMDBContentModule.closeSearchModal()" class="history-close-btn">✕</button>
                    </div>
                    <div class="history-modal-body">
                        ${results.map(result => `
                            <div class="tmdb-provider-section">
                                <h3 class="tmdb-provider-name">📦 ${result.displayName}</h3>
                                <div class="tmdb-results-grid">
                                    ${result.posts.map(post => `
                                        <div class="tmdb-result-card" onclick="TMDBContentModule.closeSearchModal(); openPlaybackTab('${result.provider}', '${post.link}')">
                                            <img src="${post.image}" alt="${post.title}" />
                                            <div class="tmdb-result-info">
                                                <h4>${post.title}</h4>
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
        
        document.body.appendChild(modal);
    },
    
    closeSearchModal() {
        const modal = document.querySelector('.tmdb-search-modal');
        if (modal) modal.remove();
    },
    
    // Render Similar and Recommended sections
    renderSimilarAndRecommended(similarContent, recommendedContent, type) {
        let html = '';
        
        // Recommended section
        if (recommendedContent.length > 0) {
            html += `
                <div class="tmdb-similar-section">
                    <h3 class="tmdb-section-title">⭐ Recommended for You</h3>
                    <div class="tmdb-similar-grid">
                        ${recommendedContent.slice(0, 12).map(item => {
                            const itemTitle = item.title || item.name;
                            const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                            const posterUrl = item.poster_path 
                                ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                                : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
                            
                            return `
                                <div class="tmdb-similar-card" onclick='TMDBContentModule.showTMDBDetails(${JSON.stringify(item).replace(/'/g, "&apos;")}, "${type}", false)'>
                                    <img src="${posterUrl}" alt="${itemTitle}" />
                                    <div class="tmdb-similar-info">
                                        <h4>${itemTitle}</h4>
                                        <span class="tmdb-rating">⭐ ${rating}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        // Similar section
        if (similarContent.length > 0) {
            html += `
                <div class="tmdb-similar-section">
                    <h3 class="tmdb-section-title">🎬 Similar ${type === 'movie' ? 'Movies' : 'TV Shows'}</h3>
                    <div class="tmdb-similar-grid">
                        ${similarContent.slice(0, 12).map(item => {
                            const itemTitle = item.title || item.name;
                            const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                            const posterUrl = item.poster_path 
                                ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
                                : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22%3E%3Crect width=%22200%22 height=%22300%22 fill=%22%23333%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%23666%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
                            
                            return `
                                <div class="tmdb-similar-card" onclick='TMDBContentModule.showTMDBDetails(${JSON.stringify(item).replace(/'/g, "&apos;")}, "${type}", false)'>
                                    <img src="${posterUrl}" alt="${itemTitle}" />
                                    <div class="tmdb-similar-info">
                                        <h4>${itemTitle}</h4>
                                        <span class="tmdb-rating">⭐ ${rating}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
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
            ));
            
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

    // Render all TMDB sections for home page
    async renderAllSections(container) {
        console.log('📺 Loading TMDB content sections...');

        const results = await Promise.allSettled([
            this.getTrendingMovies(),
            this.getSheedysPicks(),
            this.getNowPlayingMovies(),
            this.getNostalgiaMovies(),
            this.getHorrorMovies(),
            this.getComedyMovies(),
            this.getActionAdventureMovies()
        ]);

        const [
            trendingMovies,
            sheedysPicks,
            nowPlaying,
            nostalgiaMovies,
            horrorMovies,
            comedyMovies,
            actionAdventureMovies
        ] = results.map(r => r.status === 'fulfilled' ? r.value : []);

        const trendingIds = new Set((trendingMovies || []).map((movie) => movie.id));
        const nonTrendingNowPlaying = [];
        const trendingNowPlaying = [];

        (nowPlaying || []).forEach((movie) => {
            if (trendingIds.has(movie.id)) {
                trendingNowPlaying.push(movie);
            } else {
                nonTrendingNowPlaying.push(movie);
            }
        });

        const orderedNowPlaying = [...nonTrendingNowPlaying, ...trendingNowPlaying];

        const sections = [
            { title: '🔥 Trending Now', items: trendingMovies, type: 'movie', endpoint: 'trending', region: '' },
            { title: "✨ Sheedy's Picks", items: sheedysPicks, type: 'movie', endpoint: 'sheedys_picks', region: '' },
            { title: '🎬 Now Playing in Theaters', items: orderedNowPlaying, type: 'movie', endpoint: 'now_playing', region: '' },
            { title: '🕰️ Nostalgia', items: nostalgiaMovies, type: 'movie', endpoint: 'discover', region: '' },
            { title: '👻 Horror After Dark', items: horrorMovies, type: 'movie', endpoint: 'discover', region: '' },
            { title: '😂 Comedy & More', items: comedyMovies, type: 'movie', endpoint: 'discover', region: '' },
            { title: '⚡ Action & Adventure', items: actionAdventureMovies, type: 'movie', endpoint: 'discover', region: '' }
        ];

        let rendered = 0;
        sections.forEach(({ title, items, type, endpoint, region }) => {
            const section = this.renderTMDBSection(title, items, type, endpoint, region);
            if (section) {
                container.appendChild(section);
                rendered++;
            }
        });

        if (rendered === 0) {
            container.appendChild(this.renderRetrySection());
        }

        console.log(`✅ TMDB content sections loaded (${rendered}/7)`);
    },

    // Render TMDB TV sections for the TV Shows page
    async renderTvSections(container) {
        if (!container) return;
        console.log('📺 Loading TMDB TV shows sections...');

        const results = await Promise.allSettled([
            this.getTrendingTvShows(),
            this.getPopularTvShows(),
            this.getTopRatedTvShows(),
            this.getAiringTodayTvShows()
        ]);
        const [trending, popular, topRated, airingToday] = results.map(r => r.status === 'fulfilled' ? r.value : []);

        container.innerHTML = '';
        const sections = [
            { title: '🔥 Trending TV', items: trending, type: 'tv', endpoint: 'trending', region: '' },
            { title: '⭐ Popular TV', items: popular, type: 'tv', endpoint: 'popular', region: '' },
            { title: '🏆 Top Rated', items: topRated, type: 'tv', endpoint: 'top_rated', region: '' },
            { title: '📡 Airing Today', items: airingToday, type: 'tv', endpoint: 'airing_today', region: '' }
        ];
        sections.forEach(({ title, items, type, endpoint, region }) => {
            const section = this.renderTMDBSection(title, items, type, endpoint, region);
            if (section) container.appendChild(section);
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
