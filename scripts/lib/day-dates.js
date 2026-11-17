// Works out the calendar date of each day in a trip's notes, so every day and
// every photo can carry its own date instead of only the trip's range.
//
// Evidence, per day:
//   - the capture dates of that day's photos (EXIF, from the originals)
//   - a date typed in the heading ("Day 2 - 7/16")
//   - a weekday typed in the heading ("Friday (Paris)", "DAY 1 (Tuesday)")
//   - the trip's typed start date
// Days in a note are consecutive, so the whole trip hangs off one date: the
// date of day 1. Each piece of evidence proposes one, and the proposal the
// evidence agrees with most wins. A typed weekday or typed date that disagrees
// rules a proposal out. If nothing fits, the days stay undated.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}

// The most common value in a list, or null for an empty one.
function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)) best = v;
  return best;
}

function labelWeekday(label) {
  const lower = label.toLowerCase();
  const i = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(lower));
  return i === -1 ? null : i;
}

// "7/16" in a heading, read as month/day in the given year.
function labelDate(label, year) {
  const m = label.match(/(?:^|[^\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (!m || !year) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// days:  [{ label, photoDates: ['YYYY-MM-DD', ...] }]
// typed: { dateStart, dateEnd, datePrecision } as written in build-trips.js
// Returns { dates: [iso|null per day], start, end, notes }.
function resolveDayDates(days, typed) {
  const notes = [];
  const none = { dates: days.map(() => null), start: null, end: null, notes };
  if (!days.length) return none;

  const typedDay = typed.dateStart && (typed.datePrecision || 'day') === 'day';
  const allPhotoDates = days.flatMap((d) => d.photoDates);
  const year = typed.dateStart ? typed.dateStart.slice(0, 4) : allPhotoDates.length ? mode(allPhotoDates.map((d) => d.slice(0, 4))) : null;

  const evidence = days.map((d) => ({
    photo: mode(d.photoDates),
    photoDates: d.photoDates,
    typedDate: labelDate(d.label, year),
    weekday: labelWeekday(d.label),
  }));

  // Every proposal for "the date of day 1".
  const proposals = new Set();
  evidence.forEach((e, i) => {
    for (const d of new Set(e.photoDates)) proposals.add(addDays(d, -i));
    if (e.typedDate) proposals.add(addDays(e.typedDate, -i));
  });
  if (typedDay) for (const shift of [-1, 0, 1]) proposals.add(addDays(typed.dateStart, shift));

  let best = null;
  for (const base of proposals) {
    let score = 0;
    let ruledOut = false;
    let photoDays = 0;
    let photoMisses = 0;
    evidence.forEach((e, i) => {
      const date = addDays(base, i);
      if (e.weekday !== null) {
        if (weekdayOf(date) === e.weekday) score += 2;
        else ruledOut = true;
      }
      if (e.typedDate) {
        if (e.typedDate === date) score += 3;
        else ruledOut = true;
      }
      if (e.photoDates.length) {
        photoDays++;
        if (e.photo === date) score += 3;
        else if (e.photoDates.includes(date)) score += 1;
        else photoMisses++;
      }
    });
    // A few photos filed under the wrong day are normal; most of them is not.
    if (ruledOut || photoMisses * 4 > photoDays) continue;
    if (typedDay && base === typed.dateStart) score += 1;
    if (!best || score > best.score) best = { base, score };
  }

  if (best && best.score === (typedDay && best.base === typed.dateStart ? 1 : 0)) {
    // Nothing but the typed start date to go on: only trust it when the number
    // of days in the note matches the typed range exactly.
    const span = typedDay ? daysBetween(typed.dateStart, typed.dateEnd) + 1 : 0;
    if (!typedDay || best.base !== typed.dateStart || span !== days.length) best = null;
  }

  if (!best) {
    notes.push('day dates: not enough agreement between headings, photos and the typed range; days left undated');
    return none;
  }

  const dates = days.map((_, i) => addDays(best.base, i));
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (typedDay && (start !== typed.dateStart || end !== typed.dateEnd)) {
    notes.push(`day dates: the ${days.length} days in the note run ${start}..${end}, but the typed range is ${typed.dateStart}..${typed.dateEnd}`);
  }
  return { dates, start, end, notes };
}

module.exports = { resolveDayDates, labelWeekday, labelDate, addDays };
