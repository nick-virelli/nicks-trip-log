// Checks on the generated HTML that nobody would notice by clicking around:
// dead links, wrong script order, pages that only break in file:// mode, and
// hand-edits to files that the build owns.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read, exists, ALL_PAGES, TOP_PAGES, SITE_URL, attrs, toRepoPath } = require('./helpers');
const { renderPage } = require('../scripts/lib/page-shell');

test('every link, image, script, and social image on every page points at a real file', () => {
  const missing = [];
  for (const page of ALL_PAGES) {
    const html = read(page);
    const metaUrls = [...html.matchAll(/<meta property="og:(?:image|url)" content="([^"]+)"/g)].map((m) => m[1]);
    for (const url of [...attrs(html, ['src', 'href']), ...metaUrls]) {
      const target = toRepoPath(page, url);
      if (target && !exists(target)) missing.push(`${page} -> ${url}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every page has a unique title, a description, and a canonical URL that matches its own path', () => {
  const titles = new Map();
  const problems = [];
  for (const page of ALL_PAGES) {
    const html = read(page);
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    if (!title) problems.push(`${page}: no title`);
    if (titles.has(title)) problems.push(`${page}: same title as ${titles.get(title)} ("${title}")`);
    titles.set(title, page);
    if (!desc || desc.length < 10) problems.push(`${page}: missing or tiny description`);
    if (desc && desc.length > 300) problems.push(`${page}: description is ${desc.length} chars`);
    const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (page === '404.html') {
      if (canonical) problems.push('404.html should not declare a canonical URL');
    } else {
      const expected = SITE_URL + (page === 'index.html' ? '' : page);
      if (canonical !== expected) problems.push(`${page}: canonical is ${canonical}, expected ${expected}`);
    }
  }
  assert.deepEqual(problems, []);
});

test('no page prints a JavaScript accident like "undefined" or "[object Object]"', () => {
  const bad = [];
  for (const page of ALL_PAGES) {
    const text = read(page).replace(/<script[\s\S]*?<\/script>/g, '');
    for (const word of ['undefined', '[object Object]', 'NaN']) if (text.includes(word)) bad.push(`${page} contains "${word}"`);
  }
  assert.deepEqual(bad, []);
});

test('header and footer nav list the same four pages everywhere, with the right one marked current', () => {
  const problems = [];
  for (const page of ALL_PAGES) {
    const html = read(page);
    const navs = [...html.matchAll(/<nav class="site-nav">([\s\S]*?)<\/nav>|<footer class="site-footer">\s*<nav>([\s\S]*?)<\/nav>/g)].map((m) => m[1] || m[2]);
    if (navs.length !== 2) { problems.push(`${page}: found ${navs.length} navs, expected header and footer`); continue; }
    for (const nav of navs) {
      const labels = [...nav.matchAll(/<a href="[^"]*"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
      if (labels.join(',') !== 'Home,Trips,Gallery,About') problems.push(`${page}: nav is ${labels.join(',')}`);
      const current = (nav.match(/aria-current="page"/g) || []).length;
      const expected = TOP_PAGES.includes(page) ? 1 : 0;
      if (current !== expected) problems.push(`${page}: ${current} current-page markers, expected ${expected}`);
    }
  }
  assert.deepEqual(problems, []);
});

// A script that reads window.TripRender at load time must come after the script
// that defines it, and geo-map.js needs Leaflet and topojson loaded first.
test('scripts load in an order that satisfies what each one uses', () => {
  const providers = {
    TripRender: 'js/render-trip.js',
    TripEntries: 'js/trip-entries.js',
    GeoMap: 'js/geo-map.js',
    GeoShapes: 'js/geo-shapes.js',
    TripLightbox: 'js/lightbox.js',
    TripUI: 'js/trip-ui.js',
    TripSearch: 'js/search.js',
  };
  const problems = [];
  for (const page of ALL_PAGES) {
    const scripts = attrs(read(page), ['src']).filter((s) => /\.js$/.test(s));
    const order = scripts.map((s) => toRepoPath(page, s) || s);
    const at = (needle) => order.findIndex((s) => s === needle || s.includes(needle));
    scripts.forEach((s, i) => {
      const rel = toRepoPath(page, s);
      if (!rel || !exists(rel) || !rel.startsWith('js/')) return;
      const src = read(rel);
      for (const [global, provider] of Object.entries(providers)) {
        if (rel === provider || !new RegExp(`window\\.${global}\\b`).test(src)) continue;
        const p = at(provider);
        if (p === -1) problems.push(`${page}: ${rel} uses ${global} but ${provider} is not loaded`);
        else if (p > i) problems.push(`${page}: ${provider} loads after ${rel}, which uses ${global}`);
      }
      if (/\bL\.[a-zA-Z]/.test(src) && !(at('leaflet') !== -1 && at('leaflet') < i)) problems.push(`${page}: ${rel} uses Leaflet before it loads`);
      if (/\btopojson\./.test(src) && !(at('topojson') !== -1 && at('topojson') < i)) problems.push(`${page}: ${rel} uses topojson before it loads`);
    });
  }
  assert.deepEqual(problems, []);
});

// The site is also opened from disk (file://), where data comes from the
// data/*.js copies instead of fetch. A page that fetches a file must also load
// its .js twin or it only breaks in that mode.
test('every data file a page fetches also has its file:// copy loaded on that page', () => {
  const problems = [];
  for (const page of ALL_PAGES) {
    const html = read(page);
    const loaded = new Set(attrs(html, ['src']).map((s) => toRepoPath(page, s)));
    for (const s of loaded) {
      if (!s || !s.startsWith('js/') || !exists(s)) continue;
      for (const m of read(s).matchAll(/loadData\("data\/([\w-]+)\.json",\s*"(__\w+__)"\)/g)) {
        if (!loaded.has(`data/${m[1]}.js`)) problems.push(`${page}: ${s} loads data/${m[1]}.json but data/${m[1]}.js is not on the page`);
        if (!read(`data/${m[1]}.js`).startsWith(`window.${m[2]} = `)) problems.push(`data/${m[1]}.js does not define ${m[2]}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('the sitemap lists every page once, each one exists, and robots.txt points at it', () => {
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(new Set(locs).size, locs.length, 'duplicate URLs in the sitemap');
  const listed = new Set(locs.map((u) => (u === SITE_URL ? 'index.html' : u.slice(SITE_URL.length))));
  for (const page of ALL_PAGES.filter((p) => p !== '404.html')) assert.ok(listed.has(page), `${page} is not in the sitemap`);
  for (const l of listed) assert.ok(exists(l), `sitemap lists ${l} but it does not exist`);
  assert.ok(!listed.has('404.html'), '404 page should not be in the sitemap');
  assert.match(read('robots.txt'), new RegExp(`Sitemap: ${SITE_URL}sitemap.xml`));
  assert.ok(exists('.nojekyll'));
});

// index/trips/gallery/about are build outputs. If someone edits the .html by
// hand, the next build silently throws that edit away.
test('the five site pages match what the build would generate right now', () => {
  for (const name of ['index', 'trips', 'search', 'gallery', 'about']) {
    const def = require(`../scripts/pages/${name}`);
    const onDisk = read(def.file).replace(/\r\n/g, '\n');
    assert.equal(onDisk, renderPage(def), `${def.file} differs from scripts/pages/${name}.js. Edit that file and run npm run build.`);
  }
});

test('the 404 page works from any depth: its assets are absolute URLs', () => {
  const html = read('404.html');
  for (const url of attrs(html, ['src', 'href'])) {
    assert.ok(/^(https?:|mailto:|#)/.test(url), `404.html has a relative URL: ${url}`);
  }
});
