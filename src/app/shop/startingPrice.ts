import { formatPence } from "@/lib/money";

export interface SizePrice {
  size: string;
  price: number;
}

interface Priced {
  price: number;
  availableSizes?: string[] | null;
  sizePrices?: SizePrice[] | null;
}

/**
 * What a piece costs before a size is chosen: the lowest of its sizes' prices,
 * and whether they differ.
 *
 * A piece can be priced per size in the Studio — Berry Velvet is £18 in S and
 * £25 in M. The card and the product page showed only the base price, so a
 * visitor could read one price and meet another once she picked her size.
 * A size without a price of its own costs the base price, as at checkout
 * (@/lib/stripeCheckout); a price for a size the piece is not offered in
 * cannot be chosen, so it does not count.
 */
export function startingPrice({ price, availableSizes, sizePrices }: Priced): { pence: number; varies: boolean } {
  const sizes = availableSizes ?? [];
  if (sizes.length === 0) return { pence: price, varies: false };
  const bySize = new Map((sizePrices ?? []).filter((sp) => sp.price > 0).map((sp) => [sp.size, sp.price]));
  const prices = sizes.map((size) => bySize.get(size) ?? price);
  return { pence: Math.min(...prices), varies: new Set(prices).size > 1 };
}

/** "£24.00", or "from £18.00" when the sizes cost different amounts */
export function startingPriceLabel(piece: Priced): string {
  const { pence, varies } = startingPrice(piece);
  return varies ? `from ${formatPence(pence)}` : formatPence(pence);
}
