import { addDays, daysBetween, type TaxYear } from "./ledger";

/**
 * «Налоги» — what the ledger's numbers mean for Self Assessment, for a sole
 * trader in England with no other income: Kristina, as of October 2026.
 *
 * A guess made out loud, never a return: it reads what is in «Касса» and says
 * what HMRC would ask for if the year ended today. Every figure is pence and
 * every function pure, so the money rules are tested, not trusted.
 *
 * 🚨 The rates are set by each Budget. A tax year that is not in RATES is
 * worked out on the newest known one and says so on the screen — update the
 * table when a new year's figures are published.
 */

export interface TaxRates {
  /** "2026/27" */
  label: string;
  /** Tax-free, unless profit passes the taper */
  personalAllowance: number;
  /** £1 of allowance lost for every £2 of income above this */
  taperFrom: number;
  /** The 20% band, counted above the allowance */
  basicBand: number;
  /** Taxable income above this pays 45% */
  additionalFrom: number;
  /** Class 4 National Insurance: 6% between these, 2% above */
  class4Lower: number;
  class4Upper: number;
  class4Main: number;
  class4Upper2: number;
  /** Below this profit the year counts for the State Pension only if Class 2 is paid by choice */
  smallProfits: number;
  /** Voluntary Class 2, a week */
  class2Weekly: number;
}

const RATES_2026: Omit<TaxRates, "label" | "smallProfits" | "class2Weekly"> = {
  personalAllowance: 1_257_000,
  taperFrom: 10_000_000,
  basicBand: 3_770_000,
  additionalFrom: 12_514_000,
  class4Lower: 1_257_000,
  class4Upper: 5_027_000,
  class4Main: 0.06,
  class4Upper2: 0.02,
};

/** Allowances are frozen to April 2031; what moves each year is Class 2. */
export const RATES: TaxRates[] = [
  { label: "2024/25", ...RATES_2026, smallProfits: 672_500, class2Weekly: 345 },
  { label: "2025/26", ...RATES_2026, smallProfits: 684_500, class2Weekly: 350 },
  { label: "2026/27", ...RATES_2026, smallProfits: 710_500, class2Weekly: 365 },
];

/** The rates for a tax year, or the newest known with `assumed` when the year is not in the table yet. */
export function ratesFor(label: string): { rates: TaxRates; assumed: boolean } {
  const exact = RATES.find((rates) => rates.label === label);
  return exact ? { rates: exact, assumed: false } : { rates: RATES[RATES.length - 1], assumed: true };
}

/** Turnover at or below this needs no return at all; above it, the £1,000 can replace the expenses. */
export const TRADING_ALLOWANCE = 100_000;
/** A tax bill above this brings two advances on next year's: 31 January and 31 July. */
export const PAYMENTS_ON_ACCOUNT_FROM = 100_000;
/** Turnover over any 12 months in a row that makes VAT compulsory. */
export const VAT_THRESHOLD = 9_000_000;
/** Pence a mile for the first 10,000 business miles in a tax year, and after. */
export const MILEAGE_RATE = 45;
export const MILEAGE_RATE_AFTER = 25;
/** Flat working-from-home amounts a month, by hours worked at home that month. */
export const HOME_WORKING = [
  { hours: "25–50 часов", amount: 1_000 },
  { hours: "51–100 часов", amount: 1_800 },
  { hours: "101 час и больше", amount: 2_600 },
];
/** Marriage Allowance: what she can hand to Safar when she does not use all of hers. */
export const MARRIAGE_ALLOWANCE = 126_000;

/** The first day «Касса» held anything: a year that starts before it may be missing money. */
export const KASSA_SINCE = "2026-10-02";

/**
 * Making Tax Digital: quarterly updates from software, once a year's turnover
 * passes the line in force when it is checked. The year whose return is read,
 * the line, and the April it starts.
 */
const MTD_STEPS = [
  { year: "2024/25", threshold: 5_000_000, starts: "апреля 2026" },
  { year: "2025/26", threshold: 3_000_000, starts: "апреля 2027" },
  { year: "2026/27", threshold: 2_000_000, starts: "апреля 2028" },
];

export function mtdStepFor(label: string): { threshold: number; starts: string } {
  const step = MTD_STEPS.find((s) => s.year === label) ?? MTD_STEPS[MTD_STEPS.length - 1];
  return { threshold: step.threshold, starts: step.starts };
}

export interface TaxEstimate {
  turnover: number;
  expenses: number;
  /** What is taken off: the real expenses, or the £1,000 allowance when that is more */
  deduction: number;
  usesTradingAllowance: boolean;
  profit: number;
  /** Turnover at £1,000 or less: nothing to file */
  noReturnNeeded: boolean;
  allowance: number;
  incomeTax: number;
  nationalInsurance: number;
  total: number;
  /** Of the next £1 of profit, how many pence would go: 0, 26, 42… */
  marginalPence: number;
  /** Advances on next year's bill, each — 0 when the bill is £1,000 or less */
  paymentOnAccount: number;
}

