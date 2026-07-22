(function () {
  const KEY = "travel-blog-theme";
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  function getStored() {
    try {
      return localStorage.getItem(KEY);
    } catch (_) {
      return null;
    }
  }

  function setTheme(value) {
    const theme = value === "dark" || value === "light" ? value : (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (_) {}
    const btn = document.querySelector(".theme-toggle");
    if (btn) btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }

  function init() {
    setTheme(getStored() || (prefersDark ? "dark" : "light"));
    document.querySelector(".theme-toggle")?.addEventListener("click", function () {
      const cur = document.documentElement.getAttribute("data-theme");
      setTheme(cur === "dark" ? "light" : "dark");
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

// Back-to-top button - shared across every page, not just the homepage.
(function () {
  function smoothScrollToTop() {
    const startY = window.scrollY;
    if (startY <= 0) return;
    const duration = 400;
    const stepMs = 16;
    const steps = Math.max(1, Math.round(duration / stepMs));
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    let i = 0;
    (function tick() {
      i++;
      const t = Math.min(1, i / steps);
      window.scrollTo(0, Math.round(startY * (1 - easeOutCubic(t))));
      if (t < 1) setTimeout(tick, stepMs);
    })();
  }

  function init() {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;
    window.addEventListener(
      "scroll",
      () => {
        btn.classList.toggle("visible", window.scrollY > 500);
      },
      { passive: true }
    );
    btn.addEventListener("click", () => {
      btn.classList.remove("visible"); // hide immediately rather than waiting on scroll events
      smoothScrollToTop();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
