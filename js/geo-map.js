// Shared drill-down map, drawn from world outlines (no tile provider, no API
// key, no quota). Used by both the home page and the gallery's browse-by-place
// map, which differ only in what happens when a city is finally selected
// (window.GeoMap.create's onSelectCity).
//
// Three steps, the same for every continent:
//   1. World view: each continent you have visited is one merged outline with
//      its name on it. Click one to zoom in.
//   2. Continent view: countries appear individually. Countries you visited are
//      outlined, highlighted, and named clearly; the rest are dim, named faintly,
//      and cannot be clicked. Click a visited country.
//   3. Country view: city pins. Where a country holds only one city, step 3
//      is skipped and the click goes straight to that city.
//
// Inside a country with more than one region (the USA, Italy, Spain...), each
// region with two or more cities gets a dashed halo you can click, and there is
// a row of region buttons, both of which zoom to that region's trips.
//
// Names appear only where they fit: visited countries first, then the rest once
// you are zoomed in further, and any name that would overlap another is left out.
//
// Scroll wheel, trackpad pinch, and ctrl + scroll all zoom; drag to pan.
window.GeoMap = (function () {
  const MIN_ZOOM_VISITED = 3; // names of countries you visited
  const MIN_ZOOM_OTHER = 5; // names of every other country

  // Continents you have not visited still get a faint name on the world view.
  const OTHER_CONTINENT_LABELS = [
    { text: "Asia", lat: 45, lon: 90 },
    { text: "Oceania", lat: -25, lon: 135 },
  ];

  function getVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function countryCities(country) {
    const cities = [];
    for (const key in country.regions) cities.push(...country.regions[key].cities);
    return cities;
  }

  function countryBoundsFallback(country) {
    const cities = countryCities(country);
    return cities.map((c) => [c.lat, c.lon]);
  }

  // [lat, lon] of the middle of a feature's biggest piece, where its name goes.
  function labelPoint(feature) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    let best = null;
    let bestArea = -1;
    for (const polygon of polygons) {
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lon, lat] of polygon[0]) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      const area = (maxLon - minLon) * (maxLat - minLat);
      if (area > bestArea) {
        bestArea = area;
        best = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
      }
    }
    return best ? { ...best, area: bestArea } : null;
  }

  /**
   * @param {object} o
   * @param {string} o.containerId Leaflet map element id (must already exist)
   * @param {object} o.countries map-data.json's countries
   * @param {object} o.continents map-data.json's continents
   * @param {object} o.world TopoJSON world data (data/world.json)
   * @param {(city: object, marker: object) => void} o.onSelectCity called with a
   *   map-data city object ({name, lat, lon, tripIds}) and its Leaflet marker
   *   once a specific city is chosen, whether by clicking its marker or by the
   *   single-city shortcut above
   * @param {(city: object) => string} o.cityTooltip tooltip/label text for a city marker
   * @param {() => void} [o.onLevelChange] called after level/bounds change
   */
  function create(o) {
    const map = L.map(o.containerId, {
      scrollWheelZoom: true,
      // Finer zoom steps: the world view fits the frame properly instead of
      // snapping to a whole zoom level, and the wheel zooms smoothly.
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 100,
      minZoom: 1,
      maxBounds: [[-85, -200], [85, 200]],
      maxBoundsViscosity: 0.7,
    });
    // level: "continent" is the world view, "country" is zoomed to a continent,
    // "city" is inside one country.
    const state = { level: "continent", activeContinent: null, activeCountry: null, activeRegion: null };
    let markerLayer = L.layerGroup().addTo(map);
    const labelLayer = L.layerGroup().addTo(map);
    let geoLayer = null;
    let continentLayer = null;

    // Region buttons sit just above the map and only show inside a country
    // that has more than one region.
    const regionBar = document.createElement("div");
    regionBar.className = "map-regions";
    regionBar.hidden = true;
    map.getContainer().parentNode.insertBefore(regionBar, map.getContainer());

    // Every world-map shape that belongs to a country: its own, plus extras such
    // as Puerto Rico for the USA.
    const isoToKey = {};
    for (const [key, c] of Object.entries(o.countries)) {
      if (c.isoNumeric) isoToKey[c.isoNumeric] = key;
      for (const extra of c.extraIsoNumeric || []) isoToKey[extra] = key;
    }
    const baseId = (id) => String(id).replace(/^outlying-/, "");

    // ---- shapes ----

    // Trim distant territories off visited countries (French Guiana, Alaska,
    // Hawaii, Svalbard, Madeira...) so only the recognisable country lights up.
    const world = o.world;
    const shown = [];
    for (const original of topojson.feature(world, world.objects.countries).features) {
      if (window.GeoShapes.NEVER_DRAWN.includes(original.id)) continue;
      const feature = window.GeoShapes.fixDateLine(original);
      const key = isoToKey[feature.id];
      if (key && o.countries[key].isoNumeric === feature.id) {
        const { core, outlying } = window.GeoShapes.splitShape(feature, o.countries[key].bounds, { clip: !!o.countries[key].clipToBounds });
        shown.push(core);
        if (outlying) shown.push(outlying);
      } else {
        shown.push(feature);
      }
    }

    // One merged outline per visited continent, for the world view. The
    // countries folded into them are hidden there so borders do not show through.
    const continentData = window.GeoShapes.continentShapes(world, topojson, o.continents, new Set(Object.keys(isoToKey)));

    // ---- styles ----

    const accent = () => getVar("--map-active", "#2d5a4a");
    const accentFill = () => getVar("--map-active-bg", "rgba(45,90,74,.2)");

    function countryStyle(feature) {
      const key = isoToKey[feature.id];
      const base = { weight: 1, className: "geo-country" };
      const plain = { ...base, color: getVar("--border", "#ccc"), fillColor: getVar("--map-bg", "#eee"), fillOpacity: 0.4, interactive: false };
      // World view: the continent outlines stand in for the countries inside them.
      if (state.level === "continent" && continentData.covered.has(baseId(feature.id))) return { ...base, opacity: 0, fillOpacity: 0, interactive: false };
      if (!key) return plain;
      if (key === state.activeCountry) return { ...base, weight: 3, color: accent(), fillColor: accent(), fillOpacity: 0.3 };
      const inFocus = o.countries[key].continent === state.activeContinent;
      if (!inFocus) return { ...base, color: getVar("--text-muted", "#888"), fillColor: getVar("--map-bg", "#eee"), fillOpacity: 0.5 };
      return { ...base, weight: 1.5, color: accent(), fillColor: accentFill(), fillOpacity: 1 };
    }

    function continentStyle() {
      return { weight: 2, color: accent(), fillColor: accentFill(), fillOpacity: 1, className: "geo-continent" };
    }

    function restyle() {
      if (geoLayer) geoLayer.eachLayer((l) => l.setStyle(countryStyle(l.feature)));
      if (continentLayer) {
        const wanted = state.level === "continent";
        if (wanted && !map.hasLayer(continentLayer)) continentLayer.addTo(map);
        if (!wanted && map.hasLayer(continentLayer)) map.removeLayer(continentLayer);
        continentLayer.eachLayer((l) => l.setStyle(continentStyle()));
      }
    }

    // ---- names ----

    // Where each country's name goes, best candidates first: countries you
    // visited, then the rest from biggest to smallest.
    const countryLabels = [];
    for (const feature of shown) {
      if (feature.properties && feature.properties.outlying) continue;
      const key = isoToKey[feature.id];
      if (key && o.countries[key].isoNumeric !== feature.id) continue; // Puerto Rico and other extras
      const point = labelPoint(feature);
      const text = key ? o.countries[key].label : feature.properties && feature.properties.name;
      if (point && text) countryLabels.push({ text, lat: point.lat, lon: point.lon, area: point.area, key });
    }
    countryLabels.sort((a, b) => (b.key ? 1 : 0) - (a.key ? 1 : 0) || b.area - a.area);

    function updateLabels() {
      labelLayer.clearLayers();
      const placed = [];
      const view = map.getBounds().pad(0.05);
      const zoom = map.getZoom();
      function place(item, className, charWidth, height) {
        if (!view.contains([item.lat, item.lon])) return;
        const at = map.latLngToContainerPoint([item.lat, item.lon]);
        const width = item.text.length * charWidth + 10;
        const box = { x1: at.x - width / 2, x2: at.x + width / 2, y1: at.y - height / 2, y2: at.y + height / 2 };
        if (placed.some((p) => box.x2 > p.x1 && box.x1 < p.x2 && box.y2 > p.y1 && box.y1 < p.y2)) return;
        placed.push(box);
        L.marker([item.lat, item.lon], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: `map-label ${className}`, html: escapeHtml(item.text), iconSize: [width, height] }),
        }).addTo(labelLayer);
      }
      if (state.level === "continent") {
        for (const [key, c] of Object.entries(o.continents)) if (c.labelAt) place({ text: c.label, lat: c.labelAt[0], lon: c.labelAt[1] }, "map-label--continent", 10, 22);
        for (const c of OTHER_CONTINENT_LABELS) place(c, "map-label--continent map-label--dim", 10, 22);
        return;
      }
      for (const item of countryLabels) {
        if (state.level === "city" && item.key && item.key === state.activeCountry) continue; // its cities are the labels
        if (item.key) {
          if (zoom >= MIN_ZOOM_VISITED) place(item, "map-label--visited", 7.2, 16);
        } else if (zoom >= MIN_ZOOM_OTHER) {
          place(item, "map-label--dim", 6.2, 14);
        }
      }
    }

    // ---- markers ----

    function clearMarkers() {
      map.removeLayer(markerLayer);
      markerLayer = L.layerGroup().addTo(map);
    }

    function drawCityMarker(city) {
      const marker = L.circleMarker([city.lat, city.lon], {
        radius: 8,
        color: accent(),
        fillColor: accent(),
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(markerLayer);
      marker.bindTooltip(o.cityTooltip(city), { direction: "top", className: "trip-pin-label" });
      marker.on("click", () => o.onSelectCity(city, marker));
      return marker;
    }

    function fitTo(bounds, padding) {
      if (bounds && bounds.length === 2 && Array.isArray(bounds[0])) map.fitBounds(bounds, { padding });
      else if (Array.isArray(bounds) && bounds.length) map.fitBounds(bounds, { padding });
    }

    // ---- regions ----

    function hideRegionBar() {
      regionBar.hidden = true;
      regionBar.innerHTML = "";
      state.activeRegion = null;
    }

    function setActiveChip() {
      regionBar.querySelectorAll(".region-chip").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.region || null) === state.activeRegion)));
    }

    // Zoom to one region's trips, or back out to the whole country.
    function focusRegion(countryKey, regionKey) {
      const country = o.countries[countryKey];
      state.activeRegion = regionKey || null;
      setActiveChip();
      if (!regionKey) {
        fitTo(country.bounds || countryBoundsFallback(country), country.bounds ? [20, 20] : [40, 40]);
        return;
      }
      const points = country.regions[regionKey].cities.map((c) => [c.lat, c.lon]);
      if (points.length === 1) map.setView(points[0], 9);
      else map.fitBounds(points, { padding: [60, 60], maxZoom: 9 });
    }

    function showRegionBar(countryKey) {
      const country = o.countries[countryKey];
      const regions = Object.entries(country.regions);
      if (regions.length < 2) {
        hideRegionBar();
        return;
      }
      state.activeRegion = null;
      regionBar.hidden = false;
      regionBar.innerHTML =
        `<span class="map-regions-label">Regions</span>` +
        `<button type="button" class="region-chip" data-region="" aria-pressed="true">All of ${escapeHtml(country.label)}</button>` +
        regions.map(([key, r]) => `<button type="button" class="region-chip" data-region="${escapeHtml(key)}" aria-pressed="false">${escapeHtml(r.label)} (${r.cities.length})</button>`).join("");
      regionBar.onclick = (e) => {
        const button = e.target.closest(".region-chip");
        if (button) focusRegion(countryKey, button.dataset.region);
      };
    }

    // A dashed circle around a region's cities. Clicking it zooms to the region.
    function drawRegionHalos(countryKey) {
      const country = o.countries[countryKey];
      if (Object.keys(country.regions).length < 2) return;
      for (const [regionKey, region] of Object.entries(country.regions)) {
        if (region.cities.length < 2) continue;
        const lat = region.cities.reduce((s, c) => s + c.lat, 0) / region.cities.length;
        const lon = region.cities.reduce((s, c) => s + c.lon, 0) / region.cities.length;
        const farthest = Math.max(...region.cities.map((c) => map.distance([lat, lon], [c.lat, c.lon])));
        const halo = L.circle([lat, lon], { radius: farthest * 1.3 + 20000, color: accent(), weight: 1, dashArray: "4 4", fillColor: accent(), fillOpacity: 0.07 }).addTo(markerLayer);
        halo.bindTooltip(`${escapeHtml(region.label)}: click to zoom`, { sticky: true, className: "trip-pin-label" });
        halo.on("click", () => focusRegion(countryKey, regionKey));
      }
    }

    // ---- levels ----

    function selectCountry(key) {
      const country = o.countries[key];
      if (!country) return;
      const cities = countryCities(country);
      state.level = "city";
      state.activeCountry = key;
      state.activeContinent = country.continent;
      clearMarkers();
      restyle();
      if (cities.length === 1) {
        // Skip straight to the one city this country holds.
        hideRegionBar();
        const marker = drawCityMarker(cities[0]);
        map.setView([cities[0].lat, cities[0].lon], 9);
        o.onSelectCity(cities[0], marker);
      } else {
        drawRegionHalos(key); // first, so the city pins sit on top of them
        for (const city of cities) drawCityMarker(city);
        showRegionBar(key);
        fitTo(country.bounds || countryBoundsFallback(country), country.bounds ? [20, 20] : [40, 40]);
      }
      updateLabels();
      if (o.onLevelChange) o.onLevelChange(state);
    }

    // A visited country: from its own continent it opens; from anywhere else it
    // first takes you to that country's continent, the same steps as always.
    function handleCountryClick(key) {
      const country = o.countries[key];
      if (!country) return;
      if (country.continent !== state.activeContinent) showContinent(country.continent);
      else selectCountry(key);
    }

    function showContinent(continentKey) {
      const continent = o.continents[continentKey];
      state.level = "country";
      state.activeContinent = continentKey;
      state.activeCountry = null;
      hideRegionBar();
      clearMarkers();
      restyle();
      if (continent && continent.bounds) fitTo(continent.bounds, [20, 20]);
      updateLabels();
      if (o.onLevelChange) o.onLevelChange(state);
    }

    function showWorld() {
      state.level = "continent";
      state.activeContinent = null;
      state.activeCountry = null;
      hideRegionBar();
      clearMarkers();
      restyle();
      const bounds = [];
      for (const c of Object.values(o.continents)) if (c.bounds) bounds.push(c.bounds[0], c.bounds[1]);
      if (bounds.length) fitTo(bounds, [10, 10]);
      updateLabels();
      if (o.onLevelChange) o.onLevelChange(state);
    }

    function redrawForTheme() {
      setTimeout(restyle, 0);
    }

    // All shapes of a country light up together (the USA and Puerto Rico).
    const layersOf = (key) => {
      const found = [];
      geoLayer.eachLayer((l) => {
        if (isoToKey[l.feature.id] === key) found.push(l);
      });
      return found;
    };

    geoLayer = L.geoJson({ type: "FeatureCollection", features: shown }, {
      style: countryStyle,
      onEachFeature(feature, layer) {
        const key = isoToKey[feature.id];
        if (!key) return; // countries you have not visited are background only
        layer.on("click", () => {
          if (state.level !== "continent") handleCountryClick(key);
        });
        layer.on("mouseover", () => {
          if (state.level === "continent" || key === state.activeCountry) return;
          for (const l of layersOf(key)) l.setStyle({ color: accent(), fillColor: accent(), fillOpacity: 0.3, weight: 2 });
        });
        layer.on("mouseout", () => {
          if (state.level === "continent") return;
          for (const l of layersOf(key)) l.setStyle(countryStyle(l.feature));
        });
      },
    }).addTo(map);

    continentLayer = L.geoJson({ type: "FeatureCollection", features: continentData.features }, {
      style: continentStyle,
      onEachFeature(feature, layer) {
        const key = feature.properties.continent;
        layer.bindTooltip(`${escapeHtml(o.continents[key].label)}: click to zoom in`, { sticky: true, className: "trip-pin-label" });
        layer.on("click", () => showContinent(key));
        layer.on("mouseover", () => layer.setStyle({ weight: 3, fillColor: accent(), fillOpacity: 0.3 }));
        layer.on("mouseout", () => layer.setStyle(continentStyle()));
      },
    });

    map.on("moveend", updateLabels);
    showWorld();

    return { map, showWorld, showContinent, selectCountry, focusRegion, redrawForTheme, state };
  }

  return { create };
})();
