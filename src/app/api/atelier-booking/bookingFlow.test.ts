import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { emailFingerprint } from "@/lib/pii";
import { instantOf, localDateOf, slotDocumentId } from "@/lib/slots";
import { POST, priceFirstHtml } from "./route";

/**
 * The booking route, run whole: a request goes in, and what comes out is read
 * where it lands — the documents written, and the emails Resend was handed.
 *
 * The database is a stand-in that answers every query through groq-js, the
 * same GROQ engine Sanity runs, over the documents this file gives it; ids
 * already in use are refused with 409, as Sanity refuses them. Resend is
 * stood in for at the network: its SDK posts with the global `fetch`, so the
 * emails are caught exactly as they would leave.
 */

type Doc = { _id: string; _type: string; _rev?: string; [field: string]: unknown };

let docs: Map<string, Doc>;
let emails: { to: string; subject: string; html: string; attachments?: { content: string }[] }[];
let ids = 0;
let ip = 0;

const realFetch = globalThis.fetch;
const client = sanityWriteClient as unknown as Record<string, unknown>;
const realClient = { ...client };
const realEnv = { ...process.env };

function conflict(): Error {
  return Object.assign(new Error("Document already exists"), { statusCode: 409 });
}

function patcher(id: string) {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  const chain = {
    set(fields: Record<string, unknown>) {
      Object.assign(set, fields);
      return chain;
    },
    unset(fields: string[]) {
      unset.push(...fields);
      return chain;
    },
    ifRevisionId() {
      return chain;
    },
    async commit() {
      const doc = docs.get(id);
      if (!doc) throw Object.assign(new Error("not found"), { statusCode: 404 });
      for (const field of unset) delete doc[field];
      Object.assign(doc, set, { _rev: `rev${++ids}` });
      return doc;
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
  delete process.env.SANITY_API_READ_TOKEN;

  client.fetch = async (query: string, params: Record<string, unknown> = {}) => {
    const result = await evaluate(parse(query), { dataset: [...docs.values()], params });
    return result.get();
  };
  client.getDocument = async (id: string) => docs.get(id) ?? undefined;
  client.create = async (doc: Doc) => {
    const id = doc._id ?? `booking-${++ids}`;
    if (docs.has(id)) throw conflict();
    const written = { ...doc, _id: id, _rev: `rev${++ids}` };
    docs.set(id, written);
    return written;
  };
  client.delete = async (id: string) => {
    docs.delete(id);
  };
  client.patch = (id: string) => patcher(id);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("https://api.resend.com/")) throw new Error(`A test reached the network: ${url}`);
    emails.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: `email-${emails.length}` }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  Object.assign(client, realClient);
  globalThis.fetch = realFetch;
  for (const key of ["SANITY_API_WRITE_TOKEN", "DATA_SECRET", "RESEND_API_KEY", "SANITY_API_READ_TOKEN"]) {
    if (realEnv[key] === undefined) delete process.env[key];
    else process.env[key] = realEnv[key];
  }
});

/**
 * A day a week or so ahead, open from 9 to 5 every day, with no notice
 * needed — whatever day the tests run on. Bank holidays are worked so none
 * gets in the way; Christmas and Boxing Day never open, so they are stepped over.
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

function request(body: Record<string, unknown>): NextRequest {
  ip += 1;
  return new NextRequest("https://www.beautasy.co.uk/api/atelier-booking", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${ip}` },
    body: JSON.stringify(body),
  });
}

const ANNA = { name: "Anna Smith", email: "anna@example.com", phone: "07700 900123", notes: "Lace hem" };

const bookings = () => [...docs.values()].filter((doc) => doc._type === "atelierBooking");

/* ─── A bride's two slots ─── */

