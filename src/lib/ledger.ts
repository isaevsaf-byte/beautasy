import { localDateOf } from "./slots";

/**
 * «Касса» — what came in and what went out, in Kristina's words.
 *
 * Every function here is pure, so the things that would quietly cost money if
 * they were wrong are tested rather than trusted: reading "15,50" as £15.50
 * and not £1,550; the tax year turning on 6 April, not 1 January; a fitting
 * paid with a gift card not being counted as money a second time; a payment
 * at half past eleven on a summer night landing on the right day.
 *
 * 🚨 Nothing here may seal or open anything. This file is imported by the
 * Studio's «Касса» pane, which is browser code, and the key must never be.
 * The dataset is public (see @/lib/pii), so an entry's amount, who paid and
 * the note exist in it only sealed, by @/lib/ledgerStore on the server.
 */

export type LedgerKind = "income" | "expense";

/** Where an entry came from. Shop orders and gift cards write themselves. */
export type LedgerSource = "manual" | "booking" | "order" | "giftcard";

export interface Choice {
  value: string;
  title: string;
}

export const PAYMENT_METHODS: Choice[] = [
  { value: "cash", title: "Наличные" },
  { value: "card", title: "Карта" },
  { value: "transfer", title: "Перевод на счёт" },
  { value: "stripe", title: "Stripe (оплата на сайте)" },
  { value: "giftcard", title: "Подарочная карта" },
  { value: "other", title: "Другое" },
];

export const INCOME_CATEGORIES: Choice[] = [
  { value: "atelier", title: "Ателье: подгонка и ремонт" },
  { value: "bridal", title: "Свадьба и выпускные" },
  { value: "home", title: "Шторы и дом" },
  { value: "shop", title: "Магазин на сайте" },
  { value: "etsy", title: "Etsy" },
  { value: "giftcards", title: "Подарочные карты" },
  { value: "other", title: "Другое" },
];

export const EXPENSE_CATEGORIES: Choice[] = [
  { value: "materials", title: "Ткани и фурнитура" },
  { value: "printing", title: "Печать и реклама" },
  { value: "partners", title: "Партнёрам за клиентов" },
  { value: "software", title: "Сайт и программы" },
  { value: "travel", title: "Транспорт и доставка" },
  { value: "fees", title: "Комиссии: Stripe, Etsy, банк" },
  { value: "refunds", title: "Возврат клиенту" },
  { value: "equipment", title: "Оборудование" },
  { value: "other", title: "Другое" },
];

/**
 * What she can pick by hand. Payments taken on the site and the shop's own
 * categories are left out: the site records those itself, so choosing them
 * by hand would count the same money twice.
 */
export const MANUAL_METHODS: Choice[] = PAYMENT_METHODS.filter((choice) => choice.value !== "stripe");
export const MANUAL_INCOME_CATEGORIES: Choice[] = INCOME_CATEGORIES.filter(
  (choice) => choice.value !== "shop" && choice.value !== "giftcards"
);

export interface LedgerEntry {
  id: string;
  /** The Southampton day the money moved, "2026-10-02" */
  date: string;
  kind: LedgerKind;
  /** Pence, always above zero; `kind` says which way it went */
  amount: number;
  method: string;
  category: string;
  who?: string;
  note?: string;
  /** The atelier booking this was paid for, when it was paid for one */
  bookingId?: string;
  source: LedgerSource;
}

