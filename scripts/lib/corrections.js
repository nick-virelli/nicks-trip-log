const fs = require('fs');
const path = require('path');

const correctionsPath = path.join(__dirname, '..', '..', 'content', 'style-corrections.json');
const data = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest-first so multi-word instance corrections don't get pre-empted by shorter global ones.
const sorted = [...data.corrections].sort((a, b) => b.original.length - a.original.length);

function applyCorrections(text) {
  let out = text;
  for (const c of sorted) {
    const re = new RegExp(escapeRegExp(c.original), 'g');
    out = out.replace(re, c.correction);
  }
  return out;
}

// Strips Apple Notes' "data detector" smart-link wrapper left over from markdown export,
// e.g. "[3:45](x-apple-data-detectors://embedded-result/47411)" -> "3:45"
function unwrapDataDetectors(text) {
  return text.replace(/\[([^\]]+)\]\(x-apple-data-detectors:\/\/[^)]+\)/g, '$1');
}

function processText(text) {
  return applyCorrections(unwrapDataDetectors(text)).trim();
}

module.exports = { applyCorrections, unwrapDataDetectors, processText };
