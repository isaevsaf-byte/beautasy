/**
 * How the gallery's tiles are laid into columns.
 *
 * CSS columns would fill the first column top to bottom before starting the
 * second, so the newest pieces would stack down the left edge and the top row
 * would show pieces one, six and eleven. Here each tile goes into whichever
 * column is shortest so far, which keeps the newest across the top — and it is
 * worked out from the pictures' shapes alone, so the server and the browser
 * lay the page out identically and nothing jumps when it loads.
 */

/** Height over width, kept between a wide landscape and a tall phone video */
export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1.25;
  return Math.min(1.9, Math.max(0.6, ratio));
}

/** The tile's shape: its cover's, or the "after" photo's for a before-and-after pair */
export function tileRatio(piece: { media: readonly { width: number; height: number }[] }): number {
  const cover = piece.media[0];
  return clampRatio(cover ? cover.height / cover.width : 1.25);
}

/**
 * Items dealt into `count` columns, each to the shortest. `extra` is the
 * height every tile adds besides its picture — the title under it — measured
 * in column widths.
 */
export function columnsFor<T>(items: readonly T[], count: number, ratio: (item: T) => number, extra = 0.22): T[][] {
  const columns: T[][] = Array.from({ length: Math.max(1, count) }, () => []);
  const heights = columns.map(() => 0);
  for (const item of items) {
    let shortest = 0;
    for (let i = 1; i < heights.length; i++) {
      // Strictly shorter: a tie goes left, so the order reads across
      if (heights[i] < heights[shortest] - 1e-9) shortest = i;
    }
    columns[shortest].push(item);
    heights[shortest] += ratio(item) + extra;
  }
  return columns;
}

/**
 * Whether a before-and-after pair was photographed the same way round — the
 * same shape to within 3% — so the "after" can be wiped across the "before"
 * like a shutter. A portrait laid over a landscape would show the edges of
 * one photo sticking out past the other, so those swap with a fade instead.
 */
export function sameFraming(a: { width: number; height: number }, b: { width: number; height: number }): boolean {
  const ratioA = a.width / a.height;
  const ratioB = b.width / b.height;
  if (!(ratioA > 0 && ratioB > 0) || !Number.isFinite(ratioA) || !Number.isFinite(ratioB)) return false;
  return Math.abs(ratioA / ratioB - 1) <= 0.03;
}
