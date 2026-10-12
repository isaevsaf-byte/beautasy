import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalCode, cardLine, codeLooksComplete, shortfall, type CardLook } from "./atelierGiftCard";
import {
  fingerprintsOf,
  judgeCard,
  redeemAtAtelier,
  redemptionMutations,
  returnMutations,
  type AtelierCard,
  type CardDesk,
} from "./atelierGiftCardStore";
import { ledgerDocument, type LedgerDocument } from "./ledgerStore";

/**
 * A gift card paid with at the atelier (12.10.2026): the code read however a
 * client shows it, the card judged, and the charge written with the ledger
 * line in one transaction, pinned to the card as it was read.
 */

const NOW = Date.parse("2026-10-12T12:00:00Z");
const fp = (value: string) => `fp:${value}`;

test("a code is found however it is typed: case, spaces, dashes, with or without BEAUTASY", () => {
  for (const typed of [
    "BEAUTASY-AB12-CD34",
    " beautasy-ab12-cd34 ",
    "beautasy ab12 cd34",
    "BEAUTASYAB12CD34",
    "Beautasy – AB12 – CD34",
    "ab12-cd34",
    "AB12 CD34",
  ]) {
    assert.equal(canonicalCode(typed), "BEAUTASY-AB12-CD34", typed);
  }
  // Not the shape cards are issued in: read the way checkout reads it, so nothing issued otherwise is lost
  assert.equal(canonicalCode(" friends-x1 "), "FRIENDS-X1");
});

test("both the issued form and checkout's form are looked up, fingerprinted, never in the clear", () => {
  assert.deepEqual(fingerprintsOf("beautasy-ab12-cd34", fp), ["fp:BEAUTASY-AB12-CD34"]);
  assert.deepEqual(fingerprintsOf("beautasy ab12 cd34", fp), ["fp:BEAUTASY-AB12-CD34", "fp:BEAUTASYAB12CD34"]);
  assert.deepEqual(fingerprintsOf("   ", fp), []);
});

test("half a code is not worth a question to the server", () => {
  assert.equal(codeLooksComplete("BEAUTASY"), false);
  assert.equal(codeLooksComplete("beautasy-ab12-cd3"), false);
  assert.equal(codeLooksComplete("beautasy-ab12-cd34"), true);
  assert.equal(codeLooksComplete("ab12 cd34"), true);
  assert.equal(codeLooksComplete("ab12"), false);
});

const card = (patch: Partial<AtelierCard> = {}): AtelierCard => ({
  _id: "giftCard-1",
  _rev: "rev-1",
  codeHint: "CD34",
  balance: 4000,
  active: true,
  expiresAt: "2027-06-01T00:00:00Z",
  ...patch,
});

test("a card that can be paid with says what is on it", () => {
  const verdict = judgeCard(card(), NOW);
  assert.ok(verdict.ok);
  assert.deepEqual(verdict.look, { hint: "CD34", balance: 4000, available: 4000 });
});

test("no card, a switched-off card, an expired card and an empty card each say so in Russian", () => {
  const missing = judgeCard(null, NOW);
  assert.ok(!missing.ok && missing.status === 404 && /Карты с таким кодом нет/.test(missing.error));
  const off = judgeCard(card({ active: false }), NOW);
  assert.ok(!off.ok && /карта отключена/.test(off.error));
  const expired = judgeCard(card({ expiresAt: "2026-10-01T09:00:00Z" }), NOW);
  assert.ok(!expired.ok && /Срок карты закончился 1 окт/.test(expired.error), JSON.stringify(expired));
  const empty = judgeCard(card({ balance: 0 }), NOW);
  assert.ok(!empty.ok && /ничего не осталось/.test(empty.error));
});

test("what a checkout on the site holds is not spendable at the atelier until that hold runs out", () => {
  const held = card({ reservedSession: "cs_1", reservedAmount: 3000, reservedUntil: "2026-10-12T13:00:00Z" });
  const verdict = judgeCard(held, NOW);
  assert.ok(verdict.ok);
  assert.deepEqual(verdict.look, { hint: "CD34", balance: 4000, available: 1000, held: 3000 });
  const all = judgeCard({ ...held, reservedAmount: 4000 }, NOW);
  assert.ok(!all.ok && /ждёт оплаты заказа/.test(all.error));
  const ranOut = judgeCard({ ...held, reservedUntil: "2026-10-12T11:00:00Z" }, NOW);
  assert.ok(ranOut.ok && ranOut.look.available === 4000);
});

const look: CardLook = { hint: "CD34", balance: 4000, available: 4000 };

test("the line under the code: what is on it, and what will be left", () => {
  assert.deepEqual(cardLine(look, 1550), { text: "На карте £40.00 — после оплаты останется £24.50.", ok: true });
  assert.deepEqual(cardLine(look, 4000), { text: "На карте £40.00 — после оплаты останется £0.00.", ok: true });
  assert.deepEqual(cardLine(look, null), { text: "На карте £40.00.", ok: true });
});

test("a price above the card is refused, with the rest to be taken as a second payment", () => {
  const small: CardLook = { hint: "CD34", balance: 1000, available: 1000 };
  const line = cardLine(small, 4500);
  assert.equal(line.ok, false);
  assert.equal(line.text, "На карте только £10.00. Запишите здесь £10.00, а остальные £35.00 — второй оплатой другим способом.");
  assert.match(shortfall({ hint: "CD34", balance: 4000, available: 1000, held: 3000 }, 1500), /£30\.00 из них ждут оплаты заказа на сайте — списать можно £10\.00/);
});

