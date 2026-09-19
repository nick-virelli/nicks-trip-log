// All-trips index: renders window.TripEntries as a filterable, sortable grid
// of window.TripRender.tripTileHtml cards.
(function () {
  const isFile = window.location.protocol === "file:";
  const { esc } = window.TripRender;

  async function loadData(jsonPath, globalVar) {
    if (isFile) {
      if (window[globalVar]) return window[globalVar];
      throw new Error(`Missing inline data ${globalVar} for file:// mode`);
    }
    const res = await fetch(jsonPath);
    return res.json();
  }

  function populateSelect(select, values, placeholder) {
    const opts = [`<option value="">${esc(placeholder)}</option>`];
    for (const [value, label] of values) opts.push(`<option value="${esc(value)}">${esc(label)}</option>`);
    select.innerHTML = opts.join("");
  }

  function init() {
    Promise.all([
      loadData("data/posts.json", "__POSTS__"),
      loadData("data/map-data.json", "__MAP_DATA__"),
      loadData("data/gallery.json", "__GALLERY__"),
    ])
      .then(([postsData, mapData]) => {
        const entries = window.TripEntries.build(postsData.posts, postsData.collections, mapData);

        const continentSelect = document.getElementById("trips-continent");
        const countrySelect = document.getElementById("trips-country");
        const collectionSelect = document.getElementById("trips-collection");
        const sortSelect = document.getElementById("trips-sort");
        const grid = document.getElementById("trips-grid");
        const countEl = document.getElementById("trips-count");

        const continentEntries = Object.entries(mapData.continents)
          .filter(([key]) => Object.values(mapData.countries).some((c) => c.continent === key))
          .map(([key, c]) => [key, c.label])
          .sort((a, b) => a[1].localeCompare(b[1]));
        populateSelect(continentSelect, continentEntries, "All continents");

        const countryEntries = Object.entries(mapData.countries)
          .map(([key, c]) => [key, c.label])
          .sort((a, b) => a[1].localeCompare(b[1]));
        populateSelect(countrySelect, countryEntries, "All countries");

        function apply() {
          const continent = continentSelect.value;
          const country = countrySelect.value;
          const collection = collectionSelect.value;
          let list = entries.filter((e) => {
            if (continent && !e.continents.includes(continent)) return false;
            if (country && !e.countries.includes(country)) return false;
            if (collection === "none" && e.type === "collection") return false;
            return true;
          });
          list = window.TripEntries.sort(list, sortSelect.value);
          grid.innerHTML = list.map(window.TripRender.tripTileHtml).join("");
          countEl.textContent = `${list.length} ${list.length === 1 ? "entry" : "entries"} (${postsData.posts.length} trips total)`;
        }

        continentSelect.addEventListener("change", apply);
        countrySelect.addEventListener("change", apply);
        collectionSelect.addEventListener("change", apply);
        sortSelect.addEventListener("change", apply);
        apply();
      })
      .catch(() => {
        document.getElementById("trips-grid").innerHTML = '<div class="load-error"><p>Failed to load the page.</p><a href="index.html">Back to home</a></div>';
      });
  }

  if (document.getElementById("trips-grid")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
