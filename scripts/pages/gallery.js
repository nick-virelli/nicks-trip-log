// Gallery page definition. Only the page's own content lives here; the chrome
// comes from scripts/lib/page-shell.js.
module.exports = {
  file: 'gallery.html',
  title: "Gallery - Nick's Trip Log",
  description: 'Every photo from every trip, searchable and browsable by place.',
  canonicalPath: 'gallery.html',
  activeNav: 'gallery.html',
  leaflet: true,
  lightbox: true,
  main: `    <div class="page-content">
      <h1>Gallery</h1>
      <p class="map-instruction">Every photo from every trip, newest first. Search by name, city, country, or date, filter by year, country, or trip, or browse by map.</p>

      <div class="gallery-controls">
        <input type="search" id="gallery-search" class="trip-search" placeholder="Search by trip, city, country, or date">
        <button type="button" id="toggle-gallery-map" class="map-back">Browse by map</button>
      </div>

      <div class="trips-controls gallery-filters">
        <label>Year
          <select id="gallery-year">
            <option value="">All years</option>
          </select>
        </label>
        <label>Country
          <select id="gallery-country">
            <option value="">All countries</option>
          </select>
        </label>
        <label>Trip
          <select id="gallery-trip">
            <option value="">All trips</option>
          </select>
        </label>
      </div>

      <div id="gallery-map-section" class="map-container gallery-map-section" style="display:none;">
        <div class="map-controls" id="gallery-map-controls" style="display:none;">
          <button type="button" class="map-back" id="gallery-back-to-world">&larr; Back to world</button>
        </div>
        <div id="gallery-leaflet-map" class="leaflet-map"></div>
      </div>

      <div id="gallery-filter-chip" class="gallery-filter-chip" style="display:none;"></div>
      <p id="gallery-count" class="post-meta"></p>
      <div id="gallery-grid" class="gallery-grid"></div>
    </div>`,
  scripts: ['data/gallery.js', 'data/map-data.js', 'data/world.js', 'js/lightbox.js', 'js/render-trip.js', 'js/gallery.js'],
};
