import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { summarise, type LedgerEntry } from "@/lib/ledger";
import { EntriesView, EntryFormView, SummaryView, amountPreview, blankForm, entryPayload, formFor } from "./LedgerPane";
import { PaymentFormView, type AlreadyPaid, type PaymentForm } from "./paymentAction";
import type { CardCheck } from "./giftCardField";

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
    /if \(sessionId\) \{\s*try \{\s*(?:stamped = )?await stampRefund\(sessionId, charge\.amount_refunded,/,
    "Every refund is noted — no condition on how much came back."
  );
  assert.ok(stamp < partial, "A partial refund is money going back too: note it before the partial return.");
  assert.ok(partial < reverse, "Part of an order coming back must still leave the reward alone.");
  assert.match(STORE, /\(refundedAt >= \$start && refundedAt < \$end\)/, "a refund in a later month is read in that month");
});

test("the Studio has «Касса» beside the bookings, and every booking a way to record its payment", () => {
  assert.match(STRUCTURE, /\.title\("Касса"\)\.child\(S\.component\(LedgerPane\)/);
  assert.match(CONFIG, /moveBookingAction,\s*collectionTimeAction,\s*recordPaymentAction,\s*partnerAttributionAction,\s*notifyCustomerAction,\s*revealContactAction/);
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

test("«+ Пришло» by gift card asks for the code too; a line already charged to a card says so and asks for none", () => {
  const props = { today, busy: false, error: null, onChange: () => {}, onSave: () => {}, onCancel: () => {} };
  const form = { ...blankForm("income", today), amount: "15.50", method: "giftcard" };
  const typing = renderToStaticMarkup(createElement(EntryFormView, { ...props, form }));
  assert.match(typing, /id="kassa-gift-card"/);
  assert.match(typing, /<button[^>]*disabled=""[^>]*>Записать \+£15\.50<\/button>/, "not saved before the card is found");
  const found: CardCheck = { state: "found", look: { hint: "CD34", balance: 4000, available: 4000 } };
  const ready = renderToStaticMarkup(createElement(EntryFormView, { ...props, form, card: found }));
  assert.match(ready, /<button[^>]*>Записать и списать £15\.50 с карты …CD34<\/button>/);
  assert.doesNotMatch(ready, /disabled=""[^>]*>Записать и списать/);

  const charged: LedgerEntry = { ...entries[3], giftCard: { id: "giftCard-1", hint: "CD34" } };
  const editing = renderToStaticMarkup(createElement(EntryFormView, { ...props, form: formFor(charged) }));
  assert.doesNotMatch(editing, /kassa-gift-card/, "a correction never charges the card again");
  assert.match(editing, /Списано с карты …CD34, поэтому сумму и способ здесь не поменять/);

  const lines = renderToStaticMarkup(
    createElement(EntriesView, { entries: [charged], confirming: charged.id, onEdit: () => {}, onAskDelete: () => {}, onDelete: () => {}, onKeep: () => {} })
  );
  assert.match(lines, /Подарочная карта …CD34/);
  assert.match(lines, /Удалить эту строку\? £30\.00 вернутся на карту …CD34\./);
});

test("the amount under the field says what will be saved, or why not", () => {
  assert.deepEqual(amountPreview("1 250"), { text: "= £1,250.00", ok: true });
  assert.equal(amountPreview("15 50")?.ok, false);
  assert.match(amountPreview("250000")?.text ?? "", /^£250,000\.00 — слишком большая сумма/);
  assert.match(amountPreview("abc")?.text ?? "", /Не похоже на сумму/);
  assert.equal(amountPreview("  "), null);
});

const paymentForm: PaymentForm = { amount: "45", method: "cash", category: "bridal", date: today, note: "", giftCardCode: "" };
const paymentView = (paid: AlreadyPaid, patch: Partial<PaymentForm> = {}, doc = { displayName: "Emily" }, card?: CardCheck) =>
  renderToStaticMarkup(
    createElement(PaymentFormView, {
      doc,
      paid,
      form: { ...paymentForm, ...patch },
      card,
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
  const friend = paymentView({ state: "ready", entries: [] }, {}, { displayName: "Emily", referralDiscount: 500, referredBy: "Mia" } as never);
  assert.match(friend, /скидка за друга £5\.00 от Mia/);
  assert.doesNotMatch(paymentView({ state: "ready", entries: [] }), /value="stripe"/, "a payment on the site records itself");
});

test("a payment by gift card asks for the card's code, and nothing is left to do by hand", () => {
  const ready: AlreadyPaid = { state: "ready", entries: [] };
  const typing = paymentView(ready, { method: "giftcard" });
  assert.match(typing, /Код карты/);
  assert.match(typing, /id="payment-gift-card"/);
  assert.match(typing, /оплата спишется с карты сама/);
  assert.match(typing, /второй оплатой\s+другим способом/);
  assert.doesNotMatch(typing, /уменьшить «Остаток»|Не забудьте/, "the card is no longer lowered by hand");
  assert.match(typing, /<button[^>]*disabled=""[^>]*>Записать в кассу \+£45\.00<\/button>/, "not saved before the card is found");
  assert.doesNotMatch(paymentView(ready), /Код карты/, "cash asks for no code");
});

test("a card that covers the price shows what will be left, and the button says what it will take off", () => {
  const ready: AlreadyPaid = { state: "ready", entries: [] };
  const found: CardCheck = { state: "found", look: { hint: "CD34", balance: 4000, available: 4000 } };
  const html = paymentView(ready, { method: "giftcard", amount: "15.50", giftCardCode: "beautasy ab12 cd34" }, undefined, found);
  assert.match(html, /Карта …CD34\. <\/strong>На карте £40\.00 — после оплаты останется £24\.50\./);
  assert.match(html, /<button[^>]*>Записать и списать £15\.50 с карты …CD34<\/button>/);
  assert.doesNotMatch(html, /disabled=""[^>]*>Записать и списать/);
});

test("a card that does not cover the price, or is not a card, cannot be saved and says why", () => {
  const ready: AlreadyPaid = { state: "ready", entries: [] };
  const small: CardCheck = { state: "found", look: { hint: "CD34", balance: 1000, available: 1000 } };
  const short = paymentView(ready, { method: "giftcard", amount: "45" }, undefined, small);
  assert.match(short, /На карте только £10\.00\. Запишите здесь £10\.00, а остальные £35\.00 — второй оплатой другим способом\./);
  assert.match(short, /<button[^>]*disabled=""/);
  const wrong: CardCheck = { state: "failed", message: "Карты с таким кодом нет." };
  const none = paymentView(ready, { method: "giftcard" }, undefined, wrong);
  assert.match(none, /role="alert"[^>]*>Карты с таким кодом нет\./);
  assert.match(none, /<button[^>]*disabled=""/);
  assert.match(paymentView(ready, { method: "giftcard" }, undefined, { state: "checking" }), /Проверяем карту…/);
});

test("what was already paid by card names the card", () => {
  const paid: AlreadyPaid = {
    state: "ready",
    entries: [{ ...entries[0], id: "p2", amount: 1550, method: "giftcard", giftCard: { id: "giftCard-1", hint: "CD34" } }],
  };
  assert.match(paymentView(paid), /\+£15\.50 · подарочная карта …CD34 · /);
});

test("the tax year shows its bill, the advances, the lines ahead and what the ledger cannot see", async () => {
  const { TaxView } = await import("./TaxView");
  const { periodOf } = await import("@/lib/ledger");
  const year: LedgerEntry[] = [
    { id: "a", date: "2026-11-01", kind: "income", amount: 2_100_000, method: "transfer", category: "bridal", source: "manual" },
    { id: "b", date: "2026-11-02", kind: "expense", amount: 100_000, method: "card", category: "mileage", source: "manual" },
  ];
  const html = renderToStaticMarkup(
    createElement(TaxView, {
      period: periodOf("taxYear", "2026-11-05"),
      summary: summarise(year),
      rolling: { state: "ready", income: 2_100_000 },
      today: "2026-11-05",
    })
  );
  assert.match(html, /Налоги за 2026\/27/);
  assert.match(html, /£20,000\.00/, "profit");
  assert.match(html, /£1,931\.80/, "7,430 at 26%");
  assert.match(html, /£2,897\.70/, "the bill and the first advance due together");
  assert.match(html, /31 января 2028/);
  assert.match(html, /Касса ведётся со 2 октября 2026/, "a year that began before the ledger says it may be short");
  assert.match(html, /Making Tax Digital/);
  assert.match(html, /апреля 2028/);
  assert.match(html, /VAT/);
  assert.doesNotMatch(html, /Marriage Allowance/, "only offered when her allowance is not used up");

  const quiet = renderToStaticMarkup(
    createElement(TaxView, {
      period: periodOf("taxYear", "2026-11-05"),
      summary: summarise([{ ...year[0], amount: 80_000 }]),
      rolling: { state: "loading" },
      today: "2026-11-05",
    })
  );
  assert.match(quiet, /декларация не нужна/);
});

test("miles and home working fill the amount for her, at HMRC's own rates", () => {
  const props = { today, busy: false, error: null, onChange: () => {}, onSave: () => {}, onCancel: () => {} };
  const miles = renderToStaticMarkup(createElement(EntryFormView, { ...props, form: { ...blankForm("expense", today), category: "mileage" } }));
  assert.match(miles, /Сколько миль/);
  const home = renderToStaticMarkup(createElement(EntryFormView, { ...props, form: { ...blankForm("expense", today), category: "homeworking" } }));
  assert.match(home, /101 час и больше → £26\.00/);
});
