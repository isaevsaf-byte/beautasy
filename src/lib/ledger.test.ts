import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MANUAL_INCOME_CATEGORIES,
  MANUAL_METHODS,
  automaticEntries,
  categoryForService,
  formatPounds,
  isDay,
  judgeEntry,
  ledgerCsv,
  newestFirst,
  parsePounds,
  periodOf,
  summarise,
  taxYearOf,
  type LedgerEntry,
} from "./ledger";

/**
 * «Касса»: the rules that would quietly cost money if they were wrong — how
 * a typed amount is read, when the tax year turns, which day a late payment
 * lands on, what counts as money that came in, and what cannot be entered by
 * hand because the site already counted it.
 */

const BOM = "﻿";

test("an amount is read the way Kristina types it, and never through a float", () => {
  for (const [typed, pence] of [
    ["15.50", 1550],
    ["£15.50", 1550],
    ["£ 15.50", 1550],
    ["15", 1500],
    ["15.5", 1550],
    ["15,50", 1550],
    ["15,5", 1550],
    [" 1,250.00 ", 125000],
    ["1,250", 125000],
    ["1 250", 125000],
    ["1 250,50", 125050],
    ["1 250", 125000],
    ["0.10", 10],
    ["10000", 1_000_000],
    ["19.99", 1999],
  ] as const) {
    assert.equal(parsePounds(typed), pence, typed);
  }
});

test("anything that is not an amount is refused, not guessed", () => {
  for (const typed of ["", "abc", "0", "0.00", "-5", "15.555", "1.2.3", "10000.01", "£", "15 pounds", "1,25,0", "15 50", "1 25", "1.234,56"]) {
    assert.equal(parsePounds(typed), null, typed);
  }
  assert.equal(parsePounds(15.5), null, "a number is not what the form sends — pounds or pence would be a guess");
  assert.equal(parsePounds(undefined), null);
});

test("pounds are written the way the site writes prices", () => {
  assert.equal(formatPounds(1550), "£15.50");
  assert.equal(formatPounds(125000), "£1,250.00");
  assert.equal(formatPounds(5), "£0.05");
  assert.equal(formatPounds(0), "£0.00");
  assert.equal(formatPounds(-500), "−£5.00");
});

test("only a real calendar day is a day", () => {
  assert.equal(isDay("2026-10-02"), true);
  assert.equal(isDay("2028-02-29"), true);
  assert.equal(isDay("2026-02-30"), false);
  assert.equal(isDay("2026-1-2"), false);
  assert.equal(isDay(20261002), false);
});

test("the tax year turns on 6 April, not 1 January", () => {
  assert.deepEqual(taxYearOf("2026-04-05"), { from: "2025-04-06", to: "2026-04-05", label: "2025/26" });
  assert.deepEqual(taxYearOf("2026-04-06"), { from: "2026-04-06", to: "2027-04-05", label: "2026/27" });
  assert.deepEqual(taxYearOf("2027-01-15"), { from: "2026-04-06", to: "2027-04-05", label: "2026/27" });
});

test("the periods are the month, the month before, and the tax years", () => {
  assert.deepEqual(periodOf("month", "2026-10-02"), { key: "month", from: "2026-10-01", to: "2026-10-31", title: "Октябрь 2026" });
  assert.deepEqual(periodOf("lastMonth", "2026-01-15"), { key: "lastMonth", from: "2025-12-01", to: "2025-12-31", title: "Декабрь 2025" });
  assert.equal(periodOf("month", "2028-02-10").to, "2028-02-29", "a leap February has 29 days");
  assert.deepEqual(periodOf("taxYear", "2026-10-02"), { key: "taxYear", from: "2026-04-06", to: "2027-04-05", title: "Налоговый год 2026/27" });
  assert.deepEqual(periodOf("lastTaxYear", "2026-10-02"), { key: "lastTaxYear", from: "2025-04-06", to: "2026-04-05", title: "Налоговый год 2025/26" });
  assert.equal(periodOf("taxYear", "2026-04-05").title, "Налоговый год 2025/26", "5 April is still the old year");
  assert.equal(periodOf("lastTaxYear", "2026-04-05").title, "Налоговый год 2024/25");
});

