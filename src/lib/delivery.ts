/**
 * How long a parcel takes, said the same way on the product page as on the
 * Stripe payment page.
 *
 * They used to disagree. Every product's Shipping text in the Studio said "UK
 * 2–3 business days, Europe 3–5, rest of the world 6–7", while Stripe Checkout
 * — the page where the customer actually pays — said UK 3–5 and international
 * 7–14. A buyer who reads both is left with two promises and no idea which one
 * we will keep, so the page now quotes these numbers, which are the ones the
 * checkout gives Stripe (src/app/api/checkout/route.ts, delivery_estimate).
 * delivery.test.ts fails if the two drift apart again.
 *
 * Making time is not here: it belongs to the piece (its productionTime) and is
 * said once, by @/lib/availability.
 */

/** Business days in the post, once the parcel has left the atelier. */
export const UK_DELIVERY_DAYS = { min: 3, max: 5 } as const;
export const INTERNATIONAL_DELIVERY_DAYS = { min: 7, max: 14 } as const;

/** A piece that is already sewn leaves the atelier within this many business days. */
export const READY_MADE_DISPATCH_DAYS = { min: 1, max: 2 } as const;

/** "3–5", with the dash the rest of the site uses. */
export function dayRange(days: { min: number; max: number }): string {
  return days.min === days.max ? String(days.min) : `${days.min}–${days.max}`;
}

/** The delivery lines shown in a product's Shipping section. */
export const DELIVERY_TIMES: readonly string[] = [
  `UK: tracked delivery, ${dayRange(UK_DELIVERY_DAYS)} business days once it's dispatched.`,
  `International: tracked delivery, ${dayRange(INTERNATIONAL_DELIVERY_DAYS)} business days once it's dispatched.`,
  "The delivery price is shown in your bag and at checkout.",
];

/** A number of days, or a range of them: "3–5 business days", "2-3 days", "7 days". */
const QUOTES_DAYS = /\b\d+\s*(?:(?:[-–—]|to)\s*\d+\s*)?(?:business\s+|working\s+)?days?\b/i;

type Block = { _type?: string; children?: { text?: unknown }[] };

function blockText(block: unknown): string {
  const children = (block as Block)?.children;
  if (!Array.isArray(children)) return "";
  return children.map((child) => (typeof child?.text === "string" ? child.text : "")).join("");
}

/**
 * Kristina's own Shipping text from the Studio, without the paragraphs that
 * quote a number of days. Those are said once, by the lines above and by the
 * piece's availability, so the page can never make two different promises.
 * Everything else she wrote — the carrier, customs and duties — still shows.
 */
export function withoutQuotedDays(blocks: unknown[] | null | undefined): unknown[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.filter((block) => !QUOTES_DAYS.test(blockText(block)));
}
