// The final palette is readable in both modes, the temporary switcher is gone,
// and photos are kept on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, read, exists, ALL_PAGES } = require('./helpers');

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
const LIGHT = tokensOf(':root');
const DARK = { ...LIGHT, ...tokensOf('[data-theme="dark"]') };

test('the chosen palette is Copper in light mode and Moss in dark mode', () => {
  assert.equal(LIGHT['--accent'], '#a4462a');
  assert.equal(LIGHT['--bg'], '#fbf6f3');
  assert.equal(DARK['--accent'], '#8fb85c');
  assert.equal(DARK['--bg'], '#12140f');
});

test('the temporary palette switcher is fully removed', () => {
  assert.ok(!exists('js/palette-switcher.js'));
  for (const page of ALL_PAGES) assert.ok(!read(page).includes('palette-switcher'), `${page} still loads the switcher`);
  assert.ok(!read('scripts/lib/page-shell.js').toLowerCase().includes('palette'));
  assert.ok(!css.includes('data-palette'));
});

test('in both modes, text is readable on the page and on card backgrounds (WCAG AA)', () => {
  const bad = [];
  for (const [mode, t] of [['light', LIGHT], ['dark', DARK]]) {
    for (const ground of ['--bg', '--surface']) {
      if (contrast(t['--text'], t[ground]) < 7) bad.push(`${mode}: body text on ${ground} is ${contrast(t['--text'], t[ground]).toFixed(2)}`);
      if (contrast(t['--text-muted'], t[ground]) < 4.5) bad.push(`${mode}: muted text on ${ground} is ${contrast(t['--text-muted'], t[ground]).toFixed(2)}`);
      if (contrast(t['--accent'], t[ground]) < 4.5) bad.push(`${mode}: links on ${ground} are ${contrast(t['--accent'], t[ground]).toFixed(2)}`);
    }
    if (contrast(t['--on-accent'], t['--accent']) < 4.5) bad.push(`${mode}: button text on the accent is ${contrast(t['--on-accent'], t['--accent']).toFixed(2)}`);
  }
  assert.deepEqual(bad, []);
});

test('the map highlight color follows the accent in both modes', () => {
  assert.equal(LIGHT['--map-active'], LIGHT['--accent']);
  assert.equal(DARK['--map-active'], DARK['--accent']);
});

test('no stylesheet rule hardcodes a color outside the token blocks', () => {
  const afterTokens = css.slice(css.indexOf('/* ---------- Base ---------- */'));
  const withoutComments = afterTokens.replace(/\/\*[\s\S]*?\*\//g, '');
  const hard = [...withoutComments.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((m) => m[0]);
  assert.deepEqual(hard, []);
});

test('a photo is never taller than the space under the header, so a whole landscape photo fits', () => {
  assert.match(css, /--media-max-height:\s*max\(20rem, calc\(100vh - var\(--header-height\)/);
  assert.match(css, /\.trip-day img,\s*\.trip-day video \{[^}]*max-height: var\(--media-max-height\)/);
  assert.match(css, /\.carousel \{[^}]*max-width: calc\(var\(--media-max-height\) \* 4 \/ 3\)/);
});

test('the sticky header height the layout assumes matches the token', () => {
  assert.match(css, /--header-height: 81px/);
});

test('no leftover stylesheet or script files that no page uses', () => {
  const used = new Set();
  for (const page of ALL_PAGES) for (const m of read(page).matchAll(/(?:src|href)="[^"]*?((?:js|css)\/[\w.-]+)"/g)) used.add(m[1]);
  const shared = new Set(['js/render-trip.js', 'js/trip-entries.js']);
  const orphans = [];
  for (const dir of ['js', 'css']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) if (!used.has(`${dir}/${f}`) && !shared.has(`${dir}/${f}`)) orphans.push(`${dir}/${f}`);
  }
  assert.deepEqual(orphans, []);
});
