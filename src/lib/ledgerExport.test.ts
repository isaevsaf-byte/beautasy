import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarise } from "./ledger";
import { exportEmailHtml, exportIdFor } from "./ledgerExport";

/**
 * The books' monthly copy by email: one per month, never two, never lost to
 * a refused email, and never sent for a month with nothing in it.
 */

const SOURCE = readFileSync(join(process.cwd(), "src", "lib", "ledgerExport.ts"), "utf8");
const CRON = readFileSync(join(process.cwd(), "src", "app", "api", "cron", "daily", "route.ts"), "utf8");

test("each month has one claim, by name", () => {
  assert.equal(exportIdFor("2026-09"), "ledgerExport-2026-09");
});

test("the month is claimed before the email, and handed back if the email is refused", () => {
  const claim = SOURCE.indexOf("sanityWriteClient.create({ _id: id");
  const send = SOURCE.indexOf("await sendEmail(");
  const release = SOURCE.indexOf("await sanityWriteClient.delete(id)");
  assert.notEqual(claim, -1, "no claim — two mornings could send the same month");
  assert.ok(claim < send, "Claim the month before sending it.");
  assert.ok(send < release, "A refused email must hand the month back for tomorrow.");
  assert.match(SOURCE, /if \(entries\.length === 0\) return \{ month, outcome: "empty" \};/);
  assert.ok(SOURCE.indexOf('outcome: "empty"') < claim, "An empty month is not claimed: a late entry for it still goes out.");
});

test("both spreadsheets go, and the email says which is for which Excel", () => {
  assert.match(SOURCE, /ledgerCsv\(entries, "uk"\)/);
  assert.match(SOURCE, /ledgerCsv\(entries, "ru"\)/);
  const html = exportEmailHtml("Сентябрь 2026", summarise([
    { id: "a", date: "2026-09-02", kind: "income", amount: 4500, method: "card", category: "bridal", source: "manual" },
    { id: "b", date: "2026-09-03", kind: "expense", amount: 1200, method: "card", category: "materials", source: "manual" },
    { id: "c", date: "2026-09-04", kind: "income", amount: 2000, method: "giftcard", category: "atelier", source: "booking" },
  ]));
  assert.match(html, /Пришло <strong>£45\.00<\/strong> · ушло <strong>£12\.00<\/strong> · осталось <strong>£33\.00<\/strong>/);
  assert.match(html, /Ещё £20\.00 оплачено подарочными картами/);
  assert.match(html, /«ru» — в Excel на русском/);
});

test("the daily job runs it, alongside the rest and not before them", () => {
  const settled = CRON.slice(CRON.indexOf("Promise.allSettled(["), CRON.indexOf("]);", CRON.indexOf("Promise.allSettled([")));
  assert.match(settled, /sendMonthlyLedgerExport\(\),/);
  assert.equal((CRON.match(/sendMonthlyLedgerExport\(/g) ?? []).length, 1, "called once, inside allSettled");
  // The same place in the list as in what is read back: the destructuring is positional
  const jobs = settled.match(/^\s{4}(\w+)\(/gm)?.map((line) => line.trim().replace("(", "")) ?? [];
  const names = CRON.slice(CRON.indexOf("const [", CRON.indexOf("Promise.allSettled([")), CRON.indexOf("] = results.map"))
    .replace("const [", "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  assert.equal(jobs.length, names.length, "every job has a name to be read back under");
  assert.ok(jobs.indexOf("sendMonthlyLedgerExport") >= 0);
  assert.equal(jobs.indexOf("sendMonthlyLedgerExport"), names.indexOf("ledgerExport"));
  assert.match(CRON, /health,\n\s+ledgerExport,\n\s+referrals,\n[\s\w,]*\] = results\.map/, "its answer is read back in its own place");
});
