import type Stripe from "stripe";
import { firstNameOf, maskEmail } from "@/lib/pii";
import { giftCardDetails, type GiftCardPurchase } from "@/lib/orderLines";

/**
 * A payment whose money went back before the shop wrote it down.
 *
 * When an order or a gift card cannot be saved, the webhook answers Stripe 500
 * and Stripe sends the same "paid" event again, for up to three days. That
 * event is a snapshot of the moment of payment: it says "paid" on every try,
 * whatever has happened to the money since. Meanwhile hello@ has been told,
 * and Kristina may well have refunded it. The refund's own event found nothing
 * to act on — no card to switch off, no order to stamp — so nothing was left
 * to say the money had gone back, and the next try that worked issued a £100
 * card for money already returned, or wrote a refunded order as paid, gave the
 * friend their £5 and emailed "Your order is confirmed".
 *
 * Two guards now, either enough on its own most of the time:
 * - just before writing, Stripe is asked how much has gone back
 *   (refundBeforeWriting), because only Stripe knows that now;
 * - a full refund that finds nothing written leaves a refunded record under
 *   the very id the retry would write (leaveRefundedRecord), so the retry's
 *   own "is it already there?" check finds it and stops.
 *
 * A refunded record holds nothing sealed. The write that failed may have
 * failed because DATA_SECRET is missing, and this record has to be writable
 * anyway; it carries only what an order or a card already shows in the clear.
 */

/** A charge as the guard reads it. */
interface ChargeFacts {
  amount: number;
  amount_refunded: number;
  /** Unix seconds: when the money was taken */
  created?: number;
}

/** The one Stripe call the check before writing needs, so a test can stand in for Stripe. */
export interface PaymentReader {
  paymentIntents: {
    retrieve(id: string, params: { expand: string[] }): Promise<{ latest_charge?: string | ChargeFacts | null }>;
  };
}

/** The Stripe call that tells a gift card from an order when the session's metadata does not. */
export interface LineItemReader {
  checkout: {
    sessions: {
      listLineItems(
        id: string,
        params: { limit: number; expand: string[] }
      ): Promise<{ data: Pick<Stripe.LineItem, "price">[] }>;
    };
  };
}

/** The part of the Sanity client a refunded record is written with. */
export interface RecordWriter {
  createIfNotExists(doc: RefundedRecord): Promise<unknown>;
}

/** What has gone back on one payment, in pence. */
export interface RefundSoFar {
  /** Everything given back so far, across every refund */
  refunded: number;
  /** What the charge was for */
  charged: number;
  /** When the money was taken, so the books keep the sale on its own day */
  paidAt?: string;
}

/** What the guard needs to know about the checkout — a Stripe session is one. */
export interface SessionFacts {
  id: string;
  amount_total: number | null;
  customer_details?: { email?: string | null; name?: string | null } | null;
}

/** An order or a card that stands for money that came in and went back out. */
export type RefundedRecord = { _id: string; _type: "order" | "giftCard"; stripeSessionId: string } & Record<
  string,
  unknown
>;

/** The charge's own facts, as the refund event carries them. */
export function refundOfCharge(charge: ChargeFacts): RefundSoFar {
  return {
    refunded: charge.amount_refunded ?? 0,
    charged: charge.amount ?? 0,
    paidAt: typeof charge.created === "number" ? new Date(charge.created * 1000).toISOString() : undefined,
  };
}

/**
 * How much of this payment has gone back, asked of Stripe now rather than
 * read off the event, which is as old as the payment.
 *
 * Null when Stripe took nothing — a gift card paid for the whole order — so
 * there is nothing that could have been refunded. Throws when Stripe cannot be
 * asked: the caller hands that back to Stripe to try again, rather than guess.
 */
export async function refundSoFar(paymentIntent: string | null | undefined, stripe: PaymentReader): Promise<RefundSoFar | null> {
  if (!paymentIntent) return null;
  const intent = await stripe.paymentIntents.retrieve(paymentIntent, { expand: ["latest_charge"] });
  const charge = intent.latest_charge;
  if (!charge) return null;
  if (typeof charge === "string") throw new Error("Stripe sent the payment's charge back without its refunds");
  return refundOfCharge(charge);
}

/**
 * Whether what has gone back stops the payment from being written as paid.
 *
 * A gift card is spendable money the moment its code is emailed, so any
 * refund at all stops one, and a person decides what is still owed. An order
 * with part of its money back is still an order to make — the rule the refund
 * event already follows, where only a full refund takes a friend's reward
 * back — so only all of it stops one, and a part is written onto the order.
 */
