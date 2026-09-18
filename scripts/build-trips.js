const fs = require('fs');
const path = require('path');
const { parseTripDays } = require('./lib/parse');
const { extractSection } = require('./lib/extract-section');
const { mergeMediaIntoDays } = require('./lib/merge-media');
const { renderDayHtml, dayMiles, extractTrails, collectMediaFiles } = require('./lib/render');
const { scanTripPhotos, resolveTripDates } = require('./lib/exif-dates');

const ROOT = path.join(__dirname, '..');
const TRIPS_DIR = path.join(ROOT, 'Trips');
const OUT_DATA = path.join(ROOT, 'data');
const OUT_BUILD = path.join(ROOT, '.build');
// Optional per-trip cover choice: { "<trip-id>": "images/trips/<trip-id>/<file>.jpg" }.
// Edit this file to change a cover; the build validates it and never needs a code change.
const COVER_OVERRIDES_FILE = path.join(ROOT, 'content', 'cover-overrides.json');

const STUDY_ABROAD_FILE = 'STUDY ABROAD SPRING 2025/STUDY ABROAD SPRING 2025.md';
const STUDY_ABROAD_ATT = 'STUDY ABROAD SPRING 2025/Attachments';
const PICS2_FILE = 'PICS PART 2 STUDY ABROAD 2025/PICS PART 2 STUDY ABROAD 2025.md';
const PICS2_ATT = 'PICS PART 2 STUDY ABROAD 2025/Attachments';

// Continents give the map its top drill-down level. Bounds are [southWest, northEast]
// in [lat, lon], sized to frame the countries visited rather than the whole landmass.
const CONTINENTS = {
  'north-america': { label: 'North America', bounds: [[7, -170], [72, -52]] },
  'south-america': { label: 'South America', bounds: [[-56, -82], [13, -34]] },
  europe: { label: 'Europe', bounds: [[35, -11], [71.5, 32]] },
  africa: { label: 'Africa', bounds: [[-35, -18], [37.5, 52]] },
};

