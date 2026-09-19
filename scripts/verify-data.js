// Read-only consistency checks for data/*. Exits 1 on the first group of failures.
// Run after `npm run build` (and after `npm run thumbs` once thumbnails exist).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const failures = [];
const fail = (msg) => failures.push(msg);

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

// Every data/<name>.json has a data/<name>.js twin used in file:// mode. The twin
// must be exactly `window.__VAR__ = <json text>;\n`.
const MIRRORS = [
  ['posts', '__POSTS__'],
  ['map-data', '__MAP_DATA__'],
  ['gallery', '__GALLERY__'],
  ['search-index', '__SEARCH_INDEX__'],
  ['world', '__WORLD__'],
];
for (const [name, globalVar] of MIRRORS) {
  const jsonPath = path.join(DATA, `${name}.json`);
  const jsPath = path.join(DATA, `${name}.js`);
  if (!fs.existsSync(jsonPath)) {
    if (name !== 'search-index') fail(`missing ${name}.json`);
    continue;
  }
  if (!fs.existsSync(jsPath)) { fail(`missing mirror ${name}.js`); continue; }
  const expected = `window.${globalVar} = ${fs.readFileSync(jsonPath, 'utf8')};\n`;
  if (fs.readFileSync(jsPath, 'utf8') !== expected) fail(`${name}.js does not mirror ${name}.json byte for byte`);
}

const { posts, collections } = readJson('posts.json');
const mapData = readJson('map-data.json');
const { images } = readJson('gallery.json');

const postIds = new Set(posts.map((p) => p.id));
if (postIds.size !== posts.length) fail('duplicate post ids');

// Map data is canonical: every pinned tripId must be a post, every post must be pinned.
let pinCount = 0;
const pinnedTrips = new Set();
for (const [ckey, country] of Object.entries(mapData.countries)) {
  if (!country.label || !country.bounds) fail(`country ${ckey} missing label or bounds`);
  if ('continent' in country && !(mapData.continents && mapData.continents[country.continent])) {
    fail(`country ${ckey} has continent "${country.continent}" not present in continents block`);
  }
  for (const [rkey, region] of Object.entries(country.regions)) {
    if (!region.label) fail(`region ${ckey}/${rkey} missing label`);
    for (const city of region.cities) {
      pinCount++;
      if (typeof city.lat !== 'number' || typeof city.lon !== 'number') fail(`pin ${city.name} missing coordinates`);
      for (const id of city.tripIds) {
        if (!postIds.has(id)) fail(`pin ${city.name} references unknown trip ${id}`);
        pinnedTrips.add(id);
      }
    }
  }
}
for (const id of postIds) if (!pinnedTrips.has(id)) fail(`post ${id} has no map pin`);

// Dates: null or YYYY-MM-DD, start <= end, precision is day or month.
for (const p of posts) {
  for (const k of ['date_start', 'date_end']) {
    if (p[k] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(p[k])) fail(`${p.id}.${k} is not YYYY-MM-DD: ${p[k]}`);
  }
  if ((p.date_start === null) !== (p.date_end === null)) fail(`${p.id} has one null date`);
  if (p.date_start && p.date_start > p.date_end) fail(`${p.id} date_start after date_end`);
  if (!['day', 'month'].includes(p.date_precision)) fail(`${p.id} bad date_precision ${p.date_precision}`);
}

// Collections (present from Phase 1b on).
if (collections) {
  if (!posts.every((p) => 'collectionId' in p)) fail('some posts lack a collectionId key');
  for (const c of collections) {
    if (!c.tripIds.length) fail(`collection ${c.id} has no members`);
    for (const id of c.tripIds) {
      const p = posts.find((x) => x.id === id);
      if (!p) fail(`collection ${c.id} references unknown trip ${id}`);
      else if (p.collectionId !== c.id) fail(`${id} is in collection ${c.id} but has collectionId ${p.collectionId}`);
    }
    const strays = posts.filter((p) => p.collectionId === c.id && !c.tripIds.includes(p.id));
    for (const s of strays) fail(`${s.id} claims collection ${c.id} but is not listed in it`);
  }
} else if (posts.some((p) => 'collectionId' in p)) {
  fail('posts carry collectionId but posts.json has no collections block');
}

// Gallery: every src (and thumb, once present) exists on disk; every image belongs to a post.
const seenSrc = new Set();
for (const img of images) {
  if (!postIds.has(img.tripId)) fail(`gallery image ${img.src} references unknown trip ${img.tripId}`);
  if (seenSrc.has(img.src)) fail(`duplicate gallery src ${img.src}`);
  seenSrc.add(img.src);
  if (!fs.existsSync(path.join(ROOT, img.src))) fail(`gallery src missing on disk: ${img.src}`);
  if ('thumb' in img && !fs.existsSync(path.join(ROOT, img.thumb))) fail(`thumb missing on disk: ${img.thumb}`);
}