export function refundStops(kind: "order" | "giftCard", refund: RefundSoFar | null): boolean {
  if (!refund || refund.refunded <= 0) return false;
  return kind === "giftCard" || refund.refunded >= refund.charged;
}

/**
 * The order a refunded payment would have been, under the id the webhook
 * writes it under (`order-<session>`), marked refunded. Its total and refund
 * put the money in «Касса» both ways; "refunded" keeps it off the pile to make
 * and out of every status email.
 */
export function refundedOrderRecord(session: SessionFacts, refund: RefundSoFar, at: string): RefundedRecord {
  return {
    _id: `order-${session.id}`,
    _type: "order",
    stripeSessionId: session.id,
    displayName: firstNameOf(session.customer_details?.name),
    emailHint: maskEmail(session.customer_details?.email),
    items: [],
    total: session.amount_total ?? refund.charged,
    status: "refunded",
    refundedAmount: refund.refunded,
    refundedAt: at,
    createdAt: refund.paidAt ?? at,
  };
}

/**
 * The card a refunded payment would have bought, under the id the webhook
 * makes it under (`giftCard-<session>`), switched off and empty.
 *
 * It has no code because there never was one: without a fingerprint nothing
 * at checkout can find it, and without a sealed recipient the daily job never
 * tries to send it. It is there so the retry finds a card and stops, and so
 * the Studio shows what happened to the money.
 */
export function refundedCardRecord(
  session: SessionFacts,
  purchase: GiftCardPurchase,
  refund: RefundSoFar,
  at: string
): RefundedRecord {
  return {
    _id: `giftCard-${session.id}`,
    _type: "giftCard",
    stripeSessionId: session.id,
    initialAmount: purchase.amount,
    balance: 0,
    active: false,
    recipientHint: maskEmail(purchase.meta.gift_card_recipient),
    refundedAmount: refund.refunded,
    refundedAt: at,
    createdAt: refund.paidAt ?? at,
  };
}

export type BeforeWriting =
  /** Write it as usual; `refund` is what has gone back so far, if anything */
  | { stop: false; refund: RefundSoFar | null }
  /** Its money went back: the refunded record is written in its place, and nothing else is to be done */
  | { stop: true; refund: RefundSoFar; recordId: string };

/**
 * Asks Stripe, just before an order or a gift card is written, whether its
 * money has already gone back — and if it has, writes the refunded record in
 * its place, so neither this try nor any later one makes the real thing.
 *
 * Throws when Stripe cannot be asked or the record cannot be written. The
 * webhook answers that with a 500, which is safe here: nothing has been made
 * or sent yet.
 */
export async function refundBeforeWriting(
  session: SessionFacts & { payment_intent?: string | { id: string } | null },
  purchase: GiftCardPurchase | null,
  deps: { stripe: PaymentReader; sanity: RecordWriter; now?: () => Date }
): Promise<BeforeWriting> {
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const refund = await refundSoFar(pi, deps.stripe);
  if (!refund || !refundStops(purchase ? "giftCard" : "order", refund)) return { stop: false, refund };

  const at = (deps.now?.() ?? new Date()).toISOString();
  const record = purchase ? refundedCardRecord(session, purchase, refund, at) : refundedOrderRecord(session, refund, at);
  // createIfNotExists: the refund event may have left this very record a moment ago
  await deps.sanity.createIfNotExists(record);
  return { stop: true, refund, recordId: record._id };
}

/**
 * Leaves the refunded record for a payment refunded in full while nothing had
 * been written for it yet — its "paid" event still being retried. The retry
 * then finds the record under its own id and stops, whichever of the two
 * Stripe happens to deliver first.
 *
 * Which record is read off the session the way the paid event reads it: its
 * metadata first, then its lines, which a checkout reopened from a reminder
 * keeps whether or not Stripe carried the metadata over. Returns the id.
 */
export async function leaveRefundedRecord(
  session: SessionFacts & Pick<Stripe.Checkout.Session, "metadata">,
  refund: RefundSoFar,
  deps: { stripe: LineItemReader; sanity: RecordWriter; now?: () => Date }
): Promise<string> {
  let purchase = giftCardDetails(session, []);
  if (!purchase) {
    const lines = await deps.stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
      expand: ["data.price.product"],
    });
    purchase = giftCardDetails(session, lines.data);
  }
  const at = (deps.now?.() ?? new Date()).toISOString();
  const record = purchase ? refundedCardRecord(session, purchase, refund, at) : refundedOrderRecord(session, refund, at);
  await deps.sanity.createIfNotExists(record);
  return record._id;
}
