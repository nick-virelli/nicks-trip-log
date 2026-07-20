(function () {
  const isFile = window.location.protocol === "file:";

  async function loadData(jsonPath, globalVar) {
    if (isFile) {
      if (window[globalVar]) return window[globalVar];
      throw new Error(`Missing inline data ${globalVar} for file:// mode`);
    }
    const res = await fetch(jsonPath);
    return res.json();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function fmtDate(d, precision) {
    if (!d) return "";
    const parts = d.split("-").map(Number);
    const dt = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    if (precision === "month") return dt.toLocaleDateString(undefined, { year: "numeric", month: "long" });
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtDateRange(p) {
    if (!p.date_start) return "";
    if (!p.date_end || p.date_end === p.date_start) return fmtDate(p.date_start, p.date_precision);
    return `${fmtDate(p.date_start, p.date_precision)} - ${fmtDate(p.date_end, p.date_precision)}`;
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  const app = {
    posts: [],
    countries: {},
    map: null,
    markerLayer: null,
    tileLayer: null,
    level: "world", // world | country
    activeCountry: null,
  };

  function tileUrlFor(theme) {
    return theme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  function setTileLayer() {
    const url = tileUrlFor(currentTheme());
    if (app.tileLayer) app.map.removeLayer(app.tileLayer);
    app.tileLayer = L.tileLayer(url, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(app.map);
  }

  function countryCentroid(country) {
    const cities = [];
    for (const regionKey in country.regions) {
      for (const c of country.regions[regionKey].cities) cities.push(c);
    }
    const lat = cities.reduce((s, c) => s + c.lat, 0) / cities.length;
    const lon = cities.reduce((s, c) => s + c.lon, 0) / cities.length;
    return [lat, lon];
  }

  function clearMarkers() {
    if (app.markerLayer) app.map.removeLayer(app.markerLayer);
    app.markerLayer = L.layerGroup().addTo(app.map);
  }

  function showWorld() {
    app.level = "world";
    app.activeCountry = null;
    clearMarkers();
    document.getElementById("map-controls").style.display = "none";

    const allBounds = [];
    for (const key in app.countries) {
      const country = app.countries[key];
      const [lat, lon] = countryCentroid(country);
      const postCount = app.posts.filter((p) => p.country === key).length;
      const marker = L.circleMarker([lat, lon], {
        radius: 9,
        color: getComputedColor(),
        fillColor: getComputedColor(),
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(app.markerLayer);
      marker.bindTooltip(`${esc(country.label)} (${postCount})`, { direction: "top", className: "trip-pin-label" });
      marker.on("click", () => showCountry(key));
      allBounds.push([lat, lon]);
      if (country.bounds) allBounds.push(country.bounds[0], country.bounds[1]);
    }
    if (allBounds.length) app.map.fitBounds(allBounds, { padding: [30, 30] });
  }

  function getComputedColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2d5a4a";
  }

  function showCountry(countryKey) {
    const country = app.countries[countryKey];
    if (!country) return;
    app.level = "country";
    app.activeCountry = countryKey;
    clearMarkers();
    document.getElementById("map-controls").style.display = "block";

    // Every place a trip touched gets its own pin (no single "main" pin). When two
    // different trips touch the exact same place, that one pin lists both - click
    // opens a small chooser instead of guessing or dumping every article at once.
    const bounds = [];
    for (const regionKey in country.regions) {
      const region = country.regions[regionKey];
      for (const city of region.cities) {
        const marker = L.circleMarker([city.lat, city.lon], {
          radius: 8,
          color: getComputedColor(),
          fillColor: getComputedColor(),
          fillOpacity: 0.85,
          weight: 2,
        }).addTo(app.markerLayer);

        if (city.tripIds.length === 1) {
          const post = app.posts.find((p) => p.id === city.tripIds[0]);
          marker.bindTooltip(`${esc(city.name)}${post ? " - " + esc(post.title) : ""}`, { direction: "top", className: "trip-pin-label" });
          marker.on("click", () => showTrip(city.tripIds[0]));
        } else {
          marker.bindTooltip(`${esc(city.name)} (${city.tripIds.length} trips)`, { direction: "top", className: "trip-pin-label" });
          marker.bindPopup(chooserPopupHtml(city));
          marker.on("popupopen", (e) => wireChooserPopup(e.popup, city));
        }
        bounds.push([city.lat, city.lon]);
      }
    }
    if (country.bounds) {
      app.map.fitBounds(country.bounds, { padding: [20, 20] });
    } else if (bounds.length) {
      app.map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  function chooserPopupHtml(city) {
    const items = city.tripIds
      .map((id) => {
        const post = app.posts.find((p) => p.id === id);
        if (!post) return "";
        return `<a href="#" data-trip="${esc(id)}" style="display:block;padding:0.3rem 0;">${esc(post.title)}<br><span style="font-size:0.85em;color:var(--text-muted);">${esc(fmtDateRange(post))}</span></a>`;
      })
      .join('<hr style="margin:0.3rem 0;border:none;border-top:1px solid var(--border);">');
    return `<div class="map-popup"><strong>${esc(city.name)}</strong><hr style="margin:0.4rem 0;border:none;border-top:1px solid var(--border);">${items}</div>`;
  }

  function wireChooserPopup(popup, city) {
    const el = popup.getElement();
    if (!el) return;
    el.querySelectorAll("a[data-trip]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        showTrip(a.dataset.trip);
        popup.close();
      });
    });
  }

  function showTrip(tripId) {
    const post = app.posts.find((p) => p.id === tripId);
    renderPosts(post ? [post] : []);
    document.getElementById("post-display").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderTripHtml(p) {
    const days = p.days
      .map(
        (d) => `
      <div class="trip-day">
        <h3>${esc(d.label)}</h3>
        ${d.body_html}
      </div>`
      )
      .join("");
    return `
      <h2>${esc(p.title)}</h2>
      <p class="post-meta">${esc(p.location)}${fmtDateRange(p) ? " &middot; " + fmtDateRange(p) : ""}${
      p.total_miles ? ` &middot; <span class="post-miles">${p.total_miles} miles</span>` : ""
    }</p>
      ${days}
    `;
  }

  function renderPosts(posts) {
    const el = document.getElementById("post-display");
    if (!posts.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = posts.map(renderTripHtml).join('<hr style="margin:2.5rem 0;border:none;border-top:1px solid var(--border);">');
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
        <a class="hero-post-title" href="#" data-trip="${esc(latest.id)}">${esc(latest.title)}</a>
        <span class="hero-post-date">${esc(fmtDateRange(latest))}</span>`;
      latestEl.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        renderPosts([latest]);
        document.getElementById("post-display").scrollIntoView({ behavior: "smooth" });
      });
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
        <a href="#" data-trip="${esc(p.id)}">${esc(p.title)}</a>
        <div class="meta">${esc(p.location)}${fmtDateRange(p) ? " &middot; " + fmtDateRange(p) : ""}</div>
      </div>`
      )
      .join("");
    listEl.querySelectorAll("a[data-trip]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const post = posts.find((p) => p.id === a.dataset.trip);
        if (post) {
          renderPosts([post]);
          document.getElementById("post-display").scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  }

  function initTripSearch() {
    const input = document.getElementById("trip-search");
    if (!input) return;
    input.addEventListener("input", () => renderRecentList(app.posts, input.value));
  }

  async function init() {
    const [postsData, mapData] = await Promise.all([
      loadData("data/posts.json", "__POSTS__"),
      loadData("data/map-data.json", "__MAP_DATA__"),
    ]);
    app.posts = postsData.posts;
    app.countries = mapData.countries;

    renderHero(app.posts);
    renderRecentList(app.posts);
    initTripSearch();

    const container = document.getElementById("map-container");
    container.innerHTML = '<div id="leaflet-map" class="leaflet-map"></div>';
    app.map = L.map("leaflet-map", { scrollWheelZoom: false });
    setTileLayer();
    showWorld();

    document.getElementById("back-to-world").addEventListener("click", showWorld);

    // keep tiles + marker colors in sync with theme toggle
    document.querySelector(".theme-toggle")?.addEventListener("click", () => {
      setTimeout(() => {
        setTileLayer();
        if (app.level === "world") showWorld();
        else showCountry(app.activeCountry);
      }, 0);
    });
  }

  if (document.getElementById("map-container")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