const entryFor = (paidWith: { id: string; hint: string }): LedgerDocument =>
  ledgerDocument(
    "ledger-0",
    { kind: "income", amount: 1550, date: "2026-10-12", method: "giftcard", category: "alterations", giftCard: paidWith },
    "2026-10-12T12:00:00Z",
    "booking-key",
    (value) => `sealed:${value.trim()}`
  );

test("the save is one transaction: the sealed line, and the card's new balance pinned to the revision read", () => {
  const entry = entryFor({ id: "giftCard-1", hint: "CD34" });
  assert.deepEqual(redemptionMutations(card(), 2450, entry), [
    { create: entry },
    { patch: { id: "giftCard-1", ifRevisionID: "rev-1", set: { balance: 2450 } } },
  ]);
  // Which card paid travels sealed with the line, so the line can be traced to it
  assert.match(entry.sealed, /"giftCard":\{"id":"giftCard-1","hint":"CD34"\}/);
  assert.doesNotMatch(JSON.stringify({ ...entry, sealed: "" }), /giftCard-1|CD34/, "nothing about the card in the clear");
});

test("deleting a card payment gives it back to the card, in the same write", () => {
  assert.deepEqual(returnMutations("ledger-0", "giftCard-1", 1550), [
    { delete: { id: "ledger-0" } },
    { patch: { id: "giftCard-1", inc: { balance: 1550 } } },
  ]);
});

/** A Sanity with one card in it that refuses writes against an old revision, as the real one does */
function store(start: AtelierCard | null, { conflicts = 0, changeTo }: { conflicts?: number; changeTo?: Partial<AtelierCard> } = {}) {
  let current = start;
  let refusals = conflicts;
  const reads: Record<string, unknown>[] = [];
  const writes: unknown[][] = [];
  const desk: CardDesk = {
    async fetch<T>(_query: string, params: Record<string, unknown>) {
      reads.push(params);
      return current as T;
    },
    async mutate(mutations: unknown[]) {
      if (refusals > 0) {
        refusals -= 1;
        // Someone else changed the card in between: a shop order, another till
        if (current && changeTo) current = { ...current, ...changeTo, _rev: `${current._rev}+` };
        throw Object.assign(new Error("Document has been modified"), { statusCode: 409 });
      }
      writes.push(mutations);
      return {};
    },
  };
  return { desk, reads, writes };
}

const redeem = (desk: CardDesk, amount: number, typed = "beautasy ab12 cd34") =>
  redeemAtAtelier(desk, typed, amount, entryFor, { now: () => NOW, fingerprintWith: fp });

test("a payment comes off the card, and the line says which card paid", async () => {
  const { desk, reads, writes } = store(card());
  const paid = await redeem(desk, 1550);
  assert.deepEqual(paid, { ok: true, card: { id: "giftCard-1", hint: "CD34" }, balanceAfter: 2450 });
  assert.deepEqual(reads[0], { fingerprints: ["fp:BEAUTASY-AB12-CD34", "fp:BEAUTASYAB12CD34"] });
  assert.equal(writes.length, 1);
  assert.deepEqual((writes[0][1] as { patch: unknown }).patch, { id: "giftCard-1", ifRevisionID: "rev-1", set: { balance: 2450 } });
});

test("more than the card holds is refused and nothing is written", async () => {
  const { desk, writes } = store(card({ balance: 1000 }));
  const paid = await redeem(desk, 4500);
  assert.ok(!paid.ok && paid.status === 409 && /На карте только £10\.00/.test(paid.error));
  assert.equal(writes.length, 0);
});

test("an expired or switched-off card is refused and nothing is written", async () => {
  for (const patch of [{ expiresAt: "2026-01-01T00:00:00Z" }, { active: false }]) {
    const { desk, writes } = store(card(patch));
    const paid = await redeem(desk, 500);
    assert.equal(paid.ok, false);
    assert.equal(writes.length, 0);
  }
});

test("a card changed between reading and writing is read again, and charged from what it holds now", async () => {
  // A shop order took £30 off while Kristina was saving
  const { desk, reads, writes } = store(card(), { conflicts: 1, changeTo: { balance: 1000 } });
  const small = await redeem(desk, 1550);
  assert.ok(!small.ok && /На карте только £10\.00/.test(small.error), "judged again on the fresh balance");
  assert.equal(reads.length, 2);
  assert.equal(writes.length, 0);

  const again = store(card(), { conflicts: 1, changeTo: { balance: 3000 } });
  const paid = await redeem(again.desk, 1550);
  assert.deepEqual(paid, { ok: true, card: { id: "giftCard-1", hint: "CD34" }, balanceAfter: 1450 });
  assert.deepEqual((again.writes[0][1] as { patch: unknown }).patch, {
    id: "giftCard-1",
    ifRevisionID: "rev-1+",
    set: { balance: 1450 },
  });
});

test("a second conflict is answered, not looped on, and nothing is written", async () => {
  const { desk, reads, writes } = store(card(), { conflicts: 2, changeTo: {} });
  const paid = await redeem(desk, 1550);
  assert.ok(!paid.ok && paid.status === 409 && /Ничего не списано/.test(paid.error));
  assert.equal(reads.length, 2);
  assert.equal(writes.length, 0);
});

test("any other failure is not mistaken for a conflict", async () => {
  const desk: CardDesk = {
    fetch: async <T,>() => card() as T,
    mutate: async () => {
      throw Object.assign(new Error("boom"), { statusCode: 500 });
    },
  };
  await assert.rejects(redeem(desk, 1550), /boom/);
});
