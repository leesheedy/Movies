// TV Shows Module — rich TMDB-powered sections with genre filtering
const TVShowsModule = {
    state: {
        currentPage: 1,
        loadedShows: [],
        allProviders: [],
        activeGenre: 'all',
    },

    async init(providers) {
        this.state.allProviders = providers;
        this.state.currentPage = 1;
        this.state.loadedShows = [];
    },

    renderTVShowsPage() {
        const container = document.getElementById('tvShowsContent');
        if (!container) return;

        // Wire up genre pills
        const pillsContainer = document.getElementById('tvGenrePills');
        if (pillsContainer) {
            pillsContainer.querySelectorAll('.nf-tv-genre-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    pillsContainer.querySelectorAll('.nf-tv-genre-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    this.state.activeGenre = pill.dataset.genre;
                    this.filterSections(container, this.state.activeGenre);
                });
            });
        }

        container.innerHTML = '<div style="display:flex;justify-content:center;padding:60px"><div class="nf-spinner"></div></div>';

        if (window.TMDBContentModule && typeof window.TMDBContentModule.renderTvSections === 'function') {
            this.loadTmdbTvSections(container);
        } else {
            this.loadProviderTVShows(container);
        }
    },

    async loadTmdbTvSections(container) {
        try {
            await window.TMDBContentModule.renderTvSections(container);
            this.tagSectionsWithGenre(container);
        } catch (err) {
            console.warn('[TVShows] TMDB sections failed, falling back to provider:', err);
            this.loadProviderTVShows(container);
        }
    },

    tagSectionsWithGenre(container) {
        const titleGenreMap = [
            ['trending',        'trending'],
            ['drama',           'drama'],
            ['comedy',          'comedy'],
            ['action',          'action'],
            ['adventure',       'action'],
            ['crime',           'crime'],
            ['thriller',        'crime'],
            ['sci-fi',          'scifi'],
            ['fantasy',         'scifi'],
            ['mystery',         'crime'],
            ['reality',         'reality'],
            ['talk',            'reality'],
            ['animation',       'animation'],
            ['anime',           'animation'],
            ['kids',            'family'],
            ['family',          'family'],
            ['children',        'family'],
            ['documentary',     'documentary'],
            ['news',            'documentary'],
        ];

        container.querySelectorAll('.netflix-section').forEach(section => {
            const titleEl = section.querySelector('.netflix-section-title');
            if (!titleEl) { section.dataset.tvGenre = 'all'; return; }
            const titleLower = titleEl.textContent.toLowerCase();
            let assigned = 'all';
            for (const [key, genre] of titleGenreMap) {
                if (titleLower.includes(key)) { assigned = genre; break; }
            }
            section.dataset.tvGenre = assigned;
        });
    },

    filterSections(container, genre) {
        container.querySelectorAll('.netflix-section').forEach(section => {
            const sectionGenre = section.dataset.tvGenre || 'all';
            section.style.display = (genre === 'all' || sectionGenre === genre) ? '' : 'none';
        });
    },

    async loadProviderTVShows(container, page = 1, append = false) {
        if (!append) {
            container.innerHTML = `
                <div class="content-sections">
                    <div id="tvShowsGrid" class="posts-grid"></div>
                    <div id="tvShowsPagination" class="pagination"></div>
                </div>`;
        }

        const grid = document.getElementById('tvShowsGrid');
        const pagination = document.getElementById('tvShowsPagination');
        if (!grid) return;

        showLoading(true, 'Loading TV shows...');

        try {
            const providers = this.state.allProviders;
            this.state.currentPage = page;
            const perPage = 8;
            const start = (page - 1) * perPage;
            const slice = providers.slice(start, start + perPage);

            if (!slice.length) {
                grid.innerHTML = '<p style="color:#b3b3b3;grid-column:1/-1">No more TV shows available.</p>';
                showLoading(false);
                return;
            }

            const results = await Promise.all(slice.map(async (provider) => {
                try {
                    const catalogData = await fetchCatalog(provider.value);
                    let tvFilter = '';
                    if (catalogData.catalog?.length) {
                        const tv = catalogData.catalog.find(item => {
                            const t = item.title.toLowerCase();
                            return t.includes('tv') || t.includes('show') || t.includes('series');
                        });
                        tvFilter = tv?.filter || catalogData.catalog[1]?.filter || catalogData.catalog[0]?.filter || '';
                    }
                    const data = await fetchPosts(provider.value, tvFilter, 1);
                    const posts = Array.isArray(data) ? data : (data.posts || []);
                    const tvPosts = posts.filter(post => {
                        const link = String(post?.link || '').toLowerCase();
                        const type = String(post?.media_type || post?.mediaType || post?.type || '').toLowerCase();
                        if (type) return type === 'tv' || type === 'series' || type === 'show';
                        if (link.includes('/meta/series/') || link.includes('/meta/tv/')) return true;
                        if (link.includes('/meta/movie/')) return false;
                        return true;
                    });
                    return {
                        posts: tvPosts.slice(0, 12).map(post => ({
                            ...post, media_type: 'tv', provider: provider.value, displayName: provider.display_name
                        })),
                        provider: provider.value
                    };
                } catch { return { posts: [], provider: provider.value }; }
            }));

            let newShows = results.flatMap(r => r.posts);
            shuffleArray(newShows);

            this.state.loadedShows = append
                ? this.state.loadedShows.concat(newShows)
                : newShows;

            grid.innerHTML = '';
            if (!this.state.loadedShows.length) {
                grid.innerHTML = '<p style="color:#b3b3b3;grid-column:1/-1">No TV shows available.</p>';
            } else {
                this.state.loadedShows.forEach(post => grid.appendChild(renderPostCard(post, post.provider)));
            }

            if (pagination) {
                const hasMore = (start + perPage) < providers.length;
                pagination.innerHTML = hasMore
                    ? '<button class="load-more-btn" onclick="TVShowsModule.loadMoreTVShows()">&#8615; Load More TV Shows</button>'
                    : '<p style="color:#b3b3b3;text-align:center">All shows loaded</p>';
            }
        } catch (err) {
            console.error('[TVShows] load error:', err);
            grid.innerHTML = '<p style="color:#e50914;grid-column:1/-1">Failed to load TV shows.</p>';
        } finally {
            showLoading(false);
        }
    },

    async loadMoreTVShows() {
        await this.loadProviderTVShows(document.getElementById('tvShowsContent'), this.state.currentPage + 1, true);
    }
};

window.TVShowsModule = TVShowsModule;
