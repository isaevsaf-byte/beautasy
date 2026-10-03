import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards what the webhook does when a payment cannot be written down.
 *
 * The rule is: answer Stripe 500 — "try again later" — only where trying again
 * cannot do anything twice, and email hello@ either way. A gift card is made
 * under the payment's own id after a lookup, so it can be retried. An order is
 * retried only because it is now written FIRST, before the card is charged and
 * the stock taken off; move either of those above it and a retry charges the
 * card twice. All of it compiles either way, so the order is asserted here.
 */

const WEBHOOK = readFileSync(join(process.cwd(), "src", "app", "api", "webhook", "route.ts"), "utf8");
const handler = WEBHOOK.slice(WEBHOOK.indexOf("export async function POST"));
const completed = handler.slice(0, handler.indexOf('event.type === "charge.refunded"'));

function at(source: string, needle: string): number {
  const i = source.indexOf(needle);
  assert.notEqual(i, -1, `webhook shape changed — "${needle}" not found; update this test`);
  return i;
}

test("the order is written before the card is charged, the stock moved or anyone emailed", () => {
  const orderAt = at(completed, '_type: "order"');
  assert.ok(orderAt < at(completed, "await spendGiftCard(session)"), "charging the card first makes a retry charge it twice");
  assert.ok(orderAt < at(completed, "await decrementStock(items)"));
  assert.ok(orderAt < at(completed, "customerEmailHtml(session"));
  assert.ok(orderAt < at(completed, "adminEmailHtml(session"));
});

test("an order that cannot be saved is alerted and handed back to Stripe, before anything moves", () => {
  const createAt = at(completed, '_type: "order"');
  const failure = completed.slice(createAt, at(completed, "await spendGiftCard(session)"));
  assert.match(failure, /sendPaymentAlert\(\s*orderNotSavedAlert\(/, "hello@ has to hear about a paid order that is not in the Studio");
  assert.match(failure, /status: 500/, "a 500 is what makes Stripe try again");
  assert.match(failure, /isAlreadyExists\(err\)[\s\S]*?duplicate: true/, "the delivery that lost the race stops, it does not alert");
  const duplicateAt = failure.indexOf("isAlreadyExists(err)");
  assert.ok(duplicateAt < failure.indexOf("orderNotSavedAlert("), "a second delivery is not a failure to alert about");
});

test("a gift card that cannot be issued is alerted and handed back to Stripe", () => {
  const branch = completed.slice(at(completed, "const giftCard = giftCardDetails(session, items)"), at(completed, '_type: "order"'));
  assert.match(branch, /sendPaymentAlert\(\s*giftCardNotIssuedAlert\(/);
  assert.match(branch, /status: 500/);
  assert.doesNotMatch(branch, /catch \(err\) \{\s*console\.error\("Failed to issue gift card:", err\);\s*\}\s*return NextResponse\.json\(\{ received: true, giftCard: true \}\)/,
    "the old shape: log, then 200 — a paid card never issued and never mentioned");
});

test("a gift card can only ever be made once per payment", () => {
  const issue = WEBHOOK.slice(at(WEBHOOK, "async function issueGiftCard"));
  const lookupAt = at(issue, 'stripeSessionId == $id');
  const createAt = at(issue, "sanityWriteClient.create(");
  assert.ok(lookupAt < createAt, "look for the card before making one");
  assert.match(issue, /_id: `giftCard-\$\{session\.id\}`/, "the card's id is the payment, so two deliveries cannot both make one");
  assert.match(issue.slice(createAt), /isAlreadyExists\(err\)\) return;/);
});

test("a card that could not be charged is alerted, not retried", () => {
  const spend = WEBHOOK.slice(at(WEBHOOK, "async function spendGiftCard"));
  assert.match(spend, /sendPaymentAlert\(\s*giftCardNotChargedAlert\(/);
  assert.doesNotMatch(spend.slice(0, spend.indexOf("function paymentIntentOf")), /status: 500/,
    "deducting twice is the money off twice: this one is never handed back to Stripe");
});

test("what the customer typed reaches Kristina's email, and the order only sealed", () => {
  assert.match(WEBHOOK, /const detail = lineDetail\(item\);/);
  const admin = WEBHOOK.slice(at(WEBHOOK, "function adminEmailHtml"), at(WEBHOOK, "/* ─── Ready-made stock ─── */"));
  assert.match(admin, /formatItems\(items\)/, "Kristina's email lists the lines with their measurements");
  const customer = WEBHOOK.slice(at(WEBHOOK, "function customerEmailHtml"), at(WEBHOOK, "function adminEmailHtml"));
  assert.doesNotMatch(customer, /lineDetail|formatItems|itemLines/, "the customer's own measurements are not repeated back to them");
  assert.match(completed, /detailSealed: sealOptional\(lineDetail\(item\)\)/, "🚨 sealed: the dataset is public");
  assert.match(completed, /name: item\.description \?\? "Item"/, "the line's name stays the product's name — no measurements in the clear");
});

test("an abandoned checkout is followed up only with consent, and the button reopens it", () => {
  const abandoned = WEBHOOK.slice(at(WEBHOOK, "async function handleAbandonedCart"));
  const consentAt = at(abandoned, "if (!mayRemind(session)) return;");
  assert.ok(consentAt < at(abandoned, "sendEmail("), "ask first, send after");
  assert.ok(consentAt < at(abandoned, "sanityWriteClient.create("), "nothing is kept about somebody who said no");
  assert.match(abandoned, /recoveryLinkOf\(session,/);
  const html = WEBHOOK.slice(at(WEBHOOK, "function abandonedCartHtml"), at(WEBHOOK, "async function handleAbandonedCart"));
  assert.doesNotMatch(html, /href="\$\{SITE_URL\}\/shop"/, "the bag is in one browser; the shop link found it empty");
});

test("a fully refunded gift card is switched off", () => {
  const refund = handler.slice(at(handler, 'event.type === "charge.refunded"'), at(handler, 'event.type === "checkout.session.expired"'));
  const partialAt = at(refund, "partialRefund: true");
  const offAt = at(refund, "deactivateCardForSession(sessionId)");
  assert.ok(partialAt < offAt, "only a full refund: part of the money back leaves a card that was paid for");
});