test("a bride who books online holds both slots, is told it takes about an hour, and Kristina sees the whole hour", async () => {
  const day = openDiary();
  const res = await POST(request({ ...ANNA, service: "Wedding Dress Alterations", slot: `${day}T14:00` }));
  assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));

  const [held] = bookings();
  assert.equal(held._id, slotDocumentId(`${day}T14:00`), "the first slot's id is what stops a second taker");
  assert.equal(held.slotStart, `${day}T14:00`);
  assert.equal(held.slotEnd, `${day}T15:00`, "her second slot is not held");
  assert.match(String(held.confirmedFor), /at 2:00pm$/, "she is expected at the start");

  const [toKristina, toBride] = emails;
  assert.match(toKristina.html, /<strong>Booked for:<\/strong> [^<]*between 2:00pm and 3:00pm/);
  assert.match(toBride.html, /It takes about an hour\./);
  const invite = Buffer.from(toBride.attachments![0].content, "base64").toString("utf8");
  const start = instantOf(`${day}T14:00`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = instantOf(`${day}T15:00`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  assert.match(invite, new RegExp(`DTSTART:${start}`));
  assert.match(invite, new RegExp(`DTEND:${end}`), "the invite ends after her first half hour");
});

test("a bride cannot take a time whose second slot somebody holds, and nothing is written", async () => {
  const day = openDiary();
  docs.set(slotDocumentId(`${day}T14:30`), {
    _id: slotDocumentId(`${day}T14:30`),
    _type: "atelierBooking",
    status: "confirmed",
    slotStart: `${day}T14:30`,
    service: "Repairs",
  });
  const res = await POST(request({ ...ANNA, service: "Bridal fitting", slot: `${day}T14:00` }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).slotTaken, true);
  assert.equal(bookings().length, 1, "a second booking was written");
  assert.equal(emails.length, 0);

  // Somebody else's fitting of one slot still fits at 2:00pm
  const single = await POST(request({ ...ANNA, email: "bea@example.com", service: "Alterations", slot: `${day}T14:00` }));
  assert.equal(single.status, 201);
  assert.equal(docs.get(slotDocumentId(`${day}T14:00`))?.slotEnd, undefined, "a fitting of one slot held two");
});

test("the length comes from the service, never from what the form says", async () => {
  const day = openDiary();
  const res = await POST(
    request({ ...ANNA, service: "Alterations", slot: `${day}T10:00`, slotEnd: `${day}T13:00`, minutes: 180 })
  );
  assert.equal(res.status, 201);
  assert.equal(docs.get(slotDocumentId(`${day}T10:00`))?.slotEnd, undefined);
  assert.equal(emailFingerprint(ANNA.email), docs.get(slotDocumentId(`${day}T10:00`))?.emailFingerprint);
});

/* ─── Abuse of the form ─── */

test("a request with the hidden field filled in is thanked, and nothing is saved or sent", async () => {
  const day = openDiary();
  const res = await POST(request({ ...ANNA, service: "Alterations", slot: `${day}T10:00`, website: "http://spam.example" }));
  assert.equal(res.status, 201, "a bot told it failed tries again");
  assert.equal((await res.json()).ok, true);
  assert.equal(bookings().length, 0);
  assert.equal(emails.length, 0);
});

test("a field too long, or a service the form never offers, is refused with the reason, before anything is written", async () => {
  openDiary();
  for (const [body, said] of [
    [{ ...ANNA, service: "Alterations", notes: "x".repeat(2001) }, /under 2,000 characters/],
    [{ ...ANNA, service: "Alterations", name: "A".repeat(81) }, /80 characters/],
    [{ ...ANNA, service: "Alterations", phone: "1".repeat(31) }, /phone number is too long/],
    [{ ...ANNA, service: "Viagra" }, /choose a service from the list/],
  ] as const) {
    const res = await POST(request(body));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, said);
  }
  assert.equal(bookings().length, 0);
  assert.equal(emails.length, 0);
});

test("the landing pages' services and the old 'not sure' still book", async () => {
  openDiary();
  for (const service of ["Prom and Evening Dress Alterations", "Other / Not Sure", "Not sure — free 10-minute look"]) {
    const res = await POST(request({ ...ANNA, email: `${service.length}@example.com`, service }));
    assert.equal(res.status, 201, service);
  }
  assert.equal(bookings().length, 3);
});

