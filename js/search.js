// Full text search over data/search-index.json. Literal matching only: case
// is ignored and every word you type must appear, as typed, in the same line
// of a day (or in a trip's title, place, or city names). No fuzzy matching, no
// guessing at meaning. Loads as window.TripSearch in the browser and as a
// CommonJS module in Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TripSearch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function words(query) {
    return String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function hasAll(text, ws) {
    const t = String(text).toLowerCase();
    return ws.every((w) => t.includes(w));
  }

  // Returns matching trips, best first. Each result lists the days that matched
  // and the lines within them that matched.
  function search(entries, query) {
    const ws = words(query);
    if (!ws.length) return [];
    const results = [];
    for (const e of entries) {
      const nameHit = hasAll([e.title, e.location, ...(e.cities || [])].join(" | "), ws);
      const days = [];
      e.days.forEach((d, i) => {
        const labelHit = hasAll(d.label, ws);
        const lines = d.text.split("\n").filter((line) => line && hasAll(line, ws));
        if (labelHit || lines.length) days.push({ number: i + 1, label: d.label, labelHit, lines });
      });
      if (nameHit || days.length) {
        results.push({
          id: e.id,
          title: e.title,
          location: e.location,
          date_start: e.date_start,
          date_end: e.date_end,
          date_precision: e.date_precision,
          nameHit,
          days,
          lineCount: days.reduce((n, d) => n + d.lines.length, 0),
        });
      }
    }
    results.sort((a, b) => {
      if (a.nameHit !== b.nameHit) return a.nameHit ? -1 : 1;
      if (a.lineCount !== b.lineCount) return b.lineCount - a.lineCount;
      if (!a.date_start !== !b.date_start) return a.date_start ? -1 : 1;
      return (a.date_start || "") < (b.date_start || "") ? 1 : -1;
    });
    return results;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Escaped HTML for `text` with every typed word wrapped in <mark>. For a long
  // line, shows a window around the first match so the match is in view.
  function highlight(text, query, maxLength) {
    const ws = words(query).sort((a, b) => b.length - a.length);
    let t = String(text);
    let lead = "";
    let tail = "";
    const max = maxLength || 200;
    if (ws.length && t.length > max) {
      const first = Math.min(...ws.map((w) => t.toLowerCase().indexOf(w)).filter((i) => i >= 0));
      const start = Math.max(0, Math.min(first - 60, t.length - max));
      if (start > 0) lead = "…";
      if (start + max < t.length) tail = "…";
      t = t.slice(start, start + max);
    }
    if (!ws.length) return escapeHtml(lead + t + tail);
    const re = new RegExp("(" + ws.map(escapeRegExp).join("|") + ")", "gi");
    const html = t
      .split(re)
      .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
      .join("");
    return lead + html + tail;
  }

  return { words, search, highlight };
});
