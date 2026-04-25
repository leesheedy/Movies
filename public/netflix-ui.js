/* ============================================================
   netflix-ui.js — Landing, Sign-in, Billboard, Header, Search,
                   Mobile nav.
   app.js handles the profile gate internally (its own storage key).
   This module controls landing ↔ signin ↔ mainApp transitions.
   ============================================================ */

(function () {
  'use strict';

  /* ── Session ── */
  const SESSION_KEY = 'mitta_session_v2';

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; }
    catch { return null; }
  }
  function setSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }
  function isLoggedIn() {
    return !!getSession()?.email;
  }

  /* ── DOM ── */
  const $ = id => document.getElementById(id);

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Page switcher ──
     'landing' | 'signin' | 'app'
     Loader fades out automatically when moving away from it.
  */
  function showPage(name) {
    const map = {
      landing: 'landingPage',
      signin:  'signinPage',
      app:     'mainApp',
    };

    Object.entries(map).forEach(([key, id]) => {
      const el = $(id);
      if (!el) return;
      if (key === name) el.removeAttribute('hidden');
      else              el.setAttribute('hidden', '');
    });

    // Fade out loader
    const loader = $('appLoader');
    if (loader && !loader.hasAttribute('hidden')) {
      loader.style.transition = 'opacity .4s';
      loader.style.opacity = '0';
      setTimeout(() => loader.setAttribute('hidden', ''), 420);
    }
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function init() {
    initLandingPage();
    initSignIn();
    initSignOut();
    initHeaderScroll();
    initProfileDropdown();
    initSearchWidget();
    initMobileNav();
    buildSigninProfileChips();

    if (isLoggedIn()) {
      showPage('app');
      initBillboard();
    } else {
      showPage('landing');
    }
  }

  /* ============================================================
     LANDING PAGE
     ============================================================ */
  function initLandingPage() {
    document.querySelectorAll('[data-action="goto-signin"]').forEach(btn => {
      btn.addEventListener('click', () => showPage('signin'));
    });

    const headerSignin = document.querySelector('.nf-landing-signin-btn');
    if (headerSignin) headerSignin.addEventListener('click', () => showPage('signin'));

    // "Sign up now" → same sign-in page
    const getStarted = $('gotoGetStarted');
    if (getStarted) getStarted.addEventListener('click', () => showPage('signin'));
  }

  /* ============================================================
     SIGN-IN PAGE
     ============================================================ */
  function initSignIn() {
    const form   = $('signinForm');
    const emailI = $('signinEmail');
    const passI  = $('signinPassword');
    const errBox = $('signinError');

    if (!form) return;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const email = (emailI?.value || '').trim();
      const pass  = (passI?.value  || '').trim();

      if (!email || !email.includes('@')) {
        showErr('Please enter a valid email address.'); return;
      }
      if (pass.length < 4) {
        showErr('Password must be at least 4 characters.'); return;
      }
      clearErr();
      setSession({ email });
      showPage('app');
      // Billboard fires after mainApp is visible
      setTimeout(initBillboard, 200);
    });

    function showErr(msg) {
      if (!errBox) return;
      errBox.textContent = msg;
      errBox.removeAttribute('hidden');
    }
    function clearErr() {
      if (errBox) errBox.setAttribute('hidden', '');
    }
  }

  /* ============================================================
     SIGN-OUT
     ============================================================ */
  function initSignOut() {
    $('signOutBtn')?.addEventListener('click', () => {
      clearSession();
      billboardDone = false;
      showPage('landing');
    });
  }

  /* ============================================================
     SIGN-IN QUICK PROFILE CHIPS
     (Lets users skip typing; sets session then reveals app)
     app.js profile gate will appear on top if no profile stored.
     ============================================================ */
  const PROFILE_COLORS = {
    guest: '#E50914', digby: '#0080FF', lee: '#E50914',
    ryan: '#1DB954', issy: '#FF69B4', renee: '#9B59B6',
    dom: '#F39C12', isla: '#1ABC9C',
  };
  const PROFILE_EMOJI = {
    guest: '🎬', digby: '🐶', lee: '🎥',
    ryan: '🏀', issy: '🌸', renee: '⭐',
    dom: '🎮', isla: '🌈',
  };
  const QUICK_PROFILES = [
    { id: 'guest', name: 'Guest' },
    { id: 'lee',   name: 'Lee' },
    { id: 'ryan',  name: 'Ryan' },
    { id: 'issy',  name: 'Issy' },
    { id: 'dom',   name: 'Dom' },
    { id: 'isla',  name: 'Dom & Isla' },
  ];

  function buildSigninProfileChips() {
    const list = $('signinProfileList');
    if (!list) return;
    list.innerHTML = '';

    QUICK_PROFILES.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'signin-profile-chip';
      const color = PROFILE_COLORS[p.id] || '#E50914';
      const emoji = PROFILE_EMOJI[p.id] || '🎬';
      btn.innerHTML = `
        <span class="chip-avatar" style="background:${color}">${escHtml(emoji)}</span>
        <span>${escHtml(p.name)}</span>
      `;
      btn.addEventListener('click', () => {
        setSession({ email: 'guest@mittamovies.com' });
        // Also write to app.js profile key so its gate is skipped
        localStorage.setItem('mitta_active_profile_v1', p.id);
        showPage('app');
        setTimeout(initBillboard, 200);
      });
      list.appendChild(btn);
    });
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
     PROFILE DROPDOWN
     (Supplements app.js's chip click — adds open/close class)
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

    function open() {
      expand.classList.add('expanded');
      input.focus();
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      expand.classList.remove('expanded');
      input.value = '';
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      input.dispatchEvent(new Event('input'));
    }

    if (toggleBtn) toggleBtn.addEventListener('click', () =>
      expand.classList.contains('expanded') ? close() : open()
    );
    input.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    clearBtn?.addEventListener('click', close);
  }

  /* ============================================================
     MOBILE BOTTOM NAV
     ============================================================ */
  function initMobileNav() {
    // Map mobile button id → desktop nav button id
    const map = {
      mobileHomeBtn:   'homeBtn',
      mobileSearchBtn: null,       // no desktop equivalent; handled separately
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
          // Search — focus the search input
          $('searchInputHeader')?.focus();
          $('nfSearchExpand')?.classList.add('expanded');
          $('searchToggle')?.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.NFAuth = {
    isLoggedIn,
    getSession,
    setSession,
    clearSession,
    showPage,
    initBillboard,
  };

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
