/**
 * How long a piece takes to make, in words that survive being pasted anywhere.
 *
 * Kristina types this field by hand, and what she types is "3-5" — which is
 * exactly right in the Studio, next to a label that says how many days. It is
 * wrong everywhere else: the product page rendered "3-5 production" and an
 * Instagram caption went out reading "Made to order in 3-5." Neither is a
 * sentence, and the caption is the one strangers see first.
 *
 * So the unit is added here rather than demanded of her. A value that already
 * carries a word — "1–3 business days", "two weeks" — is left exactly as she
 * wrote it; only a bare range or number gets "days" put on the end.
 */

/** Digits, an optional range, and nothing else: "3-5", "3 – 5", "7". */
const BARE_RANGE = /^\s*(\d+)\s*(?:[-–—]\s*(\d+)\s*)?$/;

export function productionTimeLabel(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const bare = BARE_RANGE.exec(value);
  if (!bare) {
    // Already a phrase. Only the hyphen is tidied, because "1-3 business days"
    // and "1–3 business days" should not read as two different promises.
    return value.replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
  }

  const [, from, to] = bare;
  const range = to ? `${from}–${to}` : from;
  const unit = !to && from === "1" ? "day" : "days";
  return `${range} ${unit}`;
}