// Covers (present from Phase 1d on).
if (posts.some((p) => 'cover' in p)) {
  for (const p of posts) {
    if (!('cover' in p) || !('coverOverride' in p)) { fail(`${p.id} lacks cover/coverOverride`); continue; }
    const mine = images.filter((i) => i.tripId === p.id).map((i) => i.src);
    if (p.cover === null) {
      if (mine.length) fail(`${p.id} has ${mine.length} photos but cover is null`);
    } else if (!mine.includes(p.cover)) fail(`${p.id} cover ${p.cover} is not one of its gallery images`);
    if (p.coverOverride && p.cover !== p.coverOverride) fail(`${p.id} coverOverride not honored`);
  }
}

// Search index (present from Phase 1f on).
if (fs.existsSync(path.join(DATA, 'search-index.json'))) {
  const { entries } = readJson('search-index.json');
  const ids = entries.map((e) => e.id);
  if (ids.length !== posts.length || !ids.every((id, i) => id === posts[i].id)) fail('search index ids do not match posts in order');
  for (const e of entries) {
    const p = posts.find((x) => x.id === e.id);
    if (p && e.days.length !== p.days.length) fail(`search entry ${e.id} has ${e.days.length} days, post has ${p.days.length}`);
    if (!Array.isArray(e.cities) || !e.cities.length) fail(`search entry ${e.id} has no cities`);
  }
}

// Generated pages (present from Phase 2 on): one per trip and collection, every
// relative link and asset resolving on disk, breadcrumbs only on collection members.
if (fs.existsSync(path.join(ROOT, 'trip'))) {
  const pageFor = (rel) => fs.existsSync(path.join(ROOT, rel));
  const resolves = (fromRel, href) => fs.existsSync(path.resolve(path.dirname(path.join(ROOT, fromRel)), href.split('#')[0]));
  let breadcrumbs = 0;
  for (const p of posts) {
    const rel = `trip/${p.id}.html`;
    if (!pageFor(rel)) { fail(`missing page ${rel}`); continue; }
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if ((html.match(/data-trip-id=/g) || []).length !== 1) fail(`${rel} should contain exactly one trip heading`);
    if (html.includes('class="breadcrumb"')) breadcrumbs++;
    if (Boolean(p.collectionId) !== html.includes('class="breadcrumb"')) fail(`${rel} breadcrumb does not match collectionId`);
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = m[1];
      if (/^(https?:|mailto:|#|data:)/.test(url) || url === '') continue;
      if (!resolves(rel, url)) fail(`${rel} links to missing file ${url}`);
    }
  }
  if (breadcrumbs !== posts.filter((p) => p.collectionId).length) fail(`expected ${posts.filter((p) => p.collectionId).length} breadcrumbs, found ${breadcrumbs}`);
  for (const c of collections || []) {
    const rel = `collections/${c.id}.html`;
    if (!pageFor(rel)) { fail(`missing page ${rel}`); continue; }
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const id of c.tripIds) if (!html.includes(`../trip/${id}.html`)) fail(`${rel} does not link to ${id}`);
  }
  for (const f of ['404.html', '.nojekyll', 'sitemap.xml', 'trips.html']) if (!pageFor(f)) fail(`missing ${f}`);
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const locs = (sitemap.match(/<loc>/g) || []).length;
  const SITE_PAGE_COUNT = 4; // index, trips, gallery, about
  const expected = SITE_PAGE_COUNT + posts.length + (collections || []).length;
  if (locs !== expected) fail(`sitemap has ${locs} URLs, expected ${expected}`);
  for (const p of posts) if (!sitemap.includes(`/trip/${p.id}.html<`)) fail(`sitemap missing trip/${p.id}.html`);
}

// World geometry (present from Phase 4 on): every visited country's isoNumeric
// must resolve to an actual polygon, so the map never has a country with no shape.
if (fs.existsSync(path.join(DATA, 'world.json'))) {
  const world = readJson('world.json');
  const ids = new Set(world.objects.countries.geometries.map((g) => g.id));
  for (const [key, c] of Object.entries(mapData.countries)) {
    if (!c.isoNumeric) fail(`country ${key} has no isoNumeric to join against world.json`);
    else if (!ids.has(c.isoNumeric)) fail(`country ${key} isoNumeric ${c.isoNumeric} has no polygon in world.json`);
  }
}

const countries = Object.keys(mapData.countries).length;
const continents = mapData.continents ? Object.keys(mapData.continents).length : 0;
console.log(`posts=${posts.length} collections=${collections ? collections.length : 0} countries=${countries} continents=${continents} pins=${pinCount} images=${images.length}`);

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('verify-data: ok');
