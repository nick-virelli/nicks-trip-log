// Search behaves literally and predictably, finds text that used to be lost,
// and every result links somewhere that exists.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read, json, exists } = require('./helpers');
const TripSearch = require('../js/search.js');

const { entries } = json('data/search-index.json');
const ids = (query) => TripSearch.search(entries, query).map((r) => r.id);

test('finds a restaurant named in the notes, on every trip that mentions it', () => {
  const hits = ids('oscar');
  assert.ok(hits.includes('zion-2024'));
  assert.ok(hits.length >= 1);
});

test('ignores case', () => {
  assert.deepEqual(ids('OSCAR'), ids('oscar'));
  assert.deepEqual(ids('oScAr'), ids('oscar'));
});

test('finds accented city names as typed', () => {
  assert.ok(ids('tromsø').includes('norway-2025'));
  assert.ok(ids('málaga').includes('morocco-malaga-2025'));
});

test('every word must appear in the same line, in any order', () => {
  assert.ok(ids('sweet potato tacos').includes('zion-2024'));
  assert.ok(ids('tacos sweet potato').includes('zion-2024'));
  assert.deepEqual(ids('sweet potato tacos zzzzqq'), []);
});

// The fix that restored text nested under photos also put it into the index.
test('finds writing that sits underneath a photo in the notes', () => {
  assert.ok(ids('medevac').includes('zion-2024'));
  assert.ok(ids('steep switchbacks').includes('zion-2024'));
});

test('does not guess: a misspelling finds nothing, and an empty search finds nothing', () => {
  assert.deepEqual(ids('oscarr'), []);
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('   '), []);
});

test('a match in a trip name or place ranks above a match buried in the notes', () => {
  const results = TripSearch.search(entries, 'zion');
  assert.ok(results.length >= 2);
  assert.ok(results[0].nameHit, 'first result should be a name match');
  const firstNoteOnly = results.findIndex((r) => !r.nameHit);
  if (firstNoteOnly !== -1) assert.ok(results.slice(0, firstNoteOnly).every((r) => r.nameHit));
});

test('every trip can be found by its own title', () => {
  for (const e of entries) assert.ok(ids(e.title).includes(e.id), `${e.title} is not found by its own title`);
});

test('every matching day has a real anchor on its trip page, so a result lands on that day', () => {
  const bad = [];
  for (const query of ['the', 'ate', 'walked']) {
    for (const r of TripSearch.search(entries, query)) {
      const page = read(`trip/${r.id}.html`);
      for (const d of r.days) if (!page.includes(`id="day-${d.number}"`)) bad.push(`${r.id} day ${d.number}`);
      assert.ok(exists(`trip/${r.id}.html`));
    }
  }
  assert.deepEqual(bad, []);
});

test('highlighting marks the match and escapes everything else', () => {
  const html = TripSearch.highlight('<b>Tom & Jerry</b>', 'tom');
  assert.ok(html.includes('<mark>Tom</mark>'));
  assert.ok(html.includes('&lt;b&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(!html.includes('<b>'));
});

test('typing regex characters or HTML into the search box is harmless', () => {
  for (const q of ['(', '[', '.*', '\\', '<script>', '"', '$1']) {
    assert.doesNotThrow(() => TripSearch.search(entries, q));
    assert.doesNotThrow(() => TripSearch.highlight('a (b) [c] <d>', q));
  }
  assert.ok(!TripSearch.highlight('x <script> y', '<script>').includes('<script>'));
});

test('a long line is shortened around the match, with the match in view', () => {
  const long = 'x'.repeat(300) + ' needle ' + 'y'.repeat(300);
  const html = TripSearch.highlight(long, 'needle', 200);
  assert.ok(html.includes('<mark>needle</mark>'));
  assert.ok(html.startsWith('…') && html.endsWith('…'));
  assert.ok(html.length < 400);
});

test('the search page and the forms that lead to it are wired up', () => {
  const page = read('search.html');
  for (const id of ['search-input', 'search-summary', 'search-results']) assert.ok(page.includes(`id="${id}"`), `search.html missing #${id}`);
  for (const p of ['index.html', 'trips.html']) {
    const html = read(p);
    assert.ok(html.includes('action="search.html"') && html.includes('name="q"'), `${p} has no search form`);
  }
});

test('there is one trip search: no page keeps its own separate trip-name search box', () => {
  for (const p of ['index.html', 'trips.html']) {
    assert.ok(!read(p).includes('id="trip-search"'), `${p} still has the old title-only search`);
  }
  assert.ok(!read('js/map.js').includes('initTripSearch'));
});
