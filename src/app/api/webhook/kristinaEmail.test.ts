import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { adminEmailHtml } from "./route";

/**
 * Kristina's "New order" email, rendered.
 *
 * A made-to-measure piece is cut to the measurements the customer typed, and
 * a gift box carries the words they wrote for its card. Both travel on the
 * Stripe line's product metadata, and both are the customer's own text — so
 * they have to reach this email, and reach it as text. The order document
 * keeps them only sealed (detailSealed); this email is the one place she
 * reads them in the clear.
 */

function line(description: string, amount: number, metadata: Record<string, string>): Stripe.LineItem {
  return {
    description,
    quantity: 1,
    amount_total: amount,
    price: { product: { id: "prod_x", object: "product", metadata } },
  } as unknown as Stripe.LineItem;
}

const SESSION = {
  id: "cs_test_1",
  payment_intent: "pi_test_1",
  amount_total: 6300,
  customer_details: { email: "anna@example.com", phone: "07700 900123" },
  total_details: { amount_shipping: 495 },
  metadata: {},
  collected_information: {
    shipping_details: {
      name: "Anna Smith",
      address: { line1: "1 High Street", city: "Southampton", postal_code: "SO14 1AA", country: "GB" },
    },
  },
};

test("each line's measurements and gift message are in her email, under the line they belong to", () => {
  const html = adminEmailHtml(
    SESSION,
    [
      line("Silk Slip", 3800, { product_id: "p-slip", size: "M" }),
      line("Made to Measure — Silk Slip", 1000, { product_id: "p-slip-madetomeasure", measurements: "Bust 88 · Waist 70 · Hips 96" }),
      line("Gift Box — Silk Slip", 500, { product_id: "p-slip-giftbox", gift_message: "Happy birthday, Mum" }),
    ],
    1500
  );
  const items = html.slice(html.indexOf("Items Ordered"), html.indexOf("Total:"));
  const at = (needle: string) => {
    const i = items.indexOf(needle);
    assert.notEqual(i, -1, `"${needle}" is not in the items`);
    return i;
  };
  assert.ok(at("Made to Measure — Silk Slip") < at("Measurements: Bust 88 · Waist 70 · Hips 96"));
  assert.ok(at("Measurements:") < at("Gift Box — Silk Slip"), "the measurements sit under their own line");
  assert.ok(at("Gift Box — Silk Slip") < at("Gift card message: &quot;Happy birthday, Mum&quot;"));
  // A plain piece has nothing under it
  assert.match(items, /• Silk Slip × 1  £38\.00\n• Made to Measure/);
});

test("what the customer typed arrives as text, never as markup", () => {
  const html = adminEmailHtml(
    SESSION,
    [
      line("Made to Measure — Silk Slip", 1000, {
        measurements: `Bust 88 <a href="https://evil.example/pay">Confirm payment</a>`,
      }),
      line("Gift Box — Silk Slip", 500, { gift_message: `<img src=x onerror="alert(1)"> & love` }),
    ],
    1500
  );
  assert.doesNotMatch(html, /<a href="https:\/\/evil|<img src=x/);
  assert.match(html, /Measurements: Bust 88 &lt;a href=&quot;https:\/\/evil\.example\/pay&quot;&gt;Confirm payment&lt;\/a&gt;/);
  assert.match(html, /Gift card message: &quot;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; love&quot;/);
});
