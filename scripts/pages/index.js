// Home page definition. Only the page's own content lives here; the chrome
// comes from scripts/lib/page-shell.js.
module.exports = {
  file: 'index.html',
  title: "Nick's Trip Log",
  description: 'A log of hiking and travel trips.',
  canonicalPath: '',
  activeNav: 'index.html',
  leaflet: true,
  lightbox: true,
  activeTripIndicator: true,
  headExtra: `  <script>
    // Trips have their own pages now. Send old #trip=<id> links there.
    (function () {
      var m = /^#trip=([A-Za-z0-9-]+)$/.exec(location.hash);
      if (m) location.replace("trip/" + m[1] + ".html");
    })();
  </script>`,
  beforeMain: `  <div class="hero-strip">
    <div class="hero-strip-inner">
      <div class="hero-stat">
        <span class="hero-count">0</span>
        <span class="hero-stat-label">Loading…</span>
      </div>
      <div class="hero-latest" id="hero-latest">
        <span class="hero-latest-label">Latest trip</span>
        <span class="hero-post-loading">Loading...</span>
      </div>
    </div>
  </div>
`,
  main: `    <div class="home-layout">
      <div class="home-main">
        <section class="map-section">
          <h2>Explore by place</h2>
          <p class="map-instruction">Click a pin to zoom in, then click a city to read the trip.</p>
          <div class="map-controls" id="map-controls" style="display:none;">
            <button type="button" class="map-back" id="back-to-world">&larr; Back to world</button>
          </div>
          <div class="map-container" id="map-container">
            <p>Loading map…</p>
          </div>
        </section>

        <article class="post-display" id="post-display" aria-live="polite"></article>
      </div>

      <aside class="special-sidebar" aria-label="Recent trips">
        <h2 class="special-title">Recent Trips</h2>
        <input type="search" id="trip-search" class="trip-search" placeholder="Search by name, place, or year">
        <div id="recent-posts-list" class="special-list">
          <p class="post-meta">Loading…</p>
        </div>
      </aside>
    </div>`,
  scripts: ['data/posts.js', 'data/map-data.js', 'js/lightbox.js', 'js/render-trip.js', 'js/trip-ui.js', 'js/map.js'],
};
