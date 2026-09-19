// Downloads the world countries geometry the map draws (no tile provider, no
// API key) and writes data/world.json. Run once, or again to refresh:
//   node scripts/fetch-world.js
// build-trips.js then writes the data/world.js mirror.
//
// Geometry: world-atlas countries-50m (TopoJSON derived from Natural Earth,
// public domain). Each geometry's id is the ISO 3166-1 numeric code, which
// map-data.json carries as isoNumeric. Continent per country comes from
// Natural Earth's own CONTINENT attribute so a whole continent can highlight.
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'world.json');
const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

const CONTINENT_SLUGS = {
  'North America': 'north-america',
  'South America': 'south-america',
  Europe: 'europe',
  Africa: 'africa',
  Asia: 'asia',
  Oceania: 'oceania',
  Antarctica: 'antarctica',
};

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.headers.location) return resolve(get(res.headers.location));
        if (res.statusCode !== 200) return reject(new Error(`${url}: HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  console.log('Downloading countries-50m TopoJSON...');
  const topo = JSON.parse(await get(TOPO_URL));
  console.log('Downloading Natural Earth attributes for continents...');
  const ne = JSON.parse(await get(NE_URL));

  const byIso = new Map();
  const byName = new Map();
  for (const f of ne.features) {
    const p = f.properties;
    const continent = CONTINENT_SLUGS[p.CONTINENT] || null;
    const iso = String(p.ISO_N3 || '').padStart(3, '0');
    if (/^\d{3}$/.test(iso) && iso !== '-99') byIso.set(iso, continent);
    for (const key of [p.NAME, p.NAME_LONG, p.ADMIN, p.NAME_EN]) if (key) byName.set(key, continent);
  }

  let matched = 0;
  const unmatched = [];
  for (const g of topo.objects.countries.geometries) {
    const name = (g.properties && g.properties.name) || '';
    const id = g.id == null ? null : String(g.id).padStart(3, '0');
    let continent = id && byIso.has(id) ? byIso.get(id) : byName.get(name);
    if (continent === undefined) {
      continent = null;
      unmatched.push(name);
    } else matched++;
    g.id = id;
    g.properties = { name, continent };
  }
  delete topo.objects.land;

  topo.attribution = 'Map data from Natural Earth, via world-atlas';
  const json = JSON.stringify(topo);
  fs.writeFileSync(OUT, json);
  fs.writeFileSync(path.join(ROOT, 'data', 'world.js'), `window.__WORLD__ = ${json};
`);
  console.log(`Wrote data/world.json + mirror: ${topo.objects.countries.geometries.length} countries, ${matched} with a continent, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
  if (unmatched.length) console.log(`  no continent for: ${unmatched.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
