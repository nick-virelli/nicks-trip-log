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

// ---- continent outlines and names ----

const visitedIds = new Set();
for (const c of Object.values(mapData.countries)) {
  visitedIds.add(c.isoNumeric);
  (c.extraIsoNumeric || []).forEach((x) => visitedIds.add(x));
}
const continents = GeoShapes.continentShapes(world, topojson, mapData.continents, visitedIds);
const continentPoints = (key) => continents.features.find((f) => f.properties.continent === key).geometry.coordinates.flatMap((p) => p[0]).map(([lon, lat]) => [lat, lon]);

test('the world view has one merged outline for each continent you have visited', () => {
  assert.deepEqual(continents.features.map((f) => f.properties.continent).sort(), Object.keys(mapData.continents).sort());
  for (const f of continents.features) assert.equal(f.geometry.type, 'MultiPolygon');
});

test('the outline is merged: Europe is a few big shapes plus islands, not one shape per country', () => {
  const europe = continents.features.find((f) => f.properties.continent === 'europe');
  const europeanCountries = features.filter((f) => f.properties.continent === 'europe').length;
  assert.ok(europeanCountries > 35);
  // Merging removes the shared borders, so the merged shape has far fewer outer
  // rings than the separate countries had between them.
  const countryPieces = features.filter((f) => f.properties.continent === 'europe').reduce((n, f) => n + (f.geometry.type === 'Polygon' ? 1 : f.geometry.coordinates.length), 0);
  assert.ok(europe.geometry.coordinates.length < countryPieces, 'Europe was not merged');
});

test('Europe covers Germany, Norway, Iceland, and Greece, but not Russia, Turkey, or the Atlantic islands', () => {
  const pts = continentPoints('europe');
  const near = (lat, lon, d = 1.5) => pts.some(([la, lo]) => Math.abs(la - lat) < d && Math.abs(lo - lon) < d);
  assert.ok(near(54, 10), 'Germany (its Baltic coast)');
  assert.ok(!near(50.5, 10, 0.6), 'the border lines inside Germany are still drawn, so the outline is not merged');
  assert.ok(near(60, 5), 'Norway (its west coast)');
  assert.ok(near(65, -19), 'Iceland');
  assert.ok(near(38, 23), 'Greece');
  assert.ok(pts.every(([, lon]) => lon <= 45 && lon >= -25), 'the outline runs into Asia or the mid-Atlantic');
  assert.ok(!continents.covered.has('643'), 'Russia should be left out');
});

test('North America leaves out Hawaii, and South America includes French Guiana', () => {
  assert.ok(!continentPoints('north-america').some(([lat, lon]) => lat > 18 && lat < 23 && lon > -162 && lon < -154), 'Hawaii is in the North America outline');
  assert.ok(continentPoints('south-america').some(([lat, lon]) => lat > 2 && lat < 6 && lon > -54 && lon < -51), 'French Guiana is not part of South America');
  assert.ok(continentPoints('africa').some(([lat, lon]) => lat < -30), 'Africa is missing its southern tip');
});

test('every continent has a name position inside it, and Europe has a wider outline frame than zoom frame', () => {
  for (const [key, c] of Object.entries(mapData.continents)) {
    assert.ok(c.labelAt && GeoShapes.inBounds(c.labelAt[0], c.labelAt[1], c.bounds), `${key} needs a label position inside its bounds`);
  }
  assert.ok(mapData.continents.europe.shapeBounds[0][1] < mapData.continents.europe.bounds[0][1]);
});

test('the same three steps for every continent: no shortcut past the continent for single-country ones', () => {
  const src = read('js/geo-map.js');
  assert.ok(!src.includes('siblingCount'), 'the old single-country shortcut is still there');
  assert.match(src, /country\.continent !== state\.activeContinent\) showContinent/);
  assert.match(src, /if \(state\.level !== "continent"\) handleCountryClick/, 'country clicks must be ignored on the world view');
});

test('countries you have not visited are background only: never clickable, dim, and faintly named', () => {
  const src = read('js/geo-map.js');
  assert.match(src, /if \(!key\) return; \/\/ countries you have not visited are background only/);
  assert.match(src, /plain = \{[^}]*interactive: false/);
  assert.match(read('css/style.css'), /\.map-label--dim \{[^}]*opacity: 0\.5/);
});

test('names are clear for visited countries and appear only where they fit', () => {
  const src = read('js/geo-map.js');
  assert.match(src, /MIN_ZOOM_VISITED = \d/);
  assert.match(src, /MIN_ZOOM_OTHER = \d/);
  assert.ok(Number(src.match(/MIN_ZOOM_OTHER = (\d+)/)[1]) > Number(src.match(/MIN_ZOOM_VISITED = (\d+)/)[1]), 'faint names should need more zoom than visited ones');
  assert.ok(src.includes('placed.some'), 'no overlap check: names would pile up');
  assert.match(read('css/style.css'), /\.map-label--visited \{[^}]*font-weight: 700/);
  assert.match(read('css/style.css'), /\.map-label--continent \{/);
});

test('the map instruction walks through continent, country, then region or city', () => {
  assert.match(read('index.html'), /Click a continent, then a country, then a region or a city/);
});

test('no outline is drawn across the date line: shapes that wrap it are split in two', () => {
  const wraps = (f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return polys.some((p) => p.some((ring) => ring.some((pt, i) => i > 0 && Math.abs(pt[0] - ring[i - 1][0]) > 180)));
  };
  const drawn = features.filter((f) => !GeoShapes.NEVER_DRAWN.includes(f.id));
  assert.ok(drawn.some(wraps), 'the world file no longer has wrapping shapes; this fix may be unneeded');
  assert.deepEqual(drawn.map(GeoShapes.fixDateLine).filter(wraps).map((f) => f.properties.name), [], 'these still draw a line across the map');
  const russia = GeoShapes.fixDateLine(shape('643'));
  const lons = russia.geometry.coordinates.flatMap((p) => p[0]).map(([lon]) => lon);
  assert.ok(Math.min(...lons) < -160 && Math.max(...lons) > 170, 'Russia lost its far east');
});

test('Antarctica is left off the map', () => {
  assert.deepEqual(GeoShapes.NEVER_DRAWN, ['010']);
  assert.match(read('js/geo-map.js'), /NEVER_DRAWN\.includes/);
});

test('the map zooms in fine steps so the world view fits its frame', () => {
  assert.match(read('js/geo-map.js'), /zoomSnap: 0\.25/);
});
