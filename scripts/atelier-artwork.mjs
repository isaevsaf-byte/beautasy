/**
 * Kristina's atelier artwork (public/beautasy-atelier-og.jpg) with its white
 * paper lifted off, for the link-preview cards (src/lib/sewnCard.tsx).
 *
 *   node scripts/atelier-artwork.mjs
 *
 * The JPEG's paper is not one white but 250–254 with compression noise, so
 * laid on a card it showed as a faint rectangle. Here the paper becomes
 * transparent and every other pixel keeps the colour it had on white (white is
 * "un-mixed" out of it), cropped to the drawing with a margin, at twice the
 * size the card draws it. Run again only if the artwork changes.
 */
import sharp from "sharp";

const SOURCE = "public/beautasy-atelier-og.jpg";
const OUT = "public/beautasy-atelier-art.png";
/** Anything this light is paper */
const PAPER = 249 / 255;
/** What the card draws it at, doubled */
const WIDTH = 888;
const MARGIN = 24;

const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

let left = width, top = height, right = 0, bottom = 0;
const out = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const o = (y * width + x) * 4;
    // Lift the paper to white, then take white out of what is left
    const c = [0, 1, 2].map((k) => Math.min(1, data[i + k] / 255 / PAPER));
    const alpha = Math.max(...c.map((v) => 1 - v));
    if (alpha > 0) {
      for (let k = 0; k < 3; k++) out[o + k] = Math.round(((c[k] - (1 - alpha)) / alpha) * 255);
      out[o + 3] = Math.round(alpha * 255);
    }
    if (alpha > 0.06) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
}

const crop = {
  left: Math.max(0, left - MARGIN),
  top: Math.max(0, top - MARGIN),
  width: Math.min(width, right + MARGIN + 1) - Math.max(0, left - MARGIN),
  height: Math.min(height, bottom + MARGIN + 1) - Math.max(0, top - MARGIN),
};
const result = await sharp(out, { raw: { width, height, channels: 4 } })
  .extract(crop)
  .resize({ width: WIDTH })
  .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
  .toFile(OUT);
console.log(OUT, result.width, result.height, `${Math.round(result.size / 1024)} KB`, crop);
