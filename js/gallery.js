(function () {
  const isFile = window.location.protocol === "file:";
  const { esc, fmtDate } = window.TripRender;

  async function loadData(jsonPath, globalVar) {
    if (isFile) {
      if (window[globalVar]) return window[globalVar];
      throw new Error(`Missing inline data ${globalVar} for file:// mode`);
    }
    const res = await fetch(jsonPath);
    return res.json();
  }

  const app = {
    images: [],
    query: "",
    locationFilter: null,
    currentList: [],
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

    // The grid shows thumbnails; the lightbox opens the full-size photo.
    gridEl.innerHTML = list
      .map(
        (img, i) => `
      <button type="button" class="gallery-item" data-index="${i}">
        <img src="${esc(img.thumb || img.src)}" alt="${esc(altTextFor(img))}" loading="lazy">
        <span class="caption">${esc(img.tripTitle)}${fmtDate(img.date_start, img.date_precision) ? " - " + esc(fmtDate(img.date_start, img.date_precision)) : ""}</span>
      </button>`
      )
      .join("");

    gridEl.querySelectorAll(".gallery-item").forEach((el) => {
      el.addEventListener("click", () => {
        const i = parseInt(el.dataset.index, 10);
        window.TripLightbox.open(
          list.map((img) => ({ src: img.src, caption: captionFor(img) })),
          i
        );
      });
    });
  }

  // A screen reader gets the trip, the specific place, and the date, not just
  // the trip title repeated on every one of its photos.
  function altTextFor(img) {
    const date = fmtDate(img.date_start, img.date_precision);
    const where = img.locations.length ? img.locations.join(", ") : img.tripTitle;
    return `${img.tripTitle}, ${where}${date ? ", " + date : ""}`;
  }

  function captionFor(img) {
    const date = fmtDate(img.date_start, img.date_precision);
    return `${img.tripTitle}${img.locations.length ? " - " + img.locations.join(", ") : ""}${date ? " - " + date : ""}`;
  }

  function initSearch() {
    const input = document.getElementById("gallery-search");
    input.addEventListener("input", () => {
      app.query = input.value;
      renderGrid();
    });
  }

  // --- Map (browse-by-place), lazy-initialized on first reveal ---

  function onSelectCity(city) {
    app.locationFilter = city.name;
    renderChip();
    renderGrid();
    document.getElementById("gallery-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function initMapToggle(mapData, world) {
    const toggleBtn = document.getElementById("toggle-gallery-map");
    const section = document.getElementById("gallery-map-section");
    let geoMap = null;

    toggleBtn.addEventListener("click", () => {
      const showing = section.style.display !== "none";
      if (showing) {
        section.style.display = "none";
        toggleBtn.textContent = "Browse by map";
        return;
      }
      section.style.display = "block";
      toggleBtn.textContent = "Hide map";
      if (!geoMap) {
        geoMap = window.GeoMap.create({
          containerId: "gallery-leaflet-map",
          countries: mapData.countries,
          continents: mapData.continents,
          world,
          onSelectCity,
          cityTooltip: (city) => esc(city.name),
          onLevelChange(state) {
            document.getElementById("gallery-map-controls").style.display = state.level === "continent" ? "none" : "block";
          },
        });
        document.getElementById("gallery-back-to-world").addEventListener("click", geoMap.showWorld);
        document.querySelector(".theme-toggle")?.addEventListener("click", geoMap.redrawForTheme);
        document.addEventListener("themechange", geoMap.redrawForTheme);
      }
      setTimeout(() => geoMap.map.invalidateSize(), 0);
    });
  }

  function showLoadError() {
    const grid = document.getElementById("gallery-grid");
    grid.innerHTML = '<div class="load-error"><p>Failed to load the page.</p><a href="index.html">Back to home</a></div>';
    document.getElementById("gallery-count").textContent = "";
  }

  async function init() {
    let galleryData, mapData, world;
    try {
      [galleryData, mapData, world] = await Promise.all([
        loadData("data/gallery.json", "__GALLERY__"),
        loadData("data/map-data.json", "__MAP_DATA__"),
        loadData("data/world.json", "__WORLD__"),
      ]);
    } catch (err) {
      showLoadError();
      return;
    }
    app.images = galleryData.images;

    renderGrid();
    initSearch();
    initMapToggle(mapData, world);
  }

  if (document.getElementById("gallery-grid")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
