// Checks that the data agrees with itself and with the files on disk, in the
// ways a person browsing the site would only hit by accident.
const test = require('node:test');
const assert = require('node:assert/strict');
const { exists, json, read, ALL_PAGES } = require('./helpers');

const { posts, collections } = json('data/posts.json');
const mapData = json('data/map-data.json');
const { images } = json('data/gallery.json');
const world = json('data/world.json');
const postById = new Map(posts.map((p) => [p.id, p]));

const cities = [];
for (const [countryKey, country] of Object.entries(mapData.countries)) {
  for (const [regionKey, region] of Object.entries(country.regions)) {
    for (const city of region.cities) cities.push({ ...city, countryKey, regionKey, country });
  }
}

const inBox = (lat, lon, [[s, w], [n, e]]) => lat >= s && lat <= n && lon >= w && lon <= e;

// The map zooms to a country's bounds. A pin outside them is drawn off screen,
// so the trip looks like it is missing.
test('every map pin sits inside its country bounds, so it is visible when you zoom in', () => {
  const outside = cities.filter((c) => !inBox(c.lat, c.lon, c.country.bounds)).map((c) => `${c.name} (${c.countryKey})`);
  assert.deepEqual(outside, []);
});

test('every country sits inside its continent bounds', () => {
  const bad = [];
  for (const [key, c] of Object.entries(mapData.countries)) {
    const box = mapData.continents[c.continent].bounds;
    const [[s, w], [n, e]] = c.bounds;
    if (!inBox(s, w, box) || !inBox(n, e, box)) bad.push(`${key} not inside ${c.continent}`);
  }
  assert.deepEqual(bad, []);
});

// Continent is typed by hand in the build; the world file carries Natural
// Earth's own answer. If they disagree, hovering would highlight the wrong place.
test('each country continent in map-data matches the continent on its world-map shape', () => {
  const shapes = new Map(world.objects.countries.geometries.map((g) => [g.id, g]));
  const bad = [];
  for (const [key, c] of Object.entries(mapData.countries)) {
    const shape = shapes.get(c.isoNumeric);
    if (!shape) bad.push(`${key}: no shape for ${c.isoNumeric}`);
    else if (shape.properties.continent !== c.continent) bad.push(`${key}: map-data says ${c.continent}, world shape says ${shape.properties.continent}`);
  }
  assert.deepEqual(bad, []);
});

test('country codes are unique, so two countries never share one shape', () => {
  const codes = Object.values(mapData.countries).map((c) => c.isoNumeric);
  assert.equal(new Set(codes).size, codes.length);
});

test('every trip is reachable: each has a page, a map pin, and at most one home in the collection', () => {
  const pinned = new Set(cities.flatMap((c) => c.tripIds));
  for (const p of posts) {
    assert.ok(exists(`trip/${p.id}.html`), `${p.id} has no page`);
    assert.ok(pinned.has(p.id), `${p.id} has no map pin`);
  }
  const listed = collections.flatMap((c) => c.tripIds);
  assert.equal(new Set(listed).size, listed.length, 'a trip is listed in two collections');
  for (const id of listed) assert.ok(postById.has(id));
});

// Clicking a city opens a trip page (or a chooser of them), so every trip a
// pin lists must exist and must actually be about that pin.
test('every trip a map pin points to exists, and a shared pin lists each trip once', () => {
  for (const c of cities) {
    assert.equal(new Set(c.tripIds).size, c.tripIds.length, `${c.name} lists a trip twice`);
    for (const id of c.tripIds) assert.ok(exists(`trip/${id}.html`), `${c.name} -> missing trip/${id}.html`);
  }
});

