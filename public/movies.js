// Movies Module - Aggregates movies from Vidsrc
const MoviesModule = {
    state: {
        currentPage: 1,
        loadedMovies: [],
        allProviders: [],
    },

    // Initialize movies module
    async init(providers) {
        console.log('🎬 Initializing Movies module with', providers.length, 'providers');
        this.state.allProviders = providers;
        this.state.currentPage = 1;
        this.state.loadedMovies = [];
    },

    // Render the movies page
    renderMoviesPage() {
        const container = document.getElementById('moviesContent');
        if (!container) return;
        
        container.innerHTML = `
            <div class="content-header">
                <h1>🎬 Movies</h1>
                <p class="content-subtitle">Browse movies from Vidsrc</p>
            </div>
            
            <div class="content-sections">
                <div id="moviesGrid" class="posts-grid"></div>
                <div id="moviesPagination" class="pagination"></div>
            </div>
        `;
        
        this.loadMovies();
    },

    // Load movies from all providers
    async loadMovies(page = 1, append = false) {
        const container = document.getElementById('moviesGrid');
        const paginationContainer = document.getElementById('moviesPagination');
        if (!container) return;
        
        showLoading(true, 'Loading movies from Vidsrc...');
        
        try {
            const providers = this.state.allProviders;
            this.state.currentPage = page;
            
            // Calculate which providers to fetch from based on page
            const providersPerPage = 8;
            const startIndex = (page - 1) * providersPerPage;
            const endIndex = startIndex + providersPerPage;
            const providersToFetch = providers.slice(startIndex, endIndex);
            
            if (providersToFetch.length === 0) {
                if (!append) {
                    container.innerHTML = '<p style="color: #b3b3b3; grid-column: 1 / -1;">No more movies available.</p>';
                }
                paginationContainer.innerHTML = '<p style="color: #b3b3b3; text-align: center;">No more content available</p>';
                showLoading(false);
                return;
            }
            
            // Fetch movies from selected providers
            const fetchPromises = providersToFetch.map(async (provider) => {
                try {
                    // Get catalog to find movie sections
                    const catalogData = await fetchCatalog(provider.value);
                    
                    // Find movie-related sections
                    let movieFilter = '';
                    if (catalogData.catalog && Array.isArray(catalogData.catalog)) {
                        const movieSection = catalogData.catalog.find(item => {
                            const title = item.title.toLowerCase();
                            return title.includes('movie') || title.includes('film');
                        });
                        if (movieSection) {
                            movieFilter = movieSection.filter;
                        } else {
                            // If no specific movie section, use first catalog item
                            movieFilter = catalogData.catalog[0]?.filter || '';
                        }
                    }
                    
                    const data = await fetchPosts(provider.value, movieFilter, 1);
                    const posts = Array.isArray(data) ? data : (data.posts || []);
                    const moviePosts = posts.filter(post => {
                        const link = String(post?.link || '').toLowerCase();
                        const type = String(post?.media_type || post?.mediaType || post?.type || '').toLowerCase();
                        if (type) return type === 'movie';
                        if (link.includes('/meta/movie/')) return true;
                        if (link.includes('/meta/series/') || link.includes('/meta/tv/')) return false;
                        return true;
                    });
                    
                    // Take first 12 posts from each provider
                    return {
                        posts: moviePosts.slice(0, 12).map(post => ({
                            ...post, 
                            media_type: 'movie',
                            provider: provider.value,
                            displayName: provider.display_name
                        })),
                        provider: provider.value
                    };
                } catch (error) {
                    console.warn(`Failed to fetch movies from ${provider.value}:`, error);
                    return { posts: [], provider: provider.value };
                }
            });
            
            const results = await Promise.all(fetchPromises);
            
            // Combine all posts
            let newMovies = [];
            results.forEach(result => {
                if (result.posts && result.posts.length > 0) {
                    newMovies = newMovies.concat(result.posts);
                }
            });
            
            // Shuffle for variety
            shuffleArray(newMovies);
            
            // Append or replace posts
            if (append) {
                this.state.loadedMovies = this.state.loadedMovies.concat(newMovies);
            } else {
                this.state.loadedMovies = newMovies;
            }
            
            // Render posts
            container.innerHTML = '';
            if (this.state.loadedMovies.length === 0) {
                container.innerHTML = '<p style="color: #b3b3b3; grid-column: 1 / -1;">No movies available.</p>';
            } else {
                this.state.loadedMovies.forEach(post => {
                    container.appendChild(renderPostCard(post, post.provider));
                });
            }
            
            // Render load more button
            const hasMore = endIndex < providers.length;
            if (hasMore) {
                paginationContainer.innerHTML = `
                    <button class="load-more-btn" onclick="MoviesModule.loadMoreMovies()">
                        📥 Load More Movies
                    </button>
                `;
            } else {
                paginationContainer.innerHTML = '<p style="color: #b3b3b3; text-align: center;">No more movies available</p>';
            }
            
        } catch (error) {
            console.error('Failed to load movies:', error);
            container.innerHTML = '<p style="color: #e50914; grid-column: 1 / -1;">Failed to load movies.</p>';
        } finally {
            showLoading(false);
        }
    },
    
    // Load more movies
    async loadMoreMovies() {
        const nextPage = this.state.currentPage + 1;
        await this.loadMovies(nextPage, true);
    }
};

// Make MoviesModule globally accessible
window.MoviesModule = MoviesModule;
