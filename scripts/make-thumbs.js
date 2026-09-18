// Generates 400px-wide thumbnails for every gallery image into images/thumbs/,
// reading the already-published 1600px JPGs (so HEIC never comes into it).
// Existing thumbnails are skipped; pass --force to regenerate them all.
// Regenerating at a different size adds a second full copy of every file to git
// history forever, so settle the size before committing.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const THUMB_WIDTH = 400;
const force = process.argv.includes('--force');

async function run() {
  const { images } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'gallery.json'), 'utf8'));
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let bytes = 0;

  for (const img of images) {
    if (!img.thumb) throw new Error(`gallery entry ${img.src} has no thumb path; run the build first`);
    const srcAbs = path.join(ROOT, img.src);
    const destAbs = path.join(ROOT, img.thumb);
    if (!force && fs.existsSync(destAbs)) {
      skipped++;
      bytes += fs.statSync(destAbs).size;
      continue;
    }
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    try {
      await sharp(srcAbs, { failOn: 'none' })
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(destAbs);
      created++;
      bytes += fs.statSync(destAbs).size;
    } catch (err) {
      failed++;
      console.warn(`  ! failed ${img.src}: ${err.message}`);
    }
  }

  console.log(`Done. created=${created} skipped=${skipped} failed=${failed} total=${images.length} size=${(bytes / 1024 / 1024).toFixed(1)} MB`);
  if (failed) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