// country metadata used to build data/map-data.json. iso3 and isoNumeric are there
// so a countries GeoJSON can be joined later without another build change. Note:
// Natural Earth's ISO_A3 is "-99" for France and Norway in the 110m set; join on
// ADM0_A3 / ISO_A3_EH or on the numeric id instead.
const PLACES = {
  usa: { label: 'United States', continent: 'north-america', iso3: 'USA', isoNumeric: '840', bounds: [[24, -125], [49, -66]] },
  peru: { label: 'Peru', continent: 'south-america', iso3: 'PER', isoNumeric: '604', bounds: [[-18, -81], [0, -68]] },
  uk: { label: 'United Kingdom', continent: 'europe', iso3: 'GBR', isoNumeric: '826', bounds: [[49, -11], [61, 2]] },
  germany: { label: 'Germany', continent: 'europe', iso3: 'DEU', isoNumeric: '276', bounds: [[47, 5.5], [55, 15.5]] },
  czechia: { label: 'Czechia', continent: 'europe', iso3: 'CZE', isoNumeric: '203', bounds: [[48.5, 12], [51, 19]] },
  hungary: { label: 'Hungary', continent: 'europe', iso3: 'HUN', isoNumeric: '348', bounds: [[45.7, 16], [48.6, 22.9]] },
  switzerland: { label: 'Switzerland', continent: 'europe', iso3: 'CHE', isoNumeric: '756', bounds: [[45.8, 5.9], [47.9, 10.5]] },
  italy: { label: 'Italy', continent: 'europe', iso3: 'ITA', isoNumeric: '380', bounds: [[36, 6.5], [47.1, 18.5]] },
  sweden: { label: 'Sweden', continent: 'europe', iso3: 'SWE', isoNumeric: '752', bounds: [[55, 10.5], [69.5, 24.5]] },
  denmark: { label: 'Denmark', continent: 'europe', iso3: 'DNK', isoNumeric: '208', bounds: [[54.5, 8], [57.8, 15.5]] },
  norway: { label: 'Norway', continent: 'europe', iso3: 'NOR', isoNumeric: '578', bounds: [[57.9, 4.5], [71.2, 31.5]] },
  portugal: { label: 'Portugal', continent: 'europe', iso3: 'PRT', isoNumeric: '620', bounds: [[36.8, -9.6], [42.2, -6]] },
  austria: { label: 'Austria', continent: 'europe', iso3: 'AUT', isoNumeric: '040', bounds: [[46.4, 9.5], [49.1, 17.2]] },
  slovakia: { label: 'Slovakia', continent: 'europe', iso3: 'SVK', isoNumeric: '703', bounds: [[47.7, 16.8], [49.6, 22.6]] },
  morocco: { label: 'Morocco', continent: 'africa', iso3: 'MAR', isoNumeric: '504', bounds: [[27.6, -13.2], [35.9, -1]] },
  spain: { label: 'Spain', continent: 'europe', iso3: 'ESP', isoNumeric: '724', bounds: [[36, -9.5], [43.8, 4.3]] },
  netherlands: { label: 'Netherlands', continent: 'europe', iso3: 'NLD', isoNumeric: '528', bounds: [[50.7, 3.3], [53.6, 7.3]] },
  croatia: { label: 'Croatia', continent: 'europe', iso3: 'HRV', isoNumeric: '191', bounds: [[42.4, 13.5], [46.6, 19.5]] },
  france: { label: 'France', continent: 'europe', iso3: 'FRA', isoNumeric: '250', bounds: [[41.3, -5.2], [51.1, 9.6]] },
  monaco: { label: 'Monaco', continent: 'europe', iso3: 'MCO', isoNumeric: '492', bounds: [[43.72, 7.4], [43.75, 7.44]] },
  greece: { label: 'Greece', continent: 'europe', iso3: 'GRC', isoNumeric: '300', bounds: [[34.8, 19.3], [41.8, 29.7]] },
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
  bavaria: { label: 'Bavaria', country: 'germany' },
  'prague-region': { label: 'Prague', country: 'czechia' },
  'budapest-region': { label: 'Budapest', country: 'hungary' },
  'bernese-oberland': { label: 'Bernese Oberland', country: 'switzerland' },
  lombardy: { label: 'Lombardy', country: 'italy' },
  veneto: { label: 'Veneto', country: 'italy' },
  tuscany: { label: 'Tuscany', country: 'italy' },
  campania: { label: 'Campania', country: 'italy' },
  lazio: { label: 'Lazio', country: 'italy' },
  'stockholm-region': { label: 'Stockholm', country: 'sweden' },
  'copenhagen-region': { label: 'Copenhagen', country: 'denmark' },
  troms: { label: 'Troms', country: 'norway' },
  'lisbon-region': { label: 'Lisbon', country: 'portugal' },
  'porto-region': { label: 'Porto', country: 'portugal' },
  'north-rhine-westphalia': { label: 'North Rhine-Westphalia', country: 'germany' },
  'vienna-region': { label: 'Vienna', country: 'austria' },
  'salzburg-region': { label: 'Salzburg', country: 'austria' },
  'bratislava-region': { label: 'Bratislava', country: 'slovakia' },
  'attica': { label: 'Attica', country: 'greece' },
  brandenburg: { label: 'Brandenburg', country: 'germany' },
  'marrakesh-safi': { label: 'Marrakesh-Safi', country: 'morocco' },
  catalonia: { label: 'Catalonia', country: 'spain' },
  'madrid-region': { label: 'Madrid', country: 'spain' },
  andalusia: { label: 'Andalusia', country: 'spain' },
  'north-holland': { label: 'North Holland', country: 'netherlands' },
  'north-brabant': { label: 'North Brabant', country: 'netherlands' },
  'utrecht-region': { label: 'Utrecht', country: 'netherlands' },
  'balearic-islands': { label: 'Balearic Islands', country: 'spain' },
  'split-dalmatia': { label: 'Split-Dalmatia', country: 'croatia' },
  'ile-de-france': { label: 'Île-de-France', country: 'france' },
  'provence-alpes-cote-dazur': { label: 'French Riviera', country: 'france' },
  monaco: { label: 'Monaco', country: 'monaco' },
};

// Collections group trips that come from one source note. Membership is derived
// from each post's source_note prefix, never listed by hand.
const COLLECTIONS = [
  { id: 'study-abroad-2025', title: 'Study Abroad, Spring 2025', sourcePrefix: 'Trips/STUDY ABROAD SPRING 2025/' },
];

