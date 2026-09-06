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
