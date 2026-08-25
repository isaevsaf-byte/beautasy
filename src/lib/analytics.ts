/**
 * GA4 / Google Ads event helpers.
 *
 * The site loaded the tags but never sent a single e-commerce event, so there
 * was no funnel to look at (where do people drop off?) and no way for Ads to
 * optimise on order value rather than order count.
 *
 * Every helper is a no-op when gtag isn't there — during SSR, before the tag
 * loads, or when a blocker removes it — so callers never need to guard.
 */

type GtagParams = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export interface AnalyticsItem {
  /** Sanity document id */
  id: string;
  name: string;
  /** Price in pence, as stored */
  price: number;
  quantity?: number;
  category?: string;
  variant?: string;
}

function send(event: string, params: GtagParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", event, params);
}

/** GA4 wants major units (pounds), we store pence. */
function toPounds(pence: number): number {
  return Math.round(pence) / 100;
}

function toGa4Items(items: AnalyticsItem[]) {
  return items.map((item) => ({
    item_id: item.id,
    item_name: item.name,
    price: toPounds(item.price),
    quantity: item.quantity ?? 1,
    ...(item.category ? { item_category: item.category } : {}),
    ...(item.variant ? { item_variant: item.variant } : {}),
  }));
}

function total(items: AnalyticsItem[]): number {
  return toPounds(
    items.reduce((sum, item) => sum + item.price * (item.quantity ?? 1), 0)
  );
}

export function trackViewItem(item: AnalyticsItem): void {
  send("view_item", {
    currency: "GBP",
    value: toPounds(item.price),
    items: toGa4Items([item]),
  });
}

export function trackAddToCart(items: AnalyticsItem[]): void {
  if (items.length === 0) return;
  send("add_to_cart", {
    currency: "GBP",
    value: total(items),
    items: toGa4Items(items),
  });
}

export function trackBeginCheckout(items: AnalyticsItem[]): void {
  if (items.length === 0) return;
  send("begin_checkout", {
    currency: "GBP",
    value: total(items),
    items: toGa4Items(items),
  });
}

export function trackSearch(term: string): void {
  send("search", { search_term: term });
}

/**
 * Purchase, sent once the customer lands back on /success.
 *
 * `value` matters twice over: GA4 reports revenue with it, and the Ads
 * conversion below can only bid toward ROAS when it knows what the order was
 * worth. The conversion previously fired with no value at all.
 */
export function trackPurchase(params: {
  transactionId: string;
  valuePence: number;
  items?: AnalyticsItem[];
  adsConversionLabel?: string;
}): void {
  const value = toPounds(params.valuePence);

  send("purchase", {
    transaction_id: params.transactionId,
    currency: "GBP",
    value,
    ...(params.items ? { items: toGa4Items(params.items) } : {}),
  });

  if (params.adsConversionLabel) {
    send("conversion", {
      send_to: params.adsConversionLabel,
      transaction_id: params.transactionId,
      currency: "GBP",
      value,
    });
  }
}
