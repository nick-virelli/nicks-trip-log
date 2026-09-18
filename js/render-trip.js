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
        (d) => `
      <div class="trip-day">
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
      p.total_miles ? ` &middot; <span class="post-miles">${p.total_miles} miles</span>` : ""
    }</p>
      ${days}
    `;
    return prefix ? html.replace(/ src="images\//g, ` src="${prefix}images/`) : html;
  }

  return { esc, fmtDate, fmtDateRange, renderTripHtml };
});
