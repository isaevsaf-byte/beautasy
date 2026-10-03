import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards what the thank-you page tells each kind of buyer.
 *
 * A guest has no My Orders: the link went to a sign-in page and then to "No
 * orders yet". A gift card is not sewn or posted, and the page promised three
 * to five days in the atelier for one.
 */

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");
const SUCCESS = read("src", "app", "success", "page.tsx");
const ORDERS = read("src", "app", "orders", "page.tsx");
const RECEIPT_ROUTE = read("src", "app", "api", "checkout-session", "route.ts");

test("My Orders is offered only to somebody signed in", () => {
  const link = SUCCESS.indexOf('href="/orders"');
  assert.notEqual(link, -1);
  const signedIn = SUCCESS.lastIndexOf("<SignedIn>", link);
  const signedInEnd = SUCCESS.indexOf("</SignedIn>", link);
  assert.ok(signedIn !== -1 && signedInEnd !== -1 && signedIn < link, "the link sits inside <SignedIn>");
  assert.equal(SUCCESS.match(/href="\/orders"/g)?.length, 1, "and nowhere else");
  assert.match(SUCCESS, /<SignedOut>\{inEmail\}<\/SignedOut>/, "a guest is told where the receipt is instead");
  assert.match(SUCCESS, /Your receipt is in your email/);
  assert.match(SUCCESS, /if \(giftCard \|\| !clerkEnabled\) return inEmail;/, "no Clerk, or a gift card: there is no My Orders to offer");
});

test("a gift card's thank-you says nothing about making or posting", () => {
  for (const promise of ["3–5 business days", "We will start crafting your items soon"]) {
    const at = SUCCESS.indexOf(promise);
    assert.notEqual(at, -1, `"${promise}" has moved — update this test`);
    const guard = SUCCESS.lastIndexOf("giftCard", at);
    assert.ok(at - guard < 300, `"${promise}" must be in the order half of a giftCard ? … : … choice`);
  }
  assert.match(SUCCESS, /searchParams\.get\("kind"\) === "gift-card"/, "known from the address before the receipt loads");
  assert.match(SUCCESS, /order\?\.kind === "giftCard"/, "and from the receipt once it has");
  assert.match(SUCCESS, /fallback=\{<h2 className="font-serif text-3xl sm:text-4xl mb-4">Thank you!<\/h2>\}/,
    "the prerendered page says only thank you");
});

test("an order a gift card paid for in full still shows its summary", () => {
  assert.match(RECEIPT_ROUTE, /!paymentSettled\(session\.payment_status\)/);
  assert.match(SUCCESS, /Gift card &amp; discounts/);
  assert.match(SUCCESS, /item\.amountSubtotal \?\? item\.amountTotal/);
});

test("an empty My Orders tells a guest where their order went", () => {
  assert.match(ORDERS, /Checked out as a guest\? Your order details are in your confirmation email\./);
});
