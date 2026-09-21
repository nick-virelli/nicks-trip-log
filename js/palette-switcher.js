// TEMPORARY palette switcher for choosing the site's color scheme (Phase 3,
// reworked Phase 7). Five named schemes, two of them green (Forest, Moss) and
// three warm (Ember, Copper, Amber). Light and dark mode remember their own
// scheme, so "Ember in light, Forest in dark" is one click in each mode.
//
// To remove: delete this file, the PALETTE_SWITCHER line in
// scripts/lib/page-shell.js, and rebuild. Whichever scheme wins for each mode
// gets folded into the :root and [data-theme="dark"] tokens in css/style.css.
(function () {
  const STORAGE_LIGHT = "trip-log-palette-light";
  const STORAGE_DARK = "trip-log-palette-dark";

  // Builds a full token set. Accent-derived tokens (map highlight) follow the
  // accent so a scheme is described by its handful of real choices.
  function tokens(t) {
    const [r, g, b] = t.accent.replace("#", "").match(/../g).map((h) => parseInt(h, 16));
    return {
      "--bg": t.bg, "--surface": t.surface, "--text": t.text, "--text-muted": t.muted, "--border": t.border,
      "--accent": t.accent, "--accent-hover": t.hover, "--on-accent": t.on,
      "--map-bg": t.mapBg, "--map-hover": t.mapHover, "--map-active": t.accent,
      "--map-active-bg": `rgba(${r}, ${g}, ${b}, ${t.alpha})`,
    };
  }

  // "forest" is the current look and sets nothing: it is whatever css/style.css says.
  const SCHEMES = [
    { id: "forest", label: "Forest", light: {}, dark: {} },
    {
      id: "moss", label: "Moss",
      light: tokens({ bg: "#f7f8f3", surface: "#ffffff", text: "#1b1f16", muted: "#5f6655", border: "#dde1d3", accent: "#4a6b2f", hover: "#385222", on: "#ffffff", mapBg: "#eef0e6", mapHover: "#e1e5d4", alpha: 0.12 }),
      dark: tokens({ bg: "#12140f", surface: "#1c1f17", text: "#eef0e6", muted: "#b3b8a4", border: "#363b2c", accent: "#8fb85c", hover: "#a9cf78", on: "#12140f", mapBg: "#171a12", mapHover: "#232719", alpha: 0.25 }),
    },
    {
      id: "ember", label: "Ember",
      light: tokens({ bg: "#faf7f3", surface: "#ffffff", text: "#1f1a15", muted: "#6b5f54", border: "#e8e0d6", accent: "#9a5520", hover: "#7a4118", on: "#ffffff", mapBg: "#f1ebe4", mapHover: "#e6ddd2", alpha: 0.12 }),
      dark: tokens({ bg: "#141210", surface: "#1e1a17", text: "#f2ebe3", muted: "#b5a99b", border: "#3a322b", accent: "#e0a458", hover: "#f0bd7a", on: "#141210", mapBg: "#191613", mapHover: "#25201c", alpha: 0.25 }),
    },
    {
      id: "copper", label: "Copper",
      light: tokens({ bg: "#fbf6f3", surface: "#ffffff", text: "#221814", muted: "#6b5a52", border: "#eadfd9", accent: "#a4462a", hover: "#82361f", on: "#ffffff", mapBg: "#f2e9e4", mapHover: "#e7dbd4", alpha: 0.12 }),
      dark: tokens({ bg: "#151110", surface: "#1f1917", text: "#f4ebe6", muted: "#b8a69e", border: "#3d322e", accent: "#e8836b", hover: "#f19c87", on: "#151110", mapBg: "#1a1513", mapHover: "#26201d", alpha: 0.25 }),
    },
    {
      id: "amber", label: "Amber",
      light: tokens({ bg: "#fffaf0", surface: "#ffffff", text: "#1f1a0e", muted: "#6a5f48", border: "#eee3c9", accent: "#8a6400", hover: "#6b4e00", on: "#ffffff", mapBg: "#f6eedb", mapHover: "#ebe0c3", alpha: 0.14 }),
      dark: tokens({ bg: "#14120d", surface: "#1e1b13", text: "#f4efe0", muted: "#b8ae94", border: "#3b3524", accent: "#f0b429", hover: "#f6c75a", on: "#14120d", mapBg: "#19160f", mapHover: "#252017", alpha: 0.25 }),
    },
  ];

  // Lets the tests read the schemes without a browser.
  if (typeof document === "undefined") {
    module.exports = { SCHEMES };
    return;
  }

  function block(selector, vars) {
    const body = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
    return body ? `${selector} {\n${body}\n}\n` : "";
  }

  function injectStyles() {
    let css = "";
    for (const s of SCHEMES) {
      css += block(`[data-palette-light="${s.id}"]:not([data-theme="dark"])`, s.light);
      css += block(`[data-palette-dark="${s.id}"][data-theme="dark"]`, s.dark);
    }
    css += `
.palette-switcher {
  position: fixed;
  right: var(--gutter);
  bottom: var(--gutter);
  z-index: var(--z-back-to-top);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 0.6rem 1.1rem;
  font-size: var(--fs-md);
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--shadow);
}
.palette-switcher:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.palette-switcher span {
  color: var(--text-muted);
}
.palette-switcher b {
  color: var(--accent);
}
`;
    const style = document.createElement("style");
    style.id = "palette-switcher-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  const root = document.documentElement;
  const isDark = () => root.getAttribute("data-theme") === "dark";
  const known = (id) => SCHEMES.some((s) => s.id === id);
  const labelOf = (id) => (SCHEMES.find((s) => s.id === id) || SCHEMES[0]).label;

  function render(btn) {
    const light = root.getAttribute("data-palette-light");
    const dark = root.getAttribute("data-palette-dark");
    const now = isDark() ? "dark" : "light";
    const part = (mode, id) => (mode === now ? `<b>${mode === "light" ? "Light" : "Dark"}: ${labelOf(id)}</b>` : `${mode === "light" ? "Light" : "Dark"}: ${labelOf(id)}`);
    btn.innerHTML = `<span>Palette</span> ${part("light", light)} &middot; ${part("dark", dark)}`;
    btn.title = `Click to change the ${now} mode palette. The other mode keeps its own.`;
  }

  function init() {
    injectStyles();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-switcher";
    document.body.appendChild(btn);

    const savedLight = read(STORAGE_LIGHT);
    const savedDark = read(STORAGE_DARK);
    root.setAttribute("data-palette-light", known(savedLight) ? savedLight : "forest");
    root.setAttribute("data-palette-dark", known(savedDark) ? savedDark : "forest");
    render(btn);

    btn.addEventListener("click", () => {
      const attr = isDark() ? "data-palette-dark" : "data-palette-light";
      const next = SCHEMES[(SCHEMES.findIndex((s) => s.id === root.getAttribute(attr)) + 1) % SCHEMES.length].id;
      root.setAttribute(attr, next);
      write(isDark() ? STORAGE_DARK : STORAGE_LIGHT, next);
      render(btn);
      // Maps draw pins from the accent token; they redraw on this event.
      document.dispatchEvent(new Event("themechange"));
    });

    // Flipping light/dark changes which half of the label is current.
    new MutationObserver(() => render(btn)).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
