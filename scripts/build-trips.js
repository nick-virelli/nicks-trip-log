const fs = require('fs');
const path = require('path');
const { parseTripDays } = require('./lib/parse');
const { extractSection } = require('./lib/extract-section');
const { mergeMediaIntoDays } = require('./lib/merge-media');
const { renderDayHtml, dayMiles, extractTrails, collectMediaFiles } = require('./lib/render');

const ROOT = path.join(__dirname, '..');
const TRIPS_DIR = path.join(ROOT, 'Trips');
const OUT_DATA = path.join(ROOT, 'data');
const OUT_BUILD = path.join(ROOT, '.build');

const STUDY_ABROAD_FILE = 'STUDY ABROAD SPRING 2025/STUDY ABROAD SPRING 2025.md';
const STUDY_ABROAD_ATT = 'STUDY ABROAD SPRING 2025/Attachments';
const PICS2_FILE = 'PICS PART 2 STUDY ABROAD 2025/PICS PART 2 STUDY ABROAD 2025.md';
const PICS2_ATT = 'PICS PART 2 STUDY ABROAD 2025/Attachments';

// country/region metadata used to build data/map-data.json
const PLACES = {
  usa: { label: 'United States', bounds: [[24, -125], [49, -66]] },
  peru: { label: 'Peru', bounds: [[-18, -81], [0, -68]] },
  uk: { label: 'United Kingdom', bounds: [[49, -11], [61, 2]] },
  germany: { label: 'Germany', bounds: [[47, 5.5], [55, 15.5]] },
  czechia: { label: 'Czechia', bounds: [[48.5, 12], [51, 19]] },
  switzerland: { label: 'Switzerland', bounds: [[45.8, 5.9], [47.9, 10.5]] },
  italy: { label: 'Italy', bounds: [[36, 6.5], [47.1, 18.5]] },
  sweden: { label: 'Sweden', bounds: [[55, 10.5], [69.5, 24.5]] },
  norway: { label: 'Norway', bounds: [[57.9, 4.5], [71.2, 31.5]] },
  portugal: { label: 'Portugal', bounds: [[36.8, -9.6], [42.2, -6]] },
  austria: { label: 'Austria', bounds: [[46.4, 9.5], [49.1, 17.2]] },
  morocco: { label: 'Morocco', bounds: [[27.6, -13.2], [35.9, -1]] },
  spain: { label: 'Spain', bounds: [[36, -9.5], [43.8, 4.3]] },
  netherlands: { label: 'Netherlands', bounds: [[50.7, 3.3], [53.6, 7.3]] },
  croatia: { label: 'Croatia', bounds: [[42.4, 13.5], [46.6, 19.5]] },
  france: { label: 'France', bounds: [[41.3, -5.2], [51.1, 9.6]] },
};

const REGIONS = {
  washington: { label: 'Washington', country: 'usa' },
  montana: { label: 'Montana', country: 'usa' },
  'puerto-rico': { label: 'Puerto Rico', country: 'usa' },
  southwest: { label: 'Utah / Arizona', country: 'usa' },
  wyoming: { label: 'Wyoming', country: 'usa' },
  utah: { label: 'Utah', country: 'usa' },
  'cusco-region': { label: 'Cusco Region', country: 'peru' },
  england: { label: 'England', country: 'uk' },
  saxony: { label: 'Saxony', country: 'germany' },
  'prague-region': { label: 'Prague', country: 'czechia' },
  'bernese-oberland': { label: 'Bernese Oberland', country: 'switzerland' },
  lombardy: { label: 'Lombardy & Beyond', country: 'italy' },
  'stockholm-region': { label: 'Stockholm', country: 'sweden' },
  troms: { label: 'Troms', country: 'norway' },
  'lisbon-region': { label: 'Lisbon & Porto', country: 'portugal' },
  'north-rhine-westphalia': { label: 'North Rhine-Westphalia', country: 'germany' },
  'vienna-region': { label: 'Vienna', country: 'austria' },
  brandenburg: { label: 'Brandenburg', country: 'germany' },
  'marrakesh-safi': { label: 'Marrakesh-Safi', country: 'morocco' },
  catalonia: { label: 'Catalonia', country: 'spain' },
  'north-holland': { label: 'North Holland', country: 'netherlands' },
  'balearic-islands': { label: 'Balearic Islands', country: 'spain' },
  'salzburg-region': { label: 'Salzburg', country: 'austria' },
  'split-dalmatia': { label: 'Split-Dalmatia', country: 'croatia' },
  'ile-de-france': { label: 'Île-de-France & Riviera', country: 'france' },
};