test("one address holds at most two times ahead; the third is asked to message instead", async () => {
  const day = openDiary();
  for (const time of ["10:00", "11:00"]) {
    assert.equal((await POST(request({ ...ANNA, service: "Alterations", slot: `${day}T${time}` }))).status, 201);
  }
  const sent = emails.length;
  const third = await POST(request({ ...ANNA, email: "ANNA@example.com ", service: "Repairs", slot: `${day}T12:00` }));
  assert.equal(third.status, 409);
  assert.match((await third.json()).error, /already have two appointments booked/);
  assert.equal(bookings().length, 2, "the third time was taken");
  assert.equal(emails.length, sent);

  // A request with no time holds nothing, so it still goes through
  assert.equal((await POST(request({ ...ANNA, service: "Repairs" }))).status, 201);
  // Somebody else is not counted against her
  assert.equal((await POST(request({ ...ANNA, email: "bea@example.com", service: "Repairs", slot: `${day}T12:00` }))).status, 201);
});

test("a cancelled time, or one already past, does not count against the next booking", async () => {
  const day = openDiary();
  const fingerprint = emailFingerprint(ANNA.email);
  docs.set("slot-2026-01-05-1000", {
    _id: "slot-2026-01-05-1000",
    _type: "atelierBooking",
    status: "completed",
    slotStart: "2026-01-05T10:00",
    emailFingerprint: fingerprint,
  });
  docs.set(slotDocumentId(`${day}T09:00`), {
    _id: slotDocumentId(`${day}T09:00`),
    _type: "atelierBooking",
    status: "cancelled",
    slotStart: `${day}T09:00`,
    emailFingerprint: fingerprint,
  });
  assert.equal((await POST(request({ ...ANNA, service: "Alterations", slot: `${day}T10:00` }))).status, 201);
  assert.equal((await POST(request({ ...ANNA, service: "Alterations", slot: `${day}T11:00` }))).status, 201);
});

/* ─── The same request, sent again ─── */

test("a booking sent again after its answer was lost gets the same answer, and no second booking or email", async () => {
  const day = openDiary();
  const first = await POST(request({ ...ANNA, service: "Alterations", slot: `${day}T10:00` }));
  assert.equal(first.status, 201);
  const firstAnswer = await first.json();
  assert.equal(emails.length, 2);

  const again = await POST(request({ ...ANNA, email: " Anna@Example.com", service: "Alterations", slot: `${day}T10:00` }));
  assert.equal(again.status, 201, "told their own time had just been taken");
  const answer = await again.json();
  assert.equal(answer.ok, true);
  assert.equal(answer.confirmedFor, firstAnswer.confirmedFor);
  assert.equal(bookings().length, 1);
  assert.equal(emails.length, 2, "a second confirmation went out");

  // Somebody else reaching for the same time is still told it has gone
  const other = await POST(request({ ...ANNA, email: "bea@example.com", service: "Alterations", slot: `${day}T10:00` }));
  assert.equal(other.status, 409);
  assert.equal((await other.json()).slotTaken, true);
});

test("pressed twice at once, one booking is made and both presses hear it went through", async () => {
  const day = openDiary();
  const body = { ...ANNA, service: "Bridal fitting", slot: `${day}T14:00` };
  const answers = await Promise.all([POST(request(body)), POST(request(body))]);
  assert.deepEqual(answers.map((res) => res.status), [201, 201]);
  assert.equal(bookings().length, 1);
  assert.equal(emails.length, 2, "one email to Kristina and one confirmation");
});

