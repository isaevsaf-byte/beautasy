/**
 * Ready-made stock bookkeeping for paid orders.
 *
 * Beautasy is a made-to-order studio: `stock` counts pieces already sewn and
 * ready to ship, and zero means "we'll make it for you", NOT "unavailable".
 * Nothing here blocks a sale — it keeps the "Only N left in ready-made stock"
 * badge honest and stops the back-in-stock cron emailing about stock that has
 * already gone. Counters floor at zero.
 *
 * Decrements are atomic (`dec`), so two orders paid in the same second both
 * count; a read-then-set would have lost one of them. Flooring happens in a
 * second pass, because `dec` cannot floor on its own.
 */

export const GIFTBOX_ADDON_SUFFIX = "-giftbox";

export interface OrderedLine {
  /** Sanity document id from the Stripe product metadata */
  productId: string;
  size?: string;
  quantity: number;
}

export interface OrderedEntry {
  total: number;
  bySize: Map<string, number>;
}

export interface StockDoc {
  _id: string;
  stock?: number;
  sizeStock?: { _key?: string; size: string; quantity: number }[];
}

/** Groups order lines per product, tracking per-size quantities where chosen. */
export function collectOrdered(lines: OrderedLine[]): Map<string, OrderedEntry> {
  const wanted = new Map<string, OrderedEntry>();

  for (const line of lines) {
    // Gift box add-ons are a surcharge on a product, not a stocked document
    if (!line.productId || line.productId.endsWith(GIFTBOX_ADDON_SUFFIX)) continue;
    if (!Number.isFinite(line.quantity) || line.quantity < 1) continue;

    const entry = wanted.get(line.productId) ?? { total: 0, bySize: new Map() };
    entry.total += line.quantity;
    if (line.size) {
      entry.bySize.set(line.size, (entry.bySize.get(line.size) ?? 0) + line.quantity);
    }
    wanted.set(line.productId, entry);
  }

  return wanted;
}

/**
 * The atomic decrements for one product, keyed by Sanity path, or null when
 * there is nothing to move. Per-size rows are addressed by `_key`; a row
 * without one cannot be targeted and is left alone.
 */
export function planStockDecrement(
  doc: StockDoc,
  entry: OrderedEntry
): Record<string, number> | null {
  const dec: Record<string, number> = {};

  if (typeof doc.stock === "number" && entry.total > 0) {
    dec.stock = entry.total;
  }

  if (doc.sizeStock && doc.sizeStock.length > 0 && entry.bySize.size > 0) {
    for (const row of doc.sizeStock) {
      const ordered = entry.bySize.get(row.size) ?? 0;
      if (ordered > 0 && row._key) {
        dec[`sizeStock[_key=="${row._key}"].quantity`] = ordered;
      }
    }
  }

  return Object.keys(dec).length > 0 ? dec : null;
}

/**
 * Fields that bring a counter back to zero after it went negative — more was
 * ordered than was ready-made, which is fine for a made-to-order shop, but a
 * badge reading "-2 left" is not. Null when everything is already at or above zero.
 */
export function planStockFloor(doc: StockDoc): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};

  if (typeof doc.stock === "number" && doc.stock < 0) {
    fields.stock = 0;
  }

  if (doc.sizeStock && doc.sizeStock.some((row) => row.quantity < 0)) {
    fields.sizeStock = doc.sizeStock.map((row) =>
      row.quantity < 0 ? { ...row, quantity: 0 } : row
    );
  }

  return Object.keys(fields).length > 0 ? fields : null;
}
