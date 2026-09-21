// The search page: reads ?q=, searches the index, and lists matching trips with
// the days and lines that matched. This is the one place trips are searched.
(function () {
  const isFile = window.location.protocol === "file:";
  const { esc, fmtDateRange } = window.TripRender;
  const { search, highlight } = window.TripSearch;

  const MAX_DAYS = 6;
  const MAX_LINES = 3;

  async function loadData(jsonPath, globalVar) {
    // Each page already loads data/*.js, so nothing is downloaded twice. Only
    // fetch the .json if that script is somehow missing (never in file:// mode).
    if (window[globalVar]) return window[globalVar];
    if (isFile) throw new Error(`Missing inline data ${globalVar} for file:// mode`);
    const res = await fetch(jsonPath);
    return res.json();
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  function resultHtml(r, query) {
    const dates = fmtDateRange(r);
    const days = r.days.slice(0, MAX_DAYS).map((d) => {
      const lines = d.lines.slice(0, MAX_LINES).map((l) => `<li>${highlight(l, query)}</li>`).join("");
      const more = d.lines.length > MAX_LINES ? `<li class="search-more">and ${d.lines.length - MAX_LINES} more ${d.lines.length - MAX_LINES === 1 ? "line" : "lines"} this day</li>` : "";
      return `<li class="search-day">
        <a href="trip/${esc(r.id)}.html#day-${d.number}">${highlight(d.label, query)}</a>
        ${lines || more ? `<ul class="search-lines">${lines}${more}</ul>` : ""}
      </li>`;
    });
    const moreDays = r.days.length > MAX_DAYS ? `<li class="search-more">and ${r.days.length - MAX_DAYS} more ${r.days.length - MAX_DAYS === 1 ? "day" : "days"}</li>` : "";
    return `
      <section class="search-result">
        <h2><a href="trip/${esc(r.id)}.html">${highlight(r.title, query)}</a></h2>
        <p class="post-meta">${highlight(r.location, query)}${dates ? " &middot; " + esc(dates) : ""}</p>
        ${days.length ? `<ul class="search-days">${days.join("")}${moreDays}</ul>` : ""}
      </section>`;
  }

  async function init() {
    const input = document.getElementById("search-input");
    const summary = document.getElementById("search-summary");
    const list = document.getElementById("search-results");
    let index;
    try {
      index = await loadData("data/search-index.json", "__SEARCH_INDEX__");
    } catch (err) {
      list.innerHTML = '<div class="load-error"><p>Failed to load the page.</p><a href="index.html">Back to home</a></div>';
      return;
    }

    function run(query, pushUrl) {
      const results = search(index.entries, query);
      if (!window.TripSearch.words(query).length) {
        summary.textContent = "Type a trip, place, restaurant, or trail.";
        list.innerHTML = "";
      } else if (!results.length) {
        summary.textContent = `Nothing matched "${query.trim()}".`;
        list.innerHTML = "";
      } else {
        const lines = results.reduce((n, r) => n + r.lineCount, 0);
        summary.textContent = `${plural(results.length, "trip")}, ${plural(lines, "matching line")}.`;
        list.innerHTML = results.map((r) => resultHtml(r, query)).join("");
      }
      if (pushUrl) {
        const url = new URL(window.location.href);
        if (query.trim()) url.searchParams.set("q", query);
        else url.searchParams.delete("q");
        window.history.replaceState(null, "", url);
      }
    }

    const initial = new URLSearchParams(window.location.search).get("q") || "";
    input.value = initial;
    run(initial, false);
    input.addEventListener("input", () => run(input.value, true));
    input.focus();
  }

  if (document.getElementById("search-results")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
