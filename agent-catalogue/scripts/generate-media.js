// Generates AI product images and turntable videos for every product in the
// catalogue and writes the resulting URLs back into data/products.json.
// Run: node scripts/generate-media.js [--videos]
// Env: MEDIA_API_KEY, MEDIA_IMAGE_URL, MEDIA_IMAGE_MODEL, MEDIA_VIDEO_URL, MEDIA_VIDEO_MODEL
const fs = require('node:fs');
const path = require('node:path');
const { generateImage, generateVideo } = require('../lib/media');

const FILE = path.join(__dirname, '..', 'data', 'products.json');
const withVideos = process.argv.includes('--videos');

async function main() {
  const products = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const product of products) {
    const image = await generateImage(product);
    product.image = image.url;
    console.log(`${product.id}: image ${image.dryRun ? '(placeholder)' : ''} ${image.url}`);

    if (withVideos) {
      const video = await generateVideo(product);
      if (video.url) {
        product.video = video.url;
        console.log(`${product.id}: video ${video.url}`);
      } else {
        console.log(`${product.id}: video skipped — ${video.note || `prediction ${video.prediction} pending`}`);
      }
    }
  }
  fs.writeFileSync(FILE, JSON.stringify(products, null, 2) + '\n');
  console.log(`Updated ${FILE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
