// Steps and miles from Apple Health: plausible, matched to trips, shown on the
// pages, and never leaking anything personal into the repo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, read, exists, json } = require('./helpers');

const summary = json('content/health-summary.json');
const { posts, health_totals } = json('data/posts.json');
const byId = new Map(posts.map((p) => [p.id, p]));

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000) + 1;

test('the summary holds only trip totals: no names, devices, dates of birth, or other health data', () => {
  assert.deepEqual(Object.keys(summary).sort(), ['generated', 'source', 'totals', 'trips']);
  assert.deepEqual(Object.keys(summary.totals).sort(), ['days_counted', 'steps', 'trips_counted', 'walking_miles']);
  for (const t of Object.values(summary.trips)) assert.deepEqual(Object.keys(t).sort(), ['days_counted', 'steps', 'walking_miles']);
});

test('the Health export itself is kept out of the repo', () => {
  const ignore = read('.gitignore');
  for (const name of ['export.xml', 'export_cda.xml', 'apple_health_export/']) assert.ok(ignore.includes(name), `.gitignore is missing ${name}`);
  const found = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'Trips', 'images'].includes(f.name)) continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/^export.*\.xml$/i.test(f.name) || /\.gpx$/i.test(f.name)) found.push(path.relative(ROOT, p));
    }
  })(ROOT);
  assert.deepEqual(found, []);
});

test('every trip with numbers is a dated trip, and every dated trip has numbers', () => {
  for (const id of Object.keys(summary.trips)) assert.ok(byId.get(id) && byId.get(id).date_start, `${id} has Health numbers but no dates`);
  for (const p of posts) {
    if (p.date_start) assert.ok(summary.trips[p.id], `${p.id} is dated but has no Health numbers`);
    else assert.equal(p.steps, null, `${p.id} has no dates so it must not have steps`);
  }
});

test('the numbers are believable: a sane number of steps per day, and steps and miles agree', () => {
  for (const [id, t] of Object.entries(summary.trips)) {
    const p = byId.get(id);
    const days = daysBetween(p.date_start, p.date_end);
    assert.ok(t.days_counted <= days, `${id} counted more days than the trip has`);
    const perDay = t.steps / t.days_counted;
    assert.ok(perDay > 1000 && perDay < 60000, `${id}: ${Math.round(perDay)} steps a day looks wrong`);
    const stride = t.walking_miles / t.steps; // miles per step
    assert.ok(stride > 0.0002 && stride < 0.0009, `${id}: steps and miles disagree (${stride.toFixed(5)} miles per step)`);
  }
});

test('posts carry exactly the numbers in the summary', () => {
  for (const [id, t] of Object.entries(summary.trips)) {
    assert.equal(byId.get(id).steps, t.steps);
    assert.equal(byId.get(id).walking_miles, t.walking_miles);
  }
});

test('overall totals count each calendar day once, even when two legs share a day', () => {
  assert.deepEqual(health_totals, summary.totals);
  const sum = Object.values(summary.trips).reduce((s, t) => s + t.steps, 0);
  assert.ok(summary.totals.steps <= sum, 'unique-day total cannot exceed the sum of trips');
  assert.ok(sum - summary.totals.steps < sum * 0.05, 'only a day or two of overlap is expected');
  assert.equal(summary.totals.trips_counted, Object.keys(summary.trips).length);
});

test('a trip page shows its steps and miles walked only when it has them', () => {
  for (const p of posts) {
    const page = read(`trip/${p.id}.html`);
    if (p.steps) assert.ok(page.includes(`${p.steps.toLocaleString('en-US')} steps, ${p.walking_miles} miles walked`), `${p.id} does not show its steps`);
    else assert.ok(!page.includes('post-steps'), `${p.id} shows steps it does not have`);
  }
});

test('data is downloaded once: each page uses the script that already loaded it before fetching', () => {
  for (const f of ['js/map.js', 'js/gallery.js', 'js/trips-index.js', 'js/search-page.js']) {
    const src = read(f);
    assert.ok(src.indexOf('if (window[globalVar]) return window[globalVar];') !== -1 && src.indexOf('if (window[globalVar])') < src.indexOf('await fetch'), `${f} fetches before checking the loaded data`);
  }
});

test('the home page has tiles for steps and miles walked, and no leftover old miles wording', () => {
  const home = read('index.html');
  for (const id of ['stat-steps', 'stat-miles', 'stat-miles-label']) assert.ok(home.includes(`id="${id}"`), `home is missing #${id}`);
  assert.ok(!read('js/map.js').includes('trips tracked'));
});
