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

  return { ringCenter, inBounds, clipRing, splitShape };
});
