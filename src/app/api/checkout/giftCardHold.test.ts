import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the ordering that stops a gift card being spent twice.
 *
 * Checkout mints the card's discount into a Stripe session before anyone has
 * paid. What keeps two such sessions from both being paid is the sequence in
 * POST /api/checkout: the previous holder is expired at Stripe before a new
 * coupon is minted, and the new session is recorded on the card — with
 * ifRevisionId — before the customer is handed its URL. Swap any of those
 * steps and everything still compiles, every unit test still passes, and the
 * loss only shows as two honest-looking payments in the Stripe dashboard.
 * The source order is asserted here, the same way socialQueue.test.ts does it.
 */

const CHECKOUT = readFileSync(join(process.cwd(), "src", "app", "api", "checkout", "route.ts"), "utf8");
const GIFT_CARDS = readFileSync(join(process.cwd(), "src", "lib", "giftCards.ts"), "utf8");

function postBody(): string {
  const start = CHECKOUT.indexOf("export async function POST");
  assert.notEqual(start, -1, "POST handler has moved — update this test");
  return CHECKOUT.slice(start);
}

test("the previous holder of a gift card is expired before a new discount is minted", () => {
  const body = postBody();
  const expireAt = body.indexOf("expireHeldSession(");
  const couponAt = body.indexOf("stripe.coupons.create(");
  assert.notEqual(expireAt, -1, "checkout no longer expires the session holding the card");
  assert.notEqual(couponAt, -1, "checkout no longer mints a coupon");
  assert.ok(expireAt < couponAt, "Expire the session that holds the card before minting another discount for it, or both sessions can be paid.");
});

test("the card is held for the new session after it exists and before the customer gets its URL", () => {
  const body = postBody();
  const createAt = body.indexOf("stripe.checkout.sessions.create(");
  const reserveAt = body.indexOf("reserveCard(");
  const returnAt = body.indexOf("return NextResponse.json({ url: session.url })");
  assert.notEqual(reserveAt, -1, "checkout no longer reserves the card");
  assert.ok(createAt !== -1 && returnAt !== -1, "checkout shape changed — update this test");
  assert.ok(createAt < reserveAt && reserveAt < returnAt, "Reserve the card once the session id exists and before returning the URL — a customer can pay the moment they have it.");
});

test("a failed reservation expires the session it was for", () => {
  const body = postBody();
  const reserveAt = body.indexOf("reserveCard(");
  const tail = body.slice(reserveAt);
  assert.match(tail, /sessions\.expire\(session\.id\)/, "A session whose card could not be held must be closed, or it stays payable with a discount the card cannot cover.");
});

test("the hold is conditional on the revision the card was read at", () => {
  assert.match(GIFT_CARDS, /ifRevisionId\(card\._rev\)/, "Without ifRevisionId two checkouts started together both think they hold the card.");
});
