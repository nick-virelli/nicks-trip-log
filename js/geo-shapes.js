// Trims a visited country's map shape down to the part you would recognise as
// that country. World country outlines include distant territories: France
// carries French Guiana, the USA carries Alaska and Hawaii, Norway carries
// Svalbard, Portugal carries Madeira and the Azores. Highlighting those would
// claim places that were never visited and that most people do not think of as
// part of the country.
//
// A country's own `bounds` in map-data.json frame the area that counts. Any
// separate piece of its shape whose centre falls outside those bounds is split
// off and drawn as plain, unhighlighted land. Loads as window.GeoShapes in the
// browser and as a CommonJS module in Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GeoShapes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // [lat, lon] of the middle of a polygon's outer ring (GeoJSON is [lon, lat]).
  function ringCenter(ring) {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
  }

  // bounds is [[south, west], [north, east]] in [lat, lon].
  function inBounds(lat, lon, bounds) {
    return lat >= bounds[0][0] && lat <= bounds[1][0] && lon >= bounds[0][1] && lon <= bounds[1][1];
  }

  // Cuts a ring (GeoJSON [lon, lat] points) down to the rectangle, keeping the
  // outline's shape inside it (Sutherland-Hodgman clipping).
  function clipRing(ring, bounds) {
    const [[south, west], [north, east]] = bounds;
    const cut = (points, inside, meet) => {
      const out = [];
      for (let i = 0; i < points.length; i++) {
        const cur = points[i];
        const prev = points[(i + points.length - 1) % points.length];
        if (inside(cur)) {
          if (!inside(prev)) out.push(meet(prev, cur));
          out.push(cur);
        } else if (inside(prev)) {
          out.push(meet(prev, cur));
        }
      }
      return out;
    };
    const atLat = (lat) => (a, b) => [a[0] + ((lat - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), lat];
    const atLon = (lon) => (a, b) => [lon, a[1] + ((lon - a[0]) / (b[0] - a[0])) * (b[1] - a[1])];
    let pts = ring.slice(0, -1);
    pts = cut(pts, (p) => p[1] >= south, atLat(south));
    if (pts.length) pts = cut(pts, (p) => p[1] <= north, atLat(north));
    if (pts.length) pts = cut(pts, (p) => p[0] >= west, atLon(west));
    if (pts.length) pts = cut(pts, (p) => p[0] <= east, atLon(east));
    return pts.length >= 3 ? [...pts, pts[0]] : null;
  }

  // Returns { core, outlying }. core keeps the feature's id and holds the pieces
  // inside the bounds. outlying (or null) holds the rest under a different id, so
  // nothing that joins on the country id will pick it up.
  //
  // options.clip: also cut the shape itself at the bounds. Used where a country's
  // outline runs past its recognised border into land that is drawn as another
  // territory (Morocco's outline includes Western Sahara).
  function splitShape(feature, bounds, options) {
    const geometry = feature.geometry;
    if (options && options.clip && bounds && geometry) {
      const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
      const clipped = polygons
        .map((polygon) => polygon.map((ring) => clipRing(ring, bounds)).filter(Boolean))
        .filter((polygon) => polygon.length && polygon[0]);
      if (clipped.length) return { core: { type: "Feature", id: feature.id, properties: feature.properties, geometry: { type: "MultiPolygon", coordinates: clipped } }, outlying: null };
    }
    if (!geometry || geometry.type !== "MultiPolygon" || !bounds) return { core: feature, outlying: null };
    const near = [];
    const far = [];
    for (const polygon of geometry.coordinates) {
      const [lat, lon] = ringCenter(polygon[0]);
      (inBounds(lat, lon, bounds) ? near : far).push(polygon);
    }
    if (!near.length) return { core: feature, outlying: null };
    const make = (id, coordinates, extra) => ({
      type: "Feature",
      id,
      properties: { ...feature.properties, ...extra },
      geometry: { type: "MultiPolygon", coordinates },
    });
    return {
      core: make(feature.id, near, {}),
      outlying: far.length ? make(`outlying-${feature.id}`, far, { outlying: true }) : null,
    };
  }

  // Left off the map entirely: Antarctica's outline circles the pole and would
  // draw as a band across the whole bottom of the world.
  const NEVER_DRAWN = ["010"];

  // Outlines that cross the date line (Russia's far east, Fiji) have edges that
  // jump from +180 to -180 and would draw as a line right across the map. This
  // splits such a shape in two at the date line so each half draws normally.
  function fixDateLine(feature) {
    const geometry = feature.geometry;
    if (!geometry) return feature;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    const wraps = (polygon) => polygon.some((ring) => ring.some((point, i) => i > 0 && Math.abs(point[0] - ring[i - 1][0]) > 180));
    if (!polygons.some(wraps)) return feature;
    const out = [];
    for (const polygon of polygons) {
      if (!wraps(polygon)) {
        out.push(polygon);
        continue;
      }
      const shifted = polygon.map((ring) => ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]));
      const west = shifted.map((ring) => clipRing(ring, [[-90, 0], [90, 180]])).filter(Boolean);
      const east = shifted
        .map((ring) => clipRing(ring, [[-90, 180], [90, 360]]))
        .filter(Boolean)
        .map((ring) => ring.map(([lon, lat]) => [lon - 360, lat]));
      if (west.length) out.push(west);
      if (east.length) out.push(east);
    }
    return { ...feature, geometry: { type: "MultiPolygon", coordinates: out } };
  }

  // Russia's outline runs across Asia to the Pacific, so it is left out of the
  // Europe outline rather than lighting up half of Asia.
  const EXCLUDE_IDS = ["643"];
  // Hawaii is part of the USA but not part of the North America you would draw.
  const EXCLUDE_BOXES = { "north-america": [[[18, -162], [23, -154]]] };

  // One merged outline per continent, so the world view can show "Europe" as a
  // single shape instead of forty countries. Each piece of each country goes to
  // the continent it sits in: normally the continent world data files it under,
  // plus overseas pieces of visited countries (French Guiana joins South
  // America, the Canary Islands join Africa) by where they physically are.
  //
  // topo is the world TopoJSON, lib is topojson-client (passed in so this runs in
  // both the browser and Node), continents is map-data.json's continents block
  // (bounds, and an optional shapeBounds used instead when the zoom frame is
  // tighter than the continent), visitedIds is a Set of the country ids visited.
  // Returns { features, covered }: one Feature per continent, and the set of
  // country ids that contributed a piece.
  function continentShapes(topo, lib, continents, visitedIds) {
    const geometries = topo.objects.countries.geometries;
    const features = lib.feature(topo, topo.objects.countries).features;
    const boundsOf = (key) => continents[key].shapeBounds || continents[key].bounds;
    const groups = {};
    const covered = new Set();
    features.forEach((feature, i) => {
      if (EXCLUDE_IDS.includes(feature.id)) return;
      const arcs = geometries[i].type === "Polygon" ? [geometries[i].arcs] : geometries[i].arcs;
      const coordinates = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      coordinates.forEach((polygon, j) => {
        const [lat, lon] = ringCenter(polygon[0]);
        const own = feature.properties && feature.properties.continent;
        let target = null;
        if (own && continents[own] && inBounds(lat, lon, boundsOf(own))) target = own;
        else if (visitedIds.has(feature.id)) target = Object.keys(continents).find((key) => inBounds(lat, lon, boundsOf(key))) || null;
        if (!target) return;
        if ((EXCLUDE_BOXES[target] || []).some((box) => inBounds(lat, lon, box))) return;
        (groups[target] = groups[target] || []).push({ type: "Polygon", arcs: arcs[j] });
        covered.add(feature.id);
      });
    });
    return {
      features: Object.entries(groups).map(([key, geometry]) => ({
        type: "Feature",
        id: `continent-${key}`,
        properties: { continent: key },
        geometry: lib.merge(topo, geometry),
      })),
      covered,
    };
  }

  return { ringCenter, inBounds, clipRing, splitShape, continentShapes, fixDateLine, NEVER_DRAWN };
});
