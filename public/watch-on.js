// "Watch On" page — a directory of legitimate places to stream sport, movies
// and TV. Reads public/watch-providers.json so entries can be added or edited
// without touching any code: copy an entry in that file, fill in
// name/url/note/kind, save. No rebuild needed.

const KIND_LABEL = { fta: 'Free', sub: 'Subscription', self: 'My Library' };

function watchOnCard(p) {
  const hasUrl = Boolean(p.url);
  const kindClass = `wp-kind wp-kind--${p.kind || 'sub'}`;

  return `
    <a class="wp-card ${hasUrl ? '' : 'wp-card--empty'}"
       ${hasUrl ? `href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer"` : 'tabindex="0"'}>
      <div class="wp-card-top">
        <span class="wp-name">${escapeHtml(p.name)}</span>
        <span class="${kindClass}">${escapeHtml(KIND_LABEL[p.kind] || 'Subscription')}</span>
      </div>
      <p class="wp-note">${escapeHtml(p.note || (hasUrl ? '' : 'Add a URL in watch-providers.json'))}</p>
    </a>`;
}

function watchOnSection(category) {
  return `
    <section class="wp-section">
      <h2 class="wp-section-title">${escapeHtml(category.label)}</h2>
      <div class="wp-grid">
        ${category.providers.map(watchOnCard).join('')}
      </div>
    </section>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadWatchOnPage() {
  console.log('📺 Loading Watch On page...');

  if (window.showView) showView('watchon');
  if (window.updateNavLinks) updateNavLinks('watchon');

  const container = document.getElementById('watchOnContent');
  if (!container) return;

  container.innerHTML = `<div class="wp-loading">Loading providers…</div>`;

  let data;
  try {
    const res = await fetch('/watch-providers.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error('Failed to load watch-providers.json:', err);
    container.innerHTML = `
      <div class="wp-error">
        Couldn't load the provider list. Check that <code>public/watch-providers.json</code> is valid JSON.
      </div>`;
    return;
  }

  const categories = Array.isArray(data.categories) ? data.categories : [];
  if (!categories.length) {
    container.innerHTML = `<div class="wp-empty">No providers configured yet.</div>`;
    return;
  }

  container.innerHTML = `
    <p class="wp-intro">
      Official, licensed places to watch — sport broadcasters, streaming services, and your own library if you run one.
      To add or edit an entry, open <code>public/watch-providers.json</code>.
    </p>
    ${categories.map(watchOnSection).join('')}
  `;
}

window.loadWatchOnPage = loadWatchOnPage;
