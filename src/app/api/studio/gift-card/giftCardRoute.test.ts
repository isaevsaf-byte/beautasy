import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { fingerprint, unseal } from "@/lib/secrets";
import { POST as check } from "./route";
import { POST as ledger } from "../ledger/route";

/**
 * A gift card at the atelier, through the real routes against a stubbed
 * Sanity (12.10.2026): who may ask, what a check answers, and that a card
 * payment is one transaction — the sealed line and the card's new balance
 * against the revision read — with the money back on the card when the line
 * is deleted. The rules themselves are in src/lib/atelierGiftCard.test.ts.
 */

const TOKEN = "studio-session-token-0123456789";
const CODE = "BEAUTASY-AB12-CD34";

interface Card {
  _id: string;
  _rev: string;
  _type: "giftCard";
  codeFingerprint: string;
  codeHint: string;
  balance: number;
  active: boolean;
  expiresAt: string;
}

/** A Sanity holding one card (and whatever ledger lines are written), membership answered */
function world(t: TestContext, { member = true, balance = 4000 }: { member?: boolean; balance?: number } = {}) {
  process.env.SANITY_API_WRITE_TOKEN = "write-token";
  process.env.DATA_SECRET = "test-secret";
  t.after(() => {
    delete process.env.SANITY_API_WRITE_TOKEN;
    delete process.env.DATA_SECRET;
  });
  t.mock.method(console, "error", () => {});
  const card: Card = {
    _id: "giftCard-1",
    _rev: "rev-1",
    _type: "giftCard",
    codeFingerprint: fingerprint(CODE),
    codeHint: "CD34",
    balance,
    active: true,
    expiresAt: "2099-01-01T00:00:00Z",
  };
  const docs = new Map<string, Record<string, unknown>>([[card._id, card as unknown as Record<string, unknown>]]);
  const transactions: unknown[][] = [];
  const asked: string[] = [];

  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.sanity.io/")) {
      return Response.json({
        members: [{ id: "kristina", isCurrentUser: true, isRobot: false, role: member ? "administrator" : "viewer" }],
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  t.mock.method(sanityWriteClient, "fetch", async (query: string, params: Record<string, unknown>) => {
    asked.push(query);
    if (query.includes("codeFingerprint in $fingerprints")) {
      const wanted = params.fingerprints as string[];
      return [...docs.values()].find((doc) => wanted.includes(doc.codeFingerprint as string)) ?? null;
    }
    if (query.includes("_id == $id")) {
      const doc = docs.get(params.id as string);
      if (!doc) return null;
      return query.includes("][0]._id") ? doc._id : doc;
    }
    return null;
  });
  // A plain create, delete or patch commit is one mutation; a card payment is a list
  t.mock.method(sanityWriteClient, "create", async (doc: Record<string, unknown>) => {
    docs.set(doc._id as string, doc);
    return doc;
  });
  t.mock.method(sanityWriteClient, "delete", async (id: string) => {
    docs.delete(id);
    return {};
  });
  t.mock.method(sanityWriteClient, "mutate", async (sent: unknown) => {
    const mutations = (Array.isArray(sent) ? sent : [sent]) as Record<string, Record<string, unknown>>[];
    for (const mutation of mutations) {
      const patch = mutation.patch;
      if (patch) {
        const doc = docs.get(patch.id as string);
        if (!doc) throw Object.assign(new Error("not found"), { statusCode: 404 });
        if (patch.ifRevisionID && patch.ifRevisionID !== doc._rev) {
          throw Object.assign(new Error("Document has been modified"), { statusCode: 409 });
        }
      }
    }
    transactions.push(mutations);
    for (const mutation of mutations) {
      if (mutation.create) docs.set(mutation.create._id as string, mutation.create);
      if (mutation.delete) docs.delete(mutation.delete.id as string);
      if (mutation.patch) {
        const doc = docs.get(mutation.patch.id as string) as Record<string, unknown>;
        const set = mutation.patch.set as Record<string, unknown> | undefined;
        const inc = mutation.patch.inc as Record<string, number> | undefined;
        if (set) Object.assign(doc, set);
        if (inc) for (const [field, by] of Object.entries(inc)) doc[field] = (doc[field] as number) + by;
        doc._rev = `${doc._rev}+`;
      }
    }
    return {};
  });
  return { card, docs, transactions, asked };
}

let ip = 0;
const call = (route: (req: NextRequest) => Promise<Response>, path: string, body: Record<string, unknown>, origin = "https://www.beautasy.co.uk") =>
  route(
    new NextRequest(`https://www.beautasy.co.uk${path}`, {
      method: "POST",
      headers: { origin, host: "www.beautasy.co.uk", "x-forwarded-for": `10.1.0.${++ip}` },
      body: JSON.stringify({ token: TOKEN, ...body }),
    })
  );
const ask = (code: string) => call(check, "/api/studio/gift-card", { code });
const pay = (body: Record<string, unknown>) => call(ledger, "/api/studio/ledger", body);
const paidByCard = (amount: string) => ({
  action: "add",
  entry: { kind: "income", amount, date: "2026-10-01", method: "giftcard", category: "atelier", who: "Emily" },
  giftCardCode: "beautasy ab12 cd34",
});

test("a card is checked only for a member of the project, from the Studio", async (t) => {
  const { asked } = world(t, { member: false });
  assert.equal((await ask(CODE)).status, 401);
  assert.equal(asked.length, 0, "the card is not looked up for a viewer");
  assert.equal((await call(check, "/api/studio/gift-card", { code: CODE }, "https://evil.example")).status, 403);
});

test("a check answers what is on the card — never its code — however the code was typed", async (t) => {
  world(t);
  const res = await ask("beautasy ab12 cd34");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { card: { hint: "CD34", balance: 4000, available: 4000 } });
  const missing = await ask("BEAUTASY-ZZZZ-ZZZZ");
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /Карты с таким кодом нет/);
});

