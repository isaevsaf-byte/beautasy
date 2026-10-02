import { test } from "node:test";
import assert from "node:assert/strict";
import { LEDGER_ID, SEAL_BLOCK, bookingKeyOf, ledgerDocument, openLedgerDocument, padded } from "./ledgerStore";
import { seal } from "./secrets";

// A key made up for the suite, so the real seal is what is measured; the key
// is read when something is sealed, not when the module loads
process.env.DATA_SECRET = "test-secret-for-the-ledger-suite";

/**
 * What a «Касса» entry looks like in a dataset anyone can read. The day and
 * an opaque booking key are what the queries need; how much, from whom, how,
 * why and for which booking must not be readable there at all — not even by
 * the length of the sealed part.
 */

const ID = "ledger-0d3f6b8e-1c2a-4f5e-9a7b-123456789abc";
const input = {
  kind: "income" as const,
  amount: 4550,
  date: "2026-10-02",
  method: "cash",
  category: "bridal",
  who: "Anna Smith",
  note: "wedding dress, bustle",
  bookingId: "slot-2026-10-06-1400",
};

test("nothing a stranger could read says how much, from whom, why or for which booking", () => {
  const doc = ledgerDocument(ID, input, "2026-10-02T10:00:00.000Z", "key-abc");
  const visible = JSON.stringify(doc);
  for (const secret of ["4550", "45.50", "Anna", "Smith", "wedding", "bustle", "cash", "bridal", "income", "slot-2026"]) {
    assert.equal(visible.includes(secret), false, `"${secret}" is readable in the public dataset`);
  }
  assert.equal(doc._type, "ledgerEntry");
  assert.equal(doc.date, "2026-10-02");
  assert.equal(doc.bookingKey, "key-abc", "an opaque key, so a booking's payments can still be found");
  assert.match(doc.sealed, /^v1\./);
});

test("the sealed part is the same length for £15 and for £4,500, so its size gives nothing away", () => {
  const sizes = [1500, 4500, 45000, 450000].map(
    (amount) => ledgerDocument(ID, { ...input, amount }, "now", "key").sealed.length
  );
  assert.equal(new Set(sizes).size, 1, `lengths differ: ${sizes.join(", ")}`);
  assert.equal(Buffer.byteLength(padded("{}"), "utf8"), SEAL_BLOCK);
  assert.equal(Buffer.byteLength(padded("я".repeat(200)), "utf8"), SEAL_BLOCK * 2, "padding counts bytes, not letters");
  assert.deepEqual(JSON.parse(padded('{"a":1}')), { a: 1 }, "the padding is spaces, which JSON ignores");
});

test("an entry comes back exactly as it went in, booking included", () => {
  const doc = ledgerDocument(ID, input, "2026-10-02T10:00:00.000Z", "key-abc");
  assert.deepEqual(openLedgerDocument(doc), {
    id: ID,
    date: "2026-10-02",
    kind: "income",
    amount: 4550,
    method: "cash",
    category: "bridal",
    who: "Anna Smith",
    note: "wedding dress, bustle",
    bookingId: "slot-2026-10-06-1400",
    source: "booking",
  });
  const { bookingId: _, ...loose } = input;
  void _;
  assert.equal(openLedgerDocument(ledgerDocument("ledger-x", loose, "now"))?.source, "manual");
});

test("a payment stays with its customer when the booking moves, and is not handed to the next one", () => {
  const anna = { _id: "slot-2026-10-06-1400", createdAt: "2026-09-30T08:00:00.000Z", nameSealed: "v1.anna" };
  const moved = { ...anna, _id: "slot-2026-10-08-1000" };
  const ben = { _id: "slot-2026-10-06-1400", createdAt: "2026-10-02T12:00:00.000Z", nameSealed: "v1.ben" };
  assert.equal(bookingKeyOf(moved), bookingKeyOf(anna), "a move makes a new id, not a new customer");
  assert.notEqual(bookingKeyOf(ben), bookingKeyOf(anna), "Ben took Anna's freed time, not her payments");
  assert.equal(bookingKeyOf(anna).includes("slot"), false, "the key names no booking");
  assert.equal(bookingKeyOf({ _id: "old-booking" }), bookingKeyOf({ _id: "old-booking" }), "a booking without marks still has a key");
});

test("what cannot be trusted is not read as money", () => {
  assert.equal(openLedgerDocument({ _id: "ledger-x", date: "2026-10-02", sealed: "v1.not-ours" }), null);
  assert.equal(openLedgerDocument({ _id: "ledger-x", date: "2026-10-02" }), null);
  const wrongShape = (part: unknown) =>
    openLedgerDocument({ _id: "ledger-x", date: "2026-10-02", sealed: seal(JSON.stringify(part)) });
  assert.equal(wrongShape({ kind: "income", amount: 0, method: "cash", category: "atelier" }), null);
  assert.equal(wrongShape({ kind: "income", amount: -100, method: "cash", category: "atelier" }), null);
  assert.equal(wrongShape({ kind: "gift", amount: 100, method: "cash", category: "atelier" }), null);
  assert.equal(wrongShape("not an object"), null);
  assert.equal(wrongShape(null), null);
  assert.equal(openLedgerDocument({ _id: "ledger-x", date: "2026-10-02", sealed: seal("{broken json") }), null);
});

test("only an entry the ledger wrote can be corrected or deleted", () => {
  assert.equal(LEDGER_ID.test(ID), true);
  for (const id of [
    "order-123",
    "slot-2026-10-06-1400",
    `drafts.${ID}`,
    `${ID}-extra`,
    "ledger-",
    "siteSettings",
  ]) {
    assert.equal(LEDGER_ID.test(id), false, id);
  }
});
