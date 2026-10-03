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

import { contactMethodOf, pageBucketOf, type ContactMethod } from "./contactClicks";

type GtagParams = Record<string, unknown>;

/**
 * Whether this path is the Studio, read as warily as the router might:
 * "/studio", "/studio/desk", "//studio", "/%73tudio" and an unknown path all
 * count. A false "yes" costs one page its analytics; a false "no" puts
 * Google's and Meta's scripts inside the Studio, beside what it shows.
 */
export function isStudioPath(path: string | null | undefined): boolean {
  if (typeof path !== "string") return true;
  let bare = path.split(/[?#]/)[0];
  try {
    bare = decodeURIComponent(bare);
  } catch {
    // A malformed escape: judged as written
  }
  const first = bare.split("/").filter(Boolean)[0] ?? "";
  return first.trim().toLowerCase() === "studio";
}

/**
 * Whether Google's tag, Google Ads and the Meta Pixel may run on this page.
 *
 * Not in the Studio. There they would run beside what Kristina has open —
 * a customer's phone and address once she presses «Показать контакты», the
 * takings in «Касса» — and could read it off the page. The tags are there to
 * measure customers; there are none in the Studio to measure.
 *
 * 🚨 What this does NOT do: keep the Studio's login token out of their reach.
 * The Studio keeps that token in localStorage (sanity.config.ts, loginMethod
 * "token"), and localStorage belongs to the origin, shared by every page of
 * www.beautasy.co.uk, not to a path. gtag.js loads on every public page
 * whether or not the visitor accepted cookies (Consent Mode changes what it
 * sends, not whether it runs), the Meta Pixel after a yes, and Clerk's script
 * everywhere. In a browser where Kristina has signed in to the Studio, any of
 * them could read the token from /atelier — and the token writes and deletes
 * the whole dataset and opens every sealed contact through
 * /api/studio/reveal. It would take a compromised or rogue script from Google,
 * Meta or Clerk; nothing here stops one. Closing it for good means the Studio
 * on an origin of its own (studio.beautasy.co.uk, or beautasy.sanity.studio)
 * where none of the shop's scripts run, its tools calling the site's
 * /api/studio/* across origins. That takes DNS and Sanity's CORS settings.
 */
export function thirdPartyTagsAllowed(path: string | null | undefined): boolean {
  return !isStudioPath(path);
}

/**
 * Set once this document has started Google's or Meta's scripts. They cannot
 * be unloaded, so should the page ever move into the Studio without a fresh
 * load — no link does today — SiteAnalytics reloads it, and the fresh
 * document starts clean, without them and with this back at false.
 */
let thirdPartyTagsStarted = false;

export function noteThirdPartyTagsStarted(): void {
  thirdPartyTagsStarted = true;
}

export function haveThirdPartyTagsStarted(): boolean {
  return thirdPartyTagsStarted;
}

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

/* ─── A tap on WhatsApp or the phone number ─── */

/** Where the page reports a tap; see /api/contact-click. */
export const CONTACT_CLICK_ENDPOINT = "/api/contact-click";

/**
 * Someone tapped WhatsApp or the phone number — for the atelier, the moment a
 * visit becomes a client. Told twice: to Google, which hears it within
 * whatever the visitor agreed to in the cookie banner, and to the site's own
 * day tally, which keeps no cookie and nothing about the person, so it counts
 * everybody (see @/lib/contactClicks). sendBeacon, because the page is being
 * left for WhatsApp or the dialler as this runs, and an ordinary request
 * would be cancelled with it.
 */
export function trackContactClick(method: ContactMethod, path: string): void {
  const page = pageBucketOf(path);
  send("contact", { method, page_bucket: page });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(CONTACT_CLICK_ENDPOINT, JSON.stringify({ method, page }));
    }
  } catch {
    // A tap that is not counted is one short on the Dashboard, never a broken link
  }
}

/** Just enough of a DOM element for this: tests pass plain objects. */
interface Closest {
  closest?: (selector: string) => { getAttribute(name: string): string | null } | null;
}

/** The method of the contact link a tap landed on or inside, if it was one. */
export function contactTapOf(target: unknown): ContactMethod | null {
  const closest = (target as Closest | null)?.closest;
  if (typeof closest !== "function") return null;
  const link = closest.call(target, "a[href]");
  return link ? contactMethodOf(link.getAttribute("href")) : null;
}

/** Just enough of a document for this. */
interface Listens {
  addEventListener(type: "click", listener: (event: { target: unknown }) => void, capture: boolean): void;
  removeEventListener(type: "click", listener: (event: { target: unknown }) => void, capture: boolean): void;
}

/**
 * One listener for the whole site rather than an onClick on each of the
 * dozen WhatsApp and phone links: a new page's link is counted without
 * anybody remembering to. Listens while the event is on its way down
 * (capture), so a component that stops it on the way back up cannot hide a
 * tap. Nothing is counted in the Studio. Returns the way to stop listening.
 */
export function listenForContactTaps(
  doc: Listens,
  currentPath: () => string,
  report: (method: ContactMethod, path: string) => void = trackContactClick
): () => void {
  const onClick = (event: { target: unknown }) => {
    const method = contactTapOf(event.target);
    if (!method) return;
    const path = currentPath();
    if (isStudioPath(path)) return;
    report(method, path);
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
