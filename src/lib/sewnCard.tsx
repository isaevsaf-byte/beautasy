import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { LOOP, NEEDLE_EYE, NEEDLE_SHAPE, NEEDLE_SHINE, PARKED, STITCHES } from "@/lib/stitchGeometry";
import { SOCIAL_CARD_SIZE } from "@/lib/socialCard";

/**
 * The picture a link to the atelier shows in a Facebook group, a WhatsApp
 * chat or a text (07.10.2026): Kristina's artwork on a label sewn onto
 * lavender cloth, and beside it an alteration page's heading as that page
 * sets it — the job, then "in Southampton" with the gold seam and the needle
 * left in the cloth — its lowest price, and the site's own booking button.
 * The atelier's card sews the home page's heading the same way.
 *
 * Until now every alteration page sent the same artwork, 1200x1028, and the
 * apps cut it to 1.91:1: the ALTERATIONS banner and half the gold name went,
 * and nothing said which job or what price. Most people reach these pages
 * from exactly such a post (src/lib/shortLinks.ts).
 *
 * Sizes are for a phone: a feed draws the card about a third of this size,
 * so nothing meant to be read is under 26px here, and the stitch, the needle
 * and the label's topstitch are drawn heavier than on the site. The seam is
 * the page's own (lib/stitchGeometry.ts). Nothing is fetched while the card
 * is drawn — the face and the artwork are read from disk and the words stay
 * plain Latin, no emoji (socialPreview.test.ts holds this). When the look
 * changes, change CARD_DESIGN in lib/sewnCardVersion.ts.
 */

/** The cloth the label is sewn onto */
export const CLOTH_TOP = "#F4EEFB";
export const CLOTH_BOTTOM = "#E9DFF5";
/** The label: a shade lighter than cream, as a woven label is */
export const LABEL = "#FFFEFB";
export const INK = "#2E2A33";
export const GREY = "#5F5A66";
export const LAVENDER = "#DCD0FF";
export const LAVENDER_INK = "#6E5BA8";
const PLUM = "#5A2D5C";
export const GOLD = "#B08848";
/** The topstitch on the site's booking buttons (globals.css .topstitch), stronger for a small picture */
export const TOPSTITCH = "rgba(90, 45, 92, 0.6)";

/** The heading's size; the needle is drawn in hundredths of it, as on the page */
const HEADING_PX = 60;
/** The needle and its thread a little larger than on the page, to survive the feed's shrinking */
const NEEDLE_SCALE = 1.45;

const LABEL_SIZE = { width: 400, height: 470 };
const PAD = 52;
const GAP = 48;
/** What is left for the words */
const COLUMN = SOCIAL_CARD_SIZE.width - PAD * 2 - LABEL_SIZE.width - GAP;

/** A file the card is drawn from, read once when first needed */
function once<T>(load: () => T): () => T {
  let value: { v: T } | null = null;
  return () => (value ??= { v: load() }).v;
}

/**
 * Kristina's atelier artwork with its paper lifted off, so it lies on the
 * label without a rectangle of its own (scripts/atelier-artwork.mjs makes it
 * from public/beautasy-atelier-og.jpg), and its size from its own header.
 */
