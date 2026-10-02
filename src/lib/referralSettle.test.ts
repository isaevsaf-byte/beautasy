import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { SETTLE_QUERY, settleBooking, settleOneBooking, settleReferredBookings, type SettleDeps } from "./referralSettle";
import type { RewardInput, RewardOutcome } from "./referrals";

/**
 * A recommended client's work marked done credits whoever sent her — once —
 * including the salon client who wrote on WhatsApp and never gave an email.
 *
 * The query is run, not read: groq-js is Sanity's own evaluator. Each case
 * asks the one question that decides money — is this booking settled now,
 * later, or never — in both directions.
 */

async function waiting(documents: Record<string, unknown>[]): Promise<string[]> {
  const answer = await evaluate(parse(SETTLE_QUERY.replace("$limit", "50")), { dataset: documents });
  return ((await answer.get()) as Array<{ _id: string }>).map((row) => row._id);
}

function booking(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "slot-2026-10-06-1400",
    _type: "atelierBooking",
    status: "completed",
    referrer: { _ref: "referrer-partner-onyx-bridal" },
    displayName: "Sarah",
    createdAt: "2026-10-01T09:00:00Z",
    ...over,
  };
}

test("a salon's client with no email is settled as soon as her work is done", async () => {
  assert.deepEqual(await waiting([booking()]), ["slot-2026-10-06-1400"]);
});

test("a client with an email is settled after her thank-you, so she hears first", async () => {
  assert.deepEqual(await waiting([booking({ emailSealed: "v1.x", notifiedStatus: "confirmed" })]), [], "not yet thanked");
  assert.deepEqual(await waiting([booking({ emailSealed: "v1.x", notifiedStatus: "completed" })]), ["slot-2026-10-06-1400"]);
});

test("nothing is settled twice, early, or for nobody", async () => {
  assert.deepEqual(await waiting([booking({ referralSettledAt: "2026-10-07T09:00:00Z" })]), [], "already settled");
  assert.deepEqual(await waiting([booking({ status: "confirmed" })]), [], "the work is not done");
  assert.deepEqual(await waiting([booking({ referrer: undefined })]), [], "nobody sent her");
  assert.deepEqual(await waiting([booking({ releasedAt: "2026-10-05T09:00:00Z" })]), [], "a copy kept when her time went to someone else");
  assert.deepEqual(await waiting([booking({ _id: "drafts.slot-2026-10-06-1400" })]), [], "a draft is not a booking");
  assert.deepEqual(await waiting([booking({ _type: "order" })]), []);
});

/* ─── Settling one ─── */

interface Fake {
  deps: SettleDeps;
  rewards: RewardInput[];
  patches: Array<{ id: string; fields: Record<string, unknown> }>;
}

