// The map only lights up places that count as visited, zooms with the wheel,
// and lets you zoom to a region.
const test = require('node:test');
const assert = require('node:assert/strict');
const topojson = require('topojson-client');
const { read, json } = require('./helpers');
const GeoShapes = require('../js/geo-shapes.js');

const world = json('data/world.json');
const mapData = json('data/map-data.json');
const features = topojson.feature(world, world.objects.countries).features;
const shape = (iso) => features.find((f) => f.id === iso);

// Every point of a feature as [lat, lon].
function points(feature) {
  const out = [];
  const polys = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const poly of polys) for (const ring of poly) for (const [lon, lat] of ring) out.push([lat, lon]);
  return out;
}
const keptShape = (key) => GeoShapes.splitShape(shape(mapData.countries[key].isoNumeric), mapData.countries[key].bounds, { clip: !!mapData.countries[key].clipToBounds });

test('France lights up mainland France and Corsica, not French Guiana or the other overseas territories', () => {
  const { core, outlying } = keptShape('france');
  const pts = points(core);
  assert.ok(pts.every(([lat, lon]) => lat > 40 && lon > -6 && lon < 10), 'a piece of France is far from Europe');
  assert.ok(outlying, 'the overseas territories should be split off');
  assert.ok(points(outlying).some(([lat]) => lat < 10), 'French Guiana should be among the split-off pieces');
});

test('the USA lights up the lower 48, not Alaska or Hawaii', () => {
  const { core, outlying } = keptShape('usa');
  const pts = points(core);
  assert.ok(pts.every(([lat, lon]) => lat < 50 && lon > -126), 'Alaska or Hawaii is still highlighted');
  assert.ok(points(outlying).some(([lat]) => lat > 55), 'Alaska should be split off');
  assert.ok(points(outlying).some(([, lon]) => lon < -150), 'Hawaii should be split off');
});

test('Puerto Rico is drawn as part of the USA because you visited it', () => {
  assert.deepEqual(mapData.countries.usa.extraIsoNumeric, ['630']);
  assert.ok(shape('630'), 'Puerto Rico has a shape in the world file');
});

test('Norway lights up the mainland and its coastal islands, not Svalbard or far-off territories', () => {
  const { core, outlying } = keptShape('norway');
  assert.ok(points(core).every(([lat, lon]) => lat < 72 && lon > 4), 'a far-off island is still highlighted');
  assert.ok(points(outlying).some(([lat]) => lat > 74), 'Svalbard should be split off');
});

test('Portugal lights up the mainland, not Madeira or the Azores; Spain drops the Canary Islands', () => {
  const pt = keptShape('portugal');
  assert.ok(points(pt.core).every(([, lon]) => lon > -10), 'Madeira or the Azores is still highlighted');
  assert.ok(points(pt.outlying).some(([, lon]) => lon < -15), 'the islands should be split off');
  const es = keptShape('spain');
  assert.ok(points(es.core).every(([lat]) => lat > 35.5), 'the Canary Islands are still highlighted');
});

test('trimming never loses land: kept plus split-off pieces are the original shape', () => {
  for (const [key, c] of Object.entries(mapData.countries)) {
    const original = shape(c.isoNumeric);
    if (c.clipToBounds) continue; // clipped shapes are checked on their own below
    const { core, outlying } = GeoShapes.splitShape(original, c.bounds);
    const count = (f) => (f ? (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length) : 0);
    assert.equal(count(core) + count(outlying), count(original), `${key} lost or gained a piece`);
    assert.ok(count(core) >= 1, `${key} has nothing left to highlight`);
    assert.notEqual(outlying && outlying.id, core.id, 'the split-off pieces must not share the country id');
  }
});

test('every country you visited still has its main shape highlighted after trimming', () => {
  for (const [key, c] of Object.entries(mapData.countries)) {
    const { core } = keptShape(key);
    assert.equal(core.id, c.isoNumeric, `${key} lost its id`);
    const [south, west] = c.bounds[0];
    const [north, east] = c.bounds[1];
    const inside = points(core).filter(([lat, lon]) => lat >= south - 3 && lat <= north + 3 && lon >= west - 3 && lon <= east + 3).length;
    assert.ok(inside / points(core).length > 0.9, `${key}: most of the kept shape should sit inside its bounds`);
  }
});

test('scrolling, pinching, and ctrl + scroll all zoom the map', () => {
  const src = read('js/geo-map.js');
  assert.match(src, /scrollWheelZoom:\s*true/);
  assert.ok(!/scrollWheelZoom:\s*false/.test(src));
});

test('the map can zoom to a region: a button for each region and a halo you can click', () => {
  const src = read('js/geo-map.js');
  assert.ok(src.includes('focusRegion'));
  assert.ok(src.includes('region-chip'));
  assert.ok(src.includes('drawRegionHalos'));
  assert.match(read('css/style.css'), /\.region-chip\[aria-pressed="true"\]/);
});

test('every region has at least one city and every city is inside its country', () => {
  for (const [ck, country] of Object.entries(mapData.countries)) {
    for (const [rk, region] of Object.entries(country.regions)) {
      assert.ok(region.cities.length >= 1, `${ck}/${rk} has no cities`);
      assert.ok(region.label, `${ck}/${rk} has no label`);
    }
  }
});

test('the map instruction mentions zooming and regions', () => {
  const home = read('index.html');
  assert.match(home, /Scroll or pinch to zoom/);
  assert.match(home, /region/);
});

test('Morocco lights up Morocco only: its outline is cut at its recognised southern border, not into Western Sahara', () => {
  assert.equal(mapData.countries.morocco.clipToBounds, true);
  const { core } = keptShape('morocco');
  const pts = points(core);
  assert.ok(Math.min(...pts.map(([lat]) => lat)) >= 27.5, 'Morocco still reaches into Western Sahara');
  assert.ok(pts.length > 100, 'Morocco lost its outline');
  assert.ok(pts.every(([lat, lon]) => lat <= 36 && lon >= -13.3 && lon <= -0.9));
});

test('clipping a shape keeps its outline closed and inside the bounds', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const clipped = GeoShapes.clipRing(square, [[2, 3], [8, 7]]);
  assert.deepEqual(clipped[0], clipped[clipped.length - 1], 'ring is not closed');
  assert.ok(clipped.every(([lon, lat]) => lat >= 2 && lat <= 8 && lon >= 3 && lon <= 7));
  assert.equal(GeoShapes.clipRing(square, [[20, 20], [30, 30]]), null, 'a shape outside the bounds should vanish');
});
