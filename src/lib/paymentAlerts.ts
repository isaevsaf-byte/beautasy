import { escapeHtml } from "@/lib/escapeHtml";
import { sendEmail, viaResend, type Deliver } from "@/lib/sendEmail";

/**
 * "Somebody paid, and the shop did not write it down."
 *
 * The Stripe webhook is where a payment becomes an order or a gift card, and
 * when that write failed it said so in a Vercel log nobody reads, which keeps
 * an hour or so, and answered Stripe 200 — so nothing was ever tried again. An
 * order still sent its emails; a gift card sent nothing to anybody. These are
 * the emails that go to hello@ instead, one per failure, with what is known
 * about the payment and what to do about it.
 *
 * What never goes in one: a gift card code (there is none yet when a card
 * fails, and a code is money), a token, a key. The reason is the error's own
 * message, cut short and with anything shaped like an address or a key
 * taken out. The customer's own details are in, because they are what
 * Kristina needs to put it right, and they go to the inbox that already gets
 * every "New order" email with the same details on it.
 */

export const ALERT_TO = "hello@beautasy.co.uk";
const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";

export interface PaymentAlert {
  subject: string;
  html: string;
}

/** A failure's reason, short and with nothing in it that should not be in an inbox. */
export function alertReason(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return raw
    .replace(/[^\s<>(),;:"]+@[^\s<>(),;:"]+/g, "an address")
    .replace(/\b(sk|rk|pk|whsec|re)_[A-Za-z0-9_]+/g, "a key")
    .replace(/Bearer\s+\S+/gi, "Bearer …")
    .slice(0, 300);
}

/** The short reference the thank-you page shows the customer, so the two can be matched. */
export function referenceOf(sessionId: string): string {
  return sessionId.slice(-8).toUpperCase();
}

function stripeLink(sessionId: string, paymentIntent?: string | null): string {
  return paymentIntent
    ? `https://dashboard.stripe.com/payments/${encodeURIComponent(paymentIntent)}`
    : `https://dashboard.stripe.com/search?query=${encodeURIComponent(sessionId)}`;
}

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function alertHtml(opts: {
  heading: string;
  facts: [string, string | undefined][];
  lines?: string[];
  happened: string;
  todo: string;
  link: string;
}): string {
  const facts = opts.facts
    .filter(([, value]) => value)
    .map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value as string)}`)
    .join("<br/>");
  const lines = opts.lines?.length
    ? `<p style="margin:0 0 18px;color:#3d3d3d;line-height:1.8;white-space:pre-line;">${opts.lines.map(escapeHtml).join("\n")}</p>`
    : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#8a5a00;padding:28px 36px;">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#ffe9c2;">Needs a look</p>
      <h1 style="margin:0;font-size:22px;font-weight:400;color:#fff;">${escapeHtml(opts.heading)}</h1>
    </div>
    <div style="padding:30px 36px;">
      <p style="margin:0 0 18px;color:#3d3d3d;line-height:1.7;">${escapeHtml(opts.happened)}</p>
      <p style="margin:0 0 18px;color:#3d3d3d;line-height:1.8;">${facts}</p>
      ${lines}
      <p style="margin:0 0 18px;padding:14px 18px;background:#fff4e5;border-radius:10px;color:#8a5a00;line-height:1.7;">${escapeHtml(opts.todo)}</p>
      <p style="margin:0;font-size:13px;"><a href="${opts.link}" style="color:#9b7fd4;">Open the payment in Stripe →</a></p>
    </div>
  </div>
</body>
</html>`;
}

/** The order's payment went through and the order document could not be written. */
export function orderNotSavedAlert(input: {
  sessionId: string;
  paymentIntent?: string | null;
  total: number;
  customerName?: string | null;
  customerEmail?: string | null;
  phone?: string | null;
  address?: string;
  items: string[];
  reason: string;
}): PaymentAlert {
  const ref = referenceOf(input.sessionId);
  return {
    subject: `⚠️ Paid order not saved — ${pounds(input.total)} · #${ref}`,
    html: alertHtml({
      heading: `A ${pounds(input.total)} order was paid for but not saved`,
      happened:
        "The payment went through at Stripe, but the order could not be written to the Studio, so nothing after it has happened yet: no confirmation to the customer, no stock taken off, no gift card charged.",
      facts: [
        ["Reference", `#${ref}`],
        ["Stripe session", input.sessionId],
        ["Customer", input.customerName ?? undefined],
        ["Email", input.customerEmail ?? undefined],
        ["Phone", input.phone ?? undefined],
        ["Deliver to", input.address],
        ["Why", input.reason],
      ],
      lines: input.items,
      todo:
        "Stripe tries again by itself over the next three days. If a \"New order\" email for this reference arrives, it has put itself right and there is nothing to do. If these keep coming, the Studio cannot be written to: make the piece from this email, write to the customer yourself, and ask Safar to look — the order appears in the Studio on the first try after it is fixed. If the customer would rather have the money back, refund it in Stripe: a payment refunded in full is kept as refunded and nothing is sent for it, however many more times Stripe tries.",
      link: stripeLink(input.sessionId, input.paymentIntent),
    }),
  };
}

