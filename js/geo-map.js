// Shared drill-down map: continent -> country -> city, drawn from a GeoJSON
// countries layer (no tile provider, no API key, no quota). Used by both the
// home page and the gallery's browse-by-place map, which differ only in what
// happens when a city is finally selected (window.GeoMap.create's onSelectCity).
//
// Where a country holds only one city, clicking it skips straight to that city
// without an interstitial "here are this country's cities" view. Where a
// continent holds only one visited country (South America: Peru; North America:
// the USA; Africa: Morocco), clicking any of its countries does the same -
// there is nothing else in that continent to choose between.
//
// Inside a country with more than one region (the USA, Italy, Spain...), each
// region with two or more cities gets a dashed halo you can click, and there is
// a row of region buttons, both of which zoom to that region's trips.
//
// Scroll wheel, trackpad pinch, and ctrl + scroll all zoom; drag to pan.
window.GeoMap = (function () {
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

  /**
   * @param {object} o
   * @param {string} o.containerId Leaflet map element id (must already exist)
   * @param {object} o.countries map-data.json's countries
   * @param {object} o.continents map-data.json's continents
   * @param {object} o.world TopoJSON world data (data/world.json)
   * @param {(city: object, marker: object) => void} o.onSelectCity called with a
   *   map-data city object ({name, lat, lon, tripIds}) and its Leaflet marker
   *   once a specific city is chosen, whether by clicking its marker or by the
   *   country-skip shortcut above
   * @param {(city: object) => string} o.cityTooltip tooltip/label text for a city marker
   * @param {() => void} [o.onLevelChange] called after level/bounds change
   */
  function create(o) {
    const map = L.map(o.containerId, {
      scrollWheelZoom: true,
      minZoom: 1,
      maxBounds: [[-85, -200], [85, 200]],
      maxBoundsViscosity: 0.7,
    });
    const state = { level: "continent", activeContinent: null, activeCountry: null, activeRegion: null };
    let markerLayer = L.layerGroup().addTo(map);
    let geoLayer = null;

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

    function siblingCount(continentKey) {
      return Object.values(o.countries).filter((c) => c.continent === continentKey).length;
    }

    function styleFor(feature) {
      const key = isoToKey[feature.id];
      const base = { weight: 1, className: "geo-country" };
      if (!key) return { ...base, color: getVar("--border", "#ccc"), fillColor: getVar("--map-bg", "#eee"), fillOpacity: 0.4, interactive: false };
      if (key === state.activeCountry) {
        return { ...base, weight: 2, color: getVar("--map-active", "#2d5a4a"), fillColor: getVar("--map-active-bg", "rgba(45,90,74,.2)"), fillOpacity: 1 };
      }
      const inFocus = state.level === "continent" || o.countries[key].continent === state.activeContinent;
      if (!inFocus) return { ...base, color: getVar("--border", "#ccc"), fillColor: getVar("--map-bg", "#eee"), fillOpacity: 0.35, interactive: true };
      return { ...base, color: getVar("--text-muted", "#888"), fillColor: getVar("--map-bg", "#eee"), fillOpacity: 0.7 };
    }

    function restyle() {
      if (geoLayer) geoLayer.eachLayer((l) => l.setStyle(styleFor(l.feature)));
    }

    function clearMarkers() {
      map.removeLayer(markerLayer);
      markerLayer = L.layerGroup().addTo(map);
    }

    function drawCityMarker(city) {
      const marker = L.circleMarker([city.lat, city.lon], {
        radius: 8,
        color: getVar("--map-active", "#2d5a4a"),
        fillColor: getVar("--map-active", "#2d5a4a"),
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
        const accent = getVar("--map-active", "#2d5a4a");
        const halo = L.circle([lat, lon], { radius: farthest * 1.3 + 20000, color: accent, weight: 1, dashArray: "4 4", fillColor: accent, fillOpacity: 0.07 }).addTo(markerLayer);
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
      if (o.onLevelChange) o.onLevelChange(state);
    }

    function handleCountryClick(key) {
      const country = o.countries[key];
      if (!country) return;
      if (state.level === "continent" && siblingCount(country.continent) > 1) {
        showContinent(country.continent);
      } else {
        selectCountry(key);
      }
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
      for (const c of Object.values(o.countries)) if (c.bounds) bounds.push(c.bounds[0], c.bounds[1]);
      if (bounds.length) fitTo(bounds, [30, 30]);
      if (o.onLevelChange) o.onLevelChange(state);
    }

    function redrawForTheme() {
      setTimeout(restyle, 0);
    }

    // Trim distant territories off visited countries (French Guiana, Alaska,
    // Hawaii, Svalbard, Madeira...) so only the recognisable country lights up.
    const world = o.world;
    const shown = [];
    for (const feature of topojson.feature(world, world.objects.countries).features) {
      const key = isoToKey[feature.id];
      if (key && o.countries[key].isoNumeric === feature.id) {
        const { core, outlying } = window.GeoShapes.splitShape(feature, o.countries[key].bounds, { clip: !!o.countries[key].clipToBounds });
        shown.push(core);
        if (outlying) shown.push(outlying);
      } else {
        shown.push(feature);
      }
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
      style: styleFor,
      onEachFeature(feature, layer) {
        const key = isoToKey[feature.id];
        if (!key) return;
        layer.on("click", () => handleCountryClick(key));
        layer.on("mouseover", () => {
          if (key === state.activeCountry) return;
          for (const l of layersOf(key)) l.setStyle({ color: getVar("--map-active", "#2d5a4a"), fillColor: getVar("--map-active-bg", "rgba(45,90,74,.2)"), fillOpacity: 1 });
        });
        layer.on("mouseout", () => {
          for (const l of layersOf(key)) l.setStyle(styleFor(l.feature));
        });
      },
    }).addTo(map);

    showWorld();

    return { map, showWorld, showContinent, selectCountry, focusRegion, redrawForTheme, state };
  }

  return { create };
})();
