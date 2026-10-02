import { test } from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { BADGE_RADIUS, GEOMETRY, GOLD, LAVENDER, PLUM, alignmentCentres, qrDrawing, qrMatrix, qrSvg, type QrDrawing } from "./qrSvg";

/**
 * The partner card's QR must scan. The first drawing of it did not, with any
 * decoder, and looked perfect — so "it looks right" is not a test here.
 *
 * Each test below paints the drawing into pixels, the way a printer and a
 * phone camera see it — dots as dots, the eyes as rounded rings, the gold
 * thread and the needle over the middle — and hands the picture to a real
 * decoder. The painting is made from `qrDrawing`, the same description the
 * SVG is written from, so a change to the drawing is a change to what is
 * scanned here.
 */

type Rgb = [number, number, number];

function hex(color: string): Rgb {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function inRoundedRect(x: number, y: number, x0: number, y0: number, side: number, radius: number): boolean {
  const x1 = x0 + side;
  const y1 = y0 + side;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
  const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function nearSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number, halfWidth: number): boolean {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  const px = ax + t * vx - x;
  const py = ay + t * vy - y;
  return px * px + py * py <= halfWidth * halfWidth;
}

/** The thread's curve as short straight pieces, in the badge's own turned frame. */
const THREAD: Array<[number, number]> = (() => {
  const cubic = (p0: number[], p1: number[], p2: number[], p3: number[], t: number): [number, number] => [
    (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0],
    (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1],
  ];
  const points: Array<[number, number]> = [];
  // "M0 -2.05 C 1.9 -2.6, 2.2 -0.4, 0.6 0.2 S -1.9 1.6, -1.1 2.6": the S mirrors (2.2,-0.4) about (0.6,0.2)
  for (let i = 0; i <= 20; i++) points.push(cubic([0, -2.05], [1.9, -2.6], [2.2, -0.4], [0.6, 0.2], i / 20));
  for (let i = 1; i <= 20; i++) points.push(cubic([0.6, 0.2], [-1.0, 0.8], [-1.9, 1.6], [-1.1, 2.6], i / 20));
  return points;
})();

const WHITE: Rgb = [255, 255, 255];
const DARK = hex(PLUM);
const GOLDEN = hex(GOLD);
const PALE = hex(LAVENDER);

/** What colour the drawing has at one point, in module units from the picture's corner. */
function colourAt(d: QrDrawing, dots: Set<string>, x: number, y: number): Rgb {
  const g = GEOMETRY;
  const gx = x - d.quiet;
  const gy = y - d.quiet;

  if (d.badge) {
    const { cx, cy, r } = d.badge;
    const dist = Math.hypot(gx - cx, gy - cy);
    if (dist <= r + g.badgeRing / 2) {
      // In the badge's own frame: turned by -38°, centred on the badge
      const a = (38 * Math.PI) / 180;
      const bx = (gx - cx) * Math.cos(a) - (gy - cy) * Math.sin(a);
      const by = (gx - cx) * Math.sin(a) + (gy - cy) * Math.cos(a);
      if (nearSegment(bx, by, 0, -2.55, 0, 2.25, g.needle / 2)) return DARK;
      for (let i = 1; i < THREAD.length; i++) {
        if (nearSegment(bx, by, THREAD[i - 1][0], THREAD[i - 1][1], THREAD[i][0], THREAD[i][1], g.thread / 2)) return GOLDEN;
      }
      return dist >= r - g.badgeRing / 2 ? GOLDEN : PALE;
    }
  }
  for (const [br, bc] of d.finders) {
    if (gx < bc || gx > bc + 7 || gy < br || gy > br + 7) continue;
    // A stroke one module wide on a 6×6 square: rounded rings at rx ± half a module
    if (inRoundedRect(gx, gy, bc, br, 7, g.finderRx + 0.5) && !inRoundedRect(gx, gy, bc + 1, br + 1, 5, g.finderRx - 0.5)) return DARK;
    if (inRoundedRect(gx, gy, bc + 2, br + 2, 3, g.finderCoreRx)) return DARK;
    return WHITE;
  }
  for (const [br, bc] of d.aligns) {
    if (gx < bc || gx > bc + 5 || gy < br || gy > br + 5) continue;
    if (inRoundedRect(gx, gy, bc, br, 5, g.alignRx + 0.5) && !inRoundedRect(gx, gy, bc + 1, br + 1, 3, Math.max(0, g.alignRx - 0.5))) return DARK;
    if (inRoundedRect(gx, gy, bc + 2, br + 2, 1, g.alignCoreRx)) return DARK;
    return WHITE;
  }
  const r = Math.floor(gy);
  const c = Math.floor(gx);
  if (dots.has(`${r},${c}`) && (gx - c - 0.5) ** 2 + (gy - r - 0.5) ** 2 <= g.dot ** 2) return DARK;
  return WHITE;
}

/** The drawing painted at `perModule` pixels a module, each pixel the average of a 3×3 grid. */
function paint(d: QrDrawing, perModule: number): { data: Uint8ClampedArray; width: number; height: number } {
  const dots = new Set(d.dots.map(([r, c]) => `${r},${c}`));
  const width = Math.round(d.total * perModule);
  const data = new Uint8ClampedArray(width * width * 4);
  for (let py = 0; py < width; py++) {
    for (let px = 0; px < width; px++) {
      let rs = 0;
      let gs = 0;
      let bs = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const [r, g, b] = colourAt(d, dots, (px + (sx + 0.5) / 3) / perModule, (py + (sy + 0.5) / 3) / perModule);
          rs += r;
          gs += g;
          bs += b;
        }
      }
      const i = (py * width + px) * 4;
      data[i] = rs / 9;
      data[i + 1] = gs / 9;
      data[i + 2] = bs / 9;
      data[i + 3] = 255;
    }
  }
  return { data, width, height: width };
}

