// TEMPORARY palette switcher for choosing the site's color scheme (Phase 3).
// Cycles five named schemes by swapping token values only; nothing else on the
// site knows it exists. To remove: delete this file, the one <script> line in
// scripts/lib/page-shell.js, and rebuild. Whichever scheme wins gets folded into
// the :root tokens in css/style.css.
(function () {
  const STORAGE_KEY = "trip-log-palette";

  // Each scheme sets the same token names as :root / [data-theme="dark"] in
  // css/style.css. "forest" is the current look, so it sets nothing.
  const SCHEMES = [
    { id: "forest", label: "Forest (current)", light: {}, dark: {} },
    {
      id: "slate",
      label: "Slate",
      light: {
        "--bg": "#f6f7f9", "--surface": "#ffffff", "--text": "#14171c", "--text-muted": "#5b6472",
        "--border": "#dfe3ea", "--accent": "#2b6cb0", "--accent-hover": "#1f4f85", "--on-accent": "#fff",
        "--map-bg": "#eceff3", "--map-hover": "#dde2ea", "--map-active": "#2b6cb0", "--map-active-bg": "rgba(43, 108, 176, 0.12)",
      },
      dark: {
        "--bg": "#0f1115", "--surface": "#181b21", "--text": "#e8eaf0", "--text-muted": "#9aa3b2",
        "--border": "#2a2f3a", "--accent": "#6ea8fe", "--accent-hover": "#8fbcff", "--on-accent": "#0f1115",
        "--map-bg": "#14171d", "--map-hover": "#1f242d", "--map-active": "#6ea8fe", "--map-active-bg": "rgba(110, 168, 254, 0.22)",
      },
    },
    {
      id: "ember",
      label: "Ember",
      light: {
        "--bg": "#faf7f3", "--surface": "#ffffff", "--text": "#1f1a15", "--text-muted": "#6b5f54",
        "--border": "#e8e0d6", "--accent": "#b4682a", "--accent-hover": "#8f4f1b", "--on-accent": "#fff",
        "--map-bg": "#f1ebe4", "--map-hover": "#e6ddd2", "--map-active": "#b4682a", "--map-active-bg": "rgba(180, 104, 42, 0.12)",
      },
      dark: {
        "--bg": "#141210", "--surface": "#1e1a17", "--text": "#f2ebe3", "--text-muted": "#b5a99b",
        "--border": "#3a322b", "--accent": "#e0a458", "--accent-hover": "#f0bd7a", "--on-accent": "#141210",
        "--map-bg": "#191613", "--map-hover": "#25201c", "--map-active": "#e0a458", "--map-active-bg": "rgba(224, 164, 88, 0.22)",
      },
    },
    {
      id: "fjord",
      label: "Fjord",
      light: {
        "--bg": "#f4f8fb", "--surface": "#ffffff", "--text": "#10202d", "--text-muted": "#56707f",
        "--border": "#d9e4ec", "--accent": "#1a8a8a", "--accent-hover": "#12676b", "--on-accent": "#fff",
        "--map-bg": "#e9f0f5", "--map-hover": "#d9e4ec", "--map-active": "#1a8a8a", "--map-active-bg": "rgba(26, 138, 138, 0.12)",
      },
      dark: {
        "--bg": "#0b1620", "--surface": "#12212e", "--text": "#e6eef5", "--text-muted": "#98acbd",
        "--border": "#22364a", "--accent": "#4fc3c3", "--accent-hover": "#7ad9d9", "--on-accent": "#0b1620",
        "--map-bg": "#0f1c27", "--map-hover": "#182a39", "--map-active": "#4fc3c3", "--map-active-bg": "rgba(79, 195, 195, 0.22)",
      },
    },
    {
      id: "mono",
      label: "Mono",
      light: {
        "--bg": "#fbfbfb", "--surface": "#ffffff", "--text": "#111111", "--text-muted": "#666666",
        "--border": "#e3e3e3", "--accent": "#222222", "--accent-hover": "#000000", "--on-accent": "#fff",
        "--map-bg": "#f0f0f0", "--map-hover": "#e2e2e2", "--map-active": "#222222", "--map-active-bg": "rgba(0, 0, 0, 0.08)",
      },
      dark: {
        "--bg": "#0e0e0e", "--surface": "#191919", "--text": "#ededed", "--text-muted": "#9c9c9c",
        "--border": "#2c2c2c", "--accent": "#d8d8d8", "--accent-hover": "#ffffff", "--on-accent": "#0e0e0e",
        "--map-bg": "#141414", "--map-hover": "#222222", "--map-active": "#d8d8d8", "--map-active-bg": "rgba(255, 255, 255, 0.14)",
      },
    },
  ];

  function block(selector, vars) {
    const body = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
    return body ? `${selector} {\n${body}\n}\n` : "";
  }

  function injectStyles() {
    let css = "";
    for (const s of SCHEMES) {
      css += block(`[data-palette="${s.id}"]`, s.light);
      css += block(`[data-palette="${s.id}"][data-theme="dark"]`, s.dark);
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
`;
    const style = document.createElement("style");
    style.id = "palette-switcher-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function store(id) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch (_) {}
  }

  function apply(id, btn) {
    document.documentElement.setAttribute("data-palette", id);
    const scheme = SCHEMES.find((s) => s.id === id) || SCHEMES[0];
    if (btn) btn.innerHTML = `<span>Palette:</span> ${scheme.label}`;
    // Maps draw their pins from the accent token at draw time; they listen for
    // this the same way they listen for the theme toggle.
    document.dispatchEvent(new Event("themechange"));
  }

  function init() {
    injectStyles();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-switcher";
    btn.setAttribute("aria-label", "Cycle color palette");
    document.body.appendChild(btn);

    const stored = readStored();
    let index = Math.max(0, SCHEMES.findIndex((s) => s.id === stored));
    apply(SCHEMES[index].id, btn);

    btn.addEventListener("click", () => {
      index = (index + 1) % SCHEMES.length;
      store(SCHEMES[index].id);
      apply(SCHEMES[index].id, btn);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
