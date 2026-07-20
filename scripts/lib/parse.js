const { processText, unwrapDataDetectors } = require('./corrections');

const DAY_WORD_RE = /^(Day\s*\d+|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;

function stripDecoration(s) {
  return s.replace(/^[#*+\s]+/, '').replace(/[#*+\s]+$/, '');
}

// Mileage sometimes appears wrapped in Apple Notes' smart-link syntax, e.g.
// "([1.5 miles](x-apple-data-detectors://...))", occasionally with stray bold
// markup inside the parens too — unwrap first, then match leniently.
function extractMilesNum(rawS) {
  const s = unwrapDataDetectors(rawS);
  let m = s.match(/\([*+\s]*([\d]+(?:\.\d+)?)(?:\s*-\s*[\d.]+)?\s*(?:ish)?\+?\s*miles?[*+\s]*\)/i);
  if (m) return parseFloat(m[1]);
  m = s.match(/-\s*([\d]+(?:\.\d+)?)\s*miles?\s*$/i);
  return m ? parseFloat(m[1]) : null;
}

function extractMedia(text) {
  const m = text.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (!m) return null;
  const filePath = m[2].trim();
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  const type = ext === 'mov' || ext === 'mp4' ? 'video' : 'image';
  return { type, file: filePath };
}

// Parses a slice of trip markdown (already isolated to one trip's section) into
// a tree of { label, miles, children: [ {text|media, miles, children} ] } per day.
// Handles: standard "### Day N - date (miles)" headings, plain weekday headings,
// bold/plus-decorated headings with no '#' ("**++Day 1++**"), fully headingless
// plain-line trips (Glacier 2023), trail/location sub-headings nested under a day
// (Southwest Road Trip), and bare (non-bulleted) image/video lines (mega-note).
function parseTripDays(rawText) {
  const lines = rawText.split(/\r?\n/);
  const days = [];
  let stack = [];

  function startDay(labelSource) {
    const day = {
      label: processText(stripDecoration(labelSource)),
      miles: extractMilesNum(labelSource),
      children: [],
    };
    days.push(day);
    stack = [{ depth: -1, node: day }];
    return day;
  }

  function attach(node, depth) {
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    return node;
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;

    const headingMatch = line.match(/^(#{1,4})\s*(.*)$/);
    if (headingMatch) {
      const stripped = stripDecoration(headingMatch[2]);
      if (!stripped) continue; // stray empty divider header
      if (DAY_WORD_RE.test(stripped)) {
        startDay(stripped);
        continue;
      }
      if (days.length === 0) continue; // front matter before first day (title, stray H1s)
      const trailNode = { text: processText(stripped), media: null, miles: extractMilesNum(stripped), children: [] };
      attach(trailNode, 0);
      stack.push({ depth: -1, node: trailNode }); // its own bullets nest depth>=0 inside it
      continue;
    }

    const strippedWhole = stripDecoration(line);
    if (strippedWhole.length < 60 && DAY_WORD_RE.test(strippedWhole)) {
      startDay(strippedWhole);
      continue;
    }

    if (days.length === 0) continue;

    const bulletMatch = line.match(/^(\s*)\*\s?(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1].length;
      const depth = Math.round(indent / 4);
      const text = bulletMatch[2];
      const media = extractMedia(text);
      const node = media
        ? { text: null, media, miles: null, children: [] }
        : { text: processText(text), media: null, miles: extractMilesNum(text), children: [] };
      attach(node, depth);
      stack.push({ depth, node });
      continue;
    }

    const bareMedia = extractMedia(line.trim());
    if (bareMedia) {
      stack[stack.length - 1].node.children.push({ text: null, media: bareMedia, miles: null, children: [] });
      continue;
    }

    // Fallback: headingless plain-line trip (Glacier 2023) -> top-level bullet under the current day
    const node = { text: processText(line.trim()), media: null, miles: extractMilesNum(line), children: [] };
    attach(node, 0);
    stack.push({ depth: 0, node });
  }

  return days;
}

module.exports = { parseTripDays, extractMilesNum, stripDecoration };
