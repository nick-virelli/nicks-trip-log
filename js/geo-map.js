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
window.GeoMap = (function () {
  function getVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
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
    const map = L.map(o.containerId, { scrollWheelZoom: false });
    const state = { level: "continent", activeContinent: null, activeCountry: null };
    let markerLayer = L.layerGroup().addTo(map);
    let geoLayer = null;

    const isoToKey = {};
    for (const [key, c] of Object.entries(o.countries)) if (c.isoNumeric) isoToKey[c.isoNumeric] = key;

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
        const marker = drawCityMarker(cities[0]);
        map.setView([cities[0].lat, cities[0].lon], 9);
        o.onSelectCity(cities[0], marker);
      } else {
        for (const city of cities) drawCityMarker(city);
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
      clearMarkers();
      restyle();
      if (continent && continent.bounds) fitTo(continent.bounds, [20, 20]);
      if (o.onLevelChange) o.onLevelChange(state);
    }

    function showWorld() {
      state.level = "continent";
      state.activeContinent = null;
      state.activeCountry = null;
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

    const world = o.world;
    const features = topojson.feature(world, world.objects.countries);
    geoLayer = L.geoJson(features, {
      style: styleFor,
      onEachFeature(feature, layer) {
        const key = isoToKey[feature.id];
        if (!key) return;
        layer.on("click", () => handleCountryClick(key));
        layer.on("mouseover", () => {
          if (key !== state.activeCountry) layer.setStyle({ color: getVar("--map-active", "#2d5a4a"), fillColor: getVar("--map-active-bg", "rgba(45,90,74,.2)"), fillOpacity: 1 });
        });
        layer.on("mouseout", () => layer.setStyle(styleFor(feature)));
      },
    }).addTo(map);

    showWorld();

    return { map, showWorld, showContinent, selectCountry, redrawForTheme, state };
  }

  return { create };
})();
