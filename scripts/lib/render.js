function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Converts the source's own emphasis markup (**bold**, ++bold++, and combinations
// like **++bold++** or ***++bold++***) into real <strong> tags. Runs after
// escapeHtml, so it's safe to inject raw tags here - asterisks/pluses are untouched
// by HTML escaping. Any run of 2+ * and/or + characters is treated as one delimiter,
// and delimiter runs alternate open/close.
function applyEmphasis(escaped) {
  const parts = escaped.split(/[*+]{2,}/);
  let result = parts[0] || '';
  for (let i = 1; i < parts.length; i++) {
    result += i % 2 === 1 ? `<strong>${parts[i]}</strong>` : parts[i];
  }
  return result;
}

// mediaMap: Map of "Attachments/ORIGINALNAME.ext" -> "images/trips/slug/newname.ext"
// altText: fallback description for images (e.g. "MT RAINIER 2026, Mount Rainier / Seattle")
function renderNode(node, mediaMap, altText) {
  if (node.media) {
    return `<li class="trip-media">${renderSingleMedia(node, mediaMap, altText)}</li>`;
  }
  const childHtml = node.children.length ? `<ul>${renderChildrenList(node.children, mediaMap, altText)}</ul>` : '';
  return `<li>${applyEmphasis(escapeHtml(node.text || ''))}${childHtml}</li>`;
}

function renderSingleMedia(node, mediaMap, altText) {
  const newPath = mediaMap.get(node.media.file) || node.media.file;
  return node.media.type === 'video'
    ? `<video controls preload="metadata" src="${escapeHtml(newPath)}"></video>`
    : `<img src="${escapeHtml(newPath)}" alt="${escapeHtml(altText || '')}" loading="lazy">`;
}

// Runs of 2+ consecutive images (no text or video breaking them up) render as a
// swipeable/arrow-navigable carousel instead of stacking full-size, one per row.
// A video in the middle of a run ends it rather than riding along in the strip.
function renderChildrenList(children, mediaMap, altText) {
  const parts = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    if (node.media && node.media.type === 'image') {
      const run = [node];
      let j = i + 1;
      while (j < children.length && children[j].media && children[j].media.type === 'image') {
        run.push(children[j]);
        j++;
      }
      parts.push(run.length >= 2 ? renderCarousel(run, mediaMap, altText) : `<li class="trip-media">${renderSingleMedia(run[0], mediaMap, altText)}</li>`);
      i = j;
    } else {
      parts.push(renderNode(node, mediaMap, altText));
      i++;
    }
  }
  return parts.join('');
}

function renderCarousel(run, mediaMap, altText) {
  const slides = run.map((n) => `<div class="carousel-slide">${renderSingleMedia(n, mediaMap, altText)}</div>`).join('');
  return `<li class="trip-media">
    <div class="carousel" data-count="${run.length}">
      <div class="carousel-track">${slides}</div>
      <button type="button" class="carousel-arrow carousel-prev" aria-label="Previous photo">&#8249;</button>
      <button type="button" class="carousel-arrow carousel-next" aria-label="Next photo">&#8250;</button>
      <span class="carousel-counter">1 / ${run.length}</span>
    </div>
  </li>`;
}

function renderDayHtml(day, mediaMap, altText) {
  return `<ul>${renderChildrenList(day.children, mediaMap, altText)}</ul>`;
}

function sumDescendantMiles(children) {
  let total = 0;
  for (const c of children) {
    if (typeof c.miles === 'number') total += c.miles;
    total += sumDescendantMiles(c.children);
  }
  return total;
}

function dayMiles(day) {
  if (typeof day.miles === 'number') return day.miles;
  const summed = sumDescendantMiles(day.children);
  return summed > 0 ? Math.round(summed * 100) / 100 : null;
}

// Best-effort extraction of named trail/activity segments that carry their own mileage,
// for the day.trails[] field (e.g. "Glacier Basin Trail (8.96 miles)").
function extractTrails(day) {
  const trails = [];
  const scan = (nodes) => {
    for (const n of nodes) {
      if (typeof n.miles === 'number' && n.text) {
        const name = n.text.replace(/\s*\([^)]*miles?[^)]*\)\s*/i, '').replace(/^[A-Z][a-z]+ (up|to|at|and|for|towards?)\s+/, '').trim();
        trails.push({ name: name.length > 2 && name.length < 80 ? name : n.text, miles: n.miles });
      }
      scan(n.children);
    }
  };
  scan(day.children);
  return trails;
}

function collectMediaFiles(days) {
  const files = new Set();
  const scan = (nodes) => {
    for (const n of nodes) {
      if (n.media) files.add(n.media.file);
      scan(n.children);
    }
  };
  for (const day of days) scan(day.children);
  return [...files];
}

module.exports = { renderDayHtml, dayMiles, extractTrails, collectMediaFiles, escapeHtml };
