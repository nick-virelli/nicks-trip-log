// Turns an Apple Health export into per-trip step and walking-distance totals.
//
//   npm run health                      (uses the default export location below)
//   node scripts/build-health.js "C:\path\to\export.xml"
//
// Only trip totals are saved, in content/health-summary.json. Nothing else from
// the export (heart rate, weight, birth date, device names) is read or kept, and
// the export itself stays outside the repo. Re-run this whenever trip dates
// change or after a fresh export, then run npm run build.
//
// How the numbers are made:
//  - A record's day is its own local date, so trips abroad count in local time.
//  - When more than one phone recorded the same day (a phone upgrade), the
//    source with the most steps that day is used for both steps and distance,
//    so nothing is counted twice.
//  - Trips are counted over their dated range, both end days included. Trips
//    with no dates (Glacier, Zion) get nothing rather than a guess.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');
const DEFAULT_EXPORT = path.join(process.env.USERPROFILE || process.env.HOME || '', 'iCloudDrive', 'Trips', 'apple_health_export', 'export.xml');
const exportPath = process.argv[2] || process.env.HEALTH_EXPORT || DEFAULT_EXPORT;
const OUT = path.join(ROOT, 'content', 'health-summary.json');

const STEPS = 'HKQuantityTypeIdentifierStepCount';
const DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';

function eachDay(start, end) {
  const days = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
}

async function main() {
  if (!fs.existsSync(exportPath)) {
    console.error(`No Health export at ${exportPath}\nExport it from the Health app (profile, Export All Health Data) and pass the export.xml path.`);
    process.exit(1);
  }
  const { posts } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'posts.json'), 'utf8'));
  const trips = posts.filter((p) => p.date_start && p.date_end);
  const wanted = new Set(trips.flatMap((t) => eachDay(t.date_start, t.date_end)));

  // day -> source -> { steps, miles }
  const perDay = new Map();
  let unitsOk = true;
  const rl = readline.createInterface({ input: fs.createReadStream(exportPath, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.includes('<Record ')) continue;
    const type = (line.match(/type="([^"]+)"/) || [])[1];
    if (type !== STEPS && type !== DISTANCE) continue;
    const day = (line.match(/startDate="(\d{4}-\d\d-\d\d)/) || [])[1];
    if (!wanted.has(day)) continue;
    const source = (line.match(/sourceName="([^"]*)"/) || [])[1] || '';
    let value = Number((line.match(/ value="([^"]*)"/) || [])[1]);
    if (!Number.isFinite(value)) continue;
    if (type === DISTANCE) {
      const unit = (line.match(/unit="([^"]*)"/) || [])[1];
      if (unit === 'km') value *= 0.621371;
      else if (unit !== 'mi') unitsOk = false;
    }
    const bySource = perDay.get(day) || new Map();
    const slot = bySource.get(source) || { steps: 0, miles: 0 };
    if (type === STEPS) slot.steps += value;
    else slot.miles += value;
    bySource.set(source, slot);
    perDay.set(day, bySource);
  }
  if (!unitsOk) throw new Error('Unexpected distance unit in the export; expected miles or kilometers.');

  // One source per day: whichever recorded the most steps.
  const daily = new Map();
  for (const [day, bySource] of perDay) {
    const best = [...bySource.values()].sort((a, b) => b.steps - a.steps)[0];
    daily.set(day, best);
  }

  const summary = { generated: new Date().toISOString().slice(0, 10), source: 'Apple Health export, steps and walking plus running distance', trips: {}, totals: null };
  for (const t of trips) {
    const days = eachDay(t.date_start, t.date_end).filter((d) => daily.has(d));
    if (!days.length) continue;
    summary.trips[t.id] = {
      steps: Math.round(days.reduce((s, d) => s + daily.get(d).steps, 0)),
      walking_miles: Math.round(days.reduce((s, d) => s + daily.get(d).miles, 0) * 10) / 10,
      days_counted: days.length,
    };
    console.log(`${t.id.padEnd(30)} ${String(summary.trips[t.id].steps).padStart(7)} steps  ${String(summary.trips[t.id].walking_miles).padStart(6)} mi  ${days.length}/${eachDay(t.date_start, t.date_end).length} days`);
  }
  // Overlapping legs share a day (Potsdam and Morocco both include 4/4), so the
  // overall total counts each calendar day once.
  const unique = [...wanted].filter((d) => daily.has(d));
  summary.totals = {
    steps: Math.round(unique.reduce((s, d) => s + daily.get(d).steps, 0)),
    walking_miles: Math.round(unique.reduce((s, d) => s + daily.get(d).miles, 0) * 10) / 10,
    days_counted: unique.length,
    trips_counted: Object.keys(summary.trips).length,
  };
  console.log(`\nTotals over ${summary.totals.days_counted} distinct days on ${summary.totals.trips_counted} trips: ${summary.totals.steps.toLocaleString('en-US')} steps, ${summary.totals.walking_miles} miles`);
  const missing = trips.filter((t) => !summary.trips[t.id]).map((t) => t.id);
  if (missing.length) console.log(`No Health data for: ${missing.join(', ')}`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2) + '\n');
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
