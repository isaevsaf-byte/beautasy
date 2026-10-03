import { productionTimeLabel } from "@/lib/productionTime";
import { READY_MADE_DISPATCH_DAYS, dayRange } from "@/lib/delivery";

/**
 * Whether a piece ships now or is made for you — said once, the same way on
 * the shop grid and on the product page.
 *
 * Both used to answer on their own. The grid said "Ready to ship" for every
 * piece with any stock at all, and the product page then said "Only 4 left in
 * ready-made stock", "Made in 3–5 days" and "Ready to dispatch within 3–5
 * business days" side by side. A buyer could not tell whether it ships
 * tomorrow or next week, which is the one thing that page has to answer.
 *
 * Stock is counted per product, not per size, unless Kristina fills in the
 * per-size counts. So for a piece with sizes, a product-wide count can only
 * honestly say "some sizes are ready", never that the size you picked is.
 */

export interface AvailabilityInput {
  /** Ready-made pieces on the shelf, for the product as a whole */
  stock?: number | null;
  /** Ready-made pieces per size, when Kristina tracks them */
  sizeStock?: { size: string; quantity: number }[] | null;
  availableSizes?: string[] | null;
  /** Kristina's making time, as typed in the Studio ("3-5") */
  productionTime?: string | null;
}

export interface Availability {
  /** ready: this one ships now · some-ready: some sizes do · made-to-order: it is made for you */
  kind: "ready" | "some-ready" | "made-to-order";
  /** One short line, for a product card or a chip */
  label: string;
  /** The full sentence for the product page */
  detail: string;
  /** Ready-made pieces left, when there are few enough to say so */
  fewLeft: number | null;
}

/** "Only N left" shows from this many down. */
export const FEW_LEFT = 5;

export function availability(
  product: AvailabilityInput,
  options: { size?: string | null; madeToMeasure?: boolean } = {}
): Availability {
  const making = productionTimeLabel(product.productionTime);
  const dispatch = `${dayRange(READY_MADE_DISPATCH_DAYS)} business days`;

  // Cut to someone's measurements is always made for them, whatever is on the shelf
  if (options.madeToMeasure) {
    return {
      kind: "made-to-order",
      label: making ? `Made to measure in ${making}` : "Made to measure",
      detail: making
        ? `Cut to your measurements and made in ${making}, then dispatched.`
        : "Cut to your measurements, then dispatched.",
      fewLeft: null,
    };
  }

  const madeToOrder: Availability = {
    kind: "made-to-order",
    label: making ? `Made to order in ${making}` : "Made to order",
    detail: making ? `Made to order for you in ${making}, then dispatched.` : "Made to order for you, then dispatched.",
    fewLeft: null,
  };
  const ready = (left: number): Availability => ({
    kind: "ready",
    label: `Ready to ship in ${dayRange(READY_MADE_DISPATCH_DAYS)} days`,
    detail: `Ready-made: dispatched within ${dispatch}.`,
    fewLeft: left <= FEW_LEFT ? left : null,
  });
  const someReady: Availability = {
    kind: "some-ready",
    label: "Some sizes ready to ship",
    detail: making
      ? `Some sizes are ready-made and dispatched within ${dispatch}; any other size is made for you in ${making}.`
      : `Some sizes are ready-made and dispatched within ${dispatch}; any other size is made for you to order.`,
    fewLeft: null,
  };

  // Per-size counts, when Kristina keeps them, answer for the size picked
  const sizeStock = product.sizeStock ?? [];
  if (sizeStock.length > 0) {
    if (options.size) {
      const left = sizeStock.find((row) => row.size === options.size)?.quantity ?? 0;
      return left > 0 ? ready(left) : madeToOrder;
    }
    return sizeStock.some((row) => row.quantity > 0) ? someReady : madeToOrder;
  }

  const stock = product.stock ?? 0;
  if (stock <= 0) return madeToOrder;
  // A product-wide count cannot promise any one size
  if ((product.availableSizes ?? []).length > 0) return someReady;
  return ready(stock);
}