function fake(outcome: RewardOutcome | Error, options: { eventOutcome?: string; patchFails?: boolean; rows?: unknown[] } = {}): Fake {
  const rewards: RewardInput[] = [];
  const patches: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const deps: SettleDeps = {
    configured: () => true,
    now: () => "2026-10-07T09:00:00.000Z",
    reward: async (input) => {
      rewards.push(input);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    client: {
      fetch: async <T>(query: string): Promise<T> => {
        if (query.includes("{ outcome }")) return (options.eventOutcome ? { outcome: options.eventOutcome } : null) as T;
        return (options.rows ?? []) as T;
      },
      patch: (id: string) => ({
        set: (fields: Record<string, unknown>) => ({
          commit: async () => {
            if (options.patchFails) throw new Error("Sanity is down");
            patches.push({ id, fields });
          },
        }),
      }),
    },
  };
  return { deps, rewards, patches };
}

const ROW = { _id: "slot-2026-10-06-1400", referrer: { _ref: "referrer-partner-onyx-bridal" }, displayName: "Sarah", createdAt: "2026-10-01T09:00:00Z", referralDiscount: 500 };

test("the partner is rewarded for the booking, then the booking is marked so it is not asked about again", async () => {
  const f = fake("ok");
  assert.equal(await settleBooking(ROW, f.deps), "rewarded", "in the words the booking's field offers");
  assert.equal(f.rewards.length, 1);
  assert.deepEqual(
    { kind: f.rewards[0].kind, referrerId: f.rewards[0].referrerId, sourceId: f.rewards[0].sourceId, discount: f.rewards[0].discount, createdAt: f.rewards[0].createdAt },
    { kind: "booking", referrerId: "referrer-partner-onyx-bridal", sourceId: "slot-2026-10-06-1400", discount: 500, createdAt: "2026-10-01T09:00:00Z" }
  );
  assert.equal(f.rewards[0].friend.email, null, "no email: the credit does not wait for one");
  assert.deepEqual(f.patches, [{ id: "slot-2026-10-06-1400", fields: { referralSettledAt: "2026-10-07T09:00:00.000Z", referralOutcome: "rewarded" } }]);
});

test("when the thank-you path got there first, the booking takes what was decided then", async () => {
  const f = fake("duplicate", { eventOutcome: "repeat" });
  assert.equal(await settleBooking(ROW, f.deps), "repeat");
  assert.equal(f.patches[0].fields.referralOutcome, "repeat");
  // Decided but unreadable just now: nothing is marked, the next run reads it
  const unread = fake("duplicate");
  assert.equal(await settleBooking(ROW, unread.deps), null);
  assert.deepEqual(unread.patches, []);
});

test("every outcome written onto a booking is one its field offers, so the Studio can still publish it", async () => {
  const { readFileSync } = await import("node:fs");
  const schema = readFileSync("src/sanity/schemaTypes/atelierBooking.ts", "utf8");
  const field = schema.slice(schema.indexOf('name: "referralOutcome"'), schema.indexOf("referralSettledAt"));
  const offered = [...field.matchAll(/value: "([a-z]+)"/g)].map((m) => m[1]);
  const outcomes: RewardOutcome[] = ["ok", "disabled", "inactive", "self", "repeat", "capped", "missing", "failed"];
  for (const outcome of outcomes) {
    const f = fake(outcome);
    const written = await settleBooking(ROW, f.deps);
    assert.ok(written && offered.includes(written), `"${written}" is not in the field's list`);
  }
  for (const eventOutcome of ["rewarded", "pending", "reversed", "self", "repeat", "capped", "inactive", "disabled"]) {
    const f = fake("duplicate", { eventOutcome });
    assert.ok(offered.includes(String(await settleBooking(ROW, f.deps))), eventOutcome);
  }
});

test("with the keys missing, or Sanity failing, nothing is marked and the next run asks again", async () => {
  const unconfigured = fake("unconfigured");
  assert.equal(await settleBooking(ROW, unconfigured.deps), null);
  assert.deepEqual(unconfigured.patches, []);

  const failing = fake(new Error("timeout"));
  assert.equal(await settleBooking(ROW, failing.deps), null);
  assert.deepEqual(failing.patches, []);
});

test("a reward paid but not marked is still a reward: the event is the lock, the mark only stops the asking", async () => {
  const f = fake("ok", { patchFails: true });
  assert.equal(await settleBooking(ROW, f.deps), "rewarded");
});

test("the morning job settles everything waiting, and does nothing at all without its keys", async () => {
  const f = fake("ok", { rows: [ROW, { ...ROW, _id: "slot-2026-10-07-1000" }] });
  assert.deepEqual(await settleReferredBookings(25, f.deps), { checked: 2, settled: 2 });
  const off = fake("ok", { rows: [ROW] });
  off.deps.configured = () => false;
  assert.deepEqual(await settleReferredBookings(25, off.deps), { checked: 0, settled: 0 });
  assert.equal(off.rewards.length, 0);
  const none = fake("ok", { rows: [] });
  assert.equal(await settleOneBooking("slot-x", none.deps), null, "not due, nothing done");
});
