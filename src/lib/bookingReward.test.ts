import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A fitting's referral reward is paid when Kristina marks the booking done,
 * inside the same run that sends the thank-you — and only in the run that
 * actually sent it. The claim in @/lib/claim is what makes that run unique;
 * the reward keyed on the booking is what makes the payment unique even if
 * the claim were ever lost.
 */

const EMAILS = readFileSync(join(process.cwd(), "src", "lib", "bookingEmails.ts"), "utf8");
const ROUTE = readFileSync(join(process.cwd(), "src", "app", "api", "atelier-booking", "route.ts"), "utf8");

test("the reward follows the claimed, sent thank-you for a completed booking", () => {
  const job = EMAILS.slice(EMAILS.indexOf("export async function sendPendingBookingEmails"));
  const claimAt = job.indexOf("claimThenSend(");
  const rewardAt = job.indexOf("rewardReferral(");
  assert.ok(claimAt !== -1 && rewardAt !== -1, "booking job shape changed — update this test");
  assert.ok(claimAt < rewardAt, "Claim and send first; reward only the run that won the claim.");
  assert.match(job, /outcome === "sent" && status === "completed" && booking\.referrer\?\._ref/,
    "Reward only a completed booking, only after its thank-you went out, only when a friend sent them.");
  assert.match(job, /sourceId:\s*booking\._id/, "Key the reward on the booking, so it is paid once.");
  assert.match(job, /createdAt:\s*booking\.createdAt/, "Count history only before the booking, or a second booking made meanwhile turns the first into a repeat.");
});

test("the friend is judged when the booking is made, and the discount is written on the booking", () => {
  const judgeAt = ROUTE.indexOf("judgeFriendFor(");
  const saveAt = ROUTE.indexOf("sanityWriteClient.create(");
  assert.ok(judgeAt !== -1 && saveAt !== -1, "booking route shape changed — update this test");
  assert.ok(judgeAt < saveAt, "Judge the friend before the booking is written, so the discount on it is one Kristina can honour.");
  assert.match(ROUTE, /emailFingerprint:\s*emailFingerprint\(email\)/, "Every booking carries the fingerprint that 'first visit?' is asked of.");
  assert.match(ROUTE, /referralDiscount:\s*friend\.discount/);
});
