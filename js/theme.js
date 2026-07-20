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
    if (btn) btn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
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
