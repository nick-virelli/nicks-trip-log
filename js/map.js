(function () {
  const isFile = window.location.protocol === "file:";
  // Shared with the static trip pages (js/render-trip.js) and the map (js/geo-map.js).
  const { esc, fmtDateRange } = window.TripRender;

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

  function renderHero(posts) {
    const totalMiles = posts.reduce((s, p) => s + (p.total_miles || 0), 0);
    const count = posts.length;
    const heroCount = document.querySelector(".hero-count");
    const heroLabel = document.querySelector(".hero-stat-label");
    if (heroCount) heroCount.textContent = Math.round(totalMiles).toLocaleString() + "+";
    if (heroLabel) heroLabel.textContent = `miles hiked (that we tracked) · ${count} trips`;

    const withDates = posts.filter((p) => p.date_start).sort((a, b) => (a.date_start < b.date_start ? 1 : -1));
    const latest = withDates[0] || posts[0];
    const latestEl = document.getElementById("hero-latest");
    if (latestEl && latest) {
      latestEl.innerHTML = `
        <span class="hero-latest-label">Latest trip</span>
        <a class="hero-post-title" href="trip/${esc(latest.id)}.html">${esc(latest.title)}</a>
        <span class="hero-post-date">${esc(fmtDateRange(latest))}</span>`;
    }
  }

  function renderRecentList(posts, query) {
    const listEl = document.getElementById("recent-posts-list");
    if (!listEl) return;
    const q = (query || "").trim().toLowerCase();
    const filtered = q
      ? posts.filter((p) => `${p.title} ${p.location} ${fmtDateRange(p)}`.toLowerCase().includes(q))
      : posts;
    const withDates = filtered.filter((p) => p.date_start).sort((a, b) => (a.date_start < b.date_start ? 1 : -1));
    const withoutDates = filtered.filter((p) => !p.date_start);
    const ordered = [...withDates, ...withoutDates];

    if (!ordered.length) {
      listEl.innerHTML = `<p class="post-meta">No trips match "${esc(query)}".</p>`;
      return;
    }

    listEl.innerHTML = ordered
      .map(
        (p) => `
      <div class="special-item">
        <a href="trip/${esc(p.id)}.html">${esc(p.title)}</a>
        <div class="meta">${esc(p.location)}${fmtDateRange(p) ? " &middot; " + fmtDateRange(p) : ""}</div>
      </div>`
      )
      .join("");
  }

  function initTripSearch() {
    const input = document.getElementById("trip-search");
    if (!input) return;
    input.addEventListener("input", () => renderRecentList(app.posts, input.value));
  }

  function showLoadError() {
    const container = document.getElementById("map-container");
    if (container) {
      container.innerHTML = '<div class="load-error"><p>Failed to load the page.</p><button type="button" onclick="location.reload()">Reload</button></div>';
    }
    const sidebar = document.getElementById("recent-posts-list");
    if (sidebar) sidebar.innerHTML = "";
    const heroLabel = document.querySelector(".hero-stat-label");
    if (heroLabel) heroLabel.textContent = "";
  }

  async function init() {
    let postsData, mapData, world;
    try {
      [postsData, mapData, world] = await Promise.all([
        loadData("data/posts.json", "__POSTS__"),
        loadData("data/map-data.json", "__MAP_DATA__"),
        loadData("data/world.json", "__WORLD__"),
      ]);
    } catch (err) {
      showLoadError();
      return;
    }
    app.posts = postsData.posts;

    renderHero(app.posts);
    renderRecentList(app.posts);
    initTripSearch();

    const container = document.getElementById("map-container");
    container.innerHTML = '<div id="leaflet-map" class="leaflet-map"></div>';

    const geoMap = window.GeoMap.create({
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

    // recolor the map when the theme toggle or the palette switcher changes tokens
    document.querySelector(".theme-toggle")?.addEventListener("click", geoMap.redrawForTheme);
    document.addEventListener("themechange", geoMap.redrawForTheme);

    window.TripUI.initActiveTripIndicator();
  }

  if (document.getElementById("map-container")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
