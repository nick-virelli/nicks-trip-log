// Trips index page definition. Content only; chrome comes from page-shell.js.
// Every trip is listed here, with the 18 Study Abroad legs collapsed into one
// entry for their collection so the list isn't flooded with a single semester.
module.exports = {
  file: 'trips.html',
  title: "All trips - Nick's Trip Log",
  description: 'Every trip, sortable and filterable by date, country, continent, and collection.',
  canonicalPath: 'trips.html',
  activeNav: 'trips.html',
  main: `    <div class="page-content">
      <h1>Trips</h1>
      <p class="map-instruction">Sort and filter to find a trip. Study Abroad, Spring 2025 counts as one entry here; open it to see its 18 legs.</p>

      <form class="search-form" action="search.html" role="search">
        <input type="search" name="q" class="trip-search" placeholder="Search every trip: a place, a restaurant, a trail" aria-label="Search all trips">
        <button type="submit" class="map-back">Search</button>
  </form>

      <div class="trips-controls">
        <label>Sort
          <select id="trips-sort">
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="az">A to Z</option>
          </select>
        </label>
        <label>Continent
          <select id="trips-continent">
            <option value="">All continents</option>
          </select>
        </label>
        <label>Country
          <select id="trips-country">
            <option value="">All countries</option>
          </select>
        </label>
        <label>Collection
          <select id="trips-collection">
            <option value="">All trips</option>
            <option value="none">Standalone trips</option>
          </select>
        </label>
      </div>

      <p id="trips-count" class="post-meta"></p>
      <div id="trips-grid" class="trip-grid">
        <p class="post-meta">Loading…</p>
      </div>
    </div>`,
  scripts: ['data/posts.js', 'data/map-data.js', 'data/gallery.js', 'js/render-trip.js', 'js/trip-entries.js', 'js/trips-index.js'],
};
