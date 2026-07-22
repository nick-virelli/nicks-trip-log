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

  function getComputedColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2d5a4a";
  }

  const app = {
    images: [],
    countries: {},
    query: "",
    locationFilter: null,
    map: null,
    markerLayer: null,
    tileLayer: null,
    level: "world",
    activeCountry: null,
    currentList: [],
    lightboxIndex: 0,
  };

  function matchesQuery(img, q) {
    if (!q) return true;
    const haystack = `${img.tripTitle} ${img.locations.join(" ")} ${fmtDate(img.date_start, img.date_precision)}`.toLowerCase();
    return haystack.includes(q);
  }

  function filteredImages() {
    const q = app.query.trim().toLowerCase();
    return app.images.filter((img) => matchesQuery(img, q) && (!app.locationFilter || img.locations.includes(app.locationFilter)));
  }

  function renderChip() {
    const chip = document.getElementById("gallery-filter-chip");
    if (!app.locationFilter) {
      chip.style.display = "none";
      chip.innerHTML = "";
      return;
    }
    chip.style.display = "inline-flex";
    chip.innerHTML = `Showing: <strong>${esc(app.locationFilter)}</strong> <button type="button" aria-label="Clear filter">&times;</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      app.locationFilter = null;
      renderChip();
      renderGrid();
    });
  }

  function renderGrid() {
    const list = filteredImages();
    app.currentList = list;
    const countEl = document.getElementById("gallery-count");
    const gridEl = document.getElementById("gallery-grid");
    countEl.textContent = `${list.length} photo${list.length === 1 ? "" : "s"}`;

    gridEl.innerHTML = list
      .map(
        (img, i) => `
      <button type="button" class="gallery-item" data-index="${i}">
        <img src="${esc(img.src)}" alt="${esc(img.tripTitle)}${img.locations.length ? ", " + esc(img.locations.join(", ")) : ""}" loading="lazy">
        <span class="caption">${esc(img.tripTitle)}${fmtDate(img.date_start, img.date_precision) ? " - " + esc(fmtDate(img.date_start, img.date_precision)) : ""}</span>
      </button>`
      )
      .join("");

    gridEl.querySelectorAll(".gallery-item").forEach((el) => {
      el.addEventListener("click", () => openLightbox(parseInt(el.dataset.index, 10)));
    });
  }

  // --- Lightbox: enlarge in place, arrow through the current filtered set ---

  function captionFor(img) {
    const date = fmtDate(img.date_start, img.date_precision);
    return `${img.tripTitle}${img.locations.length ? " - " + img.locations.join(", ") : ""}${date ? " - " + date : ""}`;
  }

  function absoluteUrl(relativeSrc) {
    return new URL(relativeSrc, window.location.href).href;
  }

  function updateLightbox() {
    const img = app.currentList[app.lightboxIndex];
    if (!img) return;
    const imgEl = document.getElementById("lightbox-img");
    imgEl.src = img.src;
    imgEl.alt = captionFor(img);
    document.getElementById("lightbox-caption").textContent = captionFor(img);
    const filename = img.src.split("/").pop();
    const dl = document.getElementById("lightbox-download");
    dl.href = img.src;
    dl.download = filename;
  }

  function openLightbox(index) {
    app.lightboxIndex = index;
    updateLightbox();
    document.getElementById("lightbox").style.display = "flex";
  }

  function closeLightbox() {
    document.getElementById("lightbox").style.display = "none";
  }

  function stepLightbox(delta) {
    const n = app.currentList.length;
    app.lightboxIndex = (app.lightboxIndex + delta + n) % n;
    updateLightbox();
  }

  async function shareLightbox() {
    const img = app.currentList[app.lightboxIndex];
    const url = absoluteUrl(img.src);
    if (navigator.share) {
      try {
        await navigator.share({ title: captionFor(img), url });
        return;
      } catch (_) {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById("lightbox-share");
      const original = btn.textContent;
      btn.textContent = "Link copied";
      setTimeout(() => (btn.textContent = original), 1500);
    } catch (_) {
      window.prompt("Copy this link:", url);
    }
  }

  function printLightbox() {
    const img = app.currentList[app.lightboxIndex];
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<!doctype html><html><head><title>${esc(captionFor(img))}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;}</style></head><body><img src="${esc(
        absoluteUrl(img.src)
      )}"></body></html>`
    );
    win.document.close();
    win.onload = () => {
      win.focus();
      win.print();
    };
    const printImg = win.document.querySelector("img");
    if (printImg) printImg.onload = () => win.print();
  }

  function initLightbox() {
    document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
    document.getElementById("lightbox-prev").addEventListener("click", () => stepLightbox(-1));
    document.getElementById("lightbox-next").addEventListener("click", () => stepLightbox(1));
    document.getElementById("lightbox-share").addEventListener("click", shareLightbox);
    document.getElementById("lightbox-print").addEventListener("click", printLightbox);
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (document.getElementById("lightbox").style.display === "none") return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") stepLightbox(-1);
      if (e.key === "ArrowRight") stepLightbox(1);
    });
  }

  function initSearch() {
    const input = document.getElementById("gallery-search");
    input.addEventListener("input", () => {
      app.query = input.value;
      renderGrid();
    });
  }

  // --- Map (browse-by-place), lazy-initialized on first reveal ---

  function countryCentroid(country) {
    const cities = [];
    for (const regionKey in country.regions) {
      for (const c of country.regions[regionKey].cities) cities.push(c);
    }
    const lat = cities.reduce((s, c) => s + c.lat, 0) / cities.length;
    const lon = cities.reduce((s, c) => s + c.lon, 0) / cities.length;
    return [lat, lon];
  }

  function tileUrlFor(theme) {
    return theme === "dark"
      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }

  function setTileLayer() {
    const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    if (app.tileLayer) app.map.removeLayer(app.tileLayer);
    app.tileLayer = L.tileLayer(tileUrlFor(theme), {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(app.map);
  }

  function clearMarkers() {
    if (app.markerLayer) app.map.removeLayer(app.markerLayer);
    app.markerLayer = L.layerGroup().addTo(app.map);
  }

  function showWorld() {
    app.level = "world";
    app.activeCountry = null;
    clearMarkers();
    document.getElementById("gallery-map-controls").style.display = "none";
    const bounds = [];
    for (const key in app.countries) {
      const country = app.countries[key];
      const [lat, lon] = countryCentroid(country);
      const marker = L.circleMarker([lat, lon], { radius: 9, color: getComputedColor(), fillColor: getComputedColor(), fillOpacity: 0.9, weight: 2 }).addTo(
        app.markerLayer
      );
      marker.bindTooltip(esc(country.label), { direction: "top", className: "trip-pin-label" });
      marker.on("click", () => showCountry(key));
      bounds.push([lat, lon]);
      if (country.bounds) bounds.push(country.bounds[0], country.bounds[1]);
    }
    if (bounds.length) app.map.fitBounds(bounds, { padding: [30, 30] });
  }

  function showCountry(countryKey) {
    const country = app.countries[countryKey];
    if (!country) return;
    app.level = "country";
    app.activeCountry = countryKey;
    clearMarkers();
    document.getElementById("gallery-map-controls").style.display = "block";
    const bounds = [];
    for (const regionKey in country.regions) {
      for (const city of country.regions[regionKey].cities) {
        const marker = L.circleMarker([city.lat, city.lon], {
          radius: 8,
          color: getComputedColor(),
          fillColor: getComputedColor(),
          fillOpacity: 0.85,
          weight: 2,
        }).addTo(app.markerLayer);
        marker.bindTooltip(esc(city.name), { direction: "top", className: "trip-pin-label" });
        marker.on("click", () => {
          app.locationFilter = city.name;
          renderChip();
          renderGrid();
          document.getElementById("gallery-grid").scrollIntoView({ behavior: "smooth", block: "start" });
        });
        bounds.push([city.lat, city.lon]);
      }
    }
    if (country.bounds) app.map.fitBounds(country.bounds, { padding: [20, 20] });
    else if (bounds.length) app.map.fitBounds(bounds, { padding: [40, 40] });
  }

  function initMapToggle() {
    const toggleBtn = document.getElementById("toggle-gallery-map");
    const section = document.getElementById("gallery-map-section");
    let initialized = false;

    toggleBtn.addEventListener("click", () => {
      const showing = section.style.display !== "none";
      if (showing) {
        section.style.display = "none";
        toggleBtn.textContent = "Browse by map";
        return;
      }
      section.style.display = "block";
      toggleBtn.textContent = "Hide map";
      if (!initialized) {
        initialized = true;
        app.map = L.map("gallery-leaflet-map", { scrollWheelZoom: false });
        setTileLayer();
        showWorld();
        document.getElementById("gallery-back-to-world").addEventListener("click", showWorld);
        document.querySelector(".theme-toggle")?.addEventListener("click", () => {
          setTimeout(() => {
            setTileLayer();
            if (app.level === "world") showWorld();
            else showCountry(app.activeCountry);
          }, 0);
        });
      }
      setTimeout(() => app.map.invalidateSize(), 0);
    });
  }

  function showLoadError() {
    const grid = document.getElementById("gallery-grid");
    grid.innerHTML = '<div class="load-error"><p>Failed to load the page.</p><a href="index.html">Back to home</a></div>';
    document.getElementById("gallery-count").textContent = "";
  }

  async function init() {
    let galleryData, mapData;
    try {
      [galleryData, mapData] = await Promise.all([
        loadData("data/gallery.json", "__GALLERY__"),
        loadData("data/map-data.json", "__MAP_DATA__"),
      ]);
    } catch (err) {
      showLoadError();
      return;
    }
    app.images = galleryData.images;
    app.countries = mapData.countries;

    renderGrid();
    initSearch();
    initMapToggle();
    initLightbox();
  }

  if (document.getElementById("gallery-grid")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
