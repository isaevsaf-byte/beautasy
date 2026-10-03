import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards what checkout takes from the browser, and what it no longer does.
 *
 * The bag lives in localStorage, and the request comes from anywhere. Prices
 * were already Sanity's; now so are names, sizes and colours (resolveLine),
 * the return address is the shop's own rather than the request's Origin
 * header, and wrong codes are counted before any code is looked up.
 */

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");
const CHECKOUT = read("src", "app", "api", "checkout", "route.ts");
const GIFT_CARDS = read("src", "app", "api", "gift-cards", "route.ts");
const post = CHECKOUT.slice(CHECKOUT.indexOf("export async function POST"));

test("neither checkout builds an address from the request's Origin header", () => {
  for (const [name, source] of [["checkout", CHECKOUT], ["gift cards", GIFT_CARDS]]) {
    assert.doesNotMatch(source, /headers\.get\(["']origin["']\)/i, `${name} still trusts Origin`);
    assert.match(source, /checkoutReturnBase\(\)/, `${name} must return shoppers to the shop's own address`);
    assert.match(source, /success_url: `\$\{returnBase\}\/success/);
  }
});

test("the Stripe line is named from Sanity, not from the bag", () => {
  const lines = post.slice(post.indexOf("line_items: pricedItems.map("), post.indexOf("success_url:"));
  assert.match(lines, /const \{ name, size, color \} = item\.verified;/);
  assert.match(lines, /let productName = name;/);
  assert.doesNotMatch(lines, /item\.name|item\.size\b|item\.color\b/, "the browser's name, size or colour on a Stripe line");
  assert.match(lines, /trustedImage\(item\.image\)/, "only the shop's own photographs");
  assert.match(post, /resolveLine\(item, products, giftBoxes\)/);
});

test("wrong codes are counted, and the count is checked before any code is looked up", () => {
  const checkAt = post.indexOf("checkoutWrongCodes.blocked(ip)");
  assert.notEqual(checkAt, -1, "checkout no longer limits wrong codes");
  assert.ok(checkAt < post.indexOf("findReferrerByCode("), "a guesser over the limit must not learn whether a friend code is right");
  assert.ok(checkAt < post.indexOf("findSpendableCard("), "a guesser over the limit must not learn whether a gift card is right");
  assert.match(post, /status: 429/);

  const misses = post.match(/checkoutWrongCodes\.miss\(ip\);\s*return NextResponse\.json\(\s*\{ error: "That (friend|gift card) code isn't valid/g) ?? [];
  assert.equal(misses.length, 2, "both a wrong friend code and a wrong gift card count");
});

test("both checkouts ask for consent, and only a discount-free one gets a recovery link", () => {
  assert.match(post, /createCheckoutSession\(stripe, \{[\s\S]*\}, \{ recovery: !discount \}\)/);
  assert.match(GIFT_CARDS, /createCheckoutSession\(stripe, \{[\s\S]*\}, \{ recovery: true \}\)/);
  assert.doesNotMatch(post + GIFT_CARDS, /stripe\.checkout\.sessions\.create\(/, "a session made around the helper has no consent and no recovery");
});

test("a gift card's details ride on its line as well as its session", () => {
  assert.match(GIFT_CARDS, /metadata: giftCard,\s*\},\s*\},\s*quantity: 1/, "the line's product carries the card");
  assert.match(GIFT_CARDS, /\n\s*metadata: giftCard,\n/, "and so does the session");
  assert.match(GIFT_CARDS, /\/success\?session_id=\{CHECKOUT_SESSION_ID\}&kind=gift-card/);
});
