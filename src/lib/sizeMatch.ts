/**
 * Turns body measurements into a recommended size using the product's own
 * size guide — the same table the customer would otherwise have to read and
 * compare by hand, which is the single biggest hesitation when buying
 * lingerie online.
 */

export interface SizeGuideRow {
  size?: string;
  uk?: string;
  eu?: string;
  bust?: string;
  waist?: string;
  hips?: string;
}

/** Measurements the guide actually has numbers for. */
export type Measure = "bust" | "waist" | "hips";

export const MEASURE_LABELS: Record<Measure, string> = {
  bust: "Bust",
  waist: "Waist",
  hips: "Hips",
};

/**
 * Parses a cell like "46-48cm", "52.5-55cm" or "86cm" into a range.
 * Returns null when there are no numbers to work with.
 */
export function parseRange(cell?: string): { min: number; max: number } | null {
  if (!cell) return null;
  const numbers = cell.match(/\d+(?:[.,]\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  const values = numbers.map((n) => parseFloat(n.replace(",", ".")));
  if (values.length === 1) return { min: values[0], max: values[0] };
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Which measurements this guide can actually match against. */
export function availableMeasures(rows: SizeGuideRow[]): Measure[] {
  const measures: Measure[] = ["bust", "waist", "hips"];
  return measures.filter((m) => rows.some((row) => parseRange(row[m]) !== null));
}

/**
 * Finds the row a single measurement belongs to.
 *
 * Between two sizes, the larger one wins — that is what Beautasy's own size
 * guides advise, and a handmade piece that is slightly roomy is wearable while
 * one that is slightly tight is not. Above the largest row, returns the largest.
 */
function matchOne(rows: SizeGuideRow[], measure: Measure, value: number): string | null {
  const candidates = rows
    .map((row) => ({ size: row.size, range: parseRange(row[measure]) }))
    .filter((r): r is { size: string; range: { min: number; max: number } } =>
      !!r.size && r.range !== null
    )
    .sort((a, b) => a.range.min - b.range.min);

  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    if (value <= candidate.range.max) return candidate.size;
  }
  return candidates[candidates.length - 1].size;
}

export interface SizeSuggestion {
  size: string | null;
  /** Sizes each measurement pointed at, for explaining the recommendation */
  perMeasure: { measure: Measure; size: string }[];
  /** True when the measurements disagreed and we rounded up */
  mixed: boolean;
}

/**
 * Recommends a size from whatever measurements were given.
 * When measurements point at different sizes, the larger is recommended and
 * `mixed` is set so the UI can say so honestly.
 */
export function suggestSize(
  rows: SizeGuideRow[],
  values: Partial<Record<Measure, number>>
): SizeSuggestion {
  const order = rows.map((r) => r.size).filter((s): s is string => !!s);
  const perMeasure: { measure: Measure; size: string }[] = [];

  for (const measure of ["bust", "waist", "hips"] as Measure[]) {
    const value = values[measure];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    const match = matchOne(rows, measure, value);
    if (match) perMeasure.push({ measure, size: match });
  }

  if (perMeasure.length === 0) return { size: null, perMeasure: [], mixed: false };

  // "Largest" means furthest down the guide, not alphabetical
  const largest = perMeasure.reduce((best, current) =>
    order.indexOf(current.size) > order.indexOf(best.size) ? current : best
  );

  return {
    size: largest.size,
    perMeasure,
    mixed: new Set(perMeasure.map((p) => p.size)).size > 1,
  };
}
