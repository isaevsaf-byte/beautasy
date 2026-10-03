import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { instantOf, localDateOf, slotDocumentId } from "@/lib/slots";
import { POST } from "./route";

/**
 * Kristina's hand on the diary, run whole: the Studio's request goes in, and
 * what comes out is read where it lands, in the documents. Source-level checks
 * of the same route live in src/sanity/diaryStudio.test.ts; these are the ones
 * a regex cannot make — what a booking by hand or a move actually holds.
 *
 * The database is a stand-in that answers every query through groq-js and
 * refuses an id already in use, as Sanity does; a transaction happens whole or
 * not at all. Sanity's "who is this?" and Resend are answered at the network.
 */

type Doc = { _id: string; _type: string; _rev?: string; [field: string]: unknown };

let docs: Map<string, Doc>;
let emails: { to: string; html: string; attachments?: { content: string }[] }[];
let ids = 0;
let ip = 0;

const realFetch = globalThis.fetch;
const client = sanityWriteClient as unknown as Record<string, unknown>;
const realClient = { ...client };
const realEnv = { ...process.env };

const conflict = () => Object.assign(new Error("Document already exists"), { statusCode: 409 });

function patchOf(id: string) {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  let rev: string | undefined;
  const chain = {
    ifRevisionId(r: string) {
      rev = r;
      return chain;
    },
    set(fields: Record<string, unknown>) {
      Object.assign(set, fields);
      return chain;
    },
    unset(fields: string[]) {
      unset.push(...fields);
      return chain;
    },
    apply() {
      const doc = docs.get(id);
      if (!doc) throw Object.assign(new Error("not found"), { statusCode: 404 });
      if (rev && doc._rev !== rev) throw conflict();
      for (const field of unset) delete doc[field];
      Object.assign(doc, set, { _rev: `rev${++ids}` });
      return doc;
    },
    async commit() {
      return chain.apply();
    },
  };
  return chain;
}