export function categoriesFor(kind: LedgerKind): Choice[] {
  return kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function manualCategoriesFor(kind: LedgerKind): Choice[] {
  return kind === "income" ? MANUAL_INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export function titleOf(list: Choice[], value: string): string {
  return list.find((choice) => choice.value === value)?.title ?? value;
}

/* ─── Money ─── */

/** £10,000 for one entry: far above any job, so an extra zero is a typo, not a sale. */
export const MAX_ENTRY_PENCE = 1_000_000;

/**
 * Pounds as typed, in pence, with no ceiling: "15.50", "£15.50", "15", "15.5"
 * and "15,50" all read as 1550. The comma is how Kristina writes pence, so
 * "15,50" is never fifteen hundred. A thousands separator is read only where
 * it separates thousands — "1,250.00", or "1 250,50" the Russian way — and a
 * space anywhere else is a typo, not a separator: "15 50" used to read as
 * £1,550. Anything else — words, a minus, a third decimal place, zero — is not
 * an amount.
 */
function readPounds(input: unknown): number | null {
  if (typeof input !== "string") return null;
  let typed = input.replace(/\u00a0/g, " ").trim().replace(/^£\s*/, "");
  if (/^\d+,\d{1,2}$/.test(typed)) typed = typed.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(typed)) typed = typed.replace(/,/g, "");
  else if (/^\d{1,3}( \d{3})+([.,]\d{1,2})?$/.test(typed)) typed = typed.replace(/ /g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(typed)) return null;
  const [whole, part = ""] = typed.split(".");
  // Whole pounds and pence apart, so no amount ever passes through a float
  const pence = Number(whole) * 100 + Number(part.padEnd(2, "0"));
  return pence > 0 ? pence : null;
}

/** An amount for one entry, or null: also null above the ceiling, which is a typo. */
export function parsePounds(input: unknown): number | null {
  const pence = readPounds(input);
  return pence !== null && pence <= MAX_ENTRY_PENCE ? pence : null;
}

/** Why a typed amount cannot be saved — not an amount at all, or one above the ceiling — or null when it can. */
export function amountProblem(input: unknown): { kind: "format" } | { kind: "cap"; pence: number } | null {
  const pence = readPounds(input);
  if (pence === null) return { kind: "format" };
  return pence > MAX_ENTRY_PENCE ? { kind: "cap", pence } : null;
}

/** 1550 → "£15.50", 125000 → "£1,250.00", −500 → "−£5.00" */
export function formatPounds(pence: number): string {
  const rounded = Math.round(pence);
  const sign = rounded < 0 ? "−" : "";
  const abs = Math.abs(rounded);
  return `${sign}£${Math.floor(abs / 100).toLocaleString("en-GB")}.${String(abs % 100).padStart(2, "0")}`;
}

/** Pence as a plain number for a spreadsheet: 1550 → "15.50", or "15,50" for a Russian Excel */
function plainPounds(pence: number, decimal: "." | "," = "."): string {
  return `${Math.floor(pence / 100)}${decimal}${String(pence % 100).padStart(2, "0")}`;
}

/* ─── Days and periods ─── */

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written "2026-10-02" — not "2026-02-30". */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_SHAPE.test(value)) return false;
  const noon = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(noon.getTime()) && noon.toISOString().slice(0, 10) === value;
}

/** Today in Southampton, whatever clock the server or the browser keeps. */
export function todayInSouthampton(now: Date = new Date()): string {
  return localDateOf(now);
}

/** Days apart, for keeping a request to a sensible span. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/** "2026-10" → "Октябрь 2026" */
export function monthTitle(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "2026-10-02" → "2 окт." */
export function dayTitle(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`)
  );
}

export interface TaxYear {
  from: string;
  to: string;
  /** "2026/27", the way HMRC writes it */
  label: string;
}

/** The UK tax year a day falls in: from 6 April to the next 5 April. */
export function taxYearOf(day: string): TaxYear {
  const year = Number(day.slice(0, 4));
  const start = day >= `${year}-04-06` ? year : year - 1;
  return { from: `${start}-04-06`, to: `${start + 1}-04-05`, label: `${start}/${String(start + 1).slice(2)}` };
}

export type PeriodKey = "month" | "lastMonth" | "taxYear" | "lastTaxYear";

export interface Period {
  key: PeriodKey;
  from: string;
  to: string;
  title: string;
}

export const PERIOD_KEYS: PeriodKey[] = ["month", "lastMonth", "taxYear", "lastTaxYear"];

export function periodOf(key: PeriodKey, today: string): Period {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (key === "month" || key === "lastMonth") {
    const y = key === "month" || month > 1 ? year : year - 1;
    const m = key === "month" ? month : month > 1 ? month - 1 : 12;
    return {
      key,
      from: `${y}-${pad(m)}-01`,
      to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`,
      title: monthTitle(`${y}-${pad(m)}`),
    };
  }
  const current = taxYearOf(today);
  const year_ = key === "taxYear" ? current : taxYearOf(`${Number(current.from.slice(0, 4)) - 1}-06-01`);
  return { key, from: year_.from, to: year_.to, title: `Налоговый год ${year_.label}` };
}

