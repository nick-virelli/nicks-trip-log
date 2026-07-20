function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// mediaMap: Map of "Attachments/ORIGINALNAME.ext" -> "images/trips/slug/newname.ext"
function renderNode(node, mediaMap) {
  if (node.media) {
    const newPath = mediaMap.get(node.media.file) || node.media.file;
    const inner =
      node.media.type === 'video'
        ? `<video controls preload="metadata" src="${escapeHtml(newPath)}"></video>`
        : `<img src="${escapeHtml(newPath)}" alt="" loading="lazy">`;
    return `<li class="trip-media">${inner}</li>`;
  }
  const childHtml = node.children.length ? `<ul>${node.children.map((c) => renderNode(c, mediaMap)).join('')}</ul>` : '';
  return `<li>${escapeHtml(node.text || '')}${childHtml}</li>`;
}

function renderDayHtml(day, mediaMap) {
  return `<ul>${day.children.map((c) => renderNode(c, mediaMap)).join('')}</ul>`;
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