test("a request with no time sent again within fifteen minutes is the same request; after that it is a new one", async () => {
  openDiary();
  const body = { ...ANNA, service: "Repairs", preferredDate: "2026-11-02" };
  assert.equal((await POST(request(body))).status, 201);
  const again = await POST(request(body));
  assert.equal(again.status, 201);
  assert.deepEqual(await again.json(), { ok: true, emailed: true });
  assert.equal(bookings().length, 1);
  assert.equal(emails.length, 2);

  // Another service is another request
  assert.equal((await POST(request({ ...body, service: "Alterations" }))).status, 201);
  assert.equal(bookings().length, 2);

  // Sixteen minutes on, the same words are a new request
  for (const doc of bookings()) doc.createdAt = new Date(Date.now() - 16 * 60_000).toISOString();
  assert.equal((await POST(request(body))).status, 201);
  assert.equal(bookings().length, 3);
});

/* ─── Not sure yet ─── */

test("somebody not sure yet is written to about a free 10-minute look, never 'not sure — free 10-minute look'", async () => {
  const day = openDiary();
  assert.equal((await POST(request({ ...ANNA, service: "Not sure — free 10-minute look", slot: `${day}T10:00` }))).status, 201);
  const confirmation = emails.find((email) => email.to === ANNA.email)!;
  assert.match(confirmation.html, /your appointment for free 10-minute look is confirmed/);
  const invite = Buffer.from(confirmation.attachments![0].content, "base64").toString("utf8");
  assert.match(invite.replace(/\r\n /g, ""), /Your free 10-minute look with Kristina/);

  emails = [];
  assert.equal(
    (await POST(request({ ...ANNA, email: "bea@example.com", phone: "07700 900456", service: "Not sure — free 10-minute look" }))).status,
    201
  );
  const toKristina = emails.find((email) => email.to !== "bea@example.com")!;
  const opener = [...toKristina.html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) =>
    new URL(m[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&")).searchParams.get("text")
  );
  assert.ok(opener.includes("Hi Anna, it's Kristina from Beautasy, about your free 10-minute look request: "), String(opener));
  // The name as a label — "Service: Not sure — free 10-minute look" — is fine; lower-cased mid-sentence it is not
  for (const email of [confirmation, ...emails]) {
    assert.doesNotMatch(email.html, /not sure — free/);
    assert.doesNotMatch(decodeURIComponent(email.html), /not sure — free/);
  }
});

/* ─── A price first ─── */

/** Every wa.me link in some HTML, read the way a browser reads the attribute. */
const whatsappTexts = (html: string) =>
  [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) =>
    new URL(m[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&")).searchParams.get("text")
  );

test("a request is answered with a way to get a price first, and a booked time is not", async () => {
  const day = openDiary();
  assert.equal((await POST(request({ ...ANNA, service: "Repairs", preferredDate: "2026-11-02" }))).status, 201);
  const received = emails.find((email) => email.to === ANNA.email)!;
  assert.match(received.subject, /received your Beautasy atelier booking request/);
  assert.match(received.html, /Want a price first\? <a href="https:\/\/wa\.me\/447729741116\?text=[^"]+"[^>]*>Send Kristina a photo on WhatsApp<\/a>\./);
  assert.ok(
    whatsappTexts(received.html).includes("Hi Kristina, it's Anna. I've just sent a booking request (Repairs). Here's a photo for a price: ")
  );
  assert.doesNotMatch(received.html, /free|£|pay/i, "nothing about what a fitting costs or how it is paid");

  emails = [];
  assert.equal((await POST(request({ ...ANNA, email: "bea@example.com", service: "Alterations", slot: `${day}T10:00` }))).status, 201);
  const confirmed = emails.find((email) => email.to === "bea@example.com")!;
  assert.doesNotMatch(confirmed.html, /Want a price first/, "a confirmed time is not a request");
});

test("whatever the customer typed stays text in that line", () => {
  const html = priceFirstHtml(`<img src=x onerror=alert(1)> Smith`, "Repairs");
  assert.doesNotMatch(html, /<img/);
  assert.equal(whatsappTexts(html)[0], "Hi Kristina, it's <img. I've just sent a booking request (Repairs). Here's a photo for a price: ");
});
