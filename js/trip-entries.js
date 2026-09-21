// Builds the unified list of "things to show as a trip tile": the 8 standalone
// trips plus one entry per collection, with the collection's members collapsed
// into a single row so a semester of legs doesn't flood a list. Used by the
// home page's Recent Trips and by the trips index (js/trips-index.js), so
// both group and sort the same way. Loads as window.TripEntries in the browser
// and as a CommonJS module in Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TripEntries = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function build(posts, collections, mapData) {
    const continentOf = (country) => (mapData.countries[country] ? mapData.countries[country].continent : null);
    const countryLabel = (country) => (mapData.countries[country] ? mapData.countries[country].label : country);

    const standalone = posts
      .filter((p) => !p.collectionId)
      .map((p) => ({
        type: "trip",
        href: `trip/${p.id}.html`,
        title: p.title,
        meta: `${p.location}${p.total_miles ? ` &middot; ${p.total_miles} miles hiked` : ""}`,
        date_start: p.date_start,
        date_end: p.date_end,
        date_precision: p.date_precision,
        cover: p.cover,
        countries: [p.country],
        continents: [continentOf(p.country)].filter(Boolean),
      }));

    const collectionEntries = (collections || []).map((c) => {
      const members = c.tripIds.map((id) => posts.find((p) => p.id === id)).filter(Boolean);
      const cover = (members.find((m) => m.cover) || {}).cover || null;
      const countries = [...new Set(members.map((m) => m.country))];
      const continents = [...new Set(countries.map(continentOf).filter(Boolean))];
      return {
        type: "collection",
        href: `collections/${c.id}.html`,
        title: c.title,
        meta: `${members.length} trips &middot; ${countries.map(countryLabel).join(", ")}`,
        date_start: c.date_start,
        date_end: c.date_end,
        date_precision: "day",
        cover,
        countries,
        continents,
      };
    });

    return [...standalone, ...collectionEntries];
  }

  // "date-desc" (default) | "date-asc" | "az"
  function sort(entries, mode) {
    if (mode === "az") return [...entries].sort((a, b) => a.title.localeCompare(b.title));
    const withDate = entries.filter((e) => e.date_start);
    const withoutDate = entries.filter((e) => !e.date_start);
    withDate.sort((a, b) => (a.date_start < b.date_start ? 1 : -1));
    if (mode === "date-asc") withDate.reverse();
    return [...withDate, ...withoutDate];
  }

  return { build, sort };
});