test("guessing codes runs into the limit quickly", async (t) => {
  world(t);
  const from = (n: number) =>
    check(
      new NextRequest("https://www.beautasy.co.uk/api/studio/gift-card", {
        method: "POST",
        headers: { origin: "https://www.beautasy.co.uk", host: "www.beautasy.co.uk", "x-forwarded-for": "10.9.9.9" },
        body: JSON.stringify({ token: TOKEN, code: `BEAUTASY-AAAA-${String(n).padStart(4, "A")}` }),
      })
    );
  const statuses: number[] = [];
  for (let n = 0; n < 31; n++) statuses.push((await from(n)).status);
  assert.equal(statuses.at(-1), 429);
  assert.ok(statuses.slice(0, 30).every((status) => status !== 429));
});

test("a card payment is one write: the sealed line naming the card, and the balance against the revision read", async (t) => {
  const { docs, transactions } = world(t);
  const res = await pay(paidByCard("15.50"));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const body = await res.json();
  assert.deepEqual(body.card, { hint: "CD34", balance: 2450 });
  assert.deepEqual(body.entry.giftCard, { id: "giftCard-1", hint: "CD34" });

  assert.equal(transactions.length, 1);
  const [create, patch] = transactions[0] as Record<string, Record<string, unknown>>[];
  assert.deepEqual(patch, { patch: { id: "giftCard-1", ifRevisionID: "rev-1", set: { balance: 2450 } } });
  const line = create.create;
  assert.equal(line._type, "ledgerEntry");
  assert.doesNotMatch(JSON.stringify({ ...line, sealed: "" }), /CD34|giftCard-1|1550|Emily/, "nothing about the payment in the clear");
  assert.match(unseal(line.sealed as string) ?? "", /"method":"giftcard".*"giftCard":\{"id":"giftCard-1","hint":"CD34"\}/);
  assert.equal(docs.get("giftCard-1")?.balance, 2450);
});

test("a card payment without a code, or above the balance, is refused and writes nothing", async (t) => {
  const { transactions } = world(t, { balance: 1000 });
  const noCode = await pay({ ...paidByCard("5"), giftCardCode: "" });
  assert.equal(noCode.status, 400);
  assert.match((await noCode.json()).error, /Напишите код подарочной карты/);
  const tooMuch = await pay(paidByCard("45"));
  assert.equal(tooMuch.status, 409);
  assert.match((await tooMuch.json()).error, /На карте только £10\.00\. Запишите здесь £10\.00, а остальные £35\.00 — второй оплатой/);
  assert.equal(transactions.length, 0);
});

test("a card charged elsewhere while saving is read again and charged from what is on it now", async (t) => {
  const { docs, transactions } = world(t);
  // The first write meets a card a shop order has just changed
  const real = sanityWriteClient.mutate;
  let first = true;
  t.mock.method(sanityWriteClient, "mutate", async (...args: Parameters<typeof real>) => {
    if (first) {
      first = false;
      Object.assign(docs.get("giftCard-1") as Record<string, unknown>, { balance: 3000, _rev: "rev-2" });
    }
    return (real as (...a: unknown[]) => Promise<unknown>)(...args);
  });
  const res = await pay(paidByCard("15.50"));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.deepEqual((await res.json()).card, { hint: "CD34", balance: 1450 });
  assert.equal(transactions.length, 1, "the refused attempt wrote nothing");
  assert.equal(docs.get("giftCard-1")?.balance, 1450);
});

test("a card payment's amount cannot be corrected; deleting it puts the money back on the card", async (t) => {
  const { docs, transactions } = world(t);
  const saved = await (await pay(paidByCard("15.50"))).json();
  const id = saved.entry.id as string;

  const change = await pay({ action: "update", id, entry: { ...paidByCard("20").entry } });
  assert.equal(change.status, 400);
  assert.match((await change.json()).error, /уже списана с карты …CD34/);
  const noteOnly = await pay({ action: "update", id, entry: { ...paidByCard("15.50").entry, note: "hem" } });
  assert.equal(noteOnly.status, 200, "the date, the note and who paid can still be put right");

  const removed = await pay({ action: "remove", id });
  assert.equal(removed.status, 200);
  assert.deepEqual((await removed.json()).returned, { hint: "CD34", amount: 1550 });
  assert.deepEqual(transactions.at(-1), [{ delete: { id } }, { patch: { id: "giftCard-1", inc: { balance: 1550 } } }]);
  assert.equal(docs.get("giftCard-1")?.balance, 4000);
  assert.equal(docs.has(id), false);
});

test("a cash line cannot be turned into a card payment by a correction", async (t) => {
  world(t);
  const cash = await (await pay({ action: "add", entry: { ...paidByCard("15.50").entry, method: "cash" } })).json();
  const res = await pay({ action: "update", id: cash.entry.id, entry: paidByCard("15.50").entry });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /запишите новой строкой/);
});
