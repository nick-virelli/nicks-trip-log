// Trips that visit several countries or cities are filed under all of them, and
// photos are placed in the right city.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read, json } = require('./helpers');
const TripEntries = require('../js/trip-entries.js');
const places = require('../scripts/lib/photo-places');

const { posts, collections } = json('data/posts.json');
const mapData = json('data/map-data.json');
const { images } = json('data/gallery.json');

const pinsByTrip = new Map();
for (const [countryKey, country] of Object.entries(mapData.countries)) {
  for (const region of Object.values(country.regions)) {
    for (const city of region.cities) {
      for (const id of city.tripIds) pinsByTrip.set(id, [...(pinsByTrip.get(id) || []), { ...city, countryKey }]);
    }
  }
}

test('each trip lists every country its cities are in, first country first', () => {
  for (const p of posts) {
    const fromPins = [...new Set(pinsByTrip.get(p.id).map((c) => c.countryKey))].sort();
    assert.deepEqual([...p.countries].sort(), fromPins, `${p.id}: countries do not match its map pins`);
    assert.equal(p.countries[0], p.country, `${p.id}: the primary country should come first`);
  }
});

test('the trips list can be filtered to every country on the map, and each has at least one trip', () => {
  const entries = TripEntries.build(posts, collections, mapData);
  const empty = Object.keys(mapData.countries).filter((c) => !entries.some((e) => e.countries.includes(c)));
  assert.deepEqual(empty, [], 'these countries show no trips when filtered');
});

test('filtering by the countries that used to come up empty finds the right trips', () => {
  const entries = TripEntries.build(posts, collections, mapData);
  const find = (country) => entries.filter((e) => e.countries.includes(country)).map((e) => e.title);
  // Study abroad legs collapse into one collection entry, which spans all of these.
  for (const country of ['denmark', 'slovakia', 'greece', 'hungary', 'monaco', 'germany']) {
    assert.ok(find(country).includes('Study Abroad, Spring 2025'), `${country} should find the study abroad collection`);
  }
  assert.ok(find('spain').includes('EUROPE MAY 2023'), 'Spain should find Europe May 2023');
  assert.ok(find('uk').includes('EUROPE MAY 2023'));
});

test('the gallery has photos for every country and every pinned city except ones nothing can place', () => {
  const byCountry = new Set(images.flatMap((i) => i.countries));
  assert.deepEqual(Object.keys(mapData.countries).filter((c) => !byCountry.has(c)), []);
  const withPhotos = new Set(images.map((i) => i.tripId));
  const noPhotos = [];
  for (const [id, pins] of pinsByTrip) {
    if (!withPhotos.has(id)) continue;
    for (const c of pins) if (!images.some((i) => i.tripId === id && i.locations.includes(c.name))) noPhotos.push(`${c.name} (${id})`);
  }
  // Seattle: nothing in the notes or the photos says which ones were taken there.
  assert.deepEqual(noPhotos, ['Seattle (mt-rainier-2026)']);
});

test('Bratislava, Copenhagen, Budapest, Monaco, and Neuschwanstein each have their own photos', () => {
  for (const [city, trip] of [['Bratislava', 'vienna-athens-2025'], ['Copenhagen', 'stockholm-copenhagen-2025'], ['Budapest', 'prague-budapest-2025'], ['Monaco', 'france-monaco-2025'], ['Neuschwanstein Castle', 'salzburg-munich-2025']]) {
    assert.ok(images.some((i) => i.tripId === trip && i.locations.includes(city)), `${city} has no photos`);
  }
});

test("a photo's country is the country of its own city, and its list matches its cities", () => {
  const cityCountry = new Map();
  for (const [id, pins] of pinsByTrip) for (const c of pins) cityCountry.set(`${id}|${c.name}`, c.countryKey);
  for (const img of images) {
    const expected = [...new Set(img.locations.map((l) => cityCountry.get(`${img.tripId}|${l}`)))];
    assert.deepEqual(img.countries, expected, `${img.src}: countries do not match its cities`);
    assert.equal(img.country, expected[0]);
  }
});