const pct = (pence: number, rate: number) => Math.round(pence * rate);
const clamp = (n: number) => Math.max(0, n);

/** Income tax and Class 4 on a year's profit, pence. */
function taxOn(profit: number, rates: TaxRates): { allowance: number; incomeTax: number; nationalInsurance: number } {
  const allowance = clamp(rates.personalAllowance - Math.floor(clamp(profit - rates.taperFrom) / 2));
  const taxable = clamp(profit - allowance);
  const basic = Math.min(taxable, rates.basicBand);
  const higher = clamp(Math.min(taxable, rates.additionalFrom) - rates.basicBand);
  const additional = clamp(taxable - rates.additionalFrom);
  const incomeTax = pct(basic, 0.2) + pct(higher, 0.4) + pct(additional, 0.45);
  const main = clamp(Math.min(profit, rates.class4Upper) - rates.class4Lower);
  const above = clamp(profit - rates.class4Upper);
  const nationalInsurance = pct(main, rates.class4Main) + pct(above, rates.class4Upper2);
  return { allowance, incomeTax, nationalInsurance };
}

/**
 * The year's bill if it ended with these totals. Turnover is money that came
 * in (a fitting paid by gift card was counted when the card was bought);
 * expenses are what went out, refunds included.
 */
export function estimateTax(turnover: number, expenses: number, rates: TaxRates): TaxEstimate {
  const allowanceDeduction = Math.min(turnover, TRADING_ALLOWANCE);
  const usesTradingAllowance = allowanceDeduction > expenses;
  const deduction = usesTradingAllowance ? allowanceDeduction : expenses;
  const profit = clamp(turnover - deduction);
  const { allowance, incomeTax, nationalInsurance } = taxOn(profit, rates);
  const total = incomeTax + nationalInsurance;
  const next = taxOn(profit + 10_000, rates);
  const marginalPence = Math.round((next.incomeTax + next.nationalInsurance - total) / 100);
  return {
    turnover,
    expenses,
    deduction,
    usesTradingAllowance,
    profit,
    noReturnNeeded: turnover <= TRADING_ALLOWANCE,
    allowance,
    incomeTax,
    nationalInsurance,
    total,
    marginalPence,
    paymentOnAccount: total > PAYMENTS_ON_ACCOUNT_FROM ? Math.round(total / 2) : 0,
  };
}

export interface TaxDate {
  day: string;
  title: string;
  /** Days from today; 0 is today */
  inDays: number;
}

const DAY_MONTH = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "2027-01-31" → "31 января 2027 г." */
export function longDay(day: string): string {
  return DAY_MONTH.format(new Date(`${day}T12:00:00Z`));
}

/**
 * The next dates HMRC holds her to, soonest first. The year is named in each,
 * because 31 January is always about the year that ended the April before.
 */
export function upcomingTaxDates(today: string, count = 3): TaxDate[] {
  const year = Number(today.slice(0, 4));
  const all: { day: string; title: string }[] = [];
  for (const y of [year, year + 1, year + 2]) {
    const ended = `${y - 2}/${String(y - 1).slice(2)}`;
    const running = `${y - 1}/${String(y).slice(2)}`;
    all.push({
      day: `${y}-01-31`,
      title: `Подать декларацию за ${ended} онлайн и заплатить налог за этот год. Если налог больше £1 000 — ещё и первый аванс за ${running}.`,
    });
    all.push({
      day: `${y}-07-31`,
      title: `Второй аванс за ${running} — только если налог за ${ended} был больше £1 000.`,
    });
    all.push({
      day: `${y}-10-05`,
      title: `Последний день зарегистрироваться в HMRC, если в ${running} впервые пришло больше £1 000. Уже есть UTR — пропустить.`,
    });
  }
  return all
    .filter((date) => date.day >= today)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(0, count)
    .map((date) => ({ ...date, inDays: daysBetween(today, date.day) }));
}

/** The year's own two deadlines, for the bill shown: return and balance, then the second advance. */
export function billDates(year: TaxYear): { balance: string; secondAdvance: string } {
  const end = Number(year.to.slice(0, 4));
  return { balance: `${end + 1}-01-31`, secondAdvance: `${end + 1}-07-31` };
}

/** The 12 months up to today, for VAT, which counts any twelve in a row and not the tax year. */
export function rollingYear(today: string): { from: string; to: string } {
  return { from: addDays(today, -364), to: today };
}

/** A typed number of miles as pence at 45p, or null. Whole and half miles only; a year is far under 100,000. */
export function mileagePence(typed: string): number | null {
  const text = typed.replace(",", ".").trim();
  if (!/^\d{1,5}(\.5|\.0)?$/.test(text)) return null;
  const miles = Number(text);
  return miles > 0 ? Math.round(miles * MILEAGE_RATE) : null;
}

/** Pence as the string the ledger form takes: 1350 → "13.50". */
export function poundsInput(pence: number): string {
  return (pence / 100).toFixed(2);
}
