// Reads capture dates from the ORIGINAL photos under Trips/ (the published JPGs in
// images/ are metadata-stripped) and decides whether they should set or tighten a
// trip's date range. exifr is used because sharp cannot open most iPhone HEIC files.
const path = require('path');
const exifr = require('exifr');

const DATE_RE = /^(\d{4}):(\d{2}):(\d{2})/;

// "YYYY-MM-DD" from the camera's own local calendar day, or null. reviveValues is
// off so the raw "YYYY:MM:DD HH:MM:SS" string is used and no timezone math happens.
async function readPhotoDate(absPath) {
  try {
    const tags = await exifr.parse(absPath, {
      pick: ['DateTimeOriginal', 'CreateDate'],
      reviveValues: false,
    });
    const raw = tags && (tags.DateTimeOriginal || tags.CreateDate);
    const m = typeof raw === 'string' && raw.match(DATE_RE);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  } catch (err) {
    return null;
  }
}

// files: absolute paths of a trip's photos. Returns per-photo results plus min/max.
async function scanTripPhotos(files) {
  const photos = [];
  for (const file of files) {
    photos.push({ file: path.basename(file), date: await readPhotoDate(file) });
  }
  const dated = photos.filter((p) => p.date).map((p) => p.date).sort();
  return {
    photos,
    total: photos.length,
    found: dated.length,
    min: dated[0] || null,
    max: dated[dated.length - 1] || null,
  };
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// manual: { dateStart, dateEnd, datePrecision } as typed in build-trips.js.
// Policy:
//   day precision, typed   -> keep it; warn if EXIF falls more than a day outside
//   null                   -> EXIF range if any photo is dated, else stay null
//   month placeholder      -> EXIF range if it lands in that month, else keep month
function resolveTripDates(manual, scan) {
  const precision = manual.datePrecision || 'day';
  const notes = [];
  const keep = (source) => ({
    date_start: manual.dateStart,
    date_end: manual.dateEnd,
    date_precision: precision,
    date_source: source,
    notes,
  });

  if (manual.dateStart && precision === 'day') {
    if (scan.found && (scan.min < addDays(manual.dateStart, -1) || scan.max > addDays(manual.dateEnd, 1))) {
      notes.push(`EXIF range ${scan.min}..${scan.max} falls outside typed range ${manual.dateStart}..${manual.dateEnd}`);
    }
    return keep('manual');
  }

  if (!manual.dateStart) {
    if (!scan.found) {
      notes.push(`no dates typed and none of ${scan.total} photos carry an EXIF date; left null`);
      return keep(null);
    }
    notes.push(`no dates typed; using EXIF range from ${scan.found} of ${scan.total} photos`);
    return { date_start: scan.min, date_end: scan.max, date_precision: 'day', date_source: 'exif', notes };
  }

  // month precision placeholder
  if (!scan.found) {
    notes.push(`month precision kept; none of ${scan.total} photos carry an EXIF date`);
    return keep('manual');
  }
  const month = manual.dateStart.slice(0, 7);
  if (scan.min.slice(0, 7) !== month || scan.max.slice(0, 7) !== month) {
    notes.push(`WARNING: EXIF range ${scan.min}..${scan.max} is not inside typed month ${month}; month precision kept`);
    return keep('manual');
  }
  notes.push(`month ${month} tightened to ${scan.min}..${scan.max} from ${scan.found} of ${scan.total} photos`);
  return { date_start: scan.min, date_end: scan.max, date_precision: 'day', date_source: 'exif-tightened', notes };
}

module.exports = { readPhotoDate, scanTripPhotos, resolveTripDates };
