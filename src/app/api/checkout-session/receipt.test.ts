import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { receiptOf, receiptIsFresh, RECEIPT_WINDOW_MS } from "./route";
import { paymentSettled } from "@/lib/orderLines";

/**
 * The thank-you page's data is fetched by session id, and the session id is
 * in the public Sanity dataset (it is the order document's id). So the answer
 * must hold nothing about the buyer. It used to include their email, which
 * made the shop's sealed addresses readable to anyone who looked.
 */

const BUYER = { email: "anna.buyer@example.com", name: "Anna Buyer", phone: "+447700900123" };

const SESSION = {
  amount_total: 3850,
  total_details: { amount_shipping: 350, amount_discount: 0, amount_tax: 0 },
  customer_details: { ...BUYER, address: { line1: "1 Private Lane", postal_code: "SO15 1AA" } },
  shipping_details: { name: BUYER.name, address: { line1: "1 Private Lane", postal_code: "SO15 1AA" } },
  line_items: {
    object: "list",
    has_more: false,
    url: "",
    data: [
      {
        id: "li_1",
        description: "The \"Cloud\" Mulberry Silk Scrunchie",
        quantity: 1,
        amount_total: 1200,
        price: { product: { metadata: { product_id: "p1", slug: "cloud-scrunchie" } } },
      },
    ],
  },
} as unknown as Stripe.Checkout.Session;

test("the receipt carries the order and nothing about who placed it", () => {
  const receipt = receiptOf({
    sessionId: "cs_live_a1b2c3d4e5f6g7h8",
    session: SESSION,
    friendsCode: "ANNA-K7P2",
    friendsOffer: { give: 500, get: 500 },
  });
  const said = JSON.stringify(receipt);

  for (const detail of [BUYER.email, BUYER.name, BUYER.phone, "Private Lane", "SO15"]) {
    assert.equal(said.includes(detail), false, `the receipt gives away ${detail}`);
  }
  assert.equal("email" in receipt, false);

  // …and still has what the page prints
  assert.equal(receipt.total, 3850);
  assert.equal(receipt.shippingTotal, 350);
  assert.equal(receipt.reference, "E5F6G7H8");
  assert.deepEqual(receipt.items, [
    { id: "p1", slug: "cloud-scrunchie", name: "The \"Cloud\" Mulberry Silk Scrunchie", quantity: 1, amountSubtotal: 1200, amountTotal: 1200 },
  ]);
  assert.equal(receipt.kind, "order");
});

/**
 * A gift card is emailed, not sewn or posted, and the page must not promise
 * three to five days in the atelier for it. And an order a gift card paid
 * for in full still has a summary to show.
 */
test("a gift card's receipt says it is a gift card, and still gives away nobody", () => {
  const giftCard = {
    amount_total: 5000,
    total_details: { amount_shipping: 0, amount_discount: 0, amount_tax: 0 },
    metadata: { gift_card: "true", gift_card_amount: "5000", gift_card_recipient: "nina@example.com", gift_card_message: "Love you" },
    line_items: {
      object: "list",
      has_more: false,
      url: "",
      data: [{ id: "li_g", description: "Beautasy Gift Card — £50.00", quantity: 1, amount_subtotal: 5000, amount_total: 5000, price: { product: { metadata: { gift_card: "true" } } } }],
    },
  } as unknown as Stripe.Checkout.Session;
  const receipt = receiptOf({ sessionId: "cs_live_gift0001", session: giftCard, friendsCode: null, friendsOffer: null });
  assert.equal(receipt.kind, "giftCard");
  const said = JSON.stringify(receipt);
  assert.equal(said.includes("nina@example.com"), false, "the recipient is nobody else's business");
  assert.equal(said.includes("Love you"), false);
});

test("an order a gift card paid for in full is settled, and shows what it was", () => {
  assert.equal(paymentSettled("paid"), true);
  assert.equal(paymentSettled("no_payment_required"), true, "Stripe's word for a total of nothing to pay");
  assert.equal(paymentSettled("unpaid"), false);
  assert.equal(paymentSettled(undefined), false);

  const covered = {
    amount_total: 0,
    total_details: { amount_shipping: 0, amount_discount: 4200, amount_tax: 0 },
    line_items: {
      object: "list",
      has_more: false,
      url: "",
      data: [{ id: "li_1", description: "Silk Slip", quantity: 1, amount_subtotal: 4200, amount_total: 0, price: { product: { metadata: { product_id: "p1" } } } }],
    },
  } as unknown as Stripe.Checkout.Session;
  const receipt = receiptOf({ sessionId: "cs_live_paid0by0card", session: covered, friendsCode: null, friendsOffer: null });
  assert.equal(receipt.items[0].amountSubtotal, 4200, "the piece at its price, not at £0.00");
  assert.equal(receipt.discountTotal, 4200, "and the card's part as its own line");
  assert.equal(receipt.total, 0);
});

test("the thank-you page can read its order for a day, and not after", () => {
  const paidAt = Date.UTC(2026, 8, 26, 12, 0, 0);
  const created = paidAt / 1000;

  assert.equal(receiptIsFresh(created, paidAt + 5_000), true, "straight after paying");
  assert.equal(receiptIsFresh(created, paidAt + RECEIPT_WINDOW_MS), true, "the last moment of the day");
  assert.equal(receiptIsFresh(created, paidAt + RECEIPT_WINDOW_MS + 1_000), false, "a day and a second later");
  assert.equal(receiptIsFresh(created, paidAt + 30 * 24 * 60 * 60 * 1000), false, "a month later");
});