/** Halves the picture, the way a phone far from the counter sees it. */
function halve(img: { data: Uint8ClampedArray; width: number }): { data: Uint8ClampedArray; width: number; height: number } {
  const width = Math.floor(img.width / 2);
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 4; k++) {
        const at = (yy: number, xx: number) => img.data[(yy * img.width + xx) * 4 + k];
        data[(y * width + x) * 4 + k] = (at(2 * y, 2 * x) + at(2 * y + 1, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x + 1)) / 4;
      }
    }
  }
  return { data, width, height: width };
}

function scans(text: string, perModule: number, spoil?: "halved"): string | null {
  let img = paint(qrDrawing(text), perModule);
  if (spoil === "halved") img = halve(img);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

const LINKS = [
  "https://www.beautasy.co.uk/p/ab",
  "https://www.beautasy.co.uk/p/the-hair-lounge",
  "https://www.beautasy.co.uk/p/onyx-bridal",
  `https://www.beautasy.co.uk/p/${"a".repeat(14)}-${"b".repeat(15)}`,
];

test("a partner's QR, dots and needle and all, is read back as the link it carries", () => {
  for (const link of LINKS) {
    assert.equal(scans(link, 8), link, `${link} did not scan at 8 px a module`);
  }
});

test("it still scans small and soft — a phone at arm's length, not a scanner on the desk", () => {
  for (const link of LINKS) {
    assert.equal(scans(link, 10, "halved"), link, `${link} did not scan at 5 px a module`);
  }
});

test("the drawing is the code: every dark module is a dot, an eye, an alignment mark, or under the badge", () => {
  const link = "https://www.beautasy.co.uk/p/the-hair-lounge";
  const m = qrMatrix(link);
  const d = qrDrawing(link);
  const dots = new Set(d.dots.map(([r, c]) => `${r},${c}`));
  let underBadge = 0;
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      const inShape =
        d.finders.some(([br, bc]) => br <= r && r < br + 7 && bc <= c && c < bc + 7) ||
        d.aligns.some(([br, bc]) => br <= r && r < br + 5 && bc <= c && c < bc + 5);
      if (!m.isDark(r, c)) {
        assert.equal(dots.has(`${r},${c}`), false, `a light module at ${r},${c} was drawn as a dot`);
        continue;
      }
      if (dots.has(`${r},${c}`) || inShape) continue;
      underBadge += 1;
      assert.ok(
        Math.hypot(r + 0.5 - m.size / 2, c + 0.5 - m.size / 2) <= BADGE_RADIUS + 0.6,
        `a dark module at ${r},${c} was dropped outside the badge`
      );
    }
  }
  // The badge costs a handful of modules; H can lose about thirty per cent
  assert.ok(underBadge > 0 && underBadge < m.size * m.size * 0.05, `${underBadge} modules under the badge`);
});

test("alignment marks sit where the standard puts them", () => {
  assert.deepEqual(alignmentCentres(1), []);
  assert.deepEqual(alignmentCentres(2), [6, 18]);
  assert.deepEqual(alignmentCentres(5), [6, 30]);
  assert.deepEqual(alignmentCentres(7), [6, 22, 38]);
  assert.deepEqual(alignmentCentres(14), [6, 26, 46, 66]);
  assert.deepEqual(alignmentCentres(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentCentres(40), [6, 30, 58, 86, 114, 142, 170]);
});

test("the SVG is the drawing: one circle a dot, two shapes an eye, and the size asked for", () => {
  const link = "https://www.beautasy.co.uk/p/onyx-bridal";
  const d = qrDrawing(link);
  const svg = qrSvg(link, 29);
  assert.match(svg, /^<svg [^>]*width="29mm" height="29mm"/);
  assert.equal((svg.match(/<circle cx="[\d.]+" cy="[\d.]+" r="0.5"\/>/g) ?? []).length, d.dots.length);
  assert.equal((svg.match(/rx="1.9"/g) ?? []).length, 3, "three finder eyes");
  assert.match(svg, new RegExp(`viewBox="0 0 ${d.total} ${d.total}"`));
  assert.equal(svg.includes(link), false, "the link is in the dots, not written out where a scraper reads it");
  const plain = qrSvg(link, 20, { badge: false });
  assert.equal(plain.includes(LAVENDER), false, "no badge when asked for none");
});