test('every gallery photo belongs to a real trip, and its photo and thumbnail files exist', () => {
  const bad = [];
  for (const img of images) {
    if (!postById.has(img.tripId)) bad.push(`${img.src}: unknown trip ${img.tripId}`);
    if (!exists(img.src)) bad.push(`missing ${img.src}`);
    if (!exists(img.thumb)) bad.push(`missing ${img.thumb}`);
    if (img.thumb !== img.src.replace('images/trips/', 'images/thumbs/')) bad.push(`${img.src}: thumb path is not the expected one`);
  }
  assert.deepEqual(bad, []);
});

// The gallery place filter matches a photo's locations against the city the
// visitor clicked. A location no pin has could never be filtered to.
test('every place name on a gallery photo is a pinned city for that same trip', () => {
  const byTrip = new Map();
  for (const c of cities) for (const id of c.tripIds) byTrip.set(id, [...(byTrip.get(id) || []), c.name]);
  const bad = new Set();
  for (const img of images) {
    for (const loc of img.locations) if (!(byTrip.get(img.tripId) || []).includes(loc)) bad.add(`${img.tripId}: "${loc}"`);
  }
  assert.deepEqual([...bad], []);
});

test('gallery photos are the same photos the trip page shows (only a note with no photos may differ)', () => {
  const bad = [];
  for (const p of posts) {
    const page = read(`trip/${p.id}.html`);
    const mine = images.filter((i) => i.tripId === p.id);
    const pageHasPhotos = /class="lightbox-trigger"/.test(page);
    if (!pageHasPhotos) continue; // gallery-only photos, like Puerto Rico, are allowed
    for (const img of mine) if (!page.includes(`../${img.src}`)) bad.push(`${p.id}: gallery photo ${img.src} is not on its trip page`);
  }
  assert.deepEqual(bad, []);
});

test('covers are real: null only when a trip has no photos, otherwise one of its own', () => {
  for (const p of posts) {
    const mine = images.filter((i) => i.tripId === p.id).map((i) => i.src);
    if (mine.length === 0) assert.equal(p.cover, null, `${p.id} has no photos but a cover`);
    else assert.ok(mine.includes(p.cover), `${p.id} cover is not one of its photos`);
  }
});

test('dates make sense: ordered, no future trips logged as done, precision honest', () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const p of posts) {
    if (!p.date_start) continue;
    assert.ok(p.date_start <= p.date_end, `${p.id}: starts after it ends`);
    assert.ok(p.date_start <= today, `${p.id}: dated in the future (${p.date_start})`);
    if (p.date_precision === 'month') assert.equal(p.date_source, 'manual', `${p.id}: month precision should only remain when no photo dates exist`);
  }
  for (const c of collections) {
    const members = c.tripIds.map((id) => postById.get(id));
    assert.equal(c.date_start, members.map((m) => m.date_start).sort()[0]);
    assert.equal(c.date_end, members.map((m) => m.date_end).sort().pop());
  }
});

test('mileage totals add up: a trip total equals the sum of its days', () => {
  for (const p of posts) {
    const sum = Math.round(p.days.reduce((s, d) => s + (d.miles || 0), 0) * 100) / 100;
    assert.equal(p.total_miles, sum, `${p.id}: total_miles ${p.total_miles} but days add to ${sum}`);
  }
});

test('the search index has every trip, its cities, and text for every day', () => {
  const { entries } = json('data/search-index.json');
  assert.equal(entries.length, posts.length);
  for (const e of entries) {
    const p = postById.get(e.id);
    assert.equal(e.days.length, p.days.length);
    assert.ok(e.days.every((d) => d.text.length > 0 || /^\s*$/.test(p.days[e.days.indexOf(d)].body_html.replace(/<[^>]+>/g, ''))), `${e.id} has an empty day that has text on the page`);
    const pinNames = cities.filter((c) => c.tripIds.includes(e.id)).map((c) => c.name).sort();
    assert.deepEqual([...e.cities].sort(), pinNames);
  }
});

test('the ALL_PAGES list found every page (26 trips, 1 collection, 4 site pages, 404)', () => {
  assert.equal(ALL_PAGES.length, posts.length + collections.length + 4 + 1);
});
