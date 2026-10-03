import { test } from "node:test";
import assert from "node:assert/strict";
import type { EmailMessage } from "./sendEmail";
import {
  ALERT_TO,
  alertReason,
  giftCardNotChargedAlert,
  giftCardNotIssuedAlert,
  orderNotSavedAlert,
  paymentRefundedFirstAlert,
  sendPaymentAlert,
} from "./paymentAlerts";

const SESSION = "cs_live_a1b2c3d4e5f6g7h8";

const ALERTS = [
  orderNotSavedAlert({
    sessionId: SESSION,
    paymentIntent: "pi_123",
    total: 4800,
    customerName: "Anna Buyer",
    customerEmail: "anna@example.com",
    items: ["• Made to Measure — Silk Slip × 1  £10.00", "   Measurements: Bust 88"],
    reason: "Unauthorized",
  }),
  giftCardNotIssuedAlert({
    sessionId: SESSION,
    amount: 5000,
    buyerEmail: "anna@example.com",
    recipient: "nina@example.com",
    reason: "DATA_SECRET is not set",
  }),
  giftCardNotChargedAlert({ sessionId: SESSION, cardId: "giftCard-cs_1", amount: 2500, reason: "timeout" }),
];

test("every alert says so in its subject, and carries the reference the customer sees", () => {
  for (const alert of ALERTS) {
    assert.ok(alert.subject.startsWith("⚠️"), alert.subject);
    assert.match(alert.subject, /#E5F6G7H8/);
    assert.match(alert.html, /dashboard\.stripe\.com/);
  }
});

test("a lost order's alert has what is needed to make it by hand", () => {
  const html = ALERTS[0].html;
  for (const needed of ["Anna Buyer", "anna@example.com", "Silk Slip", "Measurements: Bust 88", "£48.00", "pi_123"]) {
    assert.ok(html.includes(needed), `missing ${needed}`);
  }
});

test("an uncharged card's alert names the card and the amount to take off", () => {
  assert.ok(ALERTS[2].html.includes("giftCard-cs_1"));
  assert.ok(ALERTS[2].html.includes("£25.00"));
});

test("a failure's reason reaches the inbox without addresses or keys in it", () => {
  const reason = alertReason(
    new Error("Refused for anna@example.com using sk_live_abc123XYZ and whsec_789 with Bearer eyJhbGciOi")
  );
  assert.doesNotMatch(reason, /anna@example\.com|sk_live_abc123XYZ|whsec_789|eyJhbGciOi/);
  assert.ok(alertReason(new Error("x".repeat(1000))).length <= 300);
});

test("an alert goes to hello@, and a mail failure never throws out of the webhook", async () => {
  const sent: EmailMessage[] = [];
  assert.equal(
    await sendPaymentAlert(ALERTS[0], async (message) => {
      sent.push(message);
      return { data: { id: "em_1" }, error: null };
    }),
    true
  );
  assert.equal(sent[0].to, ALERT_TO);
  assert.equal(ALERT_TO, "hello@beautasy.co.uk");

  assert.equal(
    await sendPaymentAlert(ALERTS[0], async () => ({ data: null, error: { message: "domain not verified" } })),
    false
  );
  assert.equal(
    await sendPaymentAlert(ALERTS[0], async () => {
      throw new Error("RESEND_API_KEY is not set");
    }),
    false
  );
});

/** The words of an alert, without its markup, so a sentence can be read across a tag. */
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ");

test("a card that was not issued is never to be made by hand, and a refund in Stripe is final", () => {
  // The old advice: "refund the payment in Stripe or make the card by hand".
  // The Studio cannot make a code that works (its fingerprint is hidden), and
  // a refund used to be overtaken by Stripe's next retry, which issued the card.
  const text = words(ALERTS[1].html);
  assert.doesNotMatch(text, /refund the payment in Stripe or make the card by hand/);
  assert.match(text, /don't make one by hand/);
  assert.match(text, /once any of it is refunded, no card is made, however many more times Stripe tries/);
});

test("a lost order's alert says what a refund in Stripe does to it", () => {
  assert.match(words(ALERTS[0].html), /a payment refunded in full is kept as refunded and nothing is sent for it/);
});

test("a payment refunded before it was saved says so, and whether anything is left to do", () => {
  const card = paymentRefundedFirstAlert({ kind: "giftCard", sessionId: SESSION, paymentIntent: "pi_1", paid: 10000, refunded: 10000 });
  assert.ok(card.subject.startsWith("⚠️"));
  assert.match(card.subject, /Refunded before it was saved — gift card £100\.00 · #E5F6G7H8/);
  assert.match(words(card.html), /no card has been made and nobody has been sent a code/);
  assert.match(words(card.html), /Nothing to do/);

  const part = paymentRefundedFirstAlert({ kind: "giftCard", sessionId: SESSION, paid: 10000, refunded: 2500 });
  assert.match(words(part.html), /£25\.00 of a £100\.00 gift card was refunded/);
  assert.match(words(part.html), /ask Safar to make it/, "part of a card's money back needs a person to decide what is owed");
  assert.doesNotMatch(words(part.html), /Nothing to do/);

  const order = paymentRefundedFirstAlert({ kind: "order", sessionId: SESSION, paid: 4800, refunded: 4800 });
  assert.match(order.subject, /order £48\.00/);
  assert.match(words(order.html), /kept in the Studio as refunded/);
  assert.match(words(order.html), /no confirmation, no stock taken off, no friend's reward/);
});