beforeEach(() => {
  docs = new Map();
  emails = [];
  process.env.SANITY_API_WRITE_TOKEN = "test-write-token";
  process.env.DATA_SECRET = "a passphrase for these tests only";
  process.env.RESEND_API_KEY = "re_test_key";

  client.fetch = async (query: string, params: Record<string, unknown> = {}) =>
    (await evaluate(parse(query), { dataset: [...docs.values()], params })).get();
  client.getDocument = async (id: string) => docs.get(id) ?? undefined;
  client.create = async (doc: Doc) => {
    if (docs.has(doc._id)) throw conflict();
    const written = { ...doc, _rev: `rev${++ids}` };
    docs.set(doc._id, written);
    return written;
  };
  client.delete = async (id: string) => {
    docs.delete(id);
  };
  client.patch = (id: string) => patchOf(id);
  client.transaction = () => {
    const steps: (() => void)[] = [];
    const tx = {
      create(doc: Doc) {
        steps.push(() => {
          if (docs.has(doc._id)) throw conflict();
          docs.set(doc._id, { ...doc, _rev: `rev${++ids}` });
        });
        return tx;
      },
      createOrReplace(doc: Doc) {
        steps.push(() => void docs.set(doc._id, { ...doc, _rev: `rev${++ids}` }));
        return tx;
      },
      patch(id: string, build: (p: ReturnType<typeof patchOf>) => ReturnType<typeof patchOf>) {
        const built = build(patchOf(id));
        steps.push(() => void built.apply());
        return tx;
      },
      delete(id: string) {
        steps.push(() => void docs.delete(id));
        return tx;
      },
      async commit() {
        const before = new Map([...docs].map(([id, doc]) => [id, { ...doc }]));
        try {
          for (const step of steps) step();
        } catch (error) {
          docs = before;
          throw error;
        }
        return {};
      },
    };
    return tx;
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.sanity.io/")) {
      return Response.json({ members: [{ id: "kristina", isCurrentUser: true, isRobot: false, role: "administrator" }] });
    }
    if (url.startsWith("https://api.resend.com/")) {
      emails.push(JSON.parse(String(init?.body)));
      return Response.json({ id: `email-${emails.length}` });
    }
    throw new Error(`A test reached the network: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  Object.assign(client, realClient);
  globalThis.fetch = realFetch;
  for (const key of ["SANITY_API_WRITE_TOKEN", "DATA_SECRET", "RESEND_API_KEY"]) {
    if (realEnv[key] === undefined) delete process.env[key];
    else process.env[key] = realEnv[key];
  }
});

/**
 * A day a week or so ahead, open from 9 to 5, with no notice needed and bank
 * holidays worked; Christmas and Boxing Day never open, so they are stepped over.
 */
function openDiary(): string {
  docs.set("atelierSchedule", {
    _id: "atelierSchedule",
    _type: "atelierSchedule",
    enabled: true,
    slotMinutes: 30,
    leadTimeHours: 0,
    horizonDays: 28,
    workBankHolidays: true,
    weekly: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => ({ day, from: "09:00", to: "17:00" })),
    closures: [],
  });
  let day = new Date(Date.now() + 7 * 86_400_000);
  while (["12-25", "12-26"].includes(localDateOf(day).slice(5))) day = new Date(day.getTime() + 86_400_000);
  return localDateOf(day);
}

/** A request from the Studio itself, with Kristina's session token. */
function studio(body: Record<string, unknown>): NextRequest {
  ip += 1;
  return new NextRequest("https://www.beautasy.co.uk/api/studio/diary", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://www.beautasy.co.uk",
      host: "www.beautasy.co.uk",
      "x-forwarded-for": `198.51.100.${ip}`,
    },
    body: JSON.stringify({ token: "skStudioSessionToken1234567890", ...body }),
  });
}

const holds = (id: string) => docs.get(id);

test("a bride booked by hand holds both her slots, and the half hour after her start is gone", async () => {
  const day = openDiary();
  const res = await POST(studio({ action: "book", slot: `${day}T14:00`, name: "Anna Smith", service: "Bridal fitting" }));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.equal((await res.json()).end, `${day}T15:00`);
  assert.equal(holds(slotDocumentId(`${day}T14:00`))?.slotEnd, `${day}T15:00`, "her second slot is still on offer online");

  const half = await POST(studio({ action: "book", slot: `${day}T14:30`, name: "Bea Jones", service: "Repairs" }));
  assert.equal(half.status, 409, "2:30pm was booked over the bride");
  assert.equal(docs.has(slotDocumentId(`${day}T14:30`)), false);
  // 3:00pm is free again
  assert.equal((await POST(studio({ action: "book", slot: `${day}T15:00`, name: "Bea Jones", service: "Repairs" }))).status, 200);
  assert.equal(holds(slotDocumentId(`${day}T15:00`))?.slotEnd, undefined, "a fitting of one slot held two");
});

test("a bride moved by half an hour keeps her whole hour", async () => {
  const day = openDiary();
  assert.equal((await POST(studio({ action: "book", slot: `${day}T14:00`, name: "Anna Smith", service: "Bridal fitting" }))).status, 200);
  const moved = await POST(studio({ action: "move", id: slotDocumentId(`${day}T14:00`), slot: `${day}T14:30` }));
  assert.equal(moved.status, 200, JSON.stringify(await moved.clone().json()));
  assert.equal((await moved.json()).end, `${day}T15:30`);
  assert.equal(docs.has(slotDocumentId(`${day}T14:00`)), false);
  assert.equal(holds(slotDocumentId(`${day}T14:30`))?.slotEnd, `${day}T15:30`, "her second slot was left behind");
  const after = await POST(studio({ action: "book", slot: `${day}T15:00`, name: "Bea Jones", service: "Repairs" }));
  assert.equal(after.status, 409, "3:00pm was booked over the bride");
});

test("a bride booked again after cancelling holds her whole hour again, and is told so", async () => {
  const day = openDiary();
  const id = slotDocumentId(`${day}T14:00`);
  const booked = await POST(
    studio({ action: "book", slot: `${day}T14:00`, name: "Anna Smith", email: "anna@example.com", service: "Bridal fitting" })
  );
  assert.equal(booked.status, 200);
  emails = [];
  // She cancels: the time is given back, the booking stays on its id
  Object.assign(docs.get(id)!, { status: "cancelled", notifiedStatus: "cancelled", _rev: "cancelled" });
  const again = await POST(studio({ action: "move", id, slot: `${day}T14:00` }));
  assert.equal(again.status, 200, JSON.stringify(await again.clone().json()));
  assert.equal((await again.json()).end, `${day}T15:00`);
  assert.equal(holds(id)?.status, "confirmed");
  assert.equal(holds(id)?.slotEnd, `${day}T15:00`, "booked again with half her hour");
  // Her email and her calendar say the hour too, not the first half of it
  const [told] = emails;
  assert.equal(told?.to, "anna@example.com");
  assert.match(told.html, /It takes about an hour\./);
  const invite = Buffer.from(told.attachments![0].content, "base64").toString("utf8");
  const end = instantOf(`${day}T15:00`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  assert.match(invite, new RegExp(`DTEND:${end}`));
  assert.equal((await POST(studio({ action: "book", slot: `${day}T14:30`, name: "Bea Jones", service: "Repairs" }))).status, 409);
});