const TODAY = "2026-10-02";
const good = { kind: "income", amount: "15,50", date: "2026-10-02", method: "cash", category: "atelier" };

test("a good entry is read: the amount from what was typed, the rest checked", () => {
  const verdict = judgeEntry({ ...good, who: "  Anna  ", note: " jeans " }, TODAY);
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.deepEqual(verdict.value, {
    kind: "income",
    amount: 1550,
    date: "2026-10-02",
    method: "cash",
    category: "atelier",
    who: "Anna",
    note: "jeans",
  });
});

test("a wrong entry is refused with a way to put it right", () => {
  const refused = (patch: Record<string, unknown>) => {
    const verdict = judgeEntry({ ...good, ...patch }, TODAY);
    assert.equal(verdict.ok, false, JSON.stringify(patch));
    return verdict.ok ? "" : verdict.error;
  };
  assert.match(refused({ kind: "refund" }), /пришло или ушло/);
  assert.match(refused({ amount: "abc" }), /15\.50/);
  assert.match(refused({ amount: "15 50" }), /15\.50/, "a stray space is a typo, not a thousands separator");
  assert.match(refused({ amount: 1550 }), /15\.50/, "pence sent as a number are not trusted");
  assert.match(refused({ amount: "25000" }), /£25,000\.00 в одной строке — похоже на лишний ноль/);
  assert.match(refused({ date: "2026-10-03" }), /не наступила/);
  assert.match(refused({ date: "2019-12-31" }), /опечатка/);
  assert.match(refused({ date: "02/10/2026" }), /дату/);
  assert.match(refused({ method: "bitcoin" }), /как заплатили/);
  assert.match(refused({ kind: "expense", method: "giftcard", category: "materials" }), /только получить/);
  assert.match(refused({ category: "materials" }), /Выберите, за что/, "an expense's category on money that came in");
  assert.match(refused({ kind: "expense", category: "atelier" }), /Выберите, на что/);
  assert.equal(judgeEntry(null, TODAY).ok, false);
});

test("what the site records itself cannot be entered by hand, so nothing is counted twice", () => {
  const refused = (patch: Record<string, unknown>) => {
    const verdict = judgeEntry({ ...good, ...patch }, TODAY);
    return verdict.ok ? "" : verdict.error;
  };
  assert.match(refused({ method: "stripe" }), /записывает сама/);
  assert.match(refused({ category: "shop" }), /записывает сама/);
  assert.match(refused({ category: "giftcards" }), /записывает сама/);
  assert.equal(MANUAL_METHODS.some((m) => m.value === "stripe"), false);
  assert.deepEqual(
    MANUAL_INCOME_CATEGORIES.map((c) => c.value),
    ["atelier", "bridal", "home", "etsy", "other"]
  );
  assert.equal(judgeEntry({ ...good, kind: "expense", method: "card", category: "refunds" }, TODAY).ok, true, "a refund by hand is an expense she can write");
});

test("what she types is trimmed and kept to a sensible length", () => {
  const verdict = judgeEntry({ ...good, who: "x".repeat(200), note: "y".repeat(900) }, TODAY);
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.equal(verdict.value.who?.length, 80);
  assert.equal(verdict.value.note?.length, 500);
  const empty = judgeEntry({ ...good, who: "   ", note: "" }, TODAY);
  assert.equal(empty.ok && empty.value.who, undefined);
});

test("a payment for a booking keeps the booking, by its published id", () => {
  const verdict = judgeEntry({ ...good, bookingId: "drafts.slot-2026-10-06-1400" }, TODAY);
  assert.equal(verdict.ok && verdict.value.bookingId, "slot-2026-10-06-1400");
  const odd = judgeEntry({ ...good, bookingId: "../../etc" }, TODAY);
  assert.equal(odd.ok && odd.value.bookingId, undefined, "an id that is not an id is dropped");
});