// Every trip carries a `locations[]` list of every real place it touched - there is
// no single "main pin" anymore. Each location becomes its own map pin; when two
// different trips touch the exact same place (matched by country+name), that pin
// shows a chooser instead of merging or duplicating.
const trips = [
  {
    slug: 'mt-rainier-2026', title: 'MT RAINIER 2026',
    location: 'Mount Rainier / Seattle', dateStart: '2026-07-15', dateEnd: '2026-07-18',
    sourceFile: 'MT RAINIER 2026/MT RAINIER 2026.md', attachmentsDir: 'MT RAINIER 2026/Attachments',
    locations: [
      { name: 'Mount Rainier', country: 'usa', region: 'washington', lat: 46.8523, lon: -121.7603 },
      { name: 'Seattle', country: 'usa', region: 'washington', lat: 47.6062, lon: -122.3321 },
    ],
  },
  {
    slug: 'glacier-2023', title: 'GLACIER 2023',
    location: 'Glacier National Park', dateStart: null, dateEnd: null,
    sourceFile: 'GLACIER 2023/GLACIER 2023.md', attachmentsDir: null,
    locations: [{ name: 'Glacier National Park', country: 'usa', region: 'montana', lat: 48.7596, lon: -113.787 }],
  },
  {
    slug: 'machu-picchu-2026', title: 'MACHU PICCHU 2026',
    location: 'Cusco / Ollantaytambo / Machu Picchu', dateStart: '2026-05-12', dateEnd: '2026-05-19',
    sourceFile: 'MACHU PICCHU 2026/MACHU PICCHU 2026.md', attachmentsDir: 'MACHU PICCHU 2026/Attachments',
    locations: [
      { name: 'Cusco', country: 'peru', region: 'cusco-region', lat: -13.5319, lon: -71.9675 },
      { name: 'Ollantaytambo', country: 'peru', region: 'cusco-region', lat: -13.2597, lon: -72.2659 },
      { name: 'Machu Picchu', country: 'peru', region: 'cusco-region', lat: -13.1631, lon: -72.545 },
    ],
  },
  {
    slug: 'puerto-rico-spring-break-2026', title: 'PUERTO RICO SPRING BREAK 2026',
    location: 'San Juan / El Yunque', dateStart: '2026-03-01', dateEnd: '2026-03-01', datePrecision: 'month',
    sourceFile: "PUERTO RICO SPRING BREAK 2026 (incomplete, won't finish)/PUERTO RICO SPRING BREAK 2026 (incomplete, won't finish).md",
    attachmentsDir: "PUERTO RICO SPRING BREAK 2026 (incomplete, won't finish)/Attachments",
    locations: [
      { name: 'San Juan', country: 'usa', region: 'puerto-rico', lat: 18.4655, lon: -66.1057 },
      { name: 'El Yunque', country: 'usa', region: 'puerto-rico', lat: 18.3213, lon: -65.7844 },
    ],
  },
  {
    slug: 'southwest-road-trip-2025', title: 'SOUTHWEST ROAD TRIP 2025',
    location: 'Capitol Reef / Moab / Antelope Canyon / Zion', dateStart: '2025-05-19', dateEnd: '2025-05-24',
    sourceFile: 'SOUTHWEST ROAD TRIP 2025/SOUTHWEST ROAD TRIP 2025.md', attachmentsDir: 'SOUTHWEST ROAD TRIP 2025/Attachments',
    locations: [
      { name: 'Capitol Reef National Park', country: 'usa', region: 'southwest', lat: 38.29, lon: -111.2615 },
      { name: 'Moab', country: 'usa', region: 'southwest', lat: 38.5733, lon: -109.5498 },
      { name: 'Antelope Canyon', country: 'usa', region: 'southwest', lat: 36.8619, lon: -111.4383 },
      { name: 'Zion National Park', country: 'usa', region: 'utah', lat: 37.2982, lon: -113.0263 },
    ],
  },
  {
    slug: 'tetons', title: 'TETONS',
    location: 'Grand Teton National Park', dateStart: '2023-07-01', dateEnd: '2023-07-01', datePrecision: 'month',
    sourceFile: 'TETONS/TETONS.md', attachmentsDir: 'TETONS/Attachments',
    locations: [{ name: 'Grand Teton National Park', country: 'usa', region: 'wyoming', lat: 43.7904, lon: -110.6818 }],
  },
  {
    slug: 'zion-2024', title: 'ZION 2024',
    location: 'Zion National Park / Bryce Canyon', dateStart: null, dateEnd: null,
    sourceFile: 'ZION 2024/ZION 2024.md', attachmentsDir: 'ZION 2024/Attachments',
    locations: [
      { name: 'Zion National Park', country: 'usa', region: 'utah', lat: 37.2982, lon: -113.0263 },
      { name: 'Bryce Canyon National Park', country: 'usa', region: 'utah', lat: 37.593, lon: -112.1871 },
    ],
  },
  {
    slug: 'europe-may-2023', title: 'EUROPE MAY 2023',
    location: 'London / Barcelona / Madrid', dateStart: '2023-05-06', dateEnd: '2023-05-15',
    sourceFile: 'EUROPE MAY 2023/EUROPE MAY 2023.md', attachmentsDir: 'EUROPE MAY 2023/Attachments',
    locations: [
      { name: 'London', country: 'uk', region: 'england', lat: 51.5074, lon: -0.1278 },
      { name: 'Barcelona', country: 'spain', region: 'catalonia', lat: 41.3874, lon: 2.1686 },
      { name: 'Madrid', country: 'spain', region: 'madrid-region', lat: 40.4168, lon: -3.7038 },
    ],
  },

  // --- Study Abroad Spring 2025 mega-note legs ---
  {
    slug: 'leipzig-2025', title: 'LEIPZIG', location: 'Leipzig',
    dateStart: '2025-01-10', dateEnd: '2025-01-10', megaSection: 'Leipzig 1/10',
    locations: [{ name: 'Leipzig', country: 'germany', region: 'saxony', lat: 51.3397, lon: 12.3731 }],
  },
  {
    slug: 'london-2025', title: 'LONDON', location: 'London',
    dateStart: '2025-01-18', dateEnd: '2025-01-19', megaSection: 'London 1/18-1/19',
    locations: [{ name: 'London', country: 'uk', region: 'england', lat: 51.5074, lon: -0.1278 }],
  },
  {
    slug: 'prague-budapest-2025', title: 'PRAGUE-BUDAPEST', location: 'Prague / Budapest',
    dateStart: '2025-01-24', dateEnd: '2025-01-26', megaSection: 'Prague-Budapest 1/24-1/26',
    locations: [
      { name: 'Prague', country: 'czechia', region: 'prague-region', lat: 50.0755, lon: 14.4378 },
      { name: 'Budapest', country: 'hungary', region: 'budapest-region', lat: 47.4979, lon: 19.0402 },
    ],
  },
  {
    slug: 'switzerland-2025', title: 'SWITZERLAND', location: 'Interlaken / Grindelwald',
    dateStart: '2025-01-30', dateEnd: '2025-02-01', megaSection: 'Switzerland 1/30-2/1',
    locations: [
      { name: 'Interlaken', country: 'switzerland', region: 'bernese-oberland', lat: 46.6863, lon: 7.8632 },
      { name: 'Grindelwald', country: 'switzerland', region: 'bernese-oberland', lat: 46.6244, lon: 8.0414 },
    ],
  },
  {
    slug: 'italy-2025', title: 'ITALY', location: 'Milan / Lake Como / Venice / Florence / Naples / Rome',
    dateStart: '2025-02-13', dateEnd: '2025-02-18', megaSection: 'Italy 2/13-2/18',
    locations: [
      { name: 'Milan', country: 'italy', region: 'lombardy', lat: 45.4642, lon: 9.19 },
      { name: 'Como', country: 'italy', region: 'lombardy', lat: 45.808, lon: 9.0852 },
      { name: 'Venice', country: 'italy', region: 'veneto', lat: 45.4408, lon: 12.3155 },
      { name: 'Florence', country: 'italy', region: 'tuscany', lat: 43.7696, lon: 11.2558 },
      { name: 'Naples', country: 'italy', region: 'campania', lat: 40.8518, lon: 14.2681 },
      { name: 'Rome', country: 'italy', region: 'lazio', lat: 41.9028, lon: 12.4964 },
    ],
  },
  {
    slug: 'stockholm-copenhagen-2025', title: 'STOCKHOLM-COPENHAGEN', location: 'Stockholm / Copenhagen',
    dateStart: '2025-02-28', dateEnd: '2025-03-02', megaSection: 'Stockholm-Copenhagen 2/28-3/2',
    locations: [
      { name: 'Stockholm', country: 'sweden', region: 'stockholm-region', lat: 59.3293, lon: 18.0686 },
      { name: 'Copenhagen', country: 'denmark', region: 'copenhagen-region', lat: 55.6761, lon: 12.5683 },
    ],
  },
  {
    slug: 'norway-2025', title: 'NORWAY', location: 'Tromsø',
    dateStart: '2025-03-07', dateEnd: '2025-03-09', megaSection: 'Norway 3/7-3/9',
    locations: [{ name: 'Tromsø', country: 'norway', region: 'troms', lat: 69.6492, lon: 18.9553 }],
  },
  {
    slug: 'portugal-manchester-2025', title: 'PORTUGAL-MANCHESTER', location: 'Lisbon / Porto / Manchester',
    dateStart: '2025-03-14', dateEnd: '2025-03-16', megaSection: 'Portugal-Manchester 3/14-3/16',
    locations: [
      { name: 'Lisbon', country: 'portugal', region: 'lisbon-region', lat: 38.7223, lon: -9.1393 },
      { name: 'Porto', country: 'portugal', region: 'porto-region', lat: 41.1579, lon: -8.6291 },
      { name: 'Manchester', country: 'uk', region: 'england', lat: 53.4808, lon: -2.2426 },
    ],
  },
  {
    slug: 'western-germany-2025', title: 'WESTERN GERMANY', location: 'Dortmund / Aachen / Cologne',
    dateStart: '2025-03-21', dateEnd: '2025-03-23', megaSection: 'Western Germany 3/21-3/23',
    locations: [
      { name: 'Dortmund', country: 'germany', region: 'north-rhine-westphalia', lat: 51.5136, lon: 7.4653 },
      { name: 'Aachen', country: 'germany', region: 'north-rhine-westphalia', lat: 50.7753, lon: 6.0839 },
      { name: 'Cologne', country: 'germany', region: 'north-rhine-westphalia', lat: 50.9375, lon: 6.9603 },
    ],
  },
  {
    slug: 'vienna-athens-2025', title: 'VIENNA-ATHENS', location: 'Vienna / Bratislava / Athens',
    dateStart: '2025-03-28', dateEnd: '2025-04-02', megaSection: 'Vienna-Athens 3/28-4/2',
    locations: [
      { name: 'Vienna', country: 'austria', region: 'vienna-region', lat: 48.2082, lon: 16.3738 },
      { name: 'Bratislava', country: 'slovakia', region: 'bratislava-region', lat: 48.1486, lon: 17.1077 },
      { name: 'Athens', country: 'greece', region: 'attica', lat: 37.9838, lon: 23.7275 },
    ],
  },
  {
    slug: 'potsdam-2025', title: 'POTSDAM', location: 'Potsdam',
    dateStart: '2025-04-04', dateEnd: '2025-04-04', megaSection: 'Potsdam 4/4',
    locations: [{ name: 'Potsdam', country: 'germany', region: 'brandenburg', lat: 52.3906, lon: 13.0645 }],
  },
  {
    slug: 'morocco-malaga-2025', title: 'MOROCCO-MALAGA', location: 'Marrakesh / Málaga',
    dateStart: '2025-04-04', dateEnd: '2025-04-07', megaSection: 'Morocco-Malaga 4/4-4/7',
    locations: [
      { name: 'Marrakesh', country: 'morocco', region: 'marrakesh-safi', lat: 31.6295, lon: -7.9811 },
      { name: 'Málaga', country: 'spain', region: 'andalusia', lat: 36.7213, lon: -4.4214 },
    ],
  },
  {
    slug: 'barcelona-2025', title: 'BARCELONA', location: 'Barcelona',
    dateStart: '2025-04-08', dateEnd: '2025-04-10', megaSection: 'Barcelona 4/8-4/10',
    locations: [{ name: 'Barcelona', country: 'spain', region: 'catalonia', lat: 41.3874, lon: 2.1686 }],
  },
  {
    slug: 'netherlands-2025', title: 'NETHERLANDS', location: 'Amsterdam / Eindhoven / Utrecht',
    dateStart: '2025-04-11', dateEnd: '2025-04-13', megaSection: 'Netherlands 4/11-4/13', picsSection: 'Netherlands 4/11-4/13',
    locations: [
      { name: 'Amsterdam', country: 'netherlands', region: 'north-holland', lat: 52.3676, lon: 4.9041 },
      { name: 'Eindhoven', country: 'netherlands', region: 'north-brabant', lat: 51.4416, lon: 5.4697 },
      { name: 'Utrecht', country: 'netherlands', region: 'utrecht-region', lat: 52.0907, lon: 5.1214 },
    ],
  },
  {
    slug: 'palma-2025', title: 'PALMA', location: 'Palma de Mallorca',
    dateStart: '2025-04-18', dateEnd: '2025-04-21', megaSection: 'Palma 4/18-4/21', picsSection: 'Palma 4/18-4/21',
    locations: [{ name: 'Palma de Mallorca', country: 'spain', region: 'balearic-islands', lat: 39.5696, lon: 2.6502 }],
  },
  {
    slug: 'salzburg-munich-2025', title: 'SALZBURG-MUNICH', location: 'Salzburg / Munich / Neuschwanstein',
    dateStart: '2025-04-24', dateEnd: '2025-04-27', megaSection: 'Salzburg-Munich 4/24-4/27', picsSection: 'Salzburg-Munich 4/24-4/27',
    locations: [
      { name: 'Salzburg', country: 'austria', region: 'salzburg-region', lat: 47.8095, lon: 13.055 },
      { name: 'Munich', country: 'germany', region: 'bavaria', lat: 48.1351, lon: 11.582 },
      { name: 'Neuschwanstein Castle', country: 'germany', region: 'bavaria', lat: 47.5576, lon: 10.7498 },
    ],
  },
  {
    slug: 'croatia-2025', title: 'CROATIA', location: 'Split / Hvar / Krka',
    dateStart: '2025-04-29', dateEnd: '2025-05-01', megaSection: 'Croatia 4/29-5/1', picsSection: 'Croatia 4/29-5/1',
    locations: [
      { name: 'Split', country: 'croatia', region: 'split-dalmatia', lat: 43.5081, lon: 16.4402 },
      { name: 'Hvar', country: 'croatia', region: 'split-dalmatia', lat: 43.1729, lon: 16.4414 },
      { name: 'Krka National Park', country: 'croatia', region: 'split-dalmatia', lat: 43.8486, lon: 15.9736 },
    ],
  },
  {
    slug: 'france-monaco-2025', title: 'FRANCE-MONACO', location: 'Paris / Nice / Èze / Monaco',
    dateStart: '2025-05-01', dateEnd: '2025-05-04', megaSection: 'France-Monaco 5/1-5/4', picsSection: 'France-Monaco 5/1-5/4',
    locations: [
      { name: 'Paris', country: 'france', region: 'ile-de-france', lat: 48.8566, lon: 2.3522 },
      { name: 'Nice', country: 'france', region: 'provence-alpes-cote-dazur', lat: 43.7102, lon: 7.262 },
      { name: 'Èze', country: 'france', region: 'provence-alpes-cote-dazur', lat: 43.7276, lon: 7.3616 },
      { name: 'Monaco', country: 'monaco', region: 'monaco', lat: 43.7384, lon: 7.4246 },
    ],
  },
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

// Multi-city trips don't tag each day with a location field, but most day labels
// already name the city in parens ("Friday (Salzburg)", "Sunday (Nice-Èze-Monaco)").
// Pull those hints out and match them against the trip's location list so gallery
// photos can be filtered by place, not just by trip; falls back to the trip's
// primary location when a day doesn't name one (e.g. "Day 1 - Travel").
function matchDayLocations(label, locations) {
  const parenMatch = label.match(/\(([^)]+)\)/);
  if (!parenMatch) return [locations[0]];
  const candidates = parenMatch[1].split(/[\/,-]/).map((s) => s.trim()).filter(Boolean);
  const matched = [];
  for (const loc of locations) {
    const locLower = loc.name.toLowerCase();
    const isMatch = candidates.some((c) => {
      const cLower = c.toLowerCase();
      return locLower.includes(cLower) || cLower.includes(locLower);
    });
    if (isMatch) matched.push(loc);
  }
  return matched.length ? matched : [locations[0]];
}

