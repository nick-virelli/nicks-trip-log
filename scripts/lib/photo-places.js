// Decides which of a trip's cities each photo belongs to. The notes rarely say
// where a photo was taken, so this uses the best evidence available, in order:
//
//   1. GPS in the original photo: the nearest trip city, if within MAX_KM.
//   2. A day heading that names exactly one of the trip's cities
//      ("Friday (Salzburg)").
//   3. The closest photo on the same day that does have GPS (photos taken in a
//      row are almost always in the same place).
//   4. A day heading that names several cities: the photo is listed under all
//      of them, since there is no way to tell which.
//   5. The trip's first city.
//
// Only about a third of the study abroad photos carry GPS (phone location
// services were off for the rest), and none of the US and Peru photos do, so
// steps 2 to 5 do most of the work for those.
const exifr = require('exifr');

const MAX_KM = 100;

async function readGps(absPath) {
  try {
    const g = await exifr.gps(absPath);
    return g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude) ? { lat: g.latitude, lon: g.longitude } : null;
  } catch (err) {
    return null;
  }
}

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function nearestLocation(gps, locations) {
  let best = null;
  let bestKm = Infinity;
  for (const loc of locations) {
    const km = distanceKm(gps, loc);
    if (km < bestKm) {
      best = loc;
      bestKm = km;
    }
  }
  return best && bestKm <= MAX_KM ? best : null;
}

// Cities named in a day heading's parentheses, or null when it names none of
// this trip's cities ("Day 1 - Travel", or a city the trip does not pin).
function explicitLocations(label, locations) {
  const parenMatch = label.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const candidates = parenMatch[1].split(/[\/,-]/).map((s) => s.trim()).filter(Boolean);
    const matched = locations.filter((loc) => {
      const locLower = loc.name.toLowerCase();
      return candidates.some((c) => {
        const cLower = c.toLowerCase();
        return locLower.includes(cLower) || cLower.includes(locLower);
      });
    });
    if (matched.length) return matched;
  }
  // Some notes put the city outside parentheses: "Day 3 - Ollantaytambo 5/14".
  // Whole words only, so a city name inside another word never matches.
  // Case matters: "nice" in a sentence is not the city Nice. An all-caps heading
  // is the one exception, since every word is capitalized there.
  const allCaps = label === label.toUpperCase();
  const escapeRegExp = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = locations.filter((loc) => new RegExp(`(^|[^\\p{L}])${escapeRegExp(loc.name)}($|[^\\p{L}])`, allCaps ? 'iu' : 'u').test(label));
  return named.length ? named : null;
}

// gpsList: one { lat, lon } or null per photo, in note order for a single day.
// Returns one array of locations per photo.
function resolveDay(gpsList, explicit, locations) {
  const fromGps = gpsList.map((g) => (g ? nearestLocation(g, locations) : null));
  return fromGps.map((own, i) => {
    if (own) return [own];
    if (explicit && explicit.length === 1) return explicit;
    for (let step = 1; step < fromGps.length; step++) {
      const before = fromGps[i - step];
      if (before) return [before];
      const after = fromGps[i + step];
      if (after) return [after];
    }
    if (explicit) return explicit;
    return [locations[0]];
  });
}

module.exports = { readGps, distanceKm, nearestLocation, explicitLocations, resolveDay, MAX_KM };
