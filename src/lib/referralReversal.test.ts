import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the order in which a refunded reward is taken back.
 *
 * £5 of credit is real money. Stripe retries refund webhooks, so the same
 * refund arrives more than once, and taking the £5 twice is as wrong as never
 * taking it at all. The event document is what makes the difference: its
 * outcome is moved off "rewarded" with ifRevisionId first, and only the caller
 * that wins that patch goes on to touch the balance.
 *
 * Swap those two around and everything still compiles, every unit test still
 * passes, and the damage only shows up as a card that lost £10 for one refund
 * — by which time nobody remembers why.
 */

const LIB = readFileSync(join(process.cwd(), "src", "lib", "referrals.ts"), "utf8");
const WEBHOOK = readFileSync(
  join(process.cwd(), "src", "app", "api", "webhook", "route.ts"),
  "utf8"
);

const reversal = LIB.slice(LIB.indexOf("export async function reverseReferralReward"));

test("the reversal is claimed before any balance moves", () => {
  const claim = reversal.indexOf("ifRevisionId");
  const money = reversal.indexOf(".dec(");
  assert.notEqual(claim, -1, "the reversal no longer claims the event before acting");
  assert.notEqual(money, -1, "the reversal no longer takes the credit back");
  assert.ok(
    claim < money,
    "Claim the event first. A retried refund webhook must not take the £5 twice."
  );
});

test("a reward that was never paid is not taken back", () => {
  assert.match(
    reversal,
    /outcome !== "rewarded"/,
    'Only a "rewarded" event has money to reverse; anything else must be left alone.'
  );
});

test("only credit still on the card is taken, never into the negative", () => {
  assert.match(
    reversal,
    /Math\.max\(0,\s*Math\.min\(reward,/,
    "Credit already spent is gone. Taking more leaves a card owing money."
  );
});

test("the yearly allowance is given back with the reward", () => {
  assert.match(
    reversal,
    /rewardsCount:\s*Math\.max\(0,/,
    "A refunded order must stop counting against the referrer's yearly cap."
  );
});

test("the webhook listens for refunds at all", () => {
  assert.match(
    WEBHOOK,
    /event\.type === "charge\.refunded"/,
    "Without this the reward is never taken back, whatever the library does."
  );
});

test("a partial refund leaves the reward alone", () => {
  assert.match(
    WEBHOOK,
    /charge\.amount_refunded < charge\.amount/,
    "Refunding £1 of a £15 order is not the order coming undone."
  );
});
