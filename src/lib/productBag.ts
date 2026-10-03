import type { CartItem } from "@/store/useCart";

/**
 * What a product page puts in the bag, and what stops it.
 *
 * Kept apart from the page so the rules can be tested on their own. The one
 * that mattered: with "Made to your measurements" ticked and a measurement
 * missing, the button only LOOKED disabled. A tap added the standard piece and
 * quietly left the made-to-measure line out, so the customer paid for a stock
 * size she had not asked for and Kristina never heard about the measurements.
 * Now a missing measurement stops the add, on the main button and on the
 * phone's sticky bar alike, and the measurement line goes in whenever it is
 * ticked.
 */

export type MeasurementField = "bust" | "waist" | "hips" | "height";

export interface Measurements {
  bust: string;
  waist: string;
  hips: string;
  height: string;
  notes: string;
}

export const EMPTY_MEASUREMENTS: Measurements = { bust: "", waist: "", hips: "", height: "", notes: "" };

const LABELS: Record<MeasurementField, string> = {
  bust: "Bust",
  waist: "Waist",
  hips: "Hips",
  height: "Height",
};

// A child has no bust, and being asked for one is the kind of small
// wrongness that makes a parent close the tab. Children's pieces are cut
// from waist, hips and height instead.
function forChild(category: string | undefined): boolean {
  return category === "Kids";
}

/** The fields offered, in order, with their labels. */
export function measurementFieldsFor(category: string | undefined): [MeasurementField, string][] {
  const fields: MeasurementField[] = forChild(category)
    ? ["waist", "hips", "height"]
    : ["bust", "waist", "hips", "height"];
  return fields.map((field) => [field, LABELS[field]]);
}

/** The fields Kristina cannot cut without. */
export function requiredMeasurementsFor(category: string | undefined): MeasurementField[] {
  return forChild(category) ? ["waist", "hips"] : ["bust", "waist", "hips"];
}

export function missingMeasurements(measurements: Measurements, category: string | undefined): MeasurementField[] {
  return requiredMeasurementsFor(category).filter((field) => !measurements[field].trim());
}

/** "bust and hips", "bust, waist and hips" */
export function listMeasurements(fields: MeasurementField[]): string {
  const words = fields.map((field) => LABELS[field].toLowerCase());
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * The measurements as one line, the way the bag shows them and checkout sends
 * them to Stripe: "Bust 86cm · Waist 70cm · Hips 94cm · Notes: …".
 */
export function measurementSummary(measurements: Measurements): string {
  return [
    measurements.bust && `Bust ${measurements.bust}`,
    measurements.waist && `Waist ${measurements.waist}`,
    measurements.hips && `Hips ${measurements.hips}`,
    measurements.height && `Height ${measurements.height}`,
    measurements.notes && `Notes: ${measurements.notes}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export interface BagChoice {
  hasSizes: boolean;
  size: string | null;
  hasColors: boolean;
  color: string | null;
  /** Made to measure ticked, on a piece that offers it */
  madeToMeasure: boolean;
  measurementsMissing: MeasurementField[];
}

export interface BagBlockers {
  size: boolean;
  colour: boolean;
  measurements: boolean;
}

export function bagBlockers(choice: BagChoice): BagBlockers {
  return {
    size: choice.hasSizes && !choice.size,
    colour: choice.hasColors && !choice.color,
    measurements: choice.madeToMeasure && choice.measurementsMissing.length > 0,
  };
}

export function isBlocked(blockers: BagBlockers): boolean {
  return blockers.size || blockers.colour || blockers.measurements;
}

/**
 * What the add button says. With a total it reads "Add to Bag — £30.00"; the
 * phone's sticky bar shows the price beside the button, so it leaves it out.
 */
export function bagButtonLabel(blockers: BagBlockers, totalPence?: number): string {
  if (blockers.size && blockers.colour) return "Select Size & Colour";
  if (blockers.size) return "Select a Size";
  if (blockers.colour) return "Select a Colour";
  if (blockers.measurements) return "Add Your Measurements";
  return totalPence === undefined ? "Add to Bag" : `Add to Bag — £${(totalPence / 100).toFixed(2)}`;
}

export type BagLine = Omit<CartItem, "quantity">;

export interface BagOrder {
  product: { _id: string; name: string; slug: string };
  price: number;
  image: string;
  size: string | null;
  color: string | null;
  giftBox: { price: number; message: string } | null;
  madeToMeasure: { price: number; measurements: Measurements } | null;
}

/**
 * The bag lines for one add: the piece, then a gift box and a made-to-measure
 * line when chosen. The made-to-measure line carries the measurements as one
 * string — checkout passes it to Stripe as it is.
 */
export function bagLines(order: BagOrder): BagLine[] {
  const { product, image } = order;
  const lines: BagLine[] = [
    {
      id: product._id,
      name: product.name,
      slug: product.slug,
      price: order.price,
      image,
      ...(order.size ? { size: order.size } : {}),
      ...(order.color ? { color: order.color } : {}),
    },
  ];

  if (order.giftBox && order.giftBox.price > 0) {
    const message = order.giftBox.message.trim();
    lines.push({
      id: `${product._id}-giftbox`,
      name: `Gift Box — ${product.name}`,
      price: order.giftBox.price,
      image,
      ...(message ? { giftMessage: message } : {}),
    });
  }

  if (order.madeToMeasure && order.madeToMeasure.price > 0) {
    lines.push({
      id: `${product._id}-madetomeasure`,
      name: `Made to Measure — ${product.name}`,
      price: order.madeToMeasure.price,
      image,
      measurements: measurementSummary(order.madeToMeasure.measurements),
    });
  }

  return lines;
}