const trips = [
  {
    slug: 'mt-rainier-2026', title: 'MT RAINIER 2026', country: 'usa', region: 'washington',
    city: 'Mount Rainier', lat: 46.8523, lon: -121.7603, location: 'Mount Rainier / Seattle',
    dateStart: '2026-07-15', dateEnd: '2026-07-18',
    sourceFile: 'MT RAINIER 2026/MT RAINIER 2026.md', attachmentsDir: 'MT RAINIER 2026/Attachments',
  },
  {
    slug: 'glacier-2023', title: 'GLACIER 2023', country: 'usa', region: 'montana',
    city: 'Glacier National Park', lat: 48.7596, lon: -113.787, location: 'Glacier National Park',
    dateStart: null, dateEnd: null,
    sourceFile: 'GLACIER 2023/GLACIER 2023.md', attachmentsDir: null,
  },
  {
    slug: 'machu-picchu-2026', title: 'MACHU PICCHU 2026', country: 'peru', region: 'cusco-region',
    city: 'Machu Picchu', lat: -13.1631, lon: -72.545, location: 'Cusco / Ollantaytambo / Machu Picchu',
    dateStart: '2026-05-12', dateEnd: '2026-05-19',
    sourceFile: 'MACHU PICCHU 2026/MACHU PICCHU 2026.md', attachmentsDir: 'MACHU PICCHU 2026/Attachments',
  },
  {
    slug: 'puerto-rico-spring-break-2026', title: "PUERTO RICO SPRING BREAK 2026", country: 'usa', region: 'puerto-rico',
    city: 'San Juan', lat: 18.4655, lon: -66.1057, location: 'San Juan / El Yunque',
    dateStart: null, dateEnd: null,
    sourceFile: "PUERTO RICO SPRING BREAK 2026 (incomplete, won't finish)/PUERTO RICO SPRING BREAK 2026 (incomplete, won't finish).md",
    attachmentsDir: "PUERTO RICO SPRING BREAK 2026 (incomplete, won't finish)/Attachments",
  },
  {
    slug: 'southwest-road-trip-2025', title: 'SOUTHWEST ROAD TRIP 2025', country: 'usa', region: 'southwest',
    city: 'Moab', lat: 38.5733, lon: -109.5498, location: 'Capitol Reef / Moab / Antelope Canyon / Zion',
    dateStart: '2025-05-19', dateEnd: '2025-05-24',
    sourceFile: 'SOUTHWEST ROAD TRIP 2025/SOUTHWEST ROAD TRIP 2025.md', attachmentsDir: 'SOUTHWEST ROAD TRIP 2025/Attachments',
  },
  {
    slug: 'tetons', title: 'TETONS', country: 'usa', region: 'wyoming',
    city: 'Grand Teton National Park', lat: 43.7904, lon: -110.6818, location: 'Grand Teton National Park',
    dateStart: null, dateEnd: null,
    sourceFile: 'TETONS/TETONS.md', attachmentsDir: 'TETONS/Attachments',
  },
  {
    slug: 'zion-2024', title: 'ZION 2024', country: 'usa', region: 'utah',
    city: 'Zion National Park', lat: 37.2982, lon: -113.0263, location: 'Zion National Park / Bryce Canyon',
    dateStart: '2024-01-01', dateEnd: null,
    sourceFile: 'ZION 2024/ZION 2024.md', attachmentsDir: 'ZION 2024/Attachments',
  },
  {
    slug: 'europe-may-2023', title: 'EUROPE MAY 2023', country: 'uk', region: 'england',
    city: 'London', lat: 51.5074, lon: -0.1278, location: 'London / Barcelona / Madrid',
    dateStart: '2023-05-06', dateEnd: '2023-05-15',
    sourceFile: 'EUROPE MAY 2023/EUROPE MAY 2023.md', attachmentsDir: 'EUROPE MAY 2023/Attachments',
  },

  // --- Study Abroad Spring 2025 mega-note legs ---
  { slug: 'leipzig-2025', title: 'LEIPZIG', country: 'germany', region: 'saxony', city: 'Leipzig', lat: 51.3397, lon: 12.3731, location: 'Leipzig', dateStart: '2025-01-10', dateEnd: '2025-01-10', megaSection: 'Leipzig 1/10' },
  { slug: 'london-2025', title: 'LONDON', country: 'uk', region: 'england', city: 'London', lat: 51.5074, lon: -0.1278, location: 'London', dateStart: '2025-01-18', dateEnd: '2025-01-19', megaSection: 'London 1/18-1/19' },
  { slug: 'prague-budapest-2025', title: 'PRAGUE-BUDAPEST', country: 'czechia', region: 'prague-region', city: 'Prague', lat: 50.0755, lon: 14.4378, location: 'Prague / Budapest', dateStart: '2025-01-24', dateEnd: '2025-01-26', megaSection: 'Prague-Budapest 1/24-1/26' },
  { slug: 'switzerland-2025', title: 'SWITZERLAND', country: 'switzerland', region: 'bernese-oberland', city: 'Interlaken', lat: 46.6863, lon: 7.8632, location: 'Interlaken / Grindelwald', dateStart: '2025-01-30', dateEnd: '2025-02-01', megaSection: 'Switzerland 1/30-2/1' },
  { slug: 'italy-2025', title: 'ITALY', country: 'italy', region: 'lombardy', city: 'Milan', lat: 45.4642, lon: 9.19, location: 'Milan / Lake Como / Venice / Florence / Naples / Rome', dateStart: '2025-02-13', dateEnd: '2025-02-18', megaSection: 'Italy 2/13-2/18' },
  { slug: 'stockholm-copenhagen-2025', title: 'STOCKHOLM-COPENHAGEN', country: 'sweden', region: 'stockholm-region', city: 'Stockholm', lat: 59.3293, lon: 18.0686, location: 'Stockholm / Copenhagen', dateStart: '2025-02-28', dateEnd: '2025-03-02', megaSection: 'Stockholm-Copenhagen 2/28-3/2' },
  { slug: 'norway-2025', title: 'NORWAY', country: 'norway', region: 'troms', city: 'Tromsø', lat: 69.6492, lon: 18.9553, location: 'Tromsø', dateStart: '2025-03-07', dateEnd: '2025-03-09', megaSection: 'Norway 3/7-3/9' },
  { slug: 'portugal-manchester-2025', title: 'PORTUGAL-MANCHESTER', country: 'portugal', region: 'lisbon-region', city: 'Lisbon', lat: 38.7223, lon: -9.1393, location: 'Lisbon / Porto / Manchester', dateStart: '2025-03-14', dateEnd: '2025-03-16', megaSection: 'Portugal-Manchester 3/14-3/16' },
  { slug: 'western-germany-2025', title: 'WESTERN GERMANY', country: 'germany', region: 'north-rhine-westphalia', city: 'Dortmund', lat: 51.5136, lon: 7.4653, location: 'Dortmund / Aachen / Cologne', dateStart: '2025-03-21', dateEnd: '2025-03-23', megaSection: 'Western Germany 3/21-3/23' },
  { slug: 'vienna-athens-2025', title: 'VIENNA-ATHENS', country: 'austria', region: 'vienna-region', city: 'Vienna', lat: 48.2082, lon: 16.3738, location: 'Vienna / Bratislava / Athens', dateStart: '2025-03-28', dateEnd: '2025-04-02', megaSection: 'Vienna-Athens 3/28-4/2' },
  { slug: 'potsdam-2025', title: 'POTSDAM', country: 'germany', region: 'brandenburg', city: 'Potsdam', lat: 52.3906, lon: 13.0645, location: 'Potsdam', dateStart: '2025-04-04', dateEnd: '2025-04-04', megaSection: 'Potsdam 4/4' },
  { slug: 'morocco-malaga-2025', title: 'MOROCCO-MALAGA', country: 'morocco', region: 'marrakesh-safi', city: 'Marrakesh', lat: 31.6295, lon: -7.9811, location: 'Marrakesh / Málaga', dateStart: '2025-04-04', dateEnd: '2025-04-07', megaSection: 'Morocco-Malaga 4/4-4/7' },
  { slug: 'barcelona-2025', title: 'BARCELONA', country: 'spain', region: 'catalonia', city: 'Barcelona', lat: 41.3874, lon: 2.1686, location: 'Barcelona', dateStart: '2025-04-08', dateEnd: '2025-04-10', megaSection: 'Barcelona 4/8-4/10' },
  { slug: 'netherlands-2025', title: 'NETHERLANDS', country: 'netherlands', region: 'north-holland', city: 'Amsterdam', lat: 52.3676, lon: 4.9041, location: 'Amsterdam / Eindhoven / Utrecht', dateStart: '2025-04-11', dateEnd: '2025-04-13', megaSection: 'Netherlands 4/11-4/13', picsSection: 'Netherlands 4/11-4/13' },
  { slug: 'palma-2025', title: 'PALMA', country: 'spain', region: 'balearic-islands', city: 'Palma de Mallorca', lat: 39.5696, lon: 2.6502, location: 'Palma de Mallorca', dateStart: '2025-04-18', dateEnd: '2025-04-21', megaSection: 'Palma 4/18-4/21', picsSection: 'Palma 4/18-4/21' },
  { slug: 'salzburg-munich-2025', title: 'SALZBURG-MUNICH', country: 'austria', region: 'salzburg-region', city: 'Salzburg', lat: 47.8095, lon: 13.055, location: 'Salzburg / Munich / Neuschwanstein', dateStart: '2025-04-24', dateEnd: '2025-04-27', megaSection: 'Salzburg-Munich 4/24-4/27', picsSection: 'Salzburg-Munich 4/24-4/27' },
  { slug: 'croatia-2025', title: 'CROATIA', country: 'croatia', region: 'split-dalmatia', city: 'Split', lat: 43.5081, lon: 16.4402, location: 'Split / Hvar / Krka', dateStart: '2025-04-29', dateEnd: '2025-05-01', megaSection: 'Croatia 4/29-5/1', picsSection: 'Croatia 4/29-5/1' },
  { slug: 'france-monaco-2025', title: 'FRANCE-MONACO', country: 'france', region: 'ile-de-france', city: 'Paris', lat: 48.8566, lon: 2.3522, location: 'Paris / Nice / Èze / Monaco', dateStart: '2025-05-01', dateEnd: '2025-05-04', megaSection: 'France-Monaco 5/1-5/4', picsSection: 'France-Monaco 5/1-5/4' },
];

