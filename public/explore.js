// Explore Module - Aggregates content from Vidsrc
const ExploreModule = {
    state: {
        allGenres: new Map(), // Map<genreName, [{provider, filter}]>
        loadedContent: new Map(), // Cache for loaded content
        currentGenre: null,
        currentGenrePage: 1,
        allContentPage: 1,
        allContentPosts: [], // Store all loaded posts for "All Content"
        genreContentPosts: [], // Store all loaded posts for genre view
    },
    curatedLists: {
        digbysFlix: [
            'tt0120903',
            'tt0290334',
            'tt0376994',
            'tt0389860',
            'tt1045778'
        ],
        customCovers: {
            tt0389860: 'https://i.imgur.com/4mvTQP5.jpeg'
        }
    },

    // Initialize explore module by collecting all genres from all providers
    async init(providers) {
        console.log('🔍 Initializing Explore module with', providers.length, 'providers');
        this.state.allGenres.clear();
        
        // Collect all genres from all providers
        for (const provider of providers) {
            try {
                const catalogData = await fetch(`${API_BASE}/api/${provider.value}/catalog`).then(r => r.json());
                
                // Add catalog items as genres
                if (catalogData.catalog && Array.isArray(catalogData.catalog)) {
                    catalogData.catalog.forEach(item => {
                        const genreName = item.title;
                        if (!this.state.allGenres.has(genreName)) {
                            this.state.allGenres.set(genreName, []);
                        }
                        this.state.allGenres.get(genreName).push({
                            provider: provider.value,
                            filter: item.filter,
                            displayName: provider.display_name
                        });
                    });
                }
                
                // Add explicit genres
                if (catalogData.genres && Array.isArray(catalogData.genres)) {
                    catalogData.genres.forEach(genre => {
                        const genreName = genre.title;
                        if (!this.state.allGenres.has(genreName)) {
                            this.state.allGenres.set(genreName, []);
                        }
                        this.state.allGenres.get(genreName).push({
                            provider: provider.value,
                            filter: genre.filter,
                            displayName: provider.display_name
                        });
                    });
                }
            } catch (error) {
                console.warn(`Failed to load catalog for ${provider.value}:`, error);
            }
        }
        
        console.log('✅ Collected', this.state.allGenres.size, 'unique genres/categories');
    },

    // Render the explore page
    renderExplorePage() {
        const container = document.getElementById('exploreContent');
        if (!container) return;
        
        container.innerHTML = `
            <div class="explore-header">
                <h1>🌍 Explore Curated Lists</h1>
                <p class="explore-subtitle">Jump into the hand-picked collections below.</p>
            </div>
            <div class="explore-nav">
                <span class="explore-nav-label">Quick jumps</span>
                <div class="explore-nav-links">
                    <a href="#sheedys-selections" class="explore-nav-link">Sheedy's Selections</a>
                    <a href="#digbys-flix" class="explore-nav-link">Digby's Flix</a>
                    <a href="#ryans-recommendations" class="explore-nav-link">Ryan's Recommendations</a>
                    <a href="#parkers-picks" class="explore-nav-link">Parker's Picks</a>
                </div>
            </div>
            <div id="exploreCuratedSections" class="explore-curated"></div>
        `;

        this.renderCuratedSections();
    },
    
    async renderCuratedSections() {
        const container = document.getElementById('exploreCuratedSections');
        if (!container) return;

        showLoading(true, 'Loading curated lists...');

        try {
            const [sheedysSelections, digbysFlix] = await Promise.all([
                window.TMDBContentModule?.getSheedysPicks?.() || [],
                this.getDigbysFlix()
            ]);

            container.innerHTML = '';

            const sheedysSection = this.buildCuratedSection({
                id: 'sheedys-selections',
                title: "✨ Sheedy's Selections",
                items: sheedysSelections,
                type: 'movie'
            });
            if (sheedysSection) container.appendChild(sheedysSection);

            const digbysSection = this.buildCuratedSection({
                id: 'digbys-flix',
                title: "🎥 Digby's Flix",
                items: digbysFlix,
                type: 'movie'
            });
            if (digbysSection) container.appendChild(digbysSection);

            container.appendChild(this.buildComingSoonSection({
                id: 'ryans-recommendations',
                title: "🍿 Ryan's Recommendations",
                message: 'Coming soon.'
            }));

            container.appendChild(this.buildComingSoonSection({
                id: 'parkers-picks',
                title: "🎬 Parker's Picks",
                message: 'Coming soon.'
            }));
        } catch (error) {
            console.error('Failed to render curated lists:', error);
            container.innerHTML = '<p class="explore-error">Failed to load curated lists. Please try again.</p>';
        } finally {
            showLoading(false);
        }
    },

    async getDigbysFlix() {
        if (!window.TMDBContentModule?.fetchMovieByImdbId) {
            return [];
        }

        const movies = await Promise.all(
            this.curatedLists.digbysFlix.map(async (imdbId) => {
                try {
                    const movie = await window.TMDBContentModule.fetchMovieByImdbId(imdbId);
                    if (!movie) {
                        return {
                            tmdb_id: null,
                            title: `IMDb ${imdbId}`,
                            poster_path: null,
                            release_date: null,
                            vote_average: null,
                            imdb_id: imdbId
                        };
                    }
                    return {
                        ...movie,
                        imdb_id: imdbId,
                        customPoster: this.curatedLists.customCovers[imdbId]
                    };
                } catch (error) {
                    console.warn('Failed to fetch Digby pick:', imdbId, error);
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

        return movies;
    },

    buildCuratedSection({ id, title, items, type }) {
        if (!items || items.length === 0) return null;

        const section = document.createElement('section');
        section.className = 'explore-section netflix-section';
        section.id = id;

        const header = document.createElement('div');
        header.className = 'netflix-section-header explore-curated-header';
        header.innerHTML = `<h3 class="netflix-section-title">${title}</h3>`;
        section.appendChild(header);

        const scrollContainer = document.createElement('div');
        scrollContainer.className = 'netflix-scroll-container';

        const row = document.createElement('div');
        row.className = 'netflix-row';

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'netflix-card tmdb-card explore-curated-card';
            const itemTitle = item.title || item.name || 'Untitled';
            const rating = item.vote_average ? item.vote_average.toFixed(1) : null;
            const year = item.release_date || item.first_air_date;
            const yearText = year ? new Date(year).getFullYear() : '';
            const poster = item.customPoster || window.TMDBContentModule?.getPosterUrl?.(item.poster_path);

            card.innerHTML = `
                <img src="${poster}" alt="${itemTitle}" loading="lazy" />
                <div class="netflix-card-overlay">
                    <h4>${itemTitle}</h4>
                    <div class="tmdb-card-info">
                        ${rating ? `<span class="tmdb-rating">⭐ ${rating}</span>` : ''}
                        ${yearText ? `<span class="tmdb-year">${yearText}</span>` : ''}
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                if (item.tmdb_id && window.TMDBContentModule?.showTMDBDetails) {
                    window.TMDBContentModule.showTMDBDetails(item, type);
                    return;
                }
                if (item.imdb_id) {
                    window.open(`https://www.imdb.com/title/${item.imdb_id}/`, '_blank', 'noopener');
                }
            });

            row.appendChild(card);
        });

        scrollContainer.appendChild(row);
        section.appendChild(scrollContainer);
        return section;
    },

    buildComingSoonSection({ id, title, message }) {
        const section = document.createElement('section');
        section.className = 'explore-section explore-coming-soon';
        section.id = id;

        section.innerHTML = `
            <div class="explore-coming-soon-header">
                <h3>${title}</h3>
            </div>
            <p>${message}</p>
        `;

        return section;
    },

    // Render all unique genres
    renderGenres() {
        const container = document.getElementById('exploreGenres');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Convert Map to sorted array
        const sortedGenres = Array.from(this.state.allGenres.keys()).sort();
        
        sortedGenres.forEach(genreName => {
            const providers = this.state.allGenres.get(genreName);
            const genreBtn = document.createElement('button');
            genreBtn.className = 'genre-btn';
            genreBtn.innerHTML = `
                ${genreName}
                <span class="genre-count">${providers.length}</span>
            `;
            genreBtn.addEventListener('click', () => {
                this.loadGenreContent(genreName);
            });
            container.appendChild(genreBtn);
        });
    },

    // Load content for a specific genre from all providers
    async loadGenreContent(genreName, page = 1, append = false) {
        showLoading(true, `Loading ${genreName}...`);
        
        try {
            const providers = this.state.allGenres.get(genreName);
            if (!providers || providers.length === 0) {
                showError('No results found for this genre');
                return;
            }
            
            // Store current genre
            this.state.currentGenre = genreName;
            this.state.currentGenrePage = page;
            
            // Fetch content from all providers for this genre
            const fetchPromises = providers.map(async ({provider, filter, displayName}) => {
                try {
                    const response = await fetch(`${API_BASE}/api/${provider}/posts?filter=${encodeURIComponent(filter)}&page=${page}`);
                    if (!response.ok) return { posts: [], provider, hasMore: false };
                    
                    const data = await response.json();
                    const posts = Array.isArray(data) ? data : (data.posts || []);
                    const hasMore = data.hasNextPage || (Array.isArray(posts) && posts.length >= 20);
                    
                    // Add provider info to each post
                    return {
                        posts: posts.map(post => ({...post, provider, displayName})),
                        provider,
                        hasMore
                    };
                } catch (error) {
                    console.warn(`Failed to fetch ${genreName} from ${provider}:`, error);
                    return { posts: [], provider, hasMore: false };
                }
            });
            
            const results = await Promise.all(fetchPromises);
            
            // Combine results
            let newPosts = [];
            let hasMoreContent = false;
            results.forEach(result => {
                if (result.posts && result.posts.length > 0) {
                    newPosts = newPosts.concat(result.posts);
                }
                if (result.hasMore) {
                    hasMoreContent = true;
                }
            });
            
            // Shuffle for variety
            shuffleArray(newPosts);
            
            // Append or replace posts
            if (append) {
                this.state.genreContentPosts = this.state.genreContentPosts.concat(newPosts);
            } else {
                this.state.genreContentPosts = newPosts;
            }
            
            // Update the page
            document.getElementById('searchTitle').textContent = `${genreName} - Vidsrc`;
            renderPosts(this.state.genreContentPosts, 'searchResults', 'explore');
            
            // Render pagination/load more button
            const paginationContainer = document.getElementById('searchPagination');
            if (hasMoreContent) {
                paginationContainer.innerHTML = `
                    <button class="load-more-btn" onclick="ExploreModule.loadMoreGenreContent()">
                        📥 Load More
                    </button>
                `;
            } else {
                paginationContainer.innerHTML = '<p style="color: #b3b3b3; text-align: center;">No more content available</p>';
            }
            
            showView('search');
            
        } catch (error) {
            showError('Failed to load genre content: ' + error.message);
        } finally {
            showLoading(false);
        }
    },
    
    // Load more content for current genre
    async loadMoreGenreContent() {
        if (!this.state.currentGenre) return;
        const nextPage = this.state.currentGenrePage + 1;
        await this.loadGenreContent(this.state.currentGenre, nextPage, true);
    },

    // Load all content from all providers (mixed)
    async loadAllContent(page = 1, append = false) {
        const container = document.getElementById('exploreAllPosts');
        const paginationContainer = document.getElementById('exploreAllPagination');
        if (!container) return;
        
        showLoading(true, 'Loading content from Vidsrc...');
        
        try {
            // Get all providers
            const providers = state.providers;
            this.state.allContentPage = page;
            
            // Calculate which providers to fetch from based on page
            const providersPerPage = 10;
            const startIndex = (page - 1) * providersPerPage;
            const endIndex = startIndex + providersPerPage;
            const providersToFetch = providers.slice(startIndex, endIndex);
            
            if (providersToFetch.length === 0) {
                if (!append) {
                    container.innerHTML = '<p style="color: #b3b3b3; grid-column: 1 / -1;">No more content available.</p>';
                }
                paginationContainer.innerHTML = '<p style="color: #b3b3b3; text-align: center;">No more content available</p>';
                showLoading(false);
                return;
            }
            
            // Fetch from selected providers
            const fetchPromises = providersToFetch.map(async (provider) => {
                try {
                    // Try to get the first catalog item
                    const catalogResponse = await fetch(`${API_BASE}/api/${provider.value}/catalog`);
                    if (!catalogResponse.ok) return { posts: [], provider: provider.value };
                    
                    const catalogData = await catalogResponse.json();
                    const firstFilter = catalogData.catalog && catalogData.catalog.length > 0 
                        ? catalogData.catalog[0].filter 
                        : '';
                    
                    const postsResponse = await fetch(`${API_BASE}/api/${provider.value}/posts?filter=${encodeURIComponent(firstFilter)}&page=1`);
                    if (!postsResponse.ok) return { posts: [], provider: provider.value };
                    
                    const data = await postsResponse.json();
                    const posts = Array.isArray(data) ? data : (data.posts || []);
                    
                    // Take only first 8 posts from each provider
                    return {
                        posts: posts.slice(0, 8).map(post => ({
                            ...post, 
                            provider: provider.value,
                            displayName: provider.display_name
                        })),
                        provider: provider.value
                    };
                } catch (error) {
                    console.warn(`Failed to fetch from ${provider.value}:`, error);
                    return { posts: [], provider: provider.value };
                }
            });
            
            const results = await Promise.all(fetchPromises);
            
            // Combine all posts
            let newPosts = [];
            results.forEach(result => {
                if (result.posts && result.posts.length > 0) {
                    newPosts = newPosts.concat(result.posts);
                }
            });
            
            // Shuffle for variety
            shuffleArray(newPosts);
            
            // Append or replace posts
            if (append) {
                this.state.allContentPosts = this.state.allContentPosts.concat(newPosts);
            } else {
                this.state.allContentPosts = newPosts;
            }
            
            // Render posts
            container.innerHTML = '';
            if (this.state.allContentPosts.length === 0) {
                container.innerHTML = '<p style="color: #b3b3b3; grid-column: 1 / -1;">No content available.</p>';
            } else {
                this.state.allContentPosts.forEach(post => {
                    container.appendChild(renderPostCard(post, post.provider));
                });
            }
            
            // Render load more button
            const hasMore = endIndex < providers.length;
            if (hasMore) {
                paginationContainer.innerHTML = `
                    <button class="load-more-btn" onclick="ExploreModule.loadMoreAllContent()">
                        📥 Load More
                    </button>
                `;
            } else {
                paginationContainer.innerHTML = '<p style="color: #b3b3b3; text-align: center;">No more content available</p>';
            }
            
        } catch (error) {
            console.error('Failed to load all content:', error);
            container.innerHTML = '<p style="color: #e50914; grid-column: 1 / -1;">Failed to load content.</p>';
        } finally {
            showLoading(false);
        }
    },
    
    // Load more content for "All Content" section
    async loadMoreAllContent() {
        const nextPage = this.state.allContentPage + 1;
        await this.loadAllContent(nextPage, true);
    }
};

// Make ExploreModule globally accessible
window.ExploreModule = ExploreModule;
