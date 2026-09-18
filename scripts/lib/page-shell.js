// The page chrome (head, header, nav, lightbox, footer, scripts) that every
// generated page shares. Copied from index.html so generated pages look exactly
// like the hand-written ones. `depth` is how many folders below the site root
// the page lives (trip/x.html is 1); asset paths are prefixed accordingly.
// 404.html is served at any path by GitHub Pages, so it uses absolute asset URLs.

const SITE_URL = 'https://nick-virelli.github.io/nicks-trip-log/';
const DEFAULT_OG_IMAGE = `${SITE_URL}images/trips/mt-rainier-2026/8E69F307-B2FC-495A-A8B1-EAD2134651B3.jpg`;
const GA_ID = 'G-Y1F7ZMFZVE';

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const THEME_TOGGLE = `<button type="button" class="theme-toggle" aria-label="Toggle theme">
        <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 12.5A8.5 8.5 0 1 1 11.5 4a7 7 0 0 0 8.5 8.5z"/></svg>
      </button>`;

const LIGHTBOX = `
  <div id="lightbox" class="lightbox" style="display:none;" role="dialog" aria-modal="true" aria-label="Photo viewer">
    <button type="button" class="lightbox-close" id="lightbox-close" aria-label="Close">&times;</button>
    <button type="button" class="lightbox-nav lightbox-prev" id="lightbox-prev" aria-label="Previous photo">&#8249;</button>
    <button type="button" class="lightbox-nav lightbox-next" id="lightbox-next" aria-label="Next photo">&#8250;</button>
    <div class="lightbox-body">
      <img id="lightbox-img" src="" alt="">
      <div class="lightbox-meta">
        <span id="lightbox-caption"></span>
        <div class="lightbox-actions">
          <button type="button" id="lightbox-share">Share</button>
          <a id="lightbox-download" download>Download</a>
          <button type="button" id="lightbox-print">Print</button>
        </div>
      </div>
    </div>
  </div>
`;

function navLinks(prefix, activeNav) {
  const items = [
    ['index.html', 'Home'],
    ['gallery.html', 'Gallery'],
    ['about.html', 'About'],
  ];
  return items
    .map(([href, label]) => {
      const active = activeNav === href ? ' class="active" aria-current="page"' : '';
      return `<a href="${prefix}${href}"${active}>${label}</a>`;
    })
    .join('\n      ');
}

/**
 * @param {object} o
 * @param {number} [o.depth] folders below the site root (default 0)
 * @param {boolean} [o.absoluteAssets] use SITE_URL instead of a relative prefix
 * @param {string} o.title full <title> text
 * @param {string} o.description meta description
 * @param {string} [o.canonicalPath] site-relative path, e.g. "trip/london-2025.html"
 * @param {string} [o.ogImage] absolute URL; defaults to the site's default image
 * @param {string} [o.ogType] "website" or "article"
 * @param {string} [o.activeNav] which nav item to mark active ("index.html" etc.)
 * @param {string} [o.bodyAttrs] extra attributes for <body>
 * @param {string} o.main inner HTML of <main>
 * @param {boolean} [o.lightbox] include the lightbox markup
 * @param {boolean} [o.activeTripIndicator] include the header trip indicator
 * @param {string[]} [o.scripts] site-relative script paths after js/theme.js
 */
function renderPage(o) {
  const depth = o.depth || 0;
  const prefix = o.absoluteAssets ? SITE_URL : '../'.repeat(depth);
  const canonical = o.canonicalPath ? `${SITE_URL}${o.canonicalPath}` : null;
  const ogImage = o.ogImage || DEFAULT_OG_IMAGE;
  const scripts = ['js/theme.js', ...(o.scripts || [])]
    .map((s) => `  <script src="${prefix}${s}"></script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escAttr(o.title)}</title>
  <meta name="description" content="${escAttr(o.description)}">
  <meta property="og:title" content="${escAttr(o.title)}">
  <meta property="og:description" content="${escAttr(o.description)}">
  <meta property="og:type" content="${o.ogType || 'website'}">
${canonical ? `  <meta property="og:url" content="${escAttr(canonical)}">\n  <link rel="canonical" href="${escAttr(canonical)}">\n` : ''}  <meta property="og:image" content="${escAttr(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/svg+xml" href="${prefix}images/favicon.svg">
  <link rel="stylesheet" href="${prefix}css/style.css">
</head>
<body${o.bodyAttrs ? ' ' + o.bodyAttrs : ''}>
  <header class="site-header">
    <h1 class="site-title"><a href="${prefix}index.html">Nick's Trip Log</a></h1>
    <nav class="site-nav">
      ${navLinks(prefix, o.activeNav)}
      ${THEME_TOGGLE}
    </nav>${
      o.activeTripIndicator
        ? `
    <button type="button" class="active-trip-indicator" id="active-trip-indicator">
      <span class="title" id="active-trip-title"></span>
      <span class="meta" id="active-trip-meta"></span>
    </button>`
        : ''
    }
  </header>

  <main>
${o.main}
  </main>
${o.lightbox ? LIGHTBOX : ''}
  <footer class="site-footer">
    <nav>
      ${navLinks(prefix, o.activeNav)}
    </nav>
    <p>Contact: <a href="${prefix}about.html">Get in touch</a></p>
  </footer>

  <button type="button" id="back-to-top" class="back-to-top" aria-label="Back to top">&uarr; Back to top</button>

${scripts}
</body>
</html>
`;
}

module.exports = { renderPage, SITE_URL, DEFAULT_OG_IMAGE, escAttr };
