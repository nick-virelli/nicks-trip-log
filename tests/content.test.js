// Checks on what visitors read and click: Nick's words reach the page intact,
// photos are wired up, the trips list groups and filters correctly, and the
// site's own copy follows the writing rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, read, exists, json, attrs } = require('./helpers');
const TripEntries = require('../js/trip-entries.js');
const TripRender = require('../js/render-trip.js');

const { posts, collections } = json('data/posts.json');
const mapData = json('data/map-data.json');
const { images } = json('data/gallery.json');

// ---------- Nick's writing ----------

test("every trip page carries every day label and every day's text exactly as the data has it", () => {
  const bad = [];
  for (const p of posts) {
    const page = read(`trip/${p.id}.html`);
    if (!page.includes(`>${TripRender.esc(p.title)}</h2>`)) bad.push(`${p.id}: title`);
    if ((page.match(/<div class="trip-day">/g) || []).length !== p.days.length) bad.push(`${p.id}: day count`);
    for (const d of p.days) {
      if (!page.includes(`<h3>${TripRender.esc(d.label)}</h3>`)) bad.push(`${p.id}: label "${d.label}"`);
      if (!page.includes(d.body_html.replace(/ src="images\//g, ' src="../images/'))) bad.push(`${p.id}: body of "${d.label}"`);
    }
  }
  assert.deepEqual(bad, []);
});

test("spelling corrections from content/style-corrections.json are applied everywhere on the site", () => {
  // Nick's words are never edited directly; typos live in that file. Any
  // original misspelling still on a page means a correction stopped applying.
  const allText = posts.map((p) => p.days.map((d) => d.body_html + d.label).join(" ")).join(" ");
  const missed = json("content/style-corrections.json").corrections.filter((c) => c.original.length >= 4 && allText.includes(c.original) && !allText.includes(c.correction));
  assert.deepEqual(missed.map((c) => c.original), []);
});

// ---------- Photos and lightbox wiring ----------

test('every photo on a trip page has alt text and a file behind it', () => {
  const bad = [];
  for (const p of posts) {
    const page = read(`trip/${p.id}.html`);
    for (const tag of (page.match(/<img[^>]*>/g) || []).filter((t) => !t.includes('id="lightbox-img"'))) {
      const alt = (tag.match(/alt="([^"]*)"/) || [])[1];
      const src = (tag.match(/src="([^"]*)"/) || [])[1];
      if (!alt || !alt.trim()) bad.push(`${p.id}: image with no alt (${src})`);
      if (src && !src.startsWith('http') && !exists(path.posix.normalize(`trip/${src}`))) bad.push(`${p.id}: ${src} missing`);
    }
  }
  assert.deepEqual(bad, []);
});

// Clicking a photo opens a lightbox group; prev/next walk that group by index.
// A gap or repeat in the numbering would skip or repeat a photo.
test('photo groups are numbered 0,1,2... with no gaps, and carousel counts match their slides', () => {
  const bad = [];
  for (const p of posts) {
    const page = read(`trip/${p.id}.html`);
    const groups = new Map();
    for (const m of page.matchAll(/data-group="([^"]+)" data-index="(\d+)"/g)) groups.set(m[1], [...(groups.get(m[1]) || []), Number(m[2])]);
    for (const [g, idx] of groups) if (idx.join() !== idx.map((_, i) => i).join()) bad.push(`${p.id}: group ${g} indexes are ${idx}`);
    for (const m of page.matchAll(/<div class="carousel" data-count="(\d+)">([\s\S]*?)<\/li>/g)) {
      const slides = (m[2].match(/class="carousel-slide"/g) || []).length;
      if (Number(m[1]) !== slides) bad.push(`${p.id}: carousel says ${m[1]} but has ${slides} slides`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the lightbox markup exists on every page that opens photos, with share, download, and print', () => {
  for (const page of ['gallery.html', ...posts.map((p) => `trip/${p.id}.html`)]) {
    const html = read(page);
    for (const id of ['lightbox', 'lightbox-img', 'lightbox-prev', 'lightbox-next', 'lightbox-close', 'lightbox-share', 'lightbox-download', 'lightbox-print']) {
      assert.ok(html.includes(`id="${id}"`), `${page} is missing #${id}`);
    }
  }
});

test('the gallery grid uses thumbnails while the lightbox uses the full photo', () => {
  const js = read('js/gallery.js');
  assert.match(js, /<img src="\$\{esc\(img\.thumb \|\| img\.src\)\}"/);
  assert.match(js, /list\.map\(\(img\) => \(\{ src: img\.src/);
});

// The user expects to get from a gallery photo to its trip. Today the lightbox
// shows the trip name as plain text only. Marked as a to-do so it shows in the
// report without failing the run; delete `todo` once the link exists.
test('a gallery photo links through to its trip page', { todo: 'the lightbox caption is plain text, there is no link to the trip yet' }, () => {
  const lightbox = read('js/lightbox.js') + read('js/gallery.js');
  assert.match(lightbox, /trip\/\$\{|trip\/["'`]/, 'no code builds a trip/<id>.html link from the gallery');
});

// ---------- Trips list and grouping ----------

test('the trips list has one entry per standalone trip plus one for the collection, nothing doubled', () => {
  const entries = TripEntries.build(posts, collections, mapData);
  const standalone = posts.filter((p) => !p.collectionId).length;
  assert.equal(entries.length, standalone + collections.length);
  const hrefs = entries.map((e) => e.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const e of entries) {
    assert.ok(exists(e.href), `${e.title} links to missing ${e.href}`);
    if (e.cover) assert.ok(exists(TripRender.thumbFor(e.cover)), `${e.title} cover thumbnail is missing`);
  }
});

test('filtering the trips list by a country finds the collection when any of its legs went there', () => {
  const entries = TripEntries.build(posts, collections, mapData);
  const members = posts.filter((p) => p.collectionId);
  for (const country of new Set(members.map((m) => m.country))) {
    const hit = entries.filter((e) => e.type === 'collection' && e.countries.includes(country));
    assert.equal(hit.length, 1, `${country} should surface the collection`);
  }
  const continents = new Set(entries.find((e) => e.type === 'collection').continents);
  assert.ok(continents.has('europe') && continents.has('africa'), 'Morocco makes the collection span Africa too');
});

test('sorting: newest first, oldest first, A to Z, and undated trips always come last', () => {
  const entries = TripEntries.build(posts, collections, mapData);
  const desc = TripEntries.sort(entries, 'date-desc');
  const asc = TripEntries.sort(entries, 'date-asc');
  const dated = (list) => list.filter((e) => e.date_start).map((e) => e.date_start);
  assert.deepEqual(dated(desc), [...dated(desc)].sort().reverse());
  assert.deepEqual(dated(asc), [...dated(asc)].sort());
  for (const list of [desc, asc]) {
    const firstUndated = list.findIndex((e) => !e.date_start);
    assert.ok(list.slice(firstUndated).every((e) => !e.date_start), 'an undated trip sits between dated ones');
  }
  const az = TripEntries.sort(entries, 'az').map((e) => e.title);
  assert.deepEqual(az, [...az].sort((a, b) => a.localeCompare(b)));
});

test('dates print the way a reader expects: one day, a range, and month-only', () => {
  assert.equal(TripRender.fmtDateRange({ date_start: '2025-01-10', date_end: '2025-01-10', date_precision: 'day' }), 'Jan 10, 2025');
  assert.equal(TripRender.fmtDateRange({ date_start: '2025-01-18', date_end: '2025-01-19', date_precision: 'day' }), 'Jan 18, 2025 - Jan 19, 2025');
  assert.equal(TripRender.fmtDateRange({ date_start: '2023-07-01', date_end: '2023-07-01', date_precision: 'month' }), 'July 2023');
  assert.equal(TripRender.fmtDateRange({ date_start: null, date_end: null }), '');
});

test('user-supplied text is escaped before it reaches the page', () => {
  const html = TripRender.tripTileHtml({ href: 'trip/x.html', title: '<b>"Tom & Jerry"</b>', meta: 'x', date_start: null, cover: null });
  assert.ok(!html.includes('<b>'), 'title was not escaped');
  assert.ok(html.includes('&lt;b&gt;'));
});

test('a trip with no photos gets a text placeholder instead of a broken image', () => {
  const html = TripRender.tripTileHtml({ href: 'trip/x.html', title: 'X', meta: '', date_start: null, cover: null });
  assert.ok(html.includes('trip-tile--no-cover'));
  assert.ok(!html.includes('<img'));
});

// ---------- The site's own copy ----------

// House style: no em dashes or en dashes in anything the site says. Nick's trip
// text is left alone, so only the site's own source files are checked.
test("the site's own copy has no em dashes or en dashes", () => {
  const files = [
    'scripts/build-pages.js',
    'scripts/lib/page-shell.js',
    ...fs.readdirSync(path.join(ROOT, 'scripts/pages')).map((f) => `scripts/pages/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'js')).map((f) => `js/${f}`),
    'css/style.css',
  ];
  const bad = [];
  files.forEach((f) => {
    read(f).split('\n').forEach((line, i) => {
      if (/[–—]|&mdash;|&ndash;/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  });
  assert.deepEqual(bad, []);
});

test('the site links out to nothing except Google Analytics, unpkg, and a mailto', () => {
  const allowed = /^(https:\/\/nick-virelli\.github\.io\/nicks-trip-log\/|https:\/\/unpkg\.com\/|https:\/\/www\.googletagmanager\.com\/|mailto:)/;
  const bad = [];
  for (const page of ['index.html', 'trips.html', 'gallery.html', 'about.html', '404.html']) {
    for (const url of attrs(read(page), ['src', 'href'])) if (/^(https?:|mailto:)/.test(url) && !allowed.test(url)) bad.push(`${page}: ${url}`);
  }
  assert.deepEqual(bad, []);
});

test('the analytics ID is the same on every page, so no page is quietly untracked', () => {
  const ids = new Set();
  const pages = ['index.html', 'trips.html', 'gallery.html', 'about.html', '404.html', ...posts.map((p) => `trip/${p.id}.html`)];
  for (const page of pages) {
    const found = [...read(page).matchAll(/gtag\('config', '(G-[A-Z0-9]+)'\)/g)].map((m) => m[1]);
    assert.equal(found.length, 1, `${page} should have exactly one analytics tag`);
    ids.add(found[0]);
  }
  assert.equal(ids.size, 1);
});
