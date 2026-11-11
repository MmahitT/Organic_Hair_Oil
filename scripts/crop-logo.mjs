// Extracts the printed brand mark from the shipping box photo and recolours it
// to brand forest green on a transparent background. Replace with the owner's
// original logo file when available.
import sharp from 'sharp';

const src = 'docs/brand-assets/combo-box-packaging.jpg';
const regions = {
  'logo-mark': { left: 640, top: 1630, width: 280, height: 178 },
  'logo-full': { left: 640, top: 1630, width: 280, height: 202 },
};
for (const [name, region] of Object.entries(regions)) {
const { data, info } = await sharp(src).extract(region).raw().toBuffer({ resolveWithObject: true });
const out = Buffer.alloc(info.width * info.height * 4);
const [r, g, b] = [0x23, 0x4b, 0x35];
for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
  const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const alpha = Math.max(0, Math.min(255, Math.round(((135 - lum) / 70) * 255)));
  out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = alpha;
}
await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
  .trim()
  .resize({ width: 480 })
  .png()
  .toFile(`client/src/assets/${name}.png`);
console.log(name, 'written');
}
