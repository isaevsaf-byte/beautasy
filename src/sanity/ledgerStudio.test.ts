import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { summarise, type LedgerEntry } from "@/lib/ledger";
import { EntriesView, EntryFormView, SummaryView, amountPreview, blankForm, entryPayload, formFor } from "./LedgerPane";
import { PaymentFormView, type AlreadyPaid, type PaymentForm } from "./paymentAction";

/**
 * «Касса» in the Studio: who may read it, what reaches the database, what
 * the site records on its own, and what Kristina sees. The money rules are
 * in src/lib/ledger.test.ts and the sealing in src/lib/ledgerStore.test.ts.
 */

const ROOT = process.cwd();
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), "utf8");
const ROUTE = read("src", "app", "api", "studio", "ledger", "route.ts");
const STORE = read("src", "lib", "ledgerStore.ts");
const WEBHOOK = read("src", "app", "api", "webhook", "route.ts");
const STRUCTURE = read("src", "sanity", "structure.ts");
const CONFIG = read("sanity.config.ts");

test("only a member of the project reaches the ledger, before anything is read or written", () => {
  const handler = ROUTE.slice(ROUTE.indexOf("export async function POST"));
  const member = handler.indexOf("await isProjectMember(token)");
  const firstTouch = Math.min(
    ...["sanityWriteClient.", "readLedger(", "readBookingPayments(", "bookingFor("]
      .map((call) => handler.indexOf(call))
      .filter((at) => at !== -1)
  );
  assert.notEqual(member, -1, "the route no longer checks who is asking");
  assert.ok(member < firstTouch, "Check membership before the database is touched.");
  assert.match(ROUTE, /if \(!fromThisSite\(req\)\) return answer\(403/);
});

test("an entry reaches the database only sealed, tied to its booking by a key that names no booking", () => {
  assert.match(ROUTE, /sanityWriteClient\.create\(ledgerDocument\(id, value, new Date\(\)\.toISOString\(\), bookingKey\)\)/);
  assert.match(ROUTE, /bookingKey = bookingKeyOf\(booking\);/);
  assert.match(ROUTE, /readBookingPayments\(bookingKeyOf\(booking\)\)/);
  assert.match(ROUTE, /\.set\(\{ date: doc\.date, sealed: doc\.sealed, updatedAt: /);
  assert.doesNotMatch(ROUTE, /\.set\(\{[^}]*(amount|bookingId)/, "an amount or a booking written in the clear");
  assert.doesNotMatch(
    ROUTE + STORE,
    /console\.\w+\([^;]*,\s*(entry|entries|value|verdict|body|stored|own|doc|existing)\b/,
    "an entry in Vercel's logs is an entry in the clear"
  );
});

test("a correction keeps the booking the payment was written against, whatever the form sends", () => {
  assert.match(ROUTE, /const before = openLedgerDocument\(existing\);/);
  assert.match(ROUTE, /delete value\.bookingId;\n\s+if \(before\?\.bookingId\) value\.bookingId = before\.bookingId;/);
  assert.match(ROUTE, /ledgerDocument\(id, value, new Date\(\)\.toISOString\(\), existing\.bookingKey\)/);
});

test("the site's own rows cannot be edited or deleted, and a friend's reward is not money", () => {
  assert.match(ROUTE, /if \(!LEDGER_ID\.test\(id\)\) return answer\(400/);
  assert.match(ROUTE, /existing\._type !== LEDGER_TYPE/);
  assert.match(STORE, /_type == "giftCard" && !\(source == "referral"\)/);
});

test("a refund reaches the ledger whether part or whole, and only a whole one undoes a friend's reward", () => {
  const block = WEBHOOK.slice(WEBHOOK.indexOf('if (event.type === "charge.refunded")'));
  const stamp = block.indexOf("await stampRefund(sessionId, charge.amount_refunded,");
  const partial = block.indexOf("if (charge.amount_refunded < charge.amount)");
  const reverse = block.indexOf('reverseReferralReward("order", sessionId)');
  assert.notEqual(stamp, -1, "refunds no longer reach the ledger");
  assert.match(
    block,
    /if \(sessionId\) \{\s*try \{\s*await stampRefund\(sessionId, charge\.amount_refunded,/,
    "Every refund is noted — no condition on how much came back."
  );
  assert.ok(stamp < partial, "A partial refund is money going back too: note it before the partial return.");
  assert.ok(partial < reverse, "Part of an order coming back must still leave the reward alone.");
  assert.match(STORE, /\(refundedAt >= \$start && refundedAt < \$end\)/, "a refund in a later month is read in that month");
});

test("the Studio has «Касса» beside the bookings, and every booking a way to record its payment", () => {
  assert.match(STRUCTURE, /\.title\("Касса"\)\.child\(S\.component\(LedgerPane\)/);
  assert.match(CONFIG, /moveBookingAction,\s*recordPaymentAction,\s*partnerAttributionAction,\s*notifyCustomerAction,\s*revealContactAction/);
});

const today = "2026-10-02";
const entries: LedgerEntry[] = [
  { id: "ledger-1", date: "2026-10-02", kind: "income", amount: 1550, method: "cash", category: "atelier", who: "Anna", source: "manual" },
  { id: "order-1", date: "2026-10-01", kind: "income", amount: 2200, method: "stripe", category: "shop", who: "Sarah", source: "order" },
  { id: "ledger-2", date: "2026-10-01", kind: "expense", amount: 800, method: "card", category: "materials", source: "manual" },
  { id: "ledger-3", date: "2026-10-01", kind: "income", amount: 3000, method: "giftcard", category: "bridal", source: "booking" },
];

test("the totals read as money in, money out and what is left, with gift-card fittings said apart", () => {
  const html = renderToStaticMarkup(createElement(SummaryView, { summary: summarise(entries), byMonth: true }));
  assert.match(html, />Пришло</);
  assert.match(html, /£37\.50/, "15.50 cash and 22.00 from the shop");
  assert.match(html, /£8\.00/);
  assert.match(html, /£29\.50/);
  assert.match(html, /Ещё £30\.00 оплачено подарочными картами/);
  assert.match(html, /Октябрь 2026/);
});

test("a line the site wrote says so and offers nothing to delete; hers can be corrected", () => {
  const html = renderToStaticMarkup(
    createElement(EntriesView, {
      entries,
      confirming: null,
      onEdit: () => {},
      onAskDelete: () => {},
      onDelete: () => {},
      onKeep: () => {},
    })
  );
  assert.match(html, /заказ на сайте, записался сам/);
  assert.equal((html.match(/>Удалить</g) ?? []).length, 3, "every line but the shop's");
  assert.match(html, /\+£15\.50/);
  assert.match(html, /−£8\.00/);
  assert.match(html, /из записи в ателье/);
});

test("a delete in flight cannot be sent twice", () => {
  const html = renderToStaticMarkup(
    createElement(EntriesView, {
      entries,
      confirming: "ledger-1",
      deleting: true,
      onEdit: () => {},
      onAskDelete: () => {},
      onDelete: () => {},
      onKeep: () => {},
    })
  );
  assert.match(html, /<button[^>]*disabled=""[^>]*>Удаляем…<\/button>/);
});

test("an empty month says what to do", () => {
  const html = renderToStaticMarkup(
    createElement(EntriesView, { entries: [], confirming: null, onEdit: () => {}, onAskDelete: () => {}, onDelete: () => {}, onKeep: () => {} })
  );
  assert.match(html, /нажмите «\+ Пришло»/);
});

test("the form offers only what she can record by hand, and shows the amount it will save", () => {
  const props = { today, busy: false, error: null, onChange: () => {}, onSave: () => {}, onCancel: () => {} };
  const expense = renderToStaticMarkup(createElement(EntryFormView, { ...props, form: blankForm("expense", today) }));
  assert.doesNotMatch(expense, /Подарочная карта/);
  assert.doesNotMatch(expense, /value="stripe"/, "paying on the site is not something she records by hand");
  assert.match(expense, /Ткани и фурнитура/);
  const income = renderToStaticMarkup(createElement(EntryFormView, { ...props, form: { ...blankForm("income", today), amount: "15,50" } }));
  assert.match(income, /Подарочная карта/);
  assert.doesNotMatch(income, /value="stripe"|value="shop"|value="giftcards"/, "the site records these itself");
  assert.match(income, /= £15\.50/);
  assert.match(income, /Записать \+£15\.50/);
  const empty = renderToStaticMarkup(createElement(EntryFormView, { ...props, form: blankForm("income", today) }));
  assert.match(empty, /<button[^>]*disabled=""[^>]*>Напишите сумму<\/button>/);

  const form = { ...blankForm("income", today), amount: "15,50" };
  assert.equal(entryPayload(form).amount, "15,50", "the server reads the amount; the Studio does not convert it");
  assert.equal(formFor(entries[0]).amount, "15.50", "a correction starts from the pounds that were saved");
});

test("the amount under the field says what will be saved, or why not", () => {
  assert.deepEqual(amountPreview("1 250"), { text: "= £1,250.00", ok: true });
  assert.equal(amountPreview("15 50")?.ok, false);
  assert.match(amountPreview("250000")?.text ?? "", /^£250,000\.00 — слишком большая сумма/);
  assert.match(amountPreview("abc")?.text ?? "", /Не похоже на сумму/);
  assert.equal(amountPreview("  "), null);
});

const paymentForm: PaymentForm = { amount: "45", method: "cash", category: "bridal", date: today, note: "" };
const paymentView = (paid: AlreadyPaid, patch: Partial<PaymentForm> = {}, doc = { displayName: "Emily" }) =>
  renderToStaticMarkup(
    createElement(PaymentFormView, {
      doc,
      paid,
      form: { ...paymentForm, ...patch },
      today,
      busy: false,
      error: null,
      onChange: () => {},
      onSave: () => {},
      onCancel: () => {},
    })
  );

test("a payment is not saved before the ledger has said what is already in it", () => {
  assert.match(paymentView({ state: "checking" }), /<button[^>]*disabled=""[^>]*>Записать в кассу \+£45\.00<\/button>/);
  const ready = paymentView({ state: "ready", entries: [] });
  assert.doesNotMatch(ready, /disabled=""[^>]*>Записать в кассу/);
});

test("a check that failed says so, instead of looking like nothing was paid", () => {
  const html = paymentView({ state: "failed", message: "Касса сейчас недоступна" });
  assert.match(html, /Не удалось проверить, записана ли уже оплата/);
  assert.match(html, /Касса сейчас недоступна/);
});

test("what is already paid is shown first, with the reminders that matter at the till", () => {
  const paid = paymentView({ state: "ready", entries: [{ ...entries[0], id: "p1", amount: 2000 }] });
  assert.match(paid, /Уже в кассе:/);
  assert.match(paid, /\+£20\.00 · наличные/);
  const giftCard = paymentView({ state: "ready", entries: [] }, { method: "giftcard" });
  assert.match(giftCard, /уменьшить «Остаток» карты/);
  const friend = paymentView({ state: "ready", entries: [] }, {}, { displayName: "Emily", referralDiscount: 500, referredBy: "Mia" } as never);
  assert.match(friend, /скидка за друга £5\.00 от Mia/);
  assert.doesNotMatch(paymentView({ state: "ready", entries: [] }), /value="stripe"/, "a payment on the site records itself");
});
