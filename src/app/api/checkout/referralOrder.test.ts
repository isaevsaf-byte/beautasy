import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the shape of a friend's discount in POST /api/checkout.
 *
 * The discount is refused or granted before any money moves: the friend is
 * judged (own email? ordered before?) before a coupon exists, the email it
 * was judged on is the one Stripe locks the session to, and the whole
 * discount — friend's £5 plus any gift card — is one coupon, because Stripe
 * Checkout takes exactly one. Reorder any of it and the code still compiles;
 * the loss shows up as £5 off for regulars, or a card paying the friend's part.
 */

const CHECKOUT = readFileSync(join(process.cwd(), "src", "app", "api", "checkout", "route.ts"), "utf8");

function postBody(): string {
  const start = CHECKOUT.indexOf("export async function POST");
  assert.notEqual(start, -1, "POST handler has moved — update this test");
  return CHECKOUT.slice(start);
}

test("the friend is judged before any discount is minted", () => {
  const body = postBody();
  const judgeAt = body.indexOf("judgeFriendFor(");
  const couponAt = body.indexOf("stripe.coupons.create(");
  assert.notEqual(judgeAt, -1, "checkout no longer judges the friend");
  assert.notEqual(couponAt, -1, "checkout no longer mints a coupon");
  assert.ok(judgeAt < couponAt, "Judge the friend (own email, ordered before) before minting a discount for them.");
});

test("the friend's discount is sized before the gift card takes what is left", () => {
  const body = postBody();
  const discountAt = body.indexOf("friendShopDiscount(");
  const cardAt = body.indexOf("redeemableAmount(");
  assert.ok(discountAt !== -1 && cardAt !== -1, "checkout shape changed — update this test");
  assert.ok(discountAt < cardAt, "The friend's £5 comes off first; the card covers the rest.");
  assert.match(body, /redeemableAmount\(card,\s*Math\.max\(0,\s*subtotal\s*-\s*\(friend\?\.discount \?\? 0\)\)\)/,
    "Size the gift card against the subtotal after the friend's discount, or the card can be overspent.");
});

test("one coupon carries both discounts, and the metadata says how to split it", () => {
  const body = postBody();
  const coupons = body.match(/stripe\.coupons\.create\(/g) ?? [];
  assert.equal(coupons.length, 1, "Stripe Checkout takes one discount per session — mint exactly one coupon.");
  assert.match(body, /referral_discount:\s*String\(friend\.discount\)/, "The webhook divides the discount by referral_discount; carry it in the session metadata.");
  assert.match(body, /referrer_id:\s*friend\.referrer\._id/, "The webhook needs the referrer's id to credit them.");
});

test("the email the friend was judged on is the email the order is paid under", () => {
  const body = postBody();
  assert.match(body, /friend && referralEmail \? \{ customer_email: referralEmail \}/,
    "Pass the judged email as customer_email, so it cannot be changed at Stripe after the check.");
});

test("a refused friend code tells the bag to drop it", () => {
  const body = postBody();
  const refusals = body.match(/referralInvalid:\s*true/g) ?? [];
  assert.ok(refusals.length >= 2, "Both an unknown code and a failed verdict must be marked referralInvalid, so the bag clears the cookie.");
});
