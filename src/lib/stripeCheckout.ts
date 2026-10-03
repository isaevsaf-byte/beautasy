import type Stripe from "stripe";
import { SITE_URL } from "@/lib/site";
import { sanityConfig } from "@/lib/sanity";

/**
 * The pieces both checkouts (the bag and the gift card page) build their Stripe
 * session from, kept apart from the routes so they can be run by a test.
 */

/* ─── Where Stripe sends the shopper back to ─── */

/**
 * The address Stripe returns a shopper to, after paying or after giving up.
 *
 * It used to be the request's own Origin header. That header is whatever the
 * caller says it is — one line of curl — so a session could be made to send a
 * paying customer on to any site at all, with "Thank you for your order" as
 * the cover story. Now it is decided by where this code runs, never by who
 * asked: the real shop in production, Vercel's own address for a preview
 * (VERCEL_URL is set by Vercel, not by a request), and localhost when nothing
 * says otherwise.
 */
export function checkoutReturnBase(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV === "preview" && env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") return SITE_URL;
  return `http://localhost:${env.PORT || 3000}`;
}

/* ─── What a bag line is, according to Sanity ─── */

export const GIFTBOX_ADDON_SUFFIX = "-giftbox";
export const MADE_TO_MEASURE_SUFFIX = "-madetomeasure";

/** One bag line as the browser sends it. Only the id, size, colour and quantity are ever believed. */
export interface CheckoutItem {
  id: string;
  name: string;
  price: number; // in pence — client-supplied, NEVER trusted
  image: string;
  size?: string;
  color?: string;
  giftMessage?: string;
  slug?: string;
  measurements?: string;
  quantity: number;
}

export interface PriceLookupProduct {
  _id: string;
  name?: string;
  price: number;
  availableSizes?: string[];
  sizePrices?: { size: string; price: number }[];
  colorNames?: string[];
  giftBoxAvailable?: boolean;
  giftBoxPrice?: number;
  madeToMeasureAvailable?: boolean;
  madeToMeasurePrice?: number;
}

export interface PriceLookupGiftBox {
  _id: string;
  name?: string;
  price: number;
}

export const PRICE_LOOKUP_QUERY = `{
  "products": *[_type == "product" && _id in $ids]{ _id, name, price, availableSizes, sizePrices, "colorNames": availableColors[].name, giftBoxAvailable, giftBoxPrice, madeToMeasureAvailable, madeToMeasurePrice },
  "giftBoxes": *[_type == "giftBox" && _id in $ids]{ _id, name, price }
}`;

/** A bag line as it is sold: price, name, size and colour all as Sanity has them. */
export interface ResolvedLine {
  price: number;
  name: string;
  size?: string;
  color?: string;
}

/** The Sanity id a bag line is priced from — an add-on is priced from its piece. */
export function lookupIdOf(id: string): string {
  if (id.endsWith(GIFTBOX_ADDON_SUFFIX)) return id.slice(0, -GIFTBOX_ADDON_SUFFIX.length);
  if (id.endsWith(MADE_TO_MEASURE_SUFFIX)) return id.slice(0, -MADE_TO_MEASURE_SUFFIX.length);
  return id;
}

/**
 * What a bag line costs and what it is called, from Sanity.
 *
 * The price was already Sanity's. The name was the browser's: whatever the bag
 * in localStorage said went onto the Stripe line, the receipt, Kristina's "New
 * order" email and the order document, so "Silk Slip — Size: M" could arrive
 * as anything somebody typed into dev tools, at the real price. Now the name
 * is Sanity's too, and a size or colour is only passed on when the piece is
 * actually offered in it — anything else is a line that can't be sold as it
 * stands, the same as an unknown id.
 *
 * Returns null when the line can't be sold, so the caller refuses the checkout.
 */
