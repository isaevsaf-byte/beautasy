import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { giftCardDetails, isAlreadyExists, lineDetail, mayRemind, recoveryLinkOf } from "./orderLines";

function line(metadata: Record<string, string>, description = "Made to Measure — Silk Slip"): Stripe.LineItem {
  return { id: "li_1", description, quantity: 1, amount_total: 1000, price: { product: { metadata } } } as unknown as Stripe.LineItem;
}

test("the measurements a piece is cut to are read back from the line", () => {
  assert.equal(
    lineDetail(line({ product_id: "p1-madetomeasure", measurements: "Bust 88 · Waist 70 · Hips 96" })),
    "Measurements: Bust 88 · Waist 70 · Hips 96"
  );
});

test("the words for a gift box's card are read back too", () => {
  assert.equal(lineDetail(line({ gift_message: "Happy birthday, Mum" })), 'Gift card message: "Happy birthday, Mum"');
});

test("a plain line, a deleted product or an unexpanded one has nothing extra", () => {
  assert.equal(lineDetail(line({ product_id: "p1", size: "M" })), undefined);
  assert.equal(lineDetail({ price: { product: { deleted: true } } } as unknown as Stripe.LineItem), undefined);
  assert.equal(lineDetail({ price: { product: "prod_123" } } as unknown as Stripe.LineItem), undefined);
  assert.equal(lineDetail({ price: null } as unknown as Stripe.LineItem), undefined);
});

const CARD_META = {
  gift_card: "true",
  gift_card_amount: "5000",
  gift_card_recipient: "nina@example.com",
  gift_card_recipient_name: "Nina",
  gift_card_message: "Treat yourself",
  gift_card_deliver_at: "2026-12-24T09:00:00.000Z",
};

test("a gift card purchase is recognised from the session", () => {
  const details = giftCardDetails({ metadata: CARD_META, amount_total: 5000 }, []);
  assert.deepEqual(details, { amount: 5000, meta: CARD_META });
});

test("and from its line, when a reopened session came without the session's details", () => {
  const details = giftCardDetails({ metadata: {}, amount_total: 5000 }, [line(CARD_META, "Beautasy Gift Card — £50.00")]);
  assert.equal(details?.meta.gift_card_recipient, "nina@example.com", "a paid card must never arrive as an order with nothing to post");
  assert.equal(details?.amount, 5000);
});

test("an order is not a gift card, even one a gift card paid for", () => {
  assert.equal(giftCardDetails({ metadata: { gift_card_id: "card-1" }, amount_total: 3000 }, [line({ product_id: "p1" })]), null);
  assert.equal(giftCardDetails({ metadata: null, amount_total: 3000 }, []), null);
});

test("Sanity's 'that id already exists' is told apart from a real failure", () => {
  assert.equal(isAlreadyExists({ statusCode: 409, message: "Conflict" }), true);
  assert.equal(isAlreadyExists(new Error('Document by ID "order-cs_1" already exists')), true);
  assert.equal(isAlreadyExists({ statusCode: 401, message: "Unauthorized" }), false);
  assert.equal(isAlreadyExists(new Error("fetch failed")), false);
  assert.equal(isAlreadyExists(null), false);
});

test("a reminder goes only to somebody who said yes to hearing from us", () => {
  assert.equal(mayRemind({ consent: { promotions: "opt_in", terms_of_service: null } }), true);
  assert.equal(mayRemind({ consent: { promotions: "opt_out", terms_of_service: null } }), false);
  assert.equal(mayRemind({ consent: null }), false, "no question asked is not a yes");
});

test("the reminder's button reopens the same checkout, or falls back to the shop", () => {
  const recovery = "https://checkout.stripe.com/c/pay/cs_live_recover#abc";
  assert.equal(
    recoveryLinkOf({ after_expiration: { recovery: { url: recovery, enabled: true, allow_promotion_codes: true, expires_at: 1 } } }, "https://www.beautasy.co.uk/shop"),
    recovery
  );
  assert.equal(recoveryLinkOf({ after_expiration: null }, "https://www.beautasy.co.uk/shop"), "https://www.beautasy.co.uk/shop");
});
