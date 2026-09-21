// Trip article markup, shared by the browser (js/map.js injects trips into the
// home page) and the build (scripts/build-pages.js writes trip/<id>.html), so the
// two can never drift. Loads as window.TripRender in the browser and as a
// CommonJS module in Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TripRender = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Locale is pinned so Node and the browser format dates the same way.
  function fmtDate(d, precision) {
    if (!d) return "";
    const parts = d.split("-").map(Number);
    const dt = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    if (precision === "month") return dt.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtDateRange(p) {
    if (!p.date_start) return "";
    if (!p.date_end || p.date_end === p.date_start) return fmtDate(p.date_start, p.date_precision);
    return `${fmtDate(p.date_start, p.date_precision)} - ${fmtDate(p.date_end, p.date_precision)}`;
  }

  // options.assetPrefix: prepended to every "images/..." src when the page lives
  // in a subfolder (trip pages use "../"). body_html always emits src="images/...".
  function renderTripHtml(p, options) {
    const prefix = (options && options.assetPrefix) || "";
    const days = p.days
      .map(
        (d, i) => `
      <div class="trip-day" id="day-${i + 1}">
        <h3>${esc(d.label)}</h3>
        ${d.body_html}
      </div>`
      )
      .join("");
    const html = `
      <h2 id="trip-heading-${esc(p.id)}" data-trip-id="${esc(p.id)}" data-trip-title="${esc(p.title)}" data-trip-meta="${esc(p.location)}${
      fmtDateRange(p) ? " - " + fmtDateRange(p) : ""
    }">${esc(p.title)}</h2>
      <p class="post-meta">${esc(p.location)}${fmtDateRange(p) ? " &middot; " + fmtDateRange(p) : ""}${
      p.total_miles ? ` &middot; <span class="post-miles">${p.total_miles} miles hiked</span>` : ""
    }${
      p.steps ? ` &middot; <span class="post-steps">${p.steps.toLocaleString("en-US")} steps, ${p.walking_miles} miles walked</span>` : ""
    }</p>
      ${days}
    `;
    return prefix ? html.replace(/ src="images\//g, ` src="${prefix}images/`) : html;
  }

  function thumbFor(src) {
    return src ? src.replace(/^images\/trips\//, "images/thumbs/") : null;
  }

  // A cover-image card for a trip or a collapsed collection, used by the home
  // page's "Recent trips" and by the trips index (js/trip-entries.js builds the
  // entry objects this expects: {href, title, meta, date_start, date_end,
  // date_precision, cover}).
  function tripTileHtml(entry) {
    const thumb = thumbFor(entry.cover);
    const media = thumb
      ? `<img src="${esc(thumb)}" alt="${esc(entry.title)}" loading="lazy">`
      : `<span class="trip-tile-placeholder">${esc(entry.title)}</span>`;
    const dates = fmtDateRange(entry);
    return `
      <a class="trip-tile${thumb ? "" : " trip-tile--no-cover"}" href="${esc(entry.href)}">
        <span class="trip-tile-media">${media}</span>
        <span class="trip-tile-body">
          <span class="trip-tile-title">${esc(entry.title)}</span>
          <span class="trip-tile-meta">${entry.meta}${dates ? " &middot; " + esc(dates) : ""}</span>
        </span>
      </a>`;
  }

  return { esc, fmtDate, fmtDateRange, renderTripHtml, thumbFor, tripTileHtml };
});
