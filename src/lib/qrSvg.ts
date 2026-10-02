import QRCode from "qrcode";

/**
 * A Beautasy QR code as SVG: round dots, rounded finder "eyes", and a needle
 * and thread in the middle.
 *
 * The same drawing as qr_svg.py in ~/Documents/Beautasy-Partner-Cards, moved
 * here so a partner's card comes out of the Studio with one button instead of
 * out of a Python script on Safar's Mac.
 *
 * Error correction H (30%) is what pays for the badge, and the quiet zone is
 * four modules, as the standard asks. A pretty code that will not scan is a
 * print run in the bin: the first version of this drawing was read by no
 * decoder at all, which is why the shapes are described once, in
 * `qrDrawing`, and both the SVG below and the scanning test in qrSvg.test.ts
 * are made from that one description.
 */

export const PLUM = "#5A2D5C";
export const GOLD = "#B08848";
export const LAVENDER = "#F5F0FF";

/**
 * The shapes' sizes, in modules. Exported so the scanning test paints with
 * the very numbers the SVG is written with: a dot shrunk here is a dot shrunk
 * there, and has to scan.
 */
export const GEOMETRY = {
  /** A dark module's dot */
  dot: 0.5,
  /** The finder eye: a ring one module thick, and a 3×3 core */
  finderRx: 1.9,
  finderCoreRx: 0.9,
  /** The alignment mark: the same, smaller */
  alignRx: 1.2,
  alignCoreRx: 0.3,
  /** The badge in the middle, and its gold ring */
  badge: 3.6,
  badgeRing: 0.35,
  /** How far past the badge the dots are cleared, so none is half covered */
  badgeClearance: 0.6,
  needle: 0.42,
  thread: 0.32,
} as const;

/** Radius of the badge in the middle, in modules. */
export const BADGE_RADIUS = GEOMETRY.badge;

export interface QrMatrix {
  version: number;
  /** Modules along one side, quiet zone not included */
  size: number;
  isDark(row: number, col: number): boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  return { version: qr.version, size, isDark: (row, col) => Boolean(data[row * size + col]) };
}

/**
 * Where the alignment patterns sit, as module coordinates of their centres —
 * the table in ISO/IEC 18004 Annex E, computed the way the encoders do.
 */
export function alignmentCentres(version: number): number[] {
  if (version < 2) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const centres = [size - 7];
  for (let i = 1; i < count - 1; i++) centres[i] = centres[i - 1] - step;
  centres.push(6);
  return centres.reverse();
}

export interface QrDrawing {
  /** Side of the whole picture, quiet zone included, in modules */
  total: number;
  quiet: number;
  /** Side of the code itself */
  size: number;
  /** Dark modules drawn as dots: [row, col] */
  dots: Array<[number, number]>;
  /** Top-left module of each 7×7 finder: [row, col] */
  finders: Array<[number, number]>;
  /** Top-left module of each 5×5 alignment pattern: [row, col] */
  aligns: Array<[number, number]>;
  /** The needle-and-thread disc, centred in the code; null when left out */
  badge: { cx: number; cy: number; r: number } | null;
}

/** The shapes, in module units, before anything is written as SVG. */
export function qrDrawing(text: string, { badge = true, quiet = 4 }: { badge?: boolean; quiet?: number } = {}): QrDrawing {
  const m = qrMatrix(text);
  const n = m.size;
  const finders: Array<[number, number]> = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ];
  const aligns: Array<[number, number]> = [];
  const centres = alignmentCentres(m.version);
  for (const r of centres) {
    for (const c of centres) {
      // The three corners where an alignment pattern would sit on a finder
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      aligns.push([r - 2, c - 2]);
    }
  }

  const inBox = (r: number, c: number, boxes: Array<[number, number]>, side: number) =>
    boxes.some(([br, bc]) => br <= r && r < br + side && bc <= c && c < bc + side);
  const mid = n / 2;
  const clear = GEOMETRY.badge + GEOMETRY.badgeClearance;
  const underBadge = (r: number, c: number) =>
    badge && (r + 0.5 - mid) ** 2 + (c + 0.5 - mid) ** 2 <= clear ** 2;

  const dots: Array<[number, number]> = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!m.isDark(r, c)) continue;
      if (inBox(r, c, finders, 7) || inBox(r, c, aligns, 5) || underBadge(r, c)) continue;
      dots.push([r, c]);
    }
  }

  return {
    total: n + 2 * quiet,
    quiet,
    size: n,
    dots,
    finders,
    aligns,
    badge: badge ? { cx: mid, cy: mid, r: GEOMETRY.badge } : null,
  };
}

export interface QrSvgOptions {
  dark?: string;
  light?: string;
  badge?: boolean;
  quiet?: number;
}

/** The code as an SVG element, `sizeMm` across including its quiet zone. */
export function qrSvg(text: string, sizeMm: number, { dark = PLUM, light = "#FFFFFF", badge = true, quiet = 4 }: QrSvgOptions = {}): string {
  const d = qrDrawing(text, { badge, quiet });
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.total} ${d.total}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="geometricPrecision" role="img" aria-label="QR code">`,
    `<rect width="${d.total}" height="${d.total}" rx="1.6" fill="${light}"/>`,
    `<g transform="translate(${d.quiet} ${d.quiet})" fill="${dark}">`,
  ];
  const g = GEOMETRY;
  for (const [r, c] of d.dots) out.push(`<circle cx="${c + 0.5}" cy="${r + 0.5}" r="${g.dot}"/>`);
  for (const [br, bc] of d.finders) {
    out.push(
      `<rect x="${bc + 0.5}" y="${br + 0.5}" width="6" height="6" rx="${g.finderRx}" fill="none" stroke="${dark}" stroke-width="1"/>`,
      `<rect x="${bc + 2}" y="${br + 2}" width="3" height="3" rx="${g.finderCoreRx}"/>`
    );
  }
  for (const [br, bc] of d.aligns) {
    out.push(
      `<rect x="${bc + 0.5}" y="${br + 0.5}" width="4" height="4" rx="${g.alignRx}" fill="none" stroke="${dark}" stroke-width="1"/>`,
      `<rect x="${bc + 2}" y="${br + 2}" width="1" height="1" rx="${g.alignCoreRx}"/>`
    );
  }
  if (d.badge) {
    const { cx, cy, r } = d.badge;
    out.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${LAVENDER}" stroke="${GOLD}" stroke-width="${g.badgeRing}"/>`,
      // A needle on the diagonal, with a loop of thread through its eye
      `<g transform="translate(${cx} ${cy}) rotate(-38)" fill="none" stroke-linecap="round">` +
        `<path d="M0 -2.55 L0 2.25" stroke="${dark}" stroke-width="${g.needle}"/>` +
        `<ellipse cx="0" cy="-2.05" rx="0.22" ry="0.42" stroke="${LAVENDER}" stroke-width="0.16" fill="${LAVENDER}"/>` +
        `<path d="M0 -2.05 C 1.9 -2.6, 2.2 -0.4, 0.6 0.2 S -1.9 1.6, -1.1 2.6" stroke="${GOLD}" stroke-width="${g.thread}"/>` +
        `</g>`
    );
  }
  out.push("</g>", "</svg>");
  return out.join("\n");
}
