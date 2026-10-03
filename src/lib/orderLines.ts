import type Stripe from "stripe";

/**
 * Reading a Checkout session back in the webhook: what each line carried, what
 * kind of purchase it was, and what may be done with an unpaid one. Kept apart
 * from the route so a test can run it.
 */

/** The metadata checkout put on a line's product, when Stripe expanded it. */
export function productMetadataOf(item: Pick<Stripe.LineItem, "price">): Record<string, string> {
  const product = item.price?.product;
  if (!product || typeof product !== "object" || "deleted" in product) return {};
  return (product as Stripe.Product).metadata ?? {};
}

/**
 * What the customer typed for this line: the measurements a made-to-measure
 * piece is cut to, or the words on a gift box's card.
 *
 * Checkout has always put them on the line's product. The webhook built its
 * emails and the order from `item.description`, which Stripe fills with the
 * product's name — so Kristina was told "Made to Measure — Silk Slip, £10"
 * and never the measurements she was being paid to sew to. They are read back
 * from the metadata here.
 *
 * 🚨 Measurements and gift messages are personal. They go to Kristina in her
 * own email and into the order only sealed (see @/lib/pii) — the dataset is
 * public — and never into a line's name, which is stored in the clear.
 */
export function lineDetail(item: Pick<Stripe.LineItem, "price">): string | undefined {
  const meta = productMetadataOf(item);
  const parts: string[] = [];
  if (meta.measurements?.trim()) parts.push(`Measurements: ${meta.measurements.trim()}`);
  if (meta.gift_message?.trim()) parts.push(`Gift card message: "${meta.gift_message.trim()}"`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Whether a checkout has been settled. A gift card that covers the whole
 * order leaves Stripe nothing to take, and it says "no_payment_required"
 * rather than "paid" — which the thank-you page read as unpaid, so the
 * customer whose card paid for everything got no order shown at all.
 */
export function paymentSettled(status: string | null | undefined): boolean {
  return status === "paid" || status === "no_payment_required";
}

/** A gift card purchase, as the webhook needs it to issue the card. */
export interface GiftCardPurchase {
  amount: number;
  /** The gift_card_* fields the gift card page wrote, from wherever they were found */
  meta: Record<string, string>;
}

/**
 * The gift card this session paid for, or null when it paid for an order.
 *
 * Read from the session's metadata first and from the line's product second:
 * the gift card page writes both, because a session reopened from an
 * abandoned-cart link keeps its lines whether or not Stripe carries the
 * session's metadata over, and a card that arrived without its details would
 * be handled as an order with nothing in it to post.
 */
export function giftCardDetails(
  session: Pick<Stripe.Checkout.Session, "metadata" | "amount_total">,
  items: Pick<Stripe.LineItem, "price">[]
): GiftCardPurchase | null {
  const fromSession = session.metadata ?? {};
  const meta =
    fromSession.gift_card === "true"
      ? fromSession
      : items.map(productMetadataOf).find((m) => m.gift_card === "true");
  if (!meta || meta.gift_card !== "true") return null;

  return { amount: Number(meta.gift_card_amount ?? session.amount_total ?? 0), meta };
}

/**
 * Whether Sanity refused a create because the id is already taken.
 *
 * Orders and gift cards are created under an id made from the payment, so
 * this is the answer a second delivery of the same Stripe event gets while the
 * first is still at work — not a failure, and not one to alert anybody about.
 */
export function isAlreadyExists(err: unknown): boolean {
  const e = err as { statusCode?: number; message?: string; response?: { statusCode?: number } } | null;
  if (!e) return false;
  if (e.statusCode === 409 || e.response?.statusCode === 409) return true;
  return typeof e.message === "string" && /already exists/i.test(e.message);
}

/**
 * Whether an unpaid checkout may be followed up with a reminder.
 *
 * A reminder is marketing, and it goes only to somebody who said yes to
 * marketing at Stripe's checkout. Stripe agrees: without that yes, an expired
 * session does not even carry the shopper's email.
 */
export function mayRemind(session: Pick<Stripe.Checkout.Session, "consent">): boolean {
  return session.consent?.promotions === "opt_in";
}

/**
 * Where the reminder's button goes: Stripe's link that reopens the very same
 * checkout — the bag lives in one browser's storage and is empty anywhere else
 * — or the shop when there is no such link.
 */
export function recoveryLinkOf(
  session: Pick<Stripe.Checkout.Session, "after_expiration">,
  fallback: string
): string {
  const url = session.after_expiration?.recovery?.url;
  return typeof url === "string" && url.startsWith("https://") ? url : fallback;
}
