const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDayDates, labelWeekday, labelDate } = require('../scripts/lib/day-dates');
const { json } = require('./helpers');

const { posts } = json('data/posts.json');
const { images } = json('data/gallery.json');

const typed = (dateStart, dateEnd, datePrecision) => ({ dateStart: dateStart || null, dateEnd: dateEnd || null, datePrecision });
const day = (label, ...photoDates) => ({ label, photoDates });

test('headings are read for a weekday and a typed month/day', () => {
  assert.equal(labelWeekday('Friday (Paris)'), 5);
  assert.equal(labelWeekday('DAY 1 (Tuesday)'), 2);
  assert.equal(labelWeekday('Day 3'), null);
  assert.equal(labelDate('Day 2 - 7/16 (16 miles)', '2026'), '2026-07-16');
  assert.equal(labelDate('Day 2 (ZION) - 13.1 miles', '2024'), null);
});

test('photo dates on some days date every day, including travel days with no photos', () => {
  const r = resolveDayDates(
    [day('DAY 1'), day('DAY 2'), day('DAY 3', '2023-07-17', '2023-07-17'), day('DAY 4', '2023-07-18'), day('DAY 5')],
    typed('2023-07-01', '2023-07-01', 'month')
  );
  assert.deepEqual(r.dates, ['2023-07-15', '2023-07-16', '2023-07-17', '2023-07-18', '2023-07-19']);
  assert.equal(r.start, '2023-07-15');
  assert.equal(r.end, '2023-07-19');
});

test('a typed weekday beats the typed start date when the note has an extra travel day', () => {
  const r = resolveDayDates([day('Thursday (Travel)'), day('Friday (Stockholm)', '2025-02-28'), day('Saturday (Copenhagen)')], typed('2025-02-28', '2025-03-02'));
  assert.deepEqual(r.dates, ['2025-02-27', '2025-02-28', '2025-03-01']);
  assert.ok(r.notes.some((n) => n.includes('typed range')));
});

test('one photo filed under the wrong day does not throw the rest off', () => {
  const r = resolveDayDates(
    [day('Day 1', '2025-05-01'), day('Day 2', '2025-05-02', '2025-05-02', '2025-05-01'), day('Day 3', '2025-05-03'), day('Day 4', '2025-05-04')],
    typed('2025-05-01', '2025-05-04')
  );
  assert.deepEqual(r.dates, ['2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04']);
});

test('with no evidence the typed range is used only when the day count matches it', () => {
  const plain = [day('Day 1'), day('Day 2'), day('Day 3')];
  assert.deepEqual(resolveDayDates(plain, typed('2023-05-06', '2023-05-08')).dates, ['2023-05-06', '2023-05-07', '2023-05-08']);
  assert.deepEqual(resolveDayDates(plain, typed('2023-05-06', '2023-05-09')).dates, [null, null, null]);
  assert.deepEqual(resolveDayDates(plain, typed()).dates, [null, null, null]);
});

test('weekdays alone, with no year to hang them on, date nothing', () => {
  const r = resolveDayDates([day('DAY 1 (Tuesday)'), day('DAY 2 (Wednesday)')], typed());
  assert.deepEqual(r.dates, [null, null]);
});

test('in the built site, day dates are consecutive and match any weekday in the heading', () => {
  for (const p of posts) {
    const dated = p.days.filter((d) => d.date);
    if (!dated.length) continue;
    assert.equal(dated.length, p.days.length, `${p.id}: only some days are dated`);
    p.days.forEach((d, i) => {
      if (i) assert.equal((new Date(d.date) - new Date(p.days[i - 1].date)) / 86400000, 1, `${p.id}: day ${i + 1} does not follow day ${i}`);
      const wd = labelWeekday(d.label);
      if (wd !== null) assert.equal(new Date(`${d.date}T00:00:00Z`).getUTCDay(), wd, `${p.id}: "${d.label}" is dated ${d.date}`);
    });
  }
});

test('every dated photo falls within a day of its trip', () => {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const dayMs = 86400000;
  for (const img of images) {
    if (!img.date) continue;
    const p = byId.get(img.tripId);
    const first = p.days[0].date || p.date_start;
    const last = p.days[p.days.length - 1].date || p.date_end;
    assert.ok(new Date(img.date) >= new Date(first) - dayMs && new Date(img.date) <= +new Date(last) + dayMs, `${img.src}: dated ${img.date}, trip runs ${first}..${last}`);
  }
});