export function resolveLine(
  item: Pick<CheckoutItem, "id" | "size" | "color">,
  products: Map<string, PriceLookupProduct>,
  giftBoxes: Map<string, PriceLookupGiftBox>
): ResolvedLine | null {
  if (item.id.endsWith(MADE_TO_MEASURE_SUFFIX)) {
    const product = products.get(lookupIdOf(item.id));
    if (!product || !product.madeToMeasureAvailable || !product.madeToMeasurePrice || !product.name) return null;
    return { price: product.madeToMeasurePrice, name: `Made to Measure — ${product.name}` };
  }

  if (item.id.endsWith(GIFTBOX_ADDON_SUFFIX)) {
    const product = products.get(lookupIdOf(item.id));
    if (!product || !product.giftBoxAvailable || !product.giftBoxPrice || !product.name) return null;
    return { price: product.giftBoxPrice, name: `Gift Box — ${product.name}` };
  }

  const product = products.get(item.id);
  if (product) {
    if (!product.name) return null;

    let size: string | undefined;
    if (item.size) {
      const offered = new Set([
        ...(product.availableSizes ?? []),
        ...(product.sizePrices ?? []).map((sp) => sp.size),
      ]);
      if (!offered.has(item.size)) return null;
      size = item.size;
    }

    let color: string | undefined;
    if (item.color) {
      if (!(product.colorNames ?? []).includes(item.color)) return null;
      color = item.color;
    }

    const sizePrice = size ? product.sizePrices?.find((sp) => sp.size === size)?.price : undefined;
    return { price: sizePrice ?? product.price, name: product.name, size, color };
  }

  const giftBox = giftBoxes.get(item.id);
  if (giftBox && giftBox.name) return { price: giftBox.price, name: giftBox.name };

  return null;
}

/**
 * A picture for the Stripe line, only when it is one of this shop's own.
 *
 * The bag sends the image it showed, which is right — a colour has its own
 * photograph — but it is the browser's word, and it is shown on Stripe's page
 * beside our name. So it is taken only from this project's own folder on
 * Sanity's CDN, where every product photograph lives.
 */
export function trustedImage(url: unknown, projectId: string = sanityConfig.projectId): string | null {
  if (typeof url !== "string" || url.length > 2000) return null;
  return url.startsWith(`https://cdn.sanity.io/images/${projectId}/`) ? url : null;
}

/* ─── Recovery and consent ─── */

/** The Stripe settings this file may add to a session, and drop again if refused. */
type Extra = "consent_collection" | "after_expiration";

/**
 * Extras Stripe has already refused on this account, remembered for as long as
 * the server instance lives, so a refusal costs one extra request rather than
 * one on every checkout.
 */
const refusedExtras = new Set<Extra>();

/**
 * True when Stripe refused the request because of this particular setting.
 * Any of Stripe's own errors counts — "not available to your account" may come
 * back as a permission error rather than an invalid request — as long as it
 * names the setting; a card, network or key problem never does.
 */
export function refusedSetting(err: unknown, extra: Extra): boolean {
  const e = err as { type?: string; param?: string; message?: string } | null;
  if (!e || typeof e.type !== "string" || !e.type.startsWith("Stripe")) return false;
  return (typeof e.param === "string" && e.param.startsWith(extra)) ||
    (typeof e.message === "string" && e.message.includes(extra));
}

/**
 * Creates the Checkout session with the two settings an abandoned-cart email
 * needs, and without either one Stripe will not accept.
 *
 * `consent_collection.promotions: "auto"` lets Stripe ask for permission to
 * send marketing; without that "yes", an expired session does not even carry
 * the shopper's email, so the reminder could never have gone to anybody.
 * `after_expiration.recovery` gives an expired session a link that reopens the
 * same checkout, which is what the reminder's button now points at.
 *
 * 🚨 Stripe documents promotional consent as available to US merchants only,
 * and Beautasy is in the UK. Whatever Stripe does with it, checkout must not be
 * the thing that breaks, so a session refused for one of these settings is
 * made again without it, and the refusal is remembered. The worst case is the
 * checkout as it was before this change.
 *
 * Recovery is left off when the session carries a discount. The gift card is
 * held for one session and let go when that session expires, and the friend's
 * discount was judged against one email for one session; a reopened copy of
 * it would carry the coupon past both checks. Those shoppers start again from
 * the bag, where the code is checked afresh.
 */
export async function createCheckoutSession(
  stripe: Pick<Stripe, "checkout">,
  params: Stripe.Checkout.SessionCreateParams,
  opts: { recovery: boolean },
  refused: Set<Extra> = refusedExtras
): Promise<Stripe.Checkout.Session> {
  const extras: Partial<Stripe.Checkout.SessionCreateParams> = {};
  if (!refused.has("consent_collection")) {
    extras.consent_collection = { promotions: "auto" };
  }
  if (opts.recovery && !refused.has("after_expiration")) {
    extras.after_expiration = {
      recovery: { enabled: true, allow_promotion_codes: params.allow_promotion_codes === true },
    };
  }

  // At most one try per extra, then the plain session: never a loop
  for (;;) {
    try {
      return await stripe.checkout.sessions.create({ ...params, ...extras });
    } catch (err) {
      const extra = (Object.keys(extras) as Extra[]).find((name) => refusedSetting(err, name));
      if (!extra) throw err;
      console.warn(`Stripe refused ${extra} on this account — checking out without it`);
      refused.add(extra);
      delete extras[extra];
    }
  }
}
