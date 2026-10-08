/**
 * The gold letters of Kristina's logo (public/beautasy-logo-gold.png) as a
 * mask, for the sheen that passes over them on the home page (.logo-sheen in
 * src/app/globals.css).
 *
 *   node scripts/logo-gold-mask.mjs
 *
 * The logo is one picture on white: a lilac figure and wreath, and "Beautasy"
 * in gold. Gold is the only warm colour in it — red over green over blue, red
 * well above blue — so those pixels are the letters, and how saturated they
 * are says how much of each pixel is letter. The mask keeps the whole frame,
 * so it lies exactly over the logo at any size, and is drawn at twice the
 * largest size the page shows the logo. Run again only if the logo changes.
 */
import sharp from "sharp";

const SOURCE = "public/beautasy-logo-gold.png";
const OUT = "public/beautasy-logo-gold-mask.png";
/** The page shows the logo at most 300px wide */
const WIDTH = 600;

const { data, info } = await sharp(SOURCE).resize({ width: WIDTH }).raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

const out = Buffer.alloc(width * height * 4);
let letters = 0;
for (let p = 0; p < width * height; p++) {
  const [r, g, b] = [data[p * channels], data[p * channels + 1], data[p * channels + 2]];
  const max = Math.max(r, g, b);
  const saturation = max ? (max - Math.min(r, g, b)) / max : 0;
  const gold = r > g && g > b && r - b > 30 ? Math.min(1, Math.max(0, (saturation - 0.15) / 0.25)) : 0;
  out.set([255, 255, 255, Math.round(gold * 255)], p * 4);
  if (gold > 0.5) letters++;
}

await sharp(out, { raw: { width, height, channels: 4 } })
  .blur(0.6)
  .png({ palette: true, colours: 16, compressionLevel: 9 })
  .toFile(OUT);

console.log(`${OUT}: ${width}×${height}, letters cover ${((letters / (width * height)) * 100).toFixed(1)}%`);
