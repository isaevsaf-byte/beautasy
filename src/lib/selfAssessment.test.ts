import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RATES,
  billDates,
  estimateTax,
  mileagePence,
  mtdStepFor,
  ratesFor,
  rollingYear,
  upcomingTaxDates,
} from "./selfAssessment";

/**
 * «Налоги» in «Касса»: the bill a sole trader in England would owe. Each
 * figure below is worked by hand from HMRC's published rates for 2026/27.
 */

const { rates } = ratesFor("2026/27");
const gbp = (pounds: number) => Math.round(pounds * 100);

test("£50,000 of profit is £7,486 income tax and £2,245.80 National Insurance", () => {
  const tax = estimateTax(gbp(58_000), gbp(8_000), rates);
  assert.equal(tax.profit, gbp(50_000));
  assert.equal(tax.incomeTax, gbp(7_486));
  assert.equal(tax.nationalInsurance, gbp(2_245.8));
  assert.equal(tax.total, gbp(9_731.8));
  assert.equal(tax.marginalPence, 26);
  assert.equal(tax.paymentOnAccount, gbp(4_865.9));
});

test("the first £12,570 of profit is free of both, and the next pound costs 26p", () => {
  const free = estimateTax(gbp(14_000), gbp(1_430), rates);
  assert.equal(free.profit, gbp(12_570));
  assert.equal(free.total, 0);
  assert.equal(free.marginalPence, 26);
  const at20k = estimateTax(gbp(20_000), gbp(1_500), rates);
  assert.equal(at20k.incomeTax, gbp(1_186), "18,500 − 12,570 = 5,930 at 20%");
  assert.equal(at20k.nationalInsurance, gbp(355.8), "5,930 at 6%");
});

test("above £50,270 a pound costs 42p, and past £100,000 the allowance melts", () => {
  assert.equal(estimateTax(gbp(60_000), 0, rates).marginalPence, 42);
  const at60k = estimateTax(gbp(61_000), gbp(1_000), rates);
  assert.equal(at60k.incomeTax, gbp(7_540 + 3_892), "37,700 at 20% and 9,730 at 40%");
  assert.equal(at60k.nationalInsurance, gbp(2_262 + 194.6));
  const at110k = estimateTax(gbp(111_000), gbp(1_000), rates);
  assert.equal(at110k.allowance, gbp(7_570), "£5,000 of allowance lost for £10,000 over");
  assert.equal(estimateTax(gbp(200_000), 0, rates).allowance, 0);
});

test("with expenses under £1,000 the £1,000 allowance is taken instead, and £1,000 of turnover needs no return", () => {
  const small = estimateTax(gbp(900), gbp(50), rates);
  assert.equal(small.noReturnNeeded, true);
  assert.equal(small.profit, 0);
  const over = estimateTax(gbp(15_000), gbp(300), rates);
  assert.equal(over.usesTradingAllowance, true);
  assert.equal(over.profit, gbp(14_000));
  assert.equal(estimateTax(gbp(1_000.01), 0, rates).noReturnNeeded, false);
  const real = estimateTax(gbp(15_000), gbp(2_000), rates);
  assert.equal(real.usesTradingAllowance, false);
  assert.equal(real.profit, gbp(13_000));
});

test("advances start only when the bill is over £1,000", () => {
  assert.equal(estimateTax(gbp(16_000), gbp(1_000), rates).paymentOnAccount, 0, "£2,430 profit over → £631.80");
  assert.ok(estimateTax(gbp(20_000), gbp(1_000), rates).paymentOnAccount > 0);
});

test("a year the table does not know yet is worked on the newest and says so", () => {
  assert.equal(ratesFor("2026/27").assumed, false);
  const later = ratesFor("2031/32");
  assert.equal(later.assumed, true);
  assert.equal(later.rates.label, RATES[RATES.length - 1].label);
});

test("the dates name the year they are about, soonest first", () => {
  const dates = upcomingTaxDates("2026-10-11");
  assert.deepEqual(dates.map((d) => d.day), ["2027-01-31", "2027-07-31", "2027-10-05"]);
  assert.match(dates[0].title, /декларацию за 2025\/26/);
  assert.match(dates[0].title, /первый аванс за 2026\/27/);
  assert.equal(dates[0].inDays, 112);
  assert.equal(upcomingTaxDates("2027-01-31")[0].inDays, 0, "the day itself is still to come");
  assert.deepEqual(billDates({ from: "2026-04-06", to: "2027-04-05", label: "2026/27" }), {
    balance: "2028-01-31",
    secondAdvance: "2028-07-31",
  });
});

test("VAT is counted over any twelve months, and Making Tax Digital by the year's step", () => {
  assert.deepEqual(rollingYear("2026-10-11"), { from: "2025-10-12", to: "2026-10-11" });
  assert.equal(mtdStepFor("2025/26").threshold, gbp(30_000));
  assert.equal(mtdStepFor("2026/27").threshold, gbp(20_000));
});

test("miles become pounds at 45p, and nothing that is not a distance does", () => {
  assert.equal(mileagePence("12"), 540);
  assert.equal(mileagePence("7,5"), 338);
  assert.equal(mileagePence("0"), null);
  assert.equal(mileagePence("12 миль"), null);
  assert.equal(mileagePence("-3"), null);
  assert.equal(mileagePence("100000"), null);
});
