// Search page definition. Content only; chrome comes from page-shell.js.
// This is the single place trips are searched. The home and trips pages have a
// small form that sends you here, so there is one search with one behavior.
module.exports = {
  file: 'search.html',
  title: "Search - Nick's Trip Log",
  description: 'Search every trip for a place, restaurant, trail, or anything else in the trip notes.',
  canonicalPath: 'search.html',
  main: `    <div class="page-content">
      <h1>Search</h1>
      <p class="map-instruction">Finds trip titles, places, cities, and anything written in the trip notes. Every word you type has to appear as typed.</p>
      <form class="search-form" action="search.html" role="search">
        <input type="search" id="search-input" name="q" class="trip-search" placeholder="Try a restaurant, a trail, or a city" autocomplete="off">
      </form>
      <p id="search-summary" class="post-meta" aria-live="polite"></p>
      <div id="search-results"></div>
    </div>`,
  scripts: ['data/search-index.js', 'js/render-trip.js', 'js/search.js', 'js/search-page.js'],
};
