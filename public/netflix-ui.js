/* ============================================================
   netflix-ui.js — Profile gate, Billboard, Header scroll,
                   Profile dropdown, Search widget, Mobile nav.
   Landing/sign-in pages are bypassed — app goes straight to
   the "Who's watching?" profile gate on every load.
   ============================================================ */

(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ============================================================
     BOOT — runs on DOMContentLoaded (before app.js finishes init)
     ============================================================ */
  function init() {
    // Reveal mainApp immediately so app.js can load content in bg
    const mainApp = $('mainApp');
    if (mainApp) mainApp.removeAttribute('hidden');

    // Hide loader, landing, signin — not used in this flow
    ['appLoader', 'landingPage', 'signinPage'].forEach(id => {
      const el = $(id);
      if (el) el.setAttribute('hidden', '');
    });

    // Always show profile gate on every page load
    const gate = $('profileGate');
    if (gate) {
      gate.removeAttribute('hidden');

      // When app.js hides the gate (profile selected), init the billboard
      const obs = new MutationObserver(() => {
        if (gate.hasAttribute('hidden')) {
          obs.disconnect();
          initBillboard();
        }
      });
      obs.observe(gate, { attributes: true, attributeFilter: ['hidden'] });
    }

    // Sign-out → show profile gate again
    $('signOutBtn')?.addEventListener('click', () => {
      localStorage.removeItem('mitta_active_profile_v1');
      billboardDone = false;
      if (gate) gate.removeAttribute('hidden');
    });

    initHeaderScroll();
    initProfileDropdown();
    initSearchWidget();
    initMobileNav();
  }

  /* ============================================================
     BILLBOARD
     ============================================================ */
  let billboardDone = false;

  async function initBillboard() {
    if (billboardDone) return;
    billboardDone = true;

    const section = $('billboardSection');
    if (!section) return;

    try {
      if (!window.TMDBContentModule) { billboardDone = false; return; }
      const movies = await window.TMDBContentModule.getTrendingMovies();
      if (!movies?.length) return;
      const item = movies[Math.floor(Math.random() * Math.min(5, movies.length))];
      renderBillboard(section, item);
    } catch (e) {
      console.warn('[Billboard]', e);
    }
  }

  function renderBillboard(section, item) {
    const backdrop = item.backdrop_path
      ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : '';
    const title    = item.title || item.name || 'Untitled';
    const overview = item.overview || '';
    const year     = (item.release_date || item.first_air_date || '').slice(0, 4);
    const score    = item.vote_average ? Math.round(item.vote_average * 10) + '% Match' : '';
    const id       = item.id;
    const type     = item.media_type === 'tv' ? 'tv' : 'movie';

    section.innerHTML = `
      <div class="nf-billboard-media">
        ${backdrop ? `<img src="${escHtml(backdrop)}" alt="${escHtml(title)}" loading="eager">` : ''}
      </div>
      <div class="nf-billboard-vignette"></div>
      <div class="nf-billboard-content">
        <h2 class="nf-billboard-title">${escHtml(title)}</h2>
        <div class="nf-billboard-meta">
          ${score ? `<span class="nf-billboard-match">${escHtml(score)}</span>` : ''}
          ${year  ? `<span>${escHtml(year)}</span>` : ''}
        </div>
        <p class="nf-billboard-overview">${escHtml(overview)}</p>
        <div class="nf-billboard-actions">
          <button class="nf-bb-play-btn" data-id="${id}" data-type="${escHtml(type)}">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Play
          </button>
          <button class="nf-bb-info-btn" data-id="${id}" data-type="${escHtml(type)}">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10
                       10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            More Info
          </button>
        </div>
      </div>
    `;

    section.querySelector('.nf-bb-play-btn')?.addEventListener('click', () => {
      if (typeof window.playContent === 'function') window.playContent(id, type, title);
      else window.dispatchEvent(new CustomEvent('playContent', { detail: { id, type, title } }));
    });

    section.querySelector('.nf-bb-info-btn')?.addEventListener('click', () => {
      if (typeof window.showDetails === 'function') window.showDetails(id, type);
      else window.dispatchEvent(new CustomEvent('showDetails', { detail: { id, type } }));
    });
  }

  /* ============================================================
     HEADER SCROLL
     ============================================================ */
  function initHeaderScroll() {
    const header = $('nfHeader');
    if (!header) return;
    const onScroll = () => header.classList.toggle('nf-header--scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ============================================================
     PROFILE DROPDOWN  (open/close class for CSS animation)
     ============================================================ */
  function initProfileDropdown() {
    const chip     = $('profileChip');
    const dropdown = $('nfProfileDropdown');
    if (!chip || !dropdown) return;

    chip.addEventListener('click', e => {
      e.stopPropagation();
      const open = !dropdown.classList.contains('open');
      dropdown.classList.toggle('open', open);
      chip.setAttribute('aria-expanded', String(open));
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
      if (chip) chip.setAttribute('aria-expanded', 'false');
    });
  }

  /* ============================================================
     SEARCH WIDGET
     ============================================================ */
  function initSearchWidget() {
    const toggleBtn = $('searchToggle');
    const expand    = $('nfSearchExpand');
    const input     = $('searchInputHeader');
    const clearBtn  = $('searchClearHeader');

    if (!expand || !input) return;

    function open()  {
      expand.classList.add('expanded');
      input.focus();
      toggleBtn?.setAttribute('aria-expanded', 'true');
    }
    function close() {
      expand.classList.remove('expanded');
      input.value = '';
      toggleBtn?.setAttribute('aria-expanded', 'false');
      input.dispatchEvent(new Event('input'));
    }

    toggleBtn?.addEventListener('click', () =>
      expand.classList.contains('expanded') ? close() : open()
    );
    input.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    clearBtn?.addEventListener('click', close);
  }

  /* ============================================================
     MOBILE BOTTOM NAV  — delegates to desktop nav buttons
     ============================================================ */
  function initMobileNav() {
    const map = {
      mobileHomeBtn:   'homeBtn',
      mobileSearchBtn: null,
      mobileMoviesBtn: 'moviesBtn',
      mobileTvBtn:     'tvShowsBtn',
      mobileMoreBtn:   'exploreBtn',
    };
    Object.entries(map).forEach(([mobileId, desktopId]) => {
      const btn = $(mobileId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nf-mobile-btn')
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (desktopId) {
          $(desktopId)?.click();
        } else {
          $('nfSearchExpand')?.classList.add('expanded');
          $('searchInputHeader')?.focus();
          $('searchToggle')?.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.NFAuth = { initBillboard };

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