export const artwork = once(() => {
  const png = readFileSync(join(process.cwd(), "public", "beautasy-atelier-art.png"));
  return {
    src: `data:image/png;base64,${png.toString("base64")}`,
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
});

/**
 * Next's own face for these pictures, with its kerning switched off.
 *
 * The renderer lays words out by adding up each letter's width, then draws
 * them kerned — Geist pulls many pairs closer — so every word was drawn
 * narrower than the room it was given, and a long one left a gap behind it:
 * "Alterations  & repairs". Renaming the two tables that hold the kerning
 * makes the drawing match the layout: even spaces, a hair looser. Should a
 * future Next move the file, the card falls back to the face next/og brings,
 * kerned — uneven, never broken.
 */
export const face = once(() => {
  const path = join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf");
  if (!existsSync(path)) return null;
  const font = readFileSync(path);
  const tables = font.readUInt16BE(4);
  for (let k = 0; k < tables; k++) {
    const at = 12 + k * 16;
    const tag = font.toString("latin1", at, at + 4);
    if (tag === "GPOS") font.write("xPOS", at, "latin1");
    if (tag === "kern") font.write("xern", at, "latin1");
  }
  return font;
});

export const svg = (body: string, viewBox: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`).toString("base64")}`;

/**
 * The knot, the needle at rest and the loop of thread between them, in
 * hundredths of the heading's size around the end of the seam (0,0) — the
 * parked picture the page's stylesheet ends on.
 */
const REST = { left: -20, top: -100, width: 120, height: 120 };
const NEEDLE_AT_REST = (() => {
  const point = { x: PARKED.pastEnd * 100, y: PARKED.below * 100 };
  return svg(
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#8C8C8C"/><stop offset=".45" stop-color="#3E3E3E"/><stop offset="1" stop-color="#6E6E6E"/>` +
      `</linearGradient></defs>` +
      `<path d="${LOOP}" transform="translate(-10 -80)" fill="none" stroke="${GOLD}" stroke-width="5.5" stroke-linecap="round"/>` +
      `<circle cx="7" cy="0" r="9" fill="${GOLD}"/>` +
      `<g transform="translate(${point.x} ${point.y}) rotate(${PARKED.turn})">` +
      `<path d="${NEEDLE_SHAPE}" fill="url(#s)"/>` +
      `<line x1="${NEEDLE_SHINE.x1}" y1="${NEEDLE_SHINE.y}" x2="${NEEDLE_SHINE.x2}" y2="${NEEDLE_SHINE.y}" stroke="rgba(255,255,255,.55)" stroke-width="${NEEDLE_SHINE.width}" stroke-linecap="round"/>` +
      `<ellipse cx="${NEEDLE_EYE.cx}" cy="0" rx="${NEEDLE_EYE.rx}" ry="${NEEDLE_EYE.ry}" fill="${CLOTH_TOP}"/>` +
      `</g>`,
    `${REST.left} ${REST.top} ${REST.width} ${REST.height}`,
  );
})();

/** A dashed topstitch round a box, as an image: the renderer's own dashes are too short to read as stitches */
export function topstitch(width: number, height: number, inset: number, radius: number, stroke: number) {
  return svg(
    `<rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${radius}" ` +
      `fill="none" stroke="${TOPSTITCH}" stroke-width="${stroke}" stroke-dasharray="12 7" stroke-linecap="round"/>`,
    `0 0 ${width} ${height}`,
  );
}
const LABEL_STITCH = topstitch(LABEL_SIZE.width, LABEL_SIZE.height, 14, 16, 2.5);

/** Each stitch and the gap after it, as shares of the seam's width, from the page's own stitches */
const SEAM = STITCHES.map((stitch, k) => {
  const next = STITCHES[k + 1];
  return {
    stitch: stitch.x2 - stitch.x1,
    gap: next ? next.x1 - stitch.x2 : 0,
    // A hand-sewn seam is never quite level: the page's wobble, in pixels
    lift: Math.round((stitch.y1 - 10) * 5 * 10) / 10,
  };
});

/** "&" kept with the word after it, so a line never ends on one */
export function bindAmpersands(text: string): string {
  return text.replace(/ & /g, ` &${String.fromCharCode(160)}`);
}

export interface SewnCard {
  /** The heading before "in Southampton", as the page sets it */
  lead: string;
  /** "£20", the lowest price the page lists, or null for none */
  priceFrom: string | null;
}

export function sewnCard({ lead, priceFrom }: SewnCard): ImageResponse {
  const art = artwork();
  const artWidth = 340;
  const font = face();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: PAD,
          gap: GAP,
          backgroundImage: `linear-gradient(160deg, ${CLOTH_TOP} 0%, ${CLOTH_BOTTOM} 100%)`,
        }}
      >
        {/* Kristina's artwork on a label sewn onto the cloth, the way the
            booking buttons are top-stitched on the site */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: LABEL_SIZE.width,
            height: LABEL_SIZE.height,
            borderRadius: 28,
            backgroundColor: LABEL,
            boxShadow: "0 2px 4px rgba(90, 45, 92, 0.08), 0 14px 34px rgba(90, 45, 92, 0.16)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
          <img src={LABEL_STITCH} width={LABEL_SIZE.width} height={LABEL_SIZE.height} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
          <img src={art.src} width={artWidth} height={Math.round((artWidth * art.height) / art.width)} alt="" />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: COLUMN,
            height: LABEL_SIZE.height,
          }}
        >
          {/* The job, its price and the button read as one block, centred on the label */}
          <div style={{ display: "flex", flexDirection: "column", marginBottom: 40 }}>
            <div
              style={{
                display: "flex",
                fontSize: HEADING_PX,
                lineHeight: 1.06,
                color: INK,
                textWrap: "balance",
              }}
            >
              {bindAmpersands(lead)}
            </div>
            <Sewn>in Southampton</Sewn>
            {priceFrom && <Price amount={priceFrom} />}
          </div>
          <BookButton />
        </div>
      </div>
    ),
    {
      ...SOCIAL_CARD_SIZE,
      ...(font ? { fonts: [{ name: "Geist", data: font, weight: 400 as const, style: "normal" as const }] } : {}),
    },
  );
}

