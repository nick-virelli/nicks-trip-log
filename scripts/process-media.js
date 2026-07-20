const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.build', 'media-manifest.json'), 'utf8'));

const MAX_WIDTH = 1600;

async function run() {
  let converted = 0;
  let copied = 0;
  let failed = 0;

  for (const item of manifest) {
    const destAbs = path.join(ROOT, item.dest);
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });

    if (item.kind === 'video') {
      if (!fs.existsSync(destAbs)) fs.copyFileSync(item.src, destAbs);
      copied++;
      continue;
    }

    if (item.kind === 'heic') {
      // Converted separately via scripts/convert-heic.ps1 (Windows' native HEIC
      // codec) because sharp/libheif rejects many real iPhone HEIC files with a
      // "security limit exceeded" error on their auxiliary-item reference count.
      continue;
    }

    try {
      await sharp(item.src, { failOn: 'none' })
        .rotate() // apply EXIF orientation
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(destAbs);
      converted++;
    } catch (err) {
      failed++;
      console.warn(`  ! failed to convert ${item.src}: ${err.message}`);
    }

    if ((converted + copied) % 50 === 0) console.log(`  ...${converted + copied}/${manifest.length}`);
  }

  console.log(`\nDone. converted=${converted} copied=${copied} failed=${failed} total=${manifest.length}`);
}

run();