/* ─── What she types ─── */

export interface EntryInput {
  kind: LedgerKind;
  amount: number;
  date: string;
  method: string;
  category: string;
  who?: string;
  note?: string;
  bookingId?: string;
}

export type EntryVerdict = { ok: true; value: EntryInput } | { ok: false; error: string };

/** Anything before this is not a payment she is entering now, it is a typo in the year. */
export const EARLIEST_DAY = "2020-01-01";

function trimmed(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, max);
  return text || undefined;
}

/**
 * What the Studio sent, checked the way the server needs it: the amount
 * comes as she typed it and is read here, never trusted as pence. Every error
 * is shown to Kristina as it is, so it says how to put it right.
 */
export function judgeEntry(raw: unknown, today: string): EntryVerdict {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = input.kind;
  if (kind !== "income" && kind !== "expense") return { ok: false, error: "Выберите: пришло или ушло." };

  const amount = parsePounds(input.amount);
  if (amount === null) {
    const problem = amountProblem(input.amount);
    return {
      ok: false,
      error:
        problem?.kind === "cap"
          ? `${formatPounds(problem.pence)} в одной строке — похоже на лишний ноль. Проверьте сумму.`
          : "Сумма выглядит неправильно. Напишите, например, 15.50 или 15,50.",
    };
  }

  const date = input.date;
  if (!isDay(date)) return { ok: false, error: "Выберите дату." };
  if (date > today) return { ok: false, error: "Дата ещё не наступила. В кассу пишется то, что уже пришло или ушло." };
  if (date < EARLIEST_DAY) return { ok: false, error: "Похоже, в годе опечатка — проверьте дату." };

  const method = typeof input.method === "string" ? input.method : "";
  if (method === "stripe") {
    return { ok: false, error: "Оплаты на сайте касса записывает сама — второй раз их писать не нужно." };
  }
  if (!MANUAL_METHODS.some((choice) => choice.value === method)) {
    return { ok: false, error: "Выберите, как заплатили." };
  }
  if (kind === "expense" && method === "giftcard") {
    return { ok: false, error: "Подарочной картой можно только получить оплату, а не заплатить." };
  }

  const category = typeof input.category === "string" ? input.category : "";
  if (kind === "income" && (category === "shop" || category === "giftcards")) {
    return { ok: false, error: "Заказы и подарочные карты с сайта касса записывает сама — второй раз их писать не нужно." };
  }
  if (!manualCategoriesFor(kind).some((choice) => choice.value === category)) {
    return { ok: false, error: kind === "income" ? "Выберите, за что." : "Выберите, на что." };
  }

  const bookingId =
    typeof input.bookingId === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(input.bookingId)
      ? input.bookingId.replace(/^drafts\./, "")
      : undefined;

  return {
    ok: true,
    value: {
      kind,
      amount,
      date,
      method,
      category,
      who: trimmed(input.who, 80),
      note: trimmed(input.note, 500),
      ...(bookingId ? { bookingId } : {}),
    },
  };
}

/* ─── What writes itself ─── */

export interface OrderRow {
  _id: string;
  createdAt?: string;
  /** What Stripe took, in pence: after a friend's discount and any gift card */
  total?: number;
  displayName?: string;
  /** Stamped by the Stripe webhook: everything given back so far, and when */
  refundedAmount?: number;
  refundedAt?: string;
}

