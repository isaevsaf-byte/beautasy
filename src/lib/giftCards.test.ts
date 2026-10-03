import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateGiftCardCode,
  normaliseCode,
  sanitiseAmount,
  redeemableAmount,
  reservationIsLive,
  deactivateCardForSession,
  MIN_AMOUNT,
  MAX_AMOUNT,
  type CardSwitch,
} from "./giftCards";

test("codes are unique, readable and free of look-alike characters", () => {
  const a = generateGiftCardCode();
  const b = generateGiftCardCode();
  assert.notEqual(a, b);
  assert.match(a, /^BEAUTASY-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(/[O0I1BS5]/.test(a.replace("BEAUTASY-", "")), false);
});

test("codes are matched however the customer types them", () => {
  assert.equal(normaliseCode(" beautasy-ab12-cd34 "), "BEAUTASY-AB12-CD34");
  assert.equal(normaliseCode("BEAUTASY AB12 CD34"), "BEAUTASYAB12CD34");
});

test("custom amounts round to whole pounds and stay in range", () => {
  assert.equal(sanitiseAmount(3750), 3800); // £37.50 → £38
  assert.equal(sanitiseAmount(MIN_AMOUNT), MIN_AMOUNT);
  assert.equal(sanitiseAmount(MAX_AMOUNT), MAX_AMOUNT);
  assert.equal(sanitiseAmount(MIN_AMOUNT - 100), null);
  assert.equal(sanitiseAmount(MAX_AMOUNT + 100), null);
  assert.equal(sanitiseAmount("nonsense"), null);
  assert.equal(sanitiseAmount(-5000), null);
});

test("a card larger than the order only spends what the order costs", () => {
  const card = { _id: "c", codeHint: "CD34", balance: 5000 };
  assert.equal(redeemableAmount(card, 2800), 2800);
});

test("a card smaller than the order spends all of itself", () => {
  const card = { _id: "c", codeHint: "CD34", balance: 2000 };
  assert.equal(redeemableAmount(card, 2800), 2000);
});

test("an empty card redeems nothing", () => {
  assert.equal(redeemableAmount({ _id: "c", codeHint: "CD34", balance: 0 }, 2800), 0);
});

const NOW = Date.parse("2026-09-03T12:00:00Z");

test("a card nobody is checking out with is free to use", () => {
  assert.equal(reservationIsLive({ _id: "c", codeHint: "CD34", balance: 5000 }, NOW), false);
});

test("a card held by an open checkout is not free", () => {
  const card = {
    _id: "c",
    codeHint: "CD34",
    balance: 5000,
    reservedSession: "cs_test_1",
    reservedAmount: 5000,
    reservedUntil: "2026-09-03T14:00:00Z",
  };
  assert.equal(reservationIsLive(card, NOW), true);
});

test("a hold outlives nothing: once the session has expired the card is free again", () => {
  const card = {
    _id: "c",
    codeHint: "CD34",
    balance: 5000,
    reservedSession: "cs_test_1",
    reservedAmount: 5000,
    reservedUntil: "2026-09-03T11:59:59Z",
  };
  assert.equal(reservationIsLive(card, NOW), false);
});

test("a hold with an unreadable date never blocks a customer", () => {
  const card = { _id: "c", codeHint: "CD34", balance: 5000, reservedSession: "cs_x", reservedUntil: "not a date" };
  assert.equal(reservationIsLive(card, NOW), false);
});

/* ─── A refunded card stops being money ─── */

function fakeCards(found: string | null) {
  const sets: { id: string; fields: Record<string, unknown> }[] = [];
  const client: CardSwitch = {
    fetch: async <T,>() => found as unknown as T,
    patch: (id: string) => ({
      set: (fields: Record<string, unknown>) => ({
        commit: async () => {
          sets.push({ id, fields });
          return {};
        },
      }),
    }),
  };
  return { client, sets };
}

test("a gift card whose payment came back in full is switched off", async () => {
  const { client, sets } = fakeCards("giftCard-cs_live_1");
  assert.equal(await deactivateCardForSession("cs_live_1", client), "giftCard-cs_live_1");
  assert.deepEqual(sets, [{ id: "giftCard-cs_live_1", fields: { active: false } }],
    "active: false is what checkout reads — the balance is left as it was, for Kristina to see");
});

test("a refund for something that was not a gift card touches nothing", async () => {
  const { client, sets } = fakeCards(null);
  assert.equal(await deactivateCardForSession("cs_live_2", client), null);
  assert.equal(sets.length, 0);
});

test("once the money is off a card, tidying up after it cannot read as 'not charged'", () => {
  const source = readFileSync(join(process.cwd(), "src", "lib", "giftCards.ts"), "utf8");
  const deduct = source.slice(source.indexOf("export async function deductFromCard"), source.indexOf("export interface CardSwitch"));
  const decAt = deduct.indexOf(".dec({ balance: spent })");
  const tryAt = deduct.indexOf("try {");
  assert.ok(decAt !== -1 && tryAt !== -1 && decAt < tryAt,
    "everything after the dec is inside a try: the webhook alerts hello@ on a throw, and a hand-made deduction on top of a real one is the money off twice");
});
