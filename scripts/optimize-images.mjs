// Generates web-optimised WebP + JPEG copies of the originals in docs/brand-assets
// into client/public/images. Production images move to Cloudinary in Phase 4.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('client/public/images', { recursive: true });
const jobs = [
  ['hair-oil-bottle', 900],
  ['hair-oil-powder-jar', 900],
  ['wooden-comb', 700],
  ['lifestyle-products-bougainvillea', 1100],
  ['combo-box-packaging', 1100],
];
for (const [name, width] of jobs) {
  const input = `docs/brand-assets/${name}.jpg`;
  const base = sharp(input).rotate().resize({ width, withoutEnlargement: true });
  await base.clone().webp({ quality: 80 }).toFile(`client/public/images/${name}.webp`);
  await base.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(`client/public/images/${name}.jpg`);
  // smaller WebP copies for phones (the page picks the right one with srcset)
  for (const w of [480, 800]) await sharp(input).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(`client/public/images/${name}-${w}.webp`);
  console.log('ok', name);
}

// Social-sharing preview (Open Graph / Twitter): 1200x630, cropped from the lifestyle photo.
await sharp('docs/brand-assets/lifestyle-products-bougainvillea.jpg').rotate().resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toFile('client/public/images/og-share.jpg');
console.log('ok og-share');
