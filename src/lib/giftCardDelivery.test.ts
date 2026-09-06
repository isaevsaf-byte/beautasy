import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the query that delivers scheduled gift cards.
 *
 * When customer details were sealed, the recipient moved from `recipientEmail`
 * to `recipientEmailSealed` — but the daily job kept filtering on the old
 * field, matched nothing, and no card bought for a future date (or retried
 * after a failed send) was ever emailed. Nothing failed loudly: the job
 * reported "0 due" every morning. This pins the query to the field the
 * webhook actually writes.
 */

const EMAILS = readFileSync(join(process.cwd(), "src", "lib", "giftCardEmails.ts"), "utf8");
const WEBHOOK = readFileSync(join(process.cwd(), "src", "app", "api", "webhook", "route.ts"), "utf8");
const REFERRALS = readFileSync(join(process.cwd(), "src", "lib", "referrals.ts"), "utf8");

function dueQuery(): string {
  const start = EMAILS.indexOf("const DUE_QUERY");
  assert.notEqual(start, -1, "DUE_QUERY has moved — update this test");
  return EMAILS.slice(start, EMAILS.indexOf("`;", start));
}

test("the delivery job looks for the sealed recipient, which is the field a card actually has", () => {
  const query = dueQuery();
  assert.match(query, /defined\(recipientEmailSealed\)/, "Filter on the sealed recipient, or no scheduled card is ever sent.");
  assert.doesNotMatch(
    query,
    /defined\(recipientEmail\)/,
    "No card has carried a clear-text recipient since sealing; this filter matches nothing."
  );
});

test("the webhook stores the recipient under the field the job filters on", () => {
  const issue = WEBHOOK.slice(WEBHOOK.indexOf("async function issueGiftCard"));
  assert.match(
    issue,
    /recipientEmailSealed:\s*sealOptional\(meta\.gift_card_recipient\)/,
    "The webhook and the delivery query must agree on the recipient field."
  );
});

test("friends credit is never picked up by the delivery job", () => {
  assert.match(dueQuery(), /source != "referral"/, "Credit is delivered by the reward email, not by this queue.");
  const credit = REFERRALS.slice(REFERRALS.indexOf("async function topUpCredit"));
  assert.match(credit, /sentAt:\s*now/, "Credit cards mark themselves sent at creation, so the queue skips them either way.");
});
