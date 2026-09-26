import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { receiptOf, receiptIsFresh, RECEIPT_WINDOW_MS } from "./route";

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
    { id: "p1", slug: "cloud-scrunchie", name: "The \"Cloud\" Mulberry Silk Scrunchie", quantity: 1, amountTotal: 1200 },
  ]);
});

test("the thank-you page can read its order for a day, and not after", () => {
  const paidAt = Date.UTC(2026, 8, 26, 12, 0, 0);
  const created = paidAt / 1000;

  assert.equal(receiptIsFresh(created, paidAt + 5_000), true, "straight after paying");
  assert.equal(receiptIsFresh(created, paidAt + RECEIPT_WINDOW_MS), true, "the last moment of the day");
  assert.equal(receiptIsFresh(created, paidAt + RECEIPT_WINDOW_MS + 1_000), false, "a day and a second later");
  assert.equal(receiptIsFresh(created, paidAt + 30 * 24 * 60 * 60 * 1000), false, "a month later");
});
