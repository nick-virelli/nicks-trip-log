// Shared helpers for the site tests. Run them all with: npm test
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE_URL = 'https://nick-virelli.github.io/nicks-trip-log/';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const json = (rel) => JSON.parse(read(rel));

const TOP_PAGES = ['index.html', 'trips.html', 'gallery.html', 'about.html'];

function listHtml(dir) {
  return fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.html')).map((f) => `${dir}/${f}`)
    : [];
}

// Every generated page: the four site pages, the 404, collections, and trips.
const ALL_PAGES = [...TOP_PAGES, 'search.html', '404.html', ...listHtml('collections'), ...listHtml('trip')];

// Attribute values of the form name="value" for the given attribute names.
function attrs(html, names) {
  const out = [];
  const re = new RegExp(`\\s(?:${names.join('|')})="([^"]*)"`, 'g');
  for (const m of html.matchAll(re)) out.push(m[1]);
  return out;
}

// Turns a URL found in a page into a repo-relative path, or null if it points
// somewhere external (Google, unpkg) or is not a file (mailto, #anchor).
function toRepoPath(fromPage, url) {
  if (!url || url.startsWith('#') || /^(mailto:|data:|javascript:)/.test(url)) return null;
  if (url.startsWith(SITE_URL)) {
    // Absolute URLs on our own site are already relative to the site root.
    const rest = url.slice(SITE_URL.length).split('#')[0].split('?')[0];
    return rest === '' || rest.endsWith('/') ? rest + 'index.html' : rest;
  }
  if (/^https?:\/\//.test(url)) return null;
  url = url.split('#')[0].split('?')[0];
  if (url === '' || url.endsWith('/')) url += 'index.html';
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromPage), url));
}

module.exports = { ROOT, SITE_URL, read, exists, json, ALL_PAGES, TOP_PAGES, attrs, toRepoPath };
