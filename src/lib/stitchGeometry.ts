/**
 * Where the first stitch goes: eleven running stitches under a heading's last
 * words, the needle that sews them and the loop of thread it is left with.
 *
 * Everything is a fraction of the words' width or a multiple of their font
 * size, so the same numbers work for the home page's 36px heading on a phone
 * and the 60px one on a laptop. The stylesheet moves the needle to the same
 * places (see .stitched in app/globals.css); stitchGeometry.test.ts holds the
 * two together.
 *
 * Chosen by Safar on the demo, 07.10.2026: gold thread, the large needle, the
 * slow pace, sewn left to right, the needle left in the cloth.
 */

/** Stitches under the words */
export const STITCH_COUNT = 11;

/** One stitch and the gap after it, as a fraction of the words' width */
export const STITCH_UNIT = 1 / (STITCH_COUNT - 0.4);

/** Hand-sewn stitches are never quite even: each one's length and height, the same every time */
const WOBBLE: readonly (readonly [number, number])[] = [
  [0.3, 1.03], [-0.2, 0.95], [0.45, 1.05], [-0.35, 0.97], [0.1, 1.06], [-0.45, 0.94],
  [0.2, 1.01], [-0.1, 0.96], [0.35, 1.04], [-0.25, 0.99], [0.15, 1.02],
];

/** The seam is drawn 1000 wide and 20 high, stretched to the words; the cloth is the middle line */
const SEAM_WIDTH = 1000;
const CLOTH = 10;

export interface Stitch {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const STITCHES: readonly Stitch[] = WOBBLE.map(([dy, length], k) => {
  const x1 = k * STITCH_UNIT * SEAM_WIDTH;
  const x2 = x1 + 0.6 * STITCH_UNIT * length * SEAM_WIDTH;
  const y = CLOTH + dy;
  return { x1: round(x1), y1: round(y), x2: round(x2), y2: round(y - dy * 0.3) };
});

/** Where the last stitch ends, as a fraction of the words' width */
export const SEAM_END = STITCHES[STITCHES.length - 1].x2 / SEAM_WIDTH;

/** Where the needle has got to when the last stitch is sewn: one unit per stitch */
export const SEWN_TO = STITCH_COUNT * STITCH_UNIT;

/** Where it is when the thread has been pulled through */
export const PULLED_TO = SEAM_END + 0.7 * STITCH_UNIT;

/** The large needle, in hundredths of the heading's font size, drawn with its point at 0,0 */
export const NEEDLE_LENGTH = (38 / 36) * 100;
const SHAFT = NEEDLE_LENGTH * 0.068;
export const NEEDLE_EYE_X = round(-NEEDLE_LENGTH + SHAFT * 2.4);

export const NEEDLE_SHAPE =
  `M0 0L${round(-NEEDLE_LENGTH * 0.34)} ${round(-SHAFT / 2)}L${round(-NEEDLE_LENGTH + SHAFT / 2)} ${round(-SHAFT / 2)}` +
  `A${round(SHAFT / 2)} ${round(SHAFT / 2)} 0 0 0 ${round(-NEEDLE_LENGTH + SHAFT / 2)} ${round(SHAFT / 2)}` +
  `L${round(-NEEDLE_LENGTH * 0.34)} ${round(SHAFT / 2)}Z`;

export const NEEDLE_SHINE = {
  x1: round(-NEEDLE_LENGTH * 0.32),
  x2: round(-NEEDLE_LENGTH + SHAFT * 1.2),
  y: round(-SHAFT * 0.2),
  width: round(SHAFT * 0.26),
};

export const NEEDLE_EYE = { cx: NEEDLE_EYE_X, rx: round(NEEDLE_LENGTH * 0.075), ry: round(SHAFT * 0.24) };

/** The thread out of the eye and down into the cloth, while the needle sews */
export const NEEDLE_TAIL = `M${NEEDLE_EYE_X} 0C${round(NEEDLE_EYE_X - 25)} 5 ${round(NEEDLE_EYE_X - 35)} 35 ${round(NEEDLE_EYE_X - 30)} 75`;

/** At rest the needle stands in the cloth past the knot, its eye up and to the right */
export const PARKED = { pastEnd: 0.2, below: 0.05, turn: 128 };

/**
 * The loop of thread from the parked needle's eye down to the knot, drawn in
 * hundredths of the font size from a point 0.1em left of the seam's end and
 * 0.8em above the cloth.
 */
export const LOOP = (() => {
  const turn = (PARKED.turn * Math.PI) / 180;
  const eye = {
    x: PARKED.pastEnd * 100 + Math.cos(turn) * NEEDLE_EYE_X + 10,
    y: PARKED.below * 100 + Math.sin(turn) * NEEDLE_EYE_X + 80,
  };
  const knot = { x: 17, y: 80 };
  return `M${round(eye.x)} ${round(eye.y)}C${round(eye.x + 42)} ${round(eye.y + 10)} ${knot.x + 50} ${knot.y - 32} ${knot.x} ${knot.y}`;
})();

/**
 * The seam under a confirmation's heading (components/stitch/TiedOff.tsx),
 * in the same 1000 × 20 cloth stretched to the words. Each stitch takes
 * `along` of its unit and leaves the rest as the gap; the last one is exactly
 * a unit long, so the seam ends at the words' edge, where a knot is tied.
 */
function seamOf(wobble: readonly (readonly [number, number])[], along: number): readonly Stitch[] {
  const unit = 1 / (wobble.length - 1 + along);
  return wobble.map(([dy, length], k) => {
    const x1 = k * unit * SEAM_WIDTH;
    const x2 = x1 + along * unit * length * SEAM_WIDTH;
    const y = CLOTH + dy;
    return { x1: round(x1), y1: round(y), x2: round(x2), y2: round(y - dy * 0.3) };
  });
}

/** A booking that holds its time: seven gold stitches, knotted and cut. Chosen by Safar on the demo, 07.10.2026 */
export const TIED_STITCHES = seamOf(
  [[0.6, 1.02], [-0.4, 0.97], [0.8, 1.04], [-0.6, 0.96], [0.3, 1.03], [-0.7, 0.98], [0.4, 1]],
  0.6,
);

/** A request Kristina still answers: five long, loose tacking stitches and no knot — held, not yet sewn */
export const TACKED_STITCHES = seamOf([[1.6, 1], [-1.6, 1.02], [1.2, 0.97], [-1.2, 1.01], [1, 1]], 0.72);

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