function readTrip(t) {
  const fileCache = {};
  const read = (rel) => {
    if (!fileCache[rel]) fileCache[rel] = fs.readFileSync(path.join(TRIPS_DIR, rel), 'utf8');
    return fileCache[rel];
  };

  let days;
  let attachmentsDir = t.attachmentsDir;

  if (t.megaSection) {
    const full = read(STUDY_ABROAD_FILE);
    const section = extractSection(full, t.megaSection);
    days = parseTripDays(section);
    attachmentsDir = STUDY_ABROAD_ATT;

    if (t.picsSection) {
      const picsFull = read(PICS2_FILE);
      const picsSection = extractSection(picsFull, t.picsSection);
      const picsDays = parseTripDays(picsSection);
      mergeMediaIntoDays(days, picsDays);
    }
  } else {
    const full = read(t.sourceFile);
    days = parseTripDays(full);
  }

  return { days, attachmentsDir };
}

function slugFile(name) {
  return name.replace(/[^A-Za-z0-9.\-]/g, '_');
}

function main() {
  fs.mkdirSync(OUT_DATA, { recursive: true });
  fs.mkdirSync(OUT_BUILD, { recursive: true });

  const posts = [];
  const mediaManifest = []; // { src: abs path, dest: relative "images/trips/slug/name" }
  const mapCountries = {};

  for (const t of trips) {
    console.log(`Parsing ${t.slug}...`);
    const { days, attachmentsDir } = readTrip(t);
    if (t.picsSection && attachmentsDir !== STUDY_ABROAD_ATT) throw new Error('unexpected');

    // Build media map: original "Attachments/xxx" -> new site path, resolving each
    // reference against the right source folder (main attachments, or PICS2's for
    // the merged trips' image nodes).
    const mediaFiles = collectMediaFiles(days);
    const mediaMap = new Map();
    for (const relRef of mediaFiles) {
      const filename = relRef.split('/').pop();
      const isJpegOrPng = /\.(jpe?g|png)$/i.test(filename);
      const isHeic = /\.(heic|heif)$/i.test(filename);
      const isVideo = /\.(mov|mp4)$/i.test(filename);
      const newExt = isVideo ? filename.split('.').pop() : 'jpg';
      const newName = slugFile(filename.replace(/\.[^.]+$/, '')) + '.' + newExt.toLowerCase();
      const dest = `images/trips/${t.slug}/${newName}`;

      // Resolve source: try this trip's own attachments dir; for merge trips, also
      // try PICS2's attachments dir (that's where the spliced-in media lives).
      const candidates = [];
      if (attachmentsDir) candidates.push(path.join(TRIPS_DIR, attachmentsDir, filename));
      if (t.picsSection) candidates.push(path.join(TRIPS_DIR, PICS2_ATT, filename));
      const src = candidates.find((c) => fs.existsSync(c));
      if (!src) {
        console.warn(`  ! media not found on disk: ${relRef} (trip ${t.slug})`);
        continue;
      }
      mediaMap.set(relRef, dest);
      mediaManifest.push({ src, dest, kind: isVideo ? 'video' : isHeic ? 'heic' : isJpegOrPng ? 'raster' : 'other' });
    }

    const dayObjs = days.map((d) => ({
      label: d.label,
      date: null,
      miles: dayMiles(d),
      body_html: renderDayHtml(d, mediaMap),
      trails: extractTrails(d),
    }));

    const totalMiles = dayObjs.reduce((sum, d) => sum + (d.miles || 0), 0);

    posts.push({
      id: t.slug,
      country: t.country,
      region: t.region,
      city: t.city,
      location: t.location,
      title: t.title,
      date_start: t.dateStart,
      date_end: t.dateEnd,
      total_miles: Math.round(totalMiles * 100) / 100,
      days: dayObjs,
      source_note: t.megaSection ? `Trips/STUDY ABROAD SPRING 2025/STUDY ABROAD SPRING 2025.md#${t.megaSection}` : `Trips/${t.sourceFile}`,
    });

    if (!mapCountries[t.country]) {
      mapCountries[t.country] = { label: PLACES[t.country].label, bounds: PLACES[t.country].bounds, regions: {} };
    }
    if (!mapCountries[t.country].regions[t.region]) {
      mapCountries[t.country].regions[t.region] = { label: REGIONS[t.region].label, cities: [] };
    }
    const cities = mapCountries[t.country].regions[t.region].cities;
    if (!cities.find((c) => c.name === t.city)) {
      cities.push({ name: t.city, lat: t.lat, lon: t.lon });
    }
  }

  // sort posts by date (unknown dates last), most recent first for "latest trip" stat
  const withDate = posts.filter((p) => p.date_start);
  const withoutDate = posts.filter((p) => !p.date_start);
  withDate.sort((a, b) => (a.date_start < b.date_start ? 1 : -1));
  const sortedPosts = [...withDate, ...withoutDate];

  fs.writeFileSync(path.join(OUT_DATA, 'posts.json'), JSON.stringify({ posts: sortedPosts }, null, 2));
  fs.writeFileSync(path.join(OUT_DATA, 'posts.js'), `window.__POSTS__ = ${JSON.stringify({ posts: sortedPosts }, null, 2)};\n`);

  const mapData = { countries: mapCountries };
  fs.writeFileSync(path.join(OUT_DATA, 'map-data.json'), JSON.stringify(mapData, null, 2));
  fs.writeFileSync(path.join(OUT_DATA, 'map-data.js'), `window.__MAP_DATA__ = ${JSON.stringify(mapData, null, 2)};\n`);

  fs.writeFileSync(path.join(OUT_BUILD, 'media-manifest.json'), JSON.stringify(mediaManifest, null, 2));

  console.log(`\nWrote ${sortedPosts.length} trips, ${mediaManifest.length} media files to convert.`);
}

main();
