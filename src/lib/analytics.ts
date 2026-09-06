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
    fbq?: (...args: unknown[]) => void;
  }
}

export interface AnalyticsItem {
  /** Sanity document id */
  id: string;
  /** Product slug — the Meta catalogue keys on BEAUTASY_<slug>, so dynamic ads
   *  can only match a viewed product when we send the same id. */
  slug?: string;
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

/** Meta Pixel. Silent when the pixel hasn't loaded — e.g. before consent. */
function sendMeta(event: string, params: GtagParams): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", event, params);
}

/** The ids Meta's catalogue uses, matching /api/meta-feed. */
function feedIds(items: AnalyticsItem[]): string[] {
  return items.filter((i) => i.slug).map((i) => `BEAUTASY_${i.slug}`);
}

function metaPayload(items: AnalyticsItem[]) {
  return {
    content_type: "product",
    content_ids: feedIds(items),
    contents: items
      .filter((i) => i.slug)
      .map((i) => ({ id: `BEAUTASY_${i.slug}`, quantity: i.quantity ?? 1 })),
    currency: "GBP",
    value: total(items),
  };
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
  sendMeta("ViewContent", { ...metaPayload([item]), content_name: item.name });
}

export function trackAddToCart(items: AnalyticsItem[]): void {
  if (items.length === 0) return;
  send("add_to_cart", {
    currency: "GBP",
    value: total(items),
    items: toGa4Items(items),
  });
  sendMeta("AddToCart", metaPayload(items));
}

export function trackBeginCheckout(items: AnalyticsItem[]): void {
  if (items.length === 0) return;
  send("begin_checkout", {
    currency: "GBP",
    value: total(items),
    items: toGa4Items(items),
  });
  sendMeta("InitiateCheckout", { ...metaPayload(items), num_items: items.length });
}

/**
 * A fitting request from the atelier form — the campaign's primary conversion.
 *
 * Bookings were the one thing the site never reported: no way to see which of
 * the local pages brings work in, nothing for Ads or Meta to optimise toward.
 * `service` carries the page it came from ("Wedding Dress Alterations").
 */
export function trackLead(params: {
  service: string;
  source?: string;
  adsConversionLabel?: string;
}): void {
  send("generate_lead", {
    currency: "GBP",
    value: 0,
    lead_source: params.source ?? "atelier-form",
    service: params.service,
  });
  sendMeta("Lead", { content_name: params.service, content_category: "atelier" });
  if (params.adsConversionLabel) {
    send("conversion", { send_to: params.adsConversionLabel });
  }
}

/**
 * Beautasy Friends ("Give £5, get £5"): a link shared, a link opened, a
 * discount applied. Three events are enough to see whether people share at
 * all, whether the links get opened, and whether the friends then use them —
 * the three places a referral programme quietly dies.
 */
export function trackReferralShare(method: "whatsapp" | "copy"): void {
  send("share", { method, content_type: "referral_link" });
}

export function trackReferralLand(): void {
  send("referral_land", {});
}

export function trackReferralApply(where: "shop" | "atelier"): void {
  send("referral_apply", { where });
}

export function trackSearch(term: string): void {
  send("search", { search_term: term });
  sendMeta("Search", { search_string: term });
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

  sendMeta("Purchase", {
    ...(params.items ? metaPayload(params.items) : { currency: "GBP" }),
    value,
    currency: "GBP",
    // Meta dedupes against the server-side event of the same name if one is added later
    order_id: params.transactionId,
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
