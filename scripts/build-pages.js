// Generates every HTML page: the three site pages (from scripts/pages/), one
// page per trip under trip/, one page per collection under collections/,
// 404.html, and sitemap.xml. Edit page content in scripts/pages/*.js and the
// shared chrome in scripts/lib/page-shell.js, never the .html files.
// Runs after build-trips.js (npm run build chains them). Trip bodies come from
// js/render-trip.js, the same code the home page uses, so the two match.
//
// Output lives in trip/ (singular) because Trips/ is the gitignored source folder
// and this checkout is case-insensitive.
const fs = require('fs');
const path = require('path');
const { renderPage, SITE_URL, DEFAULT_OG_IMAGE, escAttr } = require('./lib/page-shell');
const { esc, fmtDate, fmtDateRange, renderTripHtml } = require('../js/render-trip');

const ROOT = path.join(__dirname, '..');
const TRIP_DIR = path.join(ROOT, 'trip');
const SITE_PAGES = ['index', 'gallery', 'about'].map((name) => require(`./pages/${name}`));
const COLLECTION_DIR = path.join(ROOT, 'collections');
const SITE_TITLE = "Nick's Trip Log";

function write(relPath, html) {
  const abs = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html);
}

// Removes generated pages whose trip or collection no longer exists.
function prune(dir, keep) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.html') && !keep.has(f)) {
      fs.unlinkSync(path.join(dir, f));
      console.log(`  pruned ${path.basename(dir)}/${f}`);
    }
  }
}

function dateText(p) {
  if (!p.date_start) return '';
  if (p.date_precision === 'month' || p.date_end === p.date_start) return fmtDate(p.date_start, p.date_precision);
  return `${fmtDate(p.date_start)} to ${fmtDate(p.date_end)}`;
}

function tripDescription(p, photoCount) {
  const parts = [p.location];
  const dates = dateText(p);
  if (dates) parts.push(dates);
  const counts = [`${p.days.length} day${p.days.length === 1 ? '' : 's'}`];
  if (photoCount) counts.push(`${photoCount} photo${photoCount === 1 ? '' : 's'}`);
  return `${parts.join(', ')}. ${counts.join(', ')}.`;
}

function tripPage(p, collection, photoCount) {
  const breadcrumb = collection
    ? `    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="../index.html">Home</a> / <a href="../collections/${esc(collection.id)}.html">${esc(collection.title)}</a></nav>\n`
    : '';
  const main = `    <div class="page-content">
${breadcrumb}    <article class="post-display" id="post-display">${renderTripHtml(p, { assetPrefix: '../' })}</article>
    </div>`;
  return renderPage({
    depth: 1,
    title: `${p.title} - ${SITE_TITLE}`,
    description: tripDescription(p, photoCount),
    canonicalPath: `trip/${p.id}.html`,
    ogImage: p.cover ? `${SITE_URL}${p.cover}` : DEFAULT_OG_IMAGE,
    ogType: 'article',
    bodyAttrs: 'data-page="trip"',
    main,
    lightbox: true,
    activeTripIndicator: true,
    scripts: ['js/lightbox.js', 'js/trip-ui.js'],
  });
}

function collectionPage(c, posts) {
  const members = c.tripIds.map((id) => posts.find((p) => p.id === id)).filter(Boolean);
  const items = members
    .map(
      (p) => `      <div class="special-item">
        <a href="../trip/${esc(p.id)}.html">${esc(p.title)}</a>
        <div class="meta">${esc(p.location)}${fmtDateRange(p) ? ' &middot; ' + fmtDateRange(p) : ''}</div>
      </div>`
    )
    .join('\n');
  const range = `${fmtDate(c.date_start)} to ${fmtDate(c.date_end)}`;
  const main = `    <div class="page-content">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="../index.html">Home</a></nav>
      <h1>${esc(c.title)}</h1>
      <p class="post-meta">${members.length} trips, ${range}</p>
      <div class="special-list">
${items}
      </div>
    </div>`;
  return renderPage({
    depth: 1,
    title: `${c.title} - ${SITE_TITLE}`,
    description: `${members.length} trips from ${range}, in order.`,
    canonicalPath: `collections/${c.id}.html`,
    main,
  });
}

function notFoundPage() {
  const main = `    <div class="page-content">
      <h1>Page not found</h1>
      <p>There is nothing at this address. It may have moved when the site changed.</p>
      <p><a href="${SITE_URL}index.html">Go to the home page</a> or <a href="${SITE_URL}gallery.html">browse the gallery</a>.</p>
    </div>`;
  return renderPage({
    absoluteAssets: true,
    title: `Page not found - ${SITE_TITLE}`,
    description: 'There is nothing at this address.',
    main,
  });
}

function sitemap(urls) {
  const body = urls.map((u) => `  <url>\n    <loc>${escAttr(SITE_URL + u)}</loc>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function main() {
  const { posts, collections } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'posts.json'), 'utf8'));
  const { images } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'gallery.json'), 'utf8'));
  const photoCounts = {};
  for (const img of images) photoCounts[img.tripId] = (photoCounts[img.tripId] || 0) + 1;

  for (const page of SITE_PAGES) write(page.file, renderPage(page));

  const tripFiles = new Set();
  for (const p of posts) {
    const collection = collections.find((c) => c.id === p.collectionId) || null;
    const html = tripPage(p, collection, photoCounts[p.id] || 0);
    if (/ src="images\//.test(html)) throw new Error(`${p.id}: un-prefixed image path in generated page`);
    write(`trip/${p.id}.html`, html);
    tripFiles.add(`${p.id}.html`);
  }
  prune(TRIP_DIR, tripFiles);

  const collectionFiles = new Set();
  for (const c of collections) {
    write(`collections/${c.id}.html`, collectionPage(c, posts));
    collectionFiles.add(`${c.id}.html`);
  }
  prune(COLLECTION_DIR, collectionFiles);

  write('404.html', notFoundPage());

  const urls = ['', 'gallery.html', 'about.html', ...collections.map((c) => `collections/${c.id}.html`), ...posts.map((p) => `trip/${p.id}.html`)];
  write('sitemap.xml', sitemap(urls));

  console.log(`Wrote ${SITE_PAGES.length} site pages, ${posts.length} trip pages, ${collections.length} collection pages, 404.html, sitemap.xml (${urls.length} URLs).`);
}

main();