export interface GiftCardRow {
  _id: string;
  createdAt?: string;
  initialAmount?: number;
  refundedAmount?: number;
  refundedAt?: string;
}

function dayOfInstant(iso: string | undefined): string | null {
  if (!iso) return null;
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : localDateOf(instant);
}

/**
 * Shop orders and gift cards bought on the site, as entries she never types.
 * An order's total is what Stripe actually took, so a part paid with a gift
 * card is not counted again here — it was counted when the card was bought.
 * A card given as a friend's reward is not money and is never passed in.
 *
 * Money given back by Stripe is its own line, on the day it went back: the
 * sale stays on the day it was made, which is how the books have to read when
 * a September order is refunded in October.
 */
export function automaticEntries(orders: OrderRow[], cards: GiftCardRow[], from: string, to: string): LedgerEntry[] {
  const within = (day: string | null): day is string => !!day && day >= from && day <= to;
  const entries: LedgerEntry[] = [];
  const add = (
    row: { _id: string; createdAt?: string; refundedAmount?: number; refundedAt?: string },
    amount: number | undefined,
    category: string,
    source: LedgerSource,
    who: string | undefined
  ) => {
    const date = dayOfInstant(row.createdAt);
    if (within(date) && typeof amount === "number" && amount > 0) {
      entries.push({
        id: row._id,
        date,
        kind: "income",
        amount: Math.round(amount),
        method: "stripe",
        category,
        ...(who ? { who } : {}),
        source,
      });
    }
    const refundDay = dayOfInstant(row.refundedAt);
    if (within(refundDay) && typeof row.refundedAmount === "number" && row.refundedAmount > 0) {
      entries.push({
        id: `${row._id}-refund`,
        date: refundDay,
        kind: "expense",
        amount: Math.round(row.refundedAmount),
        method: "stripe",
        category: "refunds",
        ...(who ? { who } : {}),
        source,
      });
    }
  };
  for (const order of orders) add(order, order.total, "shop", "order", order.displayName);
  for (const card of cards) add(card, card.initialAmount, "giftcards", "giftcard", undefined);
  return entries;
}

/** Newest day first; on one day, the order they came back in. */
export function newestFirst(entries: LedgerEntry[]): LedgerEntry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.date === b.entry.date ? a.index - b.index : a.entry.date < b.entry.date ? 1 : -1))
    .map(({ entry }) => entry);
}

/**
 * The ledger's category for a booking's service. The booking form's own
 * services and the landing pages' names both arrive here, so both are named:
 * curtains are home, wedding and prom dresses are bridal, the rest is the
 * atelier.
 */
const SERVICE_CATEGORIES: Record<string, string> = {
  "Home Textiles": "home",
  "Curtain Alterations and Home Textiles": "home",
  "Wedding Dress Alterations": "bridal",
  "Prom and Evening Dress Alterations": "bridal",
};

export function categoryForService(service: string | undefined): string {
  return (service && SERVICE_CATEGORIES[service]) || "atelier";
}

/* ─── Adding it up ─── */

export interface Total {
  key: string;
  title: string;
  amount: number;
}

export interface MonthTotal {
  month: string;
  title: string;
  income: number;
  expense: number;
}

export interface LedgerSummary {
  /** Money that came in. A fitting paid with a gift card is not in it. */
  income: number;
  expense: number;
  net: number;
  /** Paid with gift cards: work done, but the money came when the card was bought */
  paidByGiftCard: number;
  incomeByCategory: Total[];
  expenseByCategory: Total[];
  incomeByMethod: Total[];
  byMonth: MonthTotal[];
  count: number;
}