function collectGalleryImages(days, locations, mediaMap) {
  const entries = [];
  for (const day of days) {
    const dayLocations = matchDayLocations(day.label, locations);
    const scan = (nodes) => {
      for (const n of nodes) {
        if (n.media && n.media.type === 'image') {
          const dest = mediaMap.get(n.media.file);
          if (dest) entries.push({ src: dest, locations: dayLocations });
        }
        scan(n.children);
      }
    };
    scan(day.children);
  }
  return entries;
}

async function main() {
  fs.mkdirSync(OUT_DATA, { recursive: true });
  fs.mkdirSync(OUT_BUILD, { recursive: true });

  const posts = [];
  const mediaManifest = []; // { src: abs path, dest: relative "images/trips/slug/name" }
  const galleryImages = [];
  const tripGallerySrcs = new Map(); // slug -> gallery srcs in document order, for covers
  // Grouped by "country|name" so two trips touching the exact same real place (e.g.
  // Barcelona, or the Zion stop inside the Southwest road trip) share one pin.
  const pinIndex = new Map();

  for (const t of trips) {
    console.log(`Parsing ${t.slug}...`);
    const { days, attachmentsDir } = readTrip(t);
    if (t.picsSection && attachmentsDir !== STUDY_ABROAD_ATT) throw new Error('unexpected');

    // Build media map: original "Attachments/xxx" -> new site path, resolving each
    // reference against the right source folder (main attachments, or PICS2's for
    // the merged trips' image nodes).
    const mediaFiles = collectMediaFiles(days);
    const mediaMap = new Map();
    const tripPhotos = []; // this trip's manifest items, for the EXIF scan
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
      const item = { src, dest, kind: isVideo ? 'video' : isHeic ? 'heic' : isJpegOrPng ? 'raster' : 'other' };
      mediaManifest.push(item);
      tripPhotos.push(item);
    }

    // A note that references no images at all (Puerto Rico) can still have photos
    // sitting in its Attachments folder. Those go to the gallery and cover only;
    // the note text is never touched. Videos are left alone.
    const extraGallery = [];
    const hasImageRefs = mediaFiles.some((f) => /\.(jpe?g|png|heic|heif)$/i.test(f));
    if (!hasImageRefs && attachmentsDir && fs.existsSync(path.join(TRIPS_DIR, attachmentsDir))) {
      const loose = fs.readdirSync(path.join(TRIPS_DIR, attachmentsDir))
        .filter((f) => /\.(jpe?g|png|heic|heif)$/i.test(f))
        .sort();
      for (const filename of loose) {
        const isHeic = /\.(heic|heif)$/i.test(filename);
        const newName = slugFile(filename.replace(/\.[^.]+$/, '')) + '.jpg';
        const dest = `images/trips/${t.slug}/${newName}`;
        const item = { src: path.join(TRIPS_DIR, attachmentsDir, filename), dest, kind: isHeic ? 'heic' : 'raster' };
        mediaManifest.push(item);
        tripPhotos.push(item);
        extraGallery.push({ src: dest, locations: [t.locations[0]] });
      }
      if (loose.length) console.log(`  gallery only: ${loose.length} unreferenced photos from ${attachmentsDir}`);
    }

    // Dates: EXIF from the originals can fill a null range or tighten a month
    // placeholder, never override a typed day-precision range.
    const scan = await scanTripPhotos(tripPhotos.filter((m) => m.kind !== 'video').map((m) => m.src));
    const dates = resolveTripDates({ dateStart: t.dateStart, dateEnd: t.dateEnd, datePrecision: t.datePrecision }, scan);
    console.log(`  dates: ${dates.date_start || 'null'}..${dates.date_end || 'null'} (${dates.date_precision}, ${dates.date_source}) from ${scan.found}/${scan.total} dated photos`);
    for (const n of dates.notes) console.log(`    ${n}`);
    if (dates.date_source !== 'manual' || dates.notes.some((n) => n.startsWith('WARNING'))) {
      for (const p of scan.photos) console.log(`    ${p.date || 'no EXIF date'}  ${p.file}`);
    }

    const altText = `${t.title} - ${t.location}`;
    const dayObjs = days.map((d, dayIdx) => ({
      label: d.label,
      date: null,
      miles: dayMiles(d),
      body_html: renderDayHtml(d, mediaMap, altText, `${t.slug}-d${dayIdx}`),
      trails: extractTrails(d),
    }));

    const totalMiles = dayObjs.reduce((sum, d) => sum + (d.miles || 0), 0);
    const primary = t.locations[0];

    posts.push({
      id: t.slug,
      country: primary.country,
      region: primary.region,
      location: t.location,
      title: t.title,
      date_start: dates.date_start,
      date_end: dates.date_end,
      date_precision: dates.date_precision,
      date_source: dates.date_source,
      total_miles: Math.round(totalMiles * 100) / 100,
      days: dayObjs,
      source_note: t.megaSection ? `Trips/STUDY ABROAD SPRING 2025/STUDY ABROAD SPRING 2025.md#${t.megaSection}` : `Trips/${t.sourceFile}`,
    });

    for (const loc of t.locations) {
      const key = `${loc.country}|${loc.name}`;
      if (!pinIndex.has(key)) {
        pinIndex.set(key, { name: loc.name, country: loc.country, region: loc.region, lat: loc.lat, lon: loc.lon, tripIds: [] });
      }
      pinIndex.get(key).tripIds.push(t.slug);
    }

    tripGallerySrcs.set(t.slug, []);
    for (const img of [...collectGalleryImages(days, t.locations, mediaMap), ...extraGallery]) {
      tripGallerySrcs.get(t.slug).push(img.src);
      galleryImages.push({
        src: img.src,
        tripId: t.slug,
        tripTitle: t.title,
        locations: img.locations.map((l) => l.name),
        country: primary.country,
        date_start: dates.date_start,
        date_end: dates.date_end,
        date_precision: dates.date_precision,
      });
    }
  }

  // Collections: tag members by source_note prefix, derive the date range from them.
  for (const p of posts) {
    const c = COLLECTIONS.find((col) => p.source_note.startsWith(col.sourcePrefix));
    p.collectionId = c ? c.id : null;
  }
  const collections = COLLECTIONS.map((col) => {
    const members = posts.filter((p) => p.collectionId === col.id && p.date_start);
    if (!members.length) throw new Error(`collection ${col.id} has no members`);
    members.sort((a, b) => (a.date_start < b.date_start ? -1 : 1));
    const c = {
      id: col.id,
      title: col.title,
      date_start: members[0].date_start,
      date_end: members.map((m) => m.date_end).sort().pop(),
      tripIds: members.map((m) => m.id),
    };
    console.log(`collection ${c.id}: ${c.tripIds.length} trips, ${c.date_start}..${c.date_end}`);
    return c;
  });

  // Covers: the first photo in the note unless content/cover-overrides.json says otherwise.
  const overrides = fs.existsSync(COVER_OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(COVER_OVERRIDES_FILE, 'utf8')) : {};
  for (const [slug, src] of Object.entries(overrides)) {
    if (!tripGallerySrcs.has(slug)) throw new Error(`cover-overrides.json: unknown trip id "${slug}"`);
    if (!tripGallerySrcs.get(slug).includes(src)) throw new Error(`cover-overrides.json: ${slug} has no gallery image ${src}`);
  }
  for (const p of posts) {
    const srcs = tripGallerySrcs.get(p.id) || [];
    p.cover = overrides[p.id] || srcs[0] || null;
    p.coverOverride = overrides[p.id] || null;
    if (!p.cover) console.log(`  no cover for ${p.id} (no photos)`);
  }

  // sort posts by date (unknown dates last), most recent first for "latest trip" stat
  const withDate = posts.filter((p) => p.date_start);
  const withoutDate = posts.filter((p) => !p.date_start);
  withDate.sort((a, b) => (a.date_start < b.date_start ? 1 : -1));
  const sortedPosts = [...withDate, ...withoutDate];

  const postsData = { posts: sortedPosts, collections };
  fs.writeFileSync(path.join(OUT_DATA, 'posts.json'), JSON.stringify(postsData, null, 2));
  fs.writeFileSync(path.join(OUT_DATA, 'posts.js'), `window.__POSTS__ = ${JSON.stringify(postsData, null, 2)};\n`);

  const mapCountries = {};
  const usedContinents = {};
  for (const pin of pinIndex.values()) {
    const place = PLACES[pin.country];
    if (!place) throw new Error(`unknown country "${pin.country}" on pin ${pin.name}`);
    if (!CONTINENTS[place.continent]) throw new Error(`country ${pin.country} has unknown continent "${place.continent}"`);
    if (!REGIONS[pin.region]) throw new Error(`unknown region "${pin.region}" on pin ${pin.name}`);
    if (REGIONS[pin.region].country !== pin.country) throw new Error(`region ${pin.region} belongs to ${REGIONS[pin.region].country}, not ${pin.country} (pin ${pin.name})`);
    usedContinents[place.continent] = CONTINENTS[place.continent];
    if (!mapCountries[pin.country]) {
      mapCountries[pin.country] = {
        label: place.label,
        continent: place.continent,
        iso3: place.iso3,
        isoNumeric: place.isoNumeric,
        bounds: place.bounds,
        regions: {},
      };
    }
    if (!mapCountries[pin.country].regions[pin.region]) {
      mapCountries[pin.country].regions[pin.region] = { label: REGIONS[pin.region].label, cities: [] };
    }
    mapCountries[pin.country].regions[pin.region].cities.push({
      name: pin.name,
      lat: pin.lat,
      lon: pin.lon,
      tripIds: pin.tripIds,
    });
  }

  const continents = {};
  for (const key of Object.keys(CONTINENTS)) if (usedContinents[key]) continents[key] = CONTINENTS[key];
  const mapData = { continents, countries: mapCountries };
  fs.writeFileSync(path.join(OUT_DATA, 'map-data.json'), JSON.stringify(mapData, null, 2));
  fs.writeFileSync(path.join(OUT_DATA, 'map-data.js'), `window.__MAP_DATA__ = ${JSON.stringify(mapData, null, 2)};\n`);

  fs.writeFileSync(path.join(OUT_BUILD, 'media-manifest.json'), JSON.stringify(mediaManifest, null, 2));

  // sort gallery most-recent-trip-first, matching the homepage default
  const galWithDate = galleryImages.filter((g) => g.date_start);
  const galWithoutDate = galleryImages.filter((g) => !g.date_start);
  galWithDate.sort((a, b) => (a.date_start < b.date_start ? 1 : -1));
  const sortedGallery = [...galWithDate, ...galWithoutDate];
  const galleryData = { images: sortedGallery };
  fs.writeFileSync(path.join(OUT_DATA, 'gallery.json'), JSON.stringify(galleryData, null, 2));
  fs.writeFileSync(path.join(OUT_DATA, 'gallery.js'), `window.__GALLERY__ = ${JSON.stringify(galleryData, null, 2)};\n`);

  const multiTripPins = [...pinIndex.values()].filter((p) => p.tripIds.length > 1);
  console.log(`\nWrote ${sortedPosts.length} trips, ${sortedGallery.length} gallery photos, ${pinIndex.size} map pins (${multiTripPins.length} shared by multiple trips), ${mediaManifest.length} media files to convert.`);
  for (const p of multiTripPins) console.log(`  shared pin: ${p.name}, ${p.country} -> ${p.tripIds.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