test('hand-made photo places name real cities and real days of the right trip', () => {
  const { _notes, ...overrides } = json('content/photo-places.json');
  for (const [tripId, o] of Object.entries(overrides)) {
    const post = posts.find((p) => p.id === tripId);
    assert.ok(post, `unknown trip ${tripId}`);
    const cities = pinsByTrip.get(tripId).map((c) => c.name);
    for (const city of [...Object.values(o.days || {}), ...Object.values(o.photos || {})]) assert.ok(cities.includes(city), `${tripId}: ${city} is not a city of this trip`);
    for (const day of Object.keys(o.days || {})) assert.ok(Number(day) >= 1 && Number(day) <= post.days.length, `${tripId}: no day ${day}`);
    for (const stem of Object.keys(o.photos || {})) assert.ok(images.some((i) => i.tripId === tripId && i.src.includes(stem)), `${tripId}: no photo named ${stem}`);
  }
});

test('photos with a hand-made place land in that city', () => {
  const day2 = images.filter((i) => i.tripId === 'vienna-athens-2025' && i.locations.includes('Bratislava'));
  assert.equal(day2.length, 5);
  assert.ok(images.filter((i) => i.tripId === 'salzburg-munich-2025' && i.locations.includes('Neuschwanstein Castle')).length === 3);
});

// ---- the placement rules themselves ----

const L = (name, lat, lon) => ({ name, lat, lon });
const vienna = L('Vienna', 48.2082, 16.3738);
const bratislava = L('Bratislava', 48.1486, 17.1077);
const athens = L('Athens', 37.9838, 23.7275);

test('GPS wins: a photo taken in Bratislava is placed there even under a Vienna heading', () => {
  const placed = places.resolveDay([{ lat: 48.145, lon: 17.11 }], [vienna], [vienna, bratislava, athens]);
  assert.deepEqual(placed[0].map((l) => l.name), ['Bratislava']);
});

test('a photo with no GPS takes the city of the nearest photo that has one', () => {
  const placed = places.resolveDay([null, { lat: 48.145, lon: 17.11 }, null], null, [vienna, bratislava, athens]);
  assert.deepEqual(placed.map((p) => p[0].name), ['Bratislava', 'Bratislava', 'Bratislava']);
});

test('a heading naming exactly one city places photos there; several cities list all of them', () => {
  assert.deepEqual(places.resolveDay([null], [athens], [vienna, athens])[0].map((l) => l.name), ['Athens']);
  assert.deepEqual(places.resolveDay([null], [vienna, bratislava], [vienna, bratislava])[0].map((l) => l.name), ['Vienna', 'Bratislava']);
});

test('with no evidence at all, a photo goes to the trip first city', () => {
  assert.deepEqual(places.resolveDay([null], null, [vienna, athens])[0].map((l) => l.name), ['Vienna']);
});

test('a photo more than 100 km from every city is not forced onto the nearest one', () => {
  assert.equal(places.nearestLocation({ lat: 60, lon: 10 }, [vienna, athens]), null);
});

test('day headings are read with or without parentheses, and a lowercase word is not a city', () => {
  const cities = [L('Cusco'), L('Ollantaytambo'), L('Machu Picchu'), L('Nice')];
  const names = (label) => (places.explicitLocations(label, cities) || []).map((l) => l.name);
  assert.deepEqual(names('Day 3 - Ollantaytambo 5/14'), ['Ollantaytambo']);
  assert.deepEqual(names('Day 7 - Machu Picchu/Cusco 5/18 (3.1 miles)'), ['Cusco', 'Machu Picchu']);
  assert.deepEqual(names('Sunday (Nice)'), ['Nice']);
  assert.deepEqual(names('Day 2 - a really nice day'), []);
  assert.deepEqual(names('Day 4 - Inca Trail 5/15 (8.7 miles)'), []);
});

test('the gallery search can find photos by country, and the trips filter uses every country', () => {
  const src = read('js/gallery.js');
  assert.ok(src.includes('countryLabels') && src.includes('img.countries'));
  assert.ok(read('js/trip-entries.js').includes('p.countries'));
});

test('the About page has just the one sentence, with no contact line', () => {
  const about = read('about.html');
  assert.ok(about.includes('This is a log of hiking trips'));
  assert.ok(!about.includes('mailto:'));
  assert.ok(!about.includes('get in contact'));
});