function totals(map: Map<string, number>, list: Choice[]): Total[] {
  return [...map.entries()]
    .map(([key, amount]) => ({ key, title: titleOf(list, key), amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function summarise(entries: LedgerEntry[]): LedgerSummary {
  let income = 0;
  let expense = 0;
  let paidByGiftCard = 0;
  const incomeByCategory = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();
  const incomeByMethod = new Map<string, number>();
  const byMonth = new Map<string, MonthTotal>();

  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const row = byMonth.get(month) ?? { month, title: monthTitle(month), income: 0, expense: 0 };
    if (entry.kind === "income") {
      if (entry.method === "giftcard") {
        paidByGiftCard += entry.amount;
      } else {
        income += entry.amount;
        row.income += entry.amount;
        incomeByCategory.set(entry.category, (incomeByCategory.get(entry.category) ?? 0) + entry.amount);
        incomeByMethod.set(entry.method, (incomeByMethod.get(entry.method) ?? 0) + entry.amount);
      }
    } else {
      expense += entry.amount;
      row.expense += entry.amount;
      expenseByCategory.set(entry.category, (expenseByCategory.get(entry.category) ?? 0) + entry.amount);
    }
    byMonth.set(month, row);
  }

  return {
    income,
    expense,
    net: income - expense,
    paidByGiftCard,
    incomeByCategory: totals(incomeByCategory, INCOME_CATEGORIES),
    expenseByCategory: totals(expenseByCategory, EXPENSE_CATEGORIES),
    incomeByMethod: totals(incomeByMethod, PAYMENT_METHODS),
    byMonth: [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    count: entries.length,
  };
}

/* ─── The spreadsheet ─── */

const SOURCE_TITLES: Record<LedgerSource, string> = {
  manual: "Вручную",
  booking: "Запись в ателье",
  order: "Заказ на сайте",
  giftcard: "Подарочная карта на сайте",
};

/**
 * One cell. Quoted when it holds either separator, a quote, a tab or a line
 * break — a Russian Excel splits on ";" — and a cell that starts like a
 * formula gets an apostrophe, so a note typed as "=1+1" or a name from a form
 * cannot run as a formula when the file is opened.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",;\t\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * "uk": commas and points — Google Sheets, Numbers, an English Excel.
 * "ru": semicolons and commas — Excel set to Russian, which otherwise puts a
 * whole line in one column and turns "12.10" into a date.
 */
export type CsvStyle = "uk" | "ru";

/**
 * The ledger as a spreadsheet for Self Assessment, or for an accountant: one
 * line per payment, money in and money out in their own columns, and fittings
 * paid with a gift card in a third, so that adding up "Приход" gives the money
 * that actually came in. The byte-order mark makes Excel read the Russian.
 */
export function ledgerCsv(entries: LedgerEntry[], style: CsvStyle = "uk"): string {
  const separator = style === "ru" ? ";" : ",";
  const decimal = style === "ru" ? "," : ".";
  const header = [
    "Дата",
    "Приход, £",
    "Расход, £",
    "Оплачено подарочной картой, £",
    "Как",
    "За что",
    "Кто",
    "Заметка",
    "Откуда",
  ];
  const lines = [...entries]
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
    .map((entry) => {
      const giftCard = entry.kind === "income" && entry.method === "giftcard";
      // The day and the amounts are ours and hold no separator, so they go as
      // they are — quoted, an amount can be read as text; everything typed is
      // passed through `cell`
      return [
        entry.date,
        entry.kind === "income" && !giftCard ? plainPounds(entry.amount, decimal) : "",
        entry.kind === "expense" ? plainPounds(entry.amount, decimal) : "",
        giftCard ? plainPounds(entry.amount, decimal) : "",
        ...[
          titleOf(PAYMENT_METHODS, entry.method),
          titleOf(categoriesFor(entry.kind), entry.category),
          entry.who ?? "",
          entry.note ?? "",
          SOURCE_TITLES[entry.source],
        ].map(cell),
      ].join(separator);
    });
  return `\uFEFF${[header.map(cell).join(separator), ...lines].join("\r\n")}\r\n`;
}