/** A gift card was paid for and could not be issued. */
export function giftCardNotIssuedAlert(input: {
  sessionId: string;
  paymentIntent?: string | null;
  amount: number;
  buyerEmail?: string | null;
  recipient?: string;
  recipientName?: string;
  deliverAt?: string;
  reason: string;
}): PaymentAlert {
  const ref = referenceOf(input.sessionId);
  return {
    subject: `⚠️ Gift card paid for but not issued — ${pounds(input.amount)} · #${ref}`,
    html: alertHtml({
      heading: `A ${pounds(input.amount)} gift card was paid for but not issued`,
      happened:
        "The payment went through at Stripe, but the card could not be created, so nobody has been sent anything — not the person it is for, and not the buyer.",
      facts: [
        ["Reference", `#${ref}`],
        ["Stripe session", input.sessionId],
        ["Bought by", input.buyerEmail ?? undefined],
        ["For", input.recipientName ? `${input.recipientName} (${input.recipient ?? "no email"})` : input.recipient],
        ["To arrive", input.deliverAt ? new Date(input.deliverAt).toLocaleDateString("en-GB") : "straight away"],
        ["Why", input.reason],
      ],
      todo:
        "Stripe tries again by itself over the next three days, and a retry cannot make two cards. If a \"Gift card sold\" email for this amount arrives, it has put itself right. If these keep coming, ask Safar to look — the card is made and sent on the first try after it is fixed. Please don't make one by hand: the Studio cannot make a code that works, and the retry would still send the real one. If the buyer would rather have the money back, refund it in Stripe and write to them: once any of it is refunded, no card is made, however many more times Stripe tries.",
      link: stripeLink(input.sessionId, input.paymentIntent),
    }),
  };
}

/**
 * A payment's money went back while Stripe was still retrying it, so the order
 * or card it paid for was never written and never will be (see
 * @/lib/paymentRefunds). This is the end of the "not saved" / "not issued"
 * emails about that reference, so it says plainly whether anything is left to
 * do. Only a gift card can be refunded in part here: an order with part of
 * its money back is written as usual.
 */
export function paymentRefundedFirstAlert(input: {
  kind: "order" | "giftCard";
  sessionId: string;
  paymentIntent?: string | null;
  paid: number;
  refunded: number;
}): PaymentAlert {
  const ref = referenceOf(input.sessionId);
  const whole = input.refunded >= input.paid;
  const card = input.kind === "giftCard";
  const what = card ? "gift card" : "order";
  return {
    subject: `⚠️ Refunded before it was saved — ${what} ${pounds(input.paid)} · #${ref}`,
    html: alertHtml({
      heading: whole
        ? `A ${pounds(input.paid)} ${what} was refunded before it was saved`
        : `${pounds(input.refunded)} of a ${pounds(input.paid)} gift card was refunded before the card was made`,
      happened: card
        ? whole
          ? "Stripe tried this payment again after the card could not be made, and by then all of its money had gone back to the buyer. So no card has been made and nobody has been sent a code — and none will be, however many more times Stripe tries."
          : "Stripe tried this payment again after the card could not be made, and by then part of its money had gone back to the buyer. A card is money the moment its code is sent, so none has been made."
        : "Stripe tried this payment again after the order could not be saved, and by then all of its money had gone back to the customer. The order is kept in the Studio as refunded, and nothing else has happened: no confirmation, no stock taken off, no friend's reward.",
      facts: [
        ["Reference", `#${ref}`],
        ["Stripe session", input.sessionId],
        ["Paid", pounds(input.paid)],
        ["Refunded", pounds(input.refunded)],
      ],
      todo: whole
        ? `Nothing to do. The earlier emails about #${ref} can be ignored; «Касса» shows the money coming in and going back.`
        : "If the buyer should still have a card for what is left, ask Safar to make it — the Studio cannot make a code that works. Otherwise refund the rest in Stripe.",
      link: stripeLink(input.sessionId, input.paymentIntent),
    }),
  };
}

/** An order was saved, but the gift card that paid for part of it still holds the money. */
export function giftCardNotChargedAlert(input: {
  sessionId: string;
  paymentIntent?: string | null;
  cardId: string;
  amount: number;
  reason: string;
}): PaymentAlert {
  const ref = referenceOf(input.sessionId);
  return {
    subject: `⚠️ Gift card not charged for order #${ref} — ${pounds(input.amount)}`,
    html: alertHtml({
      heading: `${pounds(input.amount)} was not taken off a gift card`,
      happened:
        "An order was paid partly with a gift card. The order is saved and its emails have gone, but the card's balance could not be lowered, so it can still be spent in full.",
      facts: [
        ["Order reference", `#${ref}`],
        ["Gift card document", input.cardId],
        ["To take off", pounds(input.amount)],
        ["Why", input.reason],
      ],
      todo:
        "This one is not tried again — doing it twice would take the money off twice. Open the card in the Studio (gift cards) and lower its balance by the amount above.",
      link: stripeLink(input.sessionId, input.paymentIntent),
    }),
  };
}

/**
 * Sends one alert to hello@. Never throws: it is called from inside the
 * failure it is about, and has nothing to fall back on but the log.
 */
export async function sendPaymentAlert(alert: PaymentAlert, deliver: Deliver = viaResend): Promise<boolean> {
  try {
    await sendEmail({ from: FROM_EMAIL, to: ALERT_TO, subject: alert.subject, html: alert.html }, deliver);
    return true;
  } catch (err) {
    console.error(`Could not send the alert "${alert.subject}" either:`, err);
    return false;
  }
}