test("shop orders and bought gift cards write themselves, on their Southampton day", () => {
  const entries = automaticEntries(
    [
      // 23:30 UTC on 1 October is 00:30 on the 2nd in Southampton (summer time)
      { _id: "order-late", createdAt: "2026-10-01T23:30:00Z", total: 2200, displayName: "Sarah" },
      { _id: "order-free", createdAt: "2026-10-02T10:00:00Z", total: 0 },
      { _id: "order-before", createdAt: "2026-09-30T22:59:00Z", total: 1000 },
      { _id: "order-broken", createdAt: "not a date", total: 1000 },
    ],
    [{ _id: "card-1", createdAt: "2026-10-05T12:00:00Z", initialAmount: 5000 }],
    "2026-10-01",
    "2026-10-31"
  );
  assert.deepEqual(entries, [
    { id: "order-late", date: "2026-10-02", kind: "income", amount: 2200, method: "stripe", category: "shop", who: "Sarah", source: "order" },
    { id: "card-1", date: "2026-10-05", kind: "income", amount: 5000, method: "stripe", category: "giftcards", source: "giftcard" },
  ]);
  // In winter Southampton is on UTC, and the same half past eleven stays on its day
  const winter = automaticEntries([{ _id: "o", createdAt: "2026-12-31T23:30:00Z", total: 100 }], [], "2026-12-01", "2026-12-31");
  assert.equal(winter[0]?.date, "2026-12-31");
});

test("money Stripe gave back is its own line, on the day it went back", () => {
  const order = {
    _id: "order-9",
    createdAt: "2026-09-20T10:00:00Z",
    total: 6000,
    displayName: "Sarah",
    refundedAmount: 6000,
    refundedAt: "2026-10-03T09:00:00Z",
  };
  // October sees the refund and not the September sale
  assert.deepEqual(automaticEntries([order], [], "2026-10-01", "2026-10-31"), [
    { id: "order-9-refund", date: "2026-10-03", kind: "expense", amount: 6000, method: "stripe", category: "refunds", who: "Sarah", source: "order" },
  ]);
  // September sees the sale and not the October refund
  assert.deepEqual(
    automaticEntries([order], [], "2026-09-01", "2026-09-30").map((e) => [e.kind, e.amount]),
    [["income", 6000]]
  );
  // A card bought and refunded in the same month comes to nothing
  const card = { _id: "card-2", createdAt: "2026-10-05T12:00:00Z", initialAmount: 2500, refundedAmount: 2500, refundedAt: "2026-10-06T12:00:00Z" };
  assert.equal(summarise(automaticEntries([], [card], "2026-10-01", "2026-10-31")).net, 0);
});

const entry = (patch: Partial<LedgerEntry>): LedgerEntry => ({
  id: "x",
  date: "2026-10-02",
  kind: "income",
  amount: 1000,
  method: "cash",
  category: "atelier",
  source: "manual",
  ...patch,
});

test("a fitting paid with a gift card is not counted as money a second time", () => {
  const summary = summarise([
    entry({ id: "a", amount: 1550 }),
    entry({ id: "b", amount: 4500, method: "card", category: "bridal", date: "2026-09-12" }),
    entry({ id: "c", amount: 3000, method: "giftcard" }),
    entry({ id: "d", kind: "expense", amount: 800, method: "card", category: "materials" }),
  ]);
  assert.equal(summary.income, 6050);
  assert.equal(summary.paidByGiftCard, 3000);
  assert.equal(summary.expense, 800);
  assert.equal(summary.net, 5250);
  assert.equal(summary.count, 4);
  assert.deepEqual(
    summary.incomeByCategory.map((t) => [t.key, t.amount]),
    [["bridal", 4500], ["atelier", 1550]],
    "largest first, and the gift card's fitting is not in it"
  );
  assert.deepEqual(summary.incomeByMethod.map((t) => t.key), ["card", "cash"]);
  assert.deepEqual(
    summary.byMonth.map((m) => [m.month, m.income, m.expense]),
    [["2026-09", 4500, 0], ["2026-10", 1550, 800]],
    "months in order"
  );
  assert.equal(summary.byMonth[1].title, "Октябрь 2026");
});