/**
 * "in Southampton" with the page's seam under it, the knot, and the needle at
 * rest, at the size of the heading above it (src/lib/workCard.tsx sews it
 * under a smaller one)
 */
export function Sewn({ children, size = HEADING_PX }: { children: string; size?: number }) {
  const scale = (size / 100) * NEEDLE_SCALE;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignSelf: "flex-start", marginTop: 4 }}>
      <div style={{ display: "flex", fontSize: size, lineHeight: 1.06, color: LAVENDER_INK }}>{children}</div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", height: 12, marginTop: 6 }}>
        {SEAM.flatMap(({ stitch, gap, lift }, k) => [
          <div
            key={`s${k}`}
            style={{
              flexGrow: stitch,
              flexBasis: 0,
              height: 6,
              marginTop: lift,
              borderRadius: 3,
              // Thread with light on it, like the gold of the artwork beside it
              backgroundImage: `linear-gradient(180deg, #CDA75E 0%, ${GOLD} 55%, #8E6A32 100%)`,
            }}
          />,
          gap > 0 ? <div key={`g${k}`} style={{ flexGrow: gap, flexBasis: 0, height: 6 }} /> : null,
        ])}
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
        <img
          src={NEEDLE_AT_REST}
          width={REST.width * scale}
          height={REST.height * scale}
          alt=""
          style={{ position: "absolute", right: -(REST.left + REST.width) * scale, top: 6 + REST.top * scale }}
        />
      </div>
    </div>
  );
}

/** "from £15.50" with the pounds large and the pence small, in the plum of the site's stitching */
function Price({ amount }: { amount: string }) {
  const [, pounds, pence] = /^(£\d+)(\.\d+)?$/.exec(amount) ?? [amount, amount, ""];
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 30 }}>
      <span style={{ fontSize: 30, color: GREY }}>from</span>
      <span style={{ fontSize: 76, lineHeight: 1, color: PLUM }}>{pounds}</span>
      {pence && <span style={{ fontSize: 44, lineHeight: 1, color: PLUM, marginLeft: -12 }}>{pence}</span>}
    </div>
  );
}

/** The site's own booking button — what the person taps next — and the other way in */
function BookButton() {
  const size = { width: 318, height: 66 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          width: size.width,
          height: size.height,
          borderRadius: size.height / 2,
          backgroundColor: LAVENDER,
          // Lavender on lavender cloth: lifted off it as the label is
          border: "1px solid rgba(90, 45, 92, 0.16)",
          boxShadow: "0 6px 16px rgba(90, 45, 92, 0.18)",
          fontSize: 26,
          letterSpacing: "0.08em",
          color: INK,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn into a PNG, not a page */}
        <img
          src={topstitch(size.width, size.height, 6, size.height / 2 - 6, 2)}
          width={size.width}
          height={size.height}
          alt=""
          style={{ position: "absolute", top: 0, left: 0 }}
        />
        CHOOSE A TIME
        <span style={{ fontSize: 28 }}>→</span>
      </div>
      <div style={{ display: "flex", fontSize: 28, color: GREY }}>or WhatsApp a photo</div>
    </div>
  );
}
