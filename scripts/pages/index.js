// Home page definition. Only the page's own content lives here; the chrome
// comes from scripts/lib/page-shell.js.
//
// Phase 5: the map is now one way in, collapsed by default, instead of a
// permanent band at the top. The old two-number hero strip is a five-tile
// stats bar. The page opens on this overview, not on any particular trip -
// there is no arbitrary default trip anymore. A short "Recent trips" list
// points to the new trips index (trips.html) for the full, filterable list.
module.exports = {
  file: 'index.html',
  title: "Nick's Trip Log",
  description: 'A log of hiking and travel trips.',
  canonicalPath: '',
  activeNav: 'index.html',
  leaflet: true,
  headExtra: `  <script>
    // Trips have their own pages now. Send old #trip=<id> links there.
    (function () {
      var m = /^#trip=([A-Za-z0-9-]+)$/.exec(location.hash);
      if (m) location.replace("trip/" + m[1] + ".html");
    })();
  </script>`,
  main: `    <section class="stats-bar" aria-label="Trip stats">
      <div class="stat-tile"><span class="stat-value" id="stat-trips">–</span><span class="stat-label">Trips</span></div>
      <div class="stat-tile"><span class="stat-value" id="stat-countries">–</span><span class="stat-label">Countries</span></div>
      <div class="stat-tile"><span class="stat-value" id="stat-continents">–</span><span class="stat-label">Continents</span></div>
      <div class="stat-tile"><span class="stat-value" id="stat-photos">–</span><span class="stat-label">Photos</span></div>
      <div class="stat-tile"><span class="stat-value" id="stat-miles">–</span><span class="stat-label" id="stat-miles-label">Miles</span></div>
    </section>

    <section class="map-section">
      <div class="section-head">
        <h2>Explore by place</h2>
        <button type="button" class="map-back" id="toggle-home-map">Show map</button>
      </div>
      <p class="map-instruction" id="map-instruction" hidden>Click a country to zoom in, then click a city to read the trip.</p>
      <div class="map-controls" id="map-controls" style="display:none;">
        <button type="button" class="map-back" id="back-to-world">&larr; Back to world</button>
      </div>
      <div class="map-container" id="map-container" hidden>
        <p>Loading map…</p>
      </div>
    </section>

    <section class="recent-section">
      <div class="section-head">
        <h2>Recent trips</h2>
        <a href="trips.html">View all trips &rarr;</a>
      </div>
      <div id="recent-trips-grid" class="trip-grid">
        <p class="post-meta">Loading…</p>
      </div>
    </section>`,
  scripts: ['data/posts.js', 'data/map-data.js', 'data/gallery.js', 'data/world.js', 'js/render-trip.js', 'js/trip-entries.js', 'js/map.js'],
};