test("nothing adds up to nothing", () => {
  const summary = summarise([]);
  assert.equal(summary.income, 0);
  assert.equal(summary.net, 0);
  assert.deepEqual(summary.byMonth, []);
});

test("newest day first, and one day keeps its order", () => {
  const sorted = newestFirst([
    entry({ id: "1", date: "2026-10-01" }),
    entry({ id: "2", date: "2026-10-03" }),
    entry({ id: "3", date: "2026-10-01" }),
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ["2", "1", "3"]);
});

test("a booking's service picks the category: curtains are home, wedding and prom are bridal", () => {
  assert.equal(categoryForService("Home Textiles"), "home");
  assert.equal(categoryForService("Curtain Alterations and Home Textiles"), "home");
  assert.equal(categoryForService("Wedding Dress Alterations"), "bridal");
  assert.equal(categoryForService("Prom and Evening Dress Alterations"), "bridal");
  assert.equal(categoryForService("Alterations"), "atelier");
  assert.equal(categoryForService("Jeans and Trouser Alterations"), "atelier");
  assert.equal(categoryForService(undefined), "atelier");
});

test("the spreadsheet adds up: money in, money out and gift-card fittings in their own columns", () => {
  const csv = ledgerCsv([
    entry({ id: "b", date: "2026-10-05", amount: 1550, who: "Anna, Portswood", note: 'said "thanks"' }),
    entry({ id: "a", date: "2026-10-01", kind: "expense", amount: 800, method: "card", category: "materials", note: "=HYPERLINK(1)" }),
    entry({ id: "c", date: "2026-10-06", amount: 3000, method: "giftcard", source: "booking" }),
  ]);
  assert.equal(csv.charAt(0), BOM, "Excel needs the byte-order mark to read Russian");
  const lines = csv.slice(1).trimEnd().split("\r\n");
  assert.equal(lines[0], "Дата,\"Приход, £\",\"Расход, £\",\"Оплачено подарочной картой, £\",Как,За что,Кто,Заметка,Откуда");
  assert.equal(lines[1], "2026-10-01,,8.00,,Карта,Ткани и фурнитура,,'=HYPERLINK(1),Вручную", "a formula is defused");
  assert.equal(lines[2], '2026-10-05,15.50,,,Наличные,Ателье: подгонка и ремонт,"Anna, Portswood","said ""thanks""",Вручную');
  assert.equal(lines[3], "2026-10-06,,,30.00,Подарочная карта,Ателье: подгонка и ремонт,,,Запись в ателье");
  assert.equal(lines.length, 4);
});

test("a Russian Excel gets semicolons and decimal commas, and a name with a semicolon stays one cell", () => {
  const csv = ledgerCsv(
    [entry({ id: "a", date: "2026-10-05", amount: 1210, who: "Bob;=1+1" }), entry({ id: "b", date: "2026-10-06", amount: 105 })],
    "ru"
  );
  assert.equal(csv.charAt(0), BOM);
  const lines = csv.slice(1).trimEnd().split("\r\n");
  assert.equal(lines[0], 'Дата;"Приход, £";"Расход, £";"Оплачено подарочной картой, £";Как;За что;Кто;Заметка;Откуда');
  assert.equal(lines[1], '2026-10-05;12,10;;;Наличные;Ателье: подгонка и ремонт;"Bob;=1+1";;Вручную', "12,10 is money, not 12 October");
  assert.equal(lines[2], "2026-10-06;1,05;;;Наличные;Ателье: подгонка и ремонт;;;Вручную");
  // The same name in the file for an English Excel stays one cell too
  assert.match(ledgerCsv([entry({ who: "Bob;=1+1" })], "uk"), /,"Bob;=1\+1",/);
});
