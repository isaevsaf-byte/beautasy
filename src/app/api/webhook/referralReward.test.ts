import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the reward's place in the webhook, and the claim that pays it once.
 *
 * Stripe retries the webhook on any non-2xx reply; the reward is keyed on the
 * session and claimed with a nonce so the retry finds it already paid. In the
 * handler it runs after the order is saved (the order carries the fingerprint
 * that "ordered before?" is asked of) and never blocks the customer's own
 * confirmation. And a gift card that shared the coupon pays only its part.
 */

const WEBHOOK = readFileSync(join(process.cwd(), "src", "app", "api", "webhook", "route.ts"), "utf8");
const REFERRALS = readFileSync(join(process.cwd(), "src", "lib", "referrals.ts"), "utf8");

test("the referrer is rewarded after the order is saved, keyed on the session", () => {
  const handler = WEBHOOK.slice(WEBHOOK.indexOf("export async function POST"));
  const orderAt = handler.indexOf('_type: "order"');
  const rewardAt = handler.indexOf("rewardReferral(");
  assert.ok(orderAt !== -1 && rewardAt !== -1, "webhook shape changed — update this test");
  assert.ok(orderAt < rewardAt, "Save the order before rewarding: its fingerprint is what a later order is checked against.");
  assert.match(handler, /sourceId:\s*session\.id/, "Key the reward on the Stripe session, so a retried webhook cannot pay twice.");
});

test("a gift card that shared the coupon pays only its own part", () => {
  const spend = WEBHOOK.slice(WEBHOOK.indexOf("async function spendGiftCard"));
  assert.match(spend, /splitDiscount\(/, "Divide the session's discount before deducting from the card.");
  assert.match(spend, /referral_discount/, "The friend's part is in the session metadata as referral_discount.");
});

test("the reward event is claimed with a nonce before any credit moves", () => {
  const fn = REFERRALS.slice(REFERRALS.indexOf("export async function rewardReferral"));
  const createAt = fn.indexOf("createIfNotExists(");
  const claimAt = fn.indexOf("event.claim !== claim");
  const creditAt = fn.indexOf("topUpCredit(");
  assert.ok(createAt !== -1 && claimAt !== -1 && creditAt !== -1, "rewardReferral shape changed — update this test");
  assert.ok(createAt < claimAt && claimAt < creditAt,
    "Create the event with a nonce, read it back, and only the caller whose nonce is there credits the card.");
  assert.match(fn, /eventIdFor\(input\.kind, input\.sourceId\)/, "The event id must come from the order or booking.");
});

test("a friend who has already ordered is refused before the discount and again before the reward", () => {
  const checkout = readFileSync(join(process.cwd(), "src", "app", "api", "checkout", "route.ts"), "utf8");
  assert.match(checkout, /judgeFriendFor\(/);
  const fn = REFERRALS.slice(REFERRALS.indexOf("export async function rewardReferral"));
  assert.match(fn, /judgeFriendFor\(/, "Judge again at reward time: the discount was granted on a promise, the reward on a paid order.");
});

/**
 * One payment, one order document, whatever Stripe does with its retries.
 *
 * The lookup above the write catches the ordinary retry — Stripe resends on
 * any non-2xx and on a timeout, and without it every retry made a second order
 * record with its own status emails and its own review request. It cannot
 * catch two retries in flight at once, both reading "no order yet" before
 * either writes, and that race got likelier the moment a hung Resend socket
 * could push the handler past Vercel's limit. So the id is the payment, the
 * way a booked slot's id is the slot: Sanity refuses the second write.
 */
test("the order's id is the payment, so one session can only ever be one order", () => {
  const handler = WEBHOOK.slice(WEBHOOK.indexOf("export async function POST"));
  assert.match(
    handler,
    /_id: `order-\$\{session\.id\}`/,
    "Without a deterministic id, two retries that both pass the duplicate check both write an order."
  );
  const lookupAt = handler.indexOf('stripeSessionId == $id');
  const writeAt = handler.indexOf("_id: `order-${session.id}`");
  assert.ok(lookupAt !== -1 && writeAt !== -1, "webhook shape changed — update this test");
  assert.ok(
    lookupAt < writeAt,
    "Look for the order before writing one: the cheap check still handles every ordinary retry."
  );
});
