// Readability of every palette, and the rule that keeps photos on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');
const { SCHEMES } = require('../js/palette-switcher.js');

const css = read('css/style.css');

// WCAG contrast ratio between two #rrggbb colors.
function luminance(hex) {
  const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Token values from a CSS block such as :root { ... } or [data-theme="dark"] { ... }.
function tokensOf(selector) {
  const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\/\*.*\*\//, '').trim()]));
}
const BASE = { light: tokensOf(':root'), dark: tokensOf('[data-theme="dark"]') };

function palettes() {
  const out = [];
  for (const s of SCHEMES) {
    for (const mode of ['light', 'dark']) {
      // A scheme that sets nothing (Forest) is the base tokens.
      const t = { ...BASE.light, ...(mode === 'dark' ? BASE.dark : {}), ...s[mode] };
      out.push({ name: `${s.label} ${mode}`, t });
    }
  }
  return out;
}

test('five palettes: two green and three warm', () => {
  assert.deepEqual(SCHEMES.map((s) => s.id), ['forest', 'moss', 'ember', 'copper', 'amber']);
});

test('every palette sets every color token, so switching never leaves a stale color behind', () => {
  const required = ['--bg', '--surface', '--text', '--text-muted', '--border', '--accent', '--accent-hover', '--on-accent', '--map-bg', '--map-hover', '--map-active', '--map-active-bg'];
  for (const s of SCHEMES.filter((x) => x.id !== 'forest')) {
    for (const mode of ['light', 'dark']) {
      assert.deepEqual(required.filter((k) => !(k in s[mode])), [], `${s.label} ${mode} is missing tokens`);
    }
  }
});

test('in every palette, text is readable on both the page and the card background (WCAG AA)', () => {
  const bad = [];
  for (const { name, t } of palettes()) {
    for (const ground of ['--bg', '--surface']) {
      if (contrast(t['--text'], t[ground]) < 7) bad.push(`${name}: body text on ${ground} is ${contrast(t['--text'], t[ground]).toFixed(2)}`);
      if (contrast(t['--text-muted'], t[ground]) < 4.5) bad.push(`${name}: muted text on ${ground} is ${contrast(t['--text-muted'], t[ground]).toFixed(2)}`);
      if (contrast(t['--accent'], t[ground]) < 4.5) bad.push(`${name}: links on ${ground} are ${contrast(t['--accent'], t[ground]).toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('in every palette, button text is readable on the accent color', () => {
  const bad = palettes().filter(({ t }) => contrast(t['--on-accent'], t['--accent']) < 4.5).map(({ name, t }) => `${name}: ${contrast(t['--on-accent'], t['--accent']).toFixed(2)}`);
  assert.deepEqual(bad, []);
});

test('a photo is never taller than the space under the header, so a whole landscape photo fits', () => {
  assert.match(css, /--media-max-height:\s*max\(20rem, calc\(100vh - var\(--header-height\)/);
  assert.match(css, /\.trip-day img,\s*\.trip-day video \{[^}]*max-height: var\(--media-max-height\)/);
  assert.match(css, /\.carousel \{[^}]*max-width: calc\(var\(--media-max-height\) \* 4 \/ 3\)/);
});

test('the sticky header height the layout assumes matches the token', () => {
  assert.match(css, /--header-height: 81px/);
});
