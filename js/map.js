(function () {
  const isFile = window.location.protocol === "file:";
  // Shared with the static trip pages (js/render-trip.js), the trips index
  // (js/trip-entries.js), and the map (js/geo-map.js).
  const { esc, fmtDateRange, tripTileHtml } = window.TripRender;

  async function loadData(jsonPath, globalVar) {
    if (isFile) {
      if (window[globalVar]) return window[globalVar];
      throw new Error(`Missing inline data ${globalVar} for file:// mode`);
    }
    const res = await fetch(jsonPath);
    return res.json();
  }

  const app = { posts: [] };

  function chooserPopupHtml(city) {
    const items = city.tripIds
      .map((id) => {
        const post = app.posts.find((p) => p.id === id);
        if (!post) return "";
        return `<a href="trip/${esc(id)}.html" style="display:block;padding:0.3rem 0;">${esc(post.title)}<br><span style="font-size:0.85em;color:var(--text-muted);">${esc(fmtDateRange(post))}</span></a>`;
      })
      .join('<hr style="margin:0.3rem 0;border:none;border-top:1px solid var(--border);">');
    return `<div class="map-popup"><strong>${esc(city.name)}</strong><hr style="margin:0.4rem 0;border:none;border-top:1px solid var(--border);">${items}</div>`;
  }

  // A city with one trip goes straight to its page. A city more than one trip
  // touched (e.g. Zion inside both the Southwest road trip and its own trip,
  // or London/Barcelona from two separate trips) shows the choice instead of
  // guessing which one the visitor wants.
  function onSelectCity(city, marker) {
    if (city.tripIds.length === 1) {
      window.location.href = `trip/${city.tripIds[0]}.html`;
      return;
    }
    marker.bindPopup(chooserPopupHtml(city)).openPopup();
  }

  function cityTooltip(city) {
    if (city.tripIds.length === 1) {
      const post = app.posts.find((p) => p.id === city.tripIds[0]);
      return `${esc(city.name)}${post ? " - " + esc(post.title) : ""}`;
    }
    return `${esc(city.name)} (${city.tripIds.length} trips)`;
  }

  // Miles are only logged on a handful of trips, so the stat says how many
  // rather than implying it covers the whole log.
  function renderStats(posts, mapData, photoCount) {
    const withMiles = posts.filter((p) => p.total_miles > 0);
    const totalMiles = withMiles.reduce((s, p) => s + p.total_miles, 0);
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    set("stat-trips", posts.length);
    set("stat-countries", Object.keys(mapData.countries).length);
    set("stat-continents", Object.keys(mapData.continents).length);
    set("stat-photos", photoCount.toLocaleString());
    set("stat-miles", Math.round(totalMiles).toLocaleString() + "+");
    const milesLabel = document.getElementById("stat-miles-label");
    if (milesLabel) milesLabel.textContent = `Miles, ${withMiles.length} trip${withMiles.length === 1 ? "" : "s"} tracked`;
  }

  function renderRecentTrips(posts, collections, mapData) {
    const grid = document.getElementById("recent-trips-grid");
    if (!grid) return;
    const entries = window.TripEntries.sort(window.TripEntries.build(posts, collections, mapData), "date-desc");
    grid.innerHTML = entries.slice(0, 6).map(tripTileHtml).join("");
  }

  function initMapToggle(mapData, world) {
    const toggleBtn = document.getElementById("toggle-home-map");
    const container = document.getElementById("map-container");
    const instruction = document.getElementById("map-instruction");
    let geoMap = null;

    toggleBtn.addEventListener("click", () => {
      const showing = !container.hidden;
      if (showing) {
        container.hidden = true;
        instruction.hidden = true;
        toggleBtn.textContent = "Show map";
        return;
      }
      container.hidden = false;
      instruction.hidden = false;
      toggleBtn.textContent = "Hide map";
      if (!geoMap) {
        container.innerHTML = '<div id="leaflet-map" class="leaflet-map"></div>';
        geoMap = window.GeoMap.create({
          containerId: "leaflet-map",
          countries: mapData.countries,
          continents: mapData.continents,
          world,
          onSelectCity,
          cityTooltip,
          onLevelChange(state) {
            document.getElementById("map-controls").style.display = state.level === "continent" ? "none" : "block";
          },
        });
        document.getElementById("back-to-world").addEventListener("click", geoMap.showWorld);
        document.querySelector(".theme-toggle")?.addEventListener("click", geoMap.redrawForTheme);
        document.addEventListener("themechange", geoMap.redrawForTheme);
      }
      setTimeout(() => geoMap.map.invalidateSize(), 0);
    });
  }

  function showLoadError() {
    const grid = document.getElementById("recent-trips-grid");
    if (grid) grid.innerHTML = '<div class="load-error"><p>Failed to load the page.</p><button type="button" onclick="location.reload()">Reload</button></div>';
  }

  async function init() {
    let postsData, mapData, galleryData, world;
    try {
      [postsData, mapData, galleryData, world] = await Promise.all([
        loadData("data/posts.json", "__POSTS__"),
        loadData("data/map-data.json", "__MAP_DATA__"),
        loadData("data/gallery.json", "__GALLERY__"),
        loadData("data/world.json", "__WORLD__"),
      ]);
    } catch (err) {
      showLoadError();
      return;
    }
    app.posts = postsData.posts;

    renderStats(postsData.posts, mapData, galleryData.images.length);
    renderRecentTrips(postsData.posts, postsData.collections, mapData);
    initMapToggle(mapData, world);
  }

  if (document.getElementById("map-container")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
