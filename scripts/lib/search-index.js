// Builds data/search-index.json: one entry per trip with the plain text of every
// day, so a literal search for a restaurant, trail, or city name can hit. Text is
// derived from body_html (the same rendered, corrected text the page shows), with
// carousel chrome dropped and the three escapes render.js emits decoded back, so
// "&" is searchable as "&". Nothing here rewrites Nick's words.

function htmlToText(html) {
  return html
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/g, '')
    .replace(/<span class="carousel-counter">[\s\S]*?<\/span>/g, '')
    .replace(/<\/li>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// posts: the final sorted post list. pinIndex: Map of "country|name" -> pin, from
// which each trip's city names are taken so map-data stays the source of truth.
function buildSearchIndex(posts, pinIndex) {
  const entries = posts.map((p) => ({
    id: p.id,
    title: p.title,
    location: p.location,
    collectionId: p.collectionId,
    date_start: p.date_start,
    date_end: p.date_end,
    date_precision: p.date_precision,
    cities: [...pinIndex.values()].filter((pin) => pin.tripIds.includes(p.id)).map((pin) => pin.name),
    days: p.days.map((d) => ({ label: d.label, text: htmlToText(d.body_html) })),
  }));
  return { entries };
}

module.exports = { buildSearchIndex, htmlToText };
