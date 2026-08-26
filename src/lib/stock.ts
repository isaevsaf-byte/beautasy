/**
 * Ready-made stock bookkeeping for paid orders.
 *
 * Beautasy is a made-to-order studio: `stock` counts pieces already sewn and
 * ready to ship, and zero means "we'll make it for you", NOT "unavailable".
 * Nothing here blocks a sale — it keeps the "Only N left in ready-made stock"
 * badge honest and stops the back-in-stock cron emailing about stock that has
 * already gone. Counters floor at zero.
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
 * Works out the fields to write for one product, or null when there is nothing
 * to change. Per-size counters are optional and only the ordered sizes move.
 */
export function planStockPatch(
  doc: StockDoc,
  entry: OrderedEntry
): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {};

  if (typeof doc.stock === "number") {
    fields.stock = Math.max(0, doc.stock - entry.total);
  }

  if (doc.sizeStock && doc.sizeStock.length > 0 && entry.bySize.size > 0) {
    fields.sizeStock = doc.sizeStock.map((row) => {
      const ordered = entry.bySize.get(row.size) ?? 0;
      return ordered > 0
        ? { ...row, quantity: Math.max(0, row.quantity - ordered) }
        : row;
    });
  }

  return Object.keys(fields).length > 0 ? fields : null;
}
