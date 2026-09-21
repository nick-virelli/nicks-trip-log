// Guards Nick's writing: every line and every photo in a source note must
// reach its trip page. A bug here once dropped about 16% of the text and 30
// photos without any error, because text nested under a photo was ignored.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { exists, json } = require('./helpers');
const { parseTripDays } = require('../scripts/lib/parse');
const { extractSection } = require('../scripts/lib/extract-section');
const { renderDayHtml } = require('../scripts/lib/render');

const media = (nodes, acc = { text: 0, media: 0 }) => {
  for (const n of nodes) {
    if (n.media) acc.media++;
    else if ((n.text || '').trim()) acc.text++;
    media(n.children, acc);
  }
  return acc;
};

test('text and photos nested under a photo are rendered, in order', () => {
  const note = [
    '### DAY 1',
    '* Hiked to the lookout',
    '* ![Image](Attachments/a.jpeg)',
    '    * steep switchbacks most of the way up',
    '    * ![Image](Attachments/b.jpeg)',
    '![Image](Attachments/c.jpeg)',
    '![Movie](Attachments/d.mp4)',
    '    * the story after the video',
    '* Ate dinner',
  ].join('\n');
  const [day] = parseTripDays(note);
  const html = renderDayHtml(day, new Map(), 'alt', 'x');
  for (const words of ['Hiked to the lookout', 'steep switchbacks most of the way up', 'the story after the video', 'Ate dinner']) {
    assert.ok(html.includes(words), `"${words}" is missing from the page`);
  }
  assert.equal((html.match(/<img /g) || []).length, 3, 'all three photos should render');
  assert.equal((html.match(/<video /g) || []).length, 1);
  assert.ok(html.indexOf('steep switchbacks') < html.indexOf('the story after the video'), 'order changed');
  assert.ok(html.indexOf('Hiked to the lookout') < html.indexOf('steep switchbacks'), 'order changed');
});

test('a run of photos still becomes one carousel when nothing is nested under them', () => {
  const [day] = parseTripDays('### DAY 1\n* ![Image](Attachments/a.jpeg)\n* ![Image](Attachments/b.jpeg)\n* ![Image](Attachments/c.jpeg)\n');
  const html = renderDayHtml(day, new Map(), 'alt', 'x');
  assert.equal((html.match(/class="carousel"/g) || []).length, 1);
  assert.equal((html.match(/carousel-slide/g) || []).length, 3);
});

// Needs the local Trips/ folder, which only exists on Nick's machine.
test('every line of every source note appears on its trip page', { skip: !exists('Trips') && "Trips/ only exists on Nick's machine" }, () => {
  const { posts } = json('data/posts.json');
  const short = [];
  for (const p of posts) {
    const [file, section] = p.source_note.split('#');
    const full = fs.readFileSync(require('path').join(__dirname, '..', file), 'utf8');
    const days = parseTripDays(section ? extractSection(full, section) : full);
    days.forEach((d, i) => {
      const noteCount = media(d.children);
      const html = p.days[i].body_html;
      const onPageText = (html.match(/<li>/g) || []).length;
      const onPageMedia = (html.match(/<img|<video/g) || []).length;
      if (onPageText < noteCount.text) short.push(`${p.id} "${p.days[i].label}": note has ${noteCount.text} lines, page shows ${onPageText}`);
      // Trips that merge in a second note gain photos, so only compare the rest.
      if (!p.source_note.includes('#') && onPageMedia < noteCount.media) short.push(`${p.id} "${p.days[i].label}": note has ${noteCount.media} photos or videos, page shows ${onPageMedia}`);
    });
  }
  assert.deepEqual(short, []);
});
