import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import {
  FIELD_LIMITS,
  FUTURE_HOLDS_QUERY,
  REPEAT_REQUEST_QUERY,
  acceptedService,
  filledHoneypot,
  heldBySameCustomer,
  postcodeFits,
  readBookingFields,
  sameAnswerAgain,
} from "./bookingRequest";
import { LOCAL_SERVICES } from "./localServices";

/**
 * What the public booking route takes from anyone, and how it tells the same
 * customer asking twice from somebody new. The route itself is run whole in
 * src/app/api/atelier-booking/bookingFlow.test.ts.
 */

const GOOD = { name: "Anna Smith", email: "anna@example.com", phone: "07700 900123", service: "Alterations", notes: "Hem" };

function refusal(body: Record<string, unknown>): string | null {
  const read = readBookingFields(body);
  return read.ok ? null : read.error;
}

test("a request the form would send is taken, trimmed", () => {
  const read = readBookingFields({ ...GOOD, name: "  Anna Smith ", email: " anna@example.com " });
  assert.ok(read.ok);
  assert.equal(read.fields.name, "Anna Smith");
  assert.equal(read.fields.email, "anna@example.com");
  assert.equal(read.fields.phone, "07700 900123");
});

test("every field has a length a person would not reach, and is told which one they did", () => {
  assert.equal(refusal({ ...GOOD, name: "A".repeat(FIELD_LIMITS.name) }), null);
  assert.match(refusal({ ...GOOD, name: "A".repeat(81) }) ?? "", /shorten your name to 80 characters/);

  const longest = `${"a".repeat(64)}@${"b".repeat(185)}.com`;
  assert.equal(longest.length, 254);
  assert.equal(refusal({ ...GOOD, email: longest }), null);
  assert.match(refusal({ ...GOOD, email: `a${longest}` }) ?? "", /email address is too long/);

  assert.equal(refusal({ ...GOOD, phone: "0".repeat(30) }), null);
  assert.match(refusal({ ...GOOD, phone: "0".repeat(31) }) ?? "", /phone number is too long/);

  assert.equal(refusal({ ...GOOD, notes: "x".repeat(2000) }), null);
  assert.match(refusal({ ...GOOD, notes: "x".repeat(2001) }) ?? "", /under 2,000 characters, and send Kristina the rest on WhatsApp/);

  assert.match(refusal({ ...GOOD, preferredDate: "x".repeat(41) }) ?? "", /preferred date from the calendar/);
});

test("the old messages for a missing name, email or service still stand", () => {
  assert.equal(refusal({ ...GOOD, name: " A " }), "Please enter your name");
  assert.equal(refusal({ ...GOOD, email: "anna" }), "Please enter a valid email");
  assert.equal(refusal({ ...GOOD, email: 42 }), "Please enter a valid email");
  assert.equal(refusal({ ...GOOD, service: "" }), "Please select a service");
});

test("a service is one the form, a landing page or an older page could send — nothing made up", () => {
  for (const service of ["Alterations", "Bridal fitting", "Not sure — free 10-minute look", "Other / Not Sure"]) {
    assert.ok(acceptedService(service), service);
  }
  for (const page of LOCAL_SERVICES) assert.ok(acceptedService(page.serviceName), page.serviceName);
  for (const service of ["Buy cheap followers", "alterations", " Alterations", "<b>Repairs</b>", 7, null]) {
    assert.equal(acceptedService(service), false, String(service));
  }
  assert.equal(refusal({ ...GOOD, service: "Buy cheap followers" }), "Please choose a service from the list.");
});

test("what is not text is not a field, and a friend code too long to be one is no code", () => {
  const read = readBookingFields({ ...GOOD, phone: { evil: true }, notes: ["x"], referralCode: "X".repeat(41) });
  assert.ok(read.ok);
  assert.equal(read.fields.phone, undefined);
  assert.equal(read.fields.notes, undefined);
  assert.equal(read.fields.referralCode, undefined);
  const coded = readBookingFields({ ...GOOD, referralCode: "ANNA-K7P2" });
  assert.ok(coded.ok);
  assert.equal(coded.fields.referralCode, "ANNA-K7P2");
});

test("only the hidden field filled in marks a bot", () => {
  assert.equal(filledHoneypot({ ...GOOD, website: "http://spam.example" }), true);
  assert.equal(filledHoneypot({ ...GOOD, website: "" }), false);
  assert.equal(filledHoneypot({ ...GOOD, website: "   " }), false);
  assert.equal(filledHoneypot({ ...GOOD }), false);
  assert.equal(filledHoneypot(null), false);
  // A customer who works at a company is not a bot: the newsletter's honeypot name is not used here
  assert.equal(filledHoneypot({ ...GOOD, company: "Acme Ltd" }), false);
});

test("a postcode longer than any postcode is not taken", () => {
  assert.equal(postcodeFits({ postcode: "SO17 1AB" }), true);
  assert.equal(postcodeFits({ postcode: "SO17 1AB".repeat(5) }), false);
  assert.equal(postcodeFits({}), true, "a missing postcode is judgeCollection's to answer");
});

/* ─── The queries, run through the same GROQ engine Sanity uses ─── */

async function run(query: string, dataset: Record<string, unknown>[], params: Record<string, unknown>) {
  return (await evaluate(parse(query), { dataset, params })).get();
}

const MINE = "fp-anna";
const holding = (id: string, fields: Record<string, unknown>) => ({
  _id: id,
  _type: "atelierBooking",
  emailFingerprint: MINE,
  status: "confirmed",
  ...fields,
});

test("only booked times still ahead, still held and this customer's own are counted", async () => {
  const dataset = [
    holding("slot-2026-10-06-1400", { slotStart: "2026-10-06T14:00" }),
    holding("slot-2026-10-09-1000", { slotStart: "2026-10-09T10:00", status: "new" }),
    // An open draft of the first is not a third booking
    holding("drafts.slot-2026-10-06-1400", { slotStart: "2026-10-06T14:00" }),
    holding("slot-2026-10-07-1000", { slotStart: "2026-10-07T10:00", status: "cancelled" }),
    holding("slot-2026-10-01-1000", { slotStart: "2026-10-01T10:00" }),
    holding("slot-2026-10-03-0930", { slotStart: "2026-10-03T09:30" }),
    holding("request-1", { status: "new" }),
    holding("slot-2026-10-08-1000", { slotStart: "2026-10-08T10:00", emailFingerprint: "fp-bea" }),
  ];
  // Saturday 3 October, 10:00 in Southampton: this morning's 9:30 has gone
  assert.equal(await run(FUTURE_HOLDS_QUERY, dataset, { fingerprint: MINE, now: "2026-10-03T10:00" }), 2);
  assert.equal(await run(FUTURE_HOLDS_QUERY, dataset, { fingerprint: "fp-bea", now: "2026-10-03T10:00" }), 1);
});

const NOW = Date.parse("2026-10-03T10:00:00.000Z");
const since = new Date(NOW - 15 * 60_000).toISOString();
const request = (id: string, fields: Record<string, unknown>) => ({
  _id: id,
  _type: "atelierBooking",
  emailFingerprint: MINE,
  service: "Repairs",
  status: "new",
  createdAt: new Date(NOW - 5 * 60_000).toISOString(),
  ...fields,
});

test("a request with no time is the same one again only from the same address, for the same service, within fifteen minutes", async () => {
  const params = { fingerprint: MINE, service: "Repairs", since, collection: false, asked: null };
  const found = (dataset: Record<string, unknown>[], over: Record<string, unknown> = {}) =>
    run(REPEAT_REQUEST_QUERY, dataset, { ...params, ...over });

  assert.equal((await found([request("r1", {})]))?._id, "r1");
  assert.equal(await found([request("r1", { createdAt: new Date(NOW - 16 * 60_000).toISOString() })]), null, "older than the window");
  assert.equal(await found([request("r1", { service: "Alterations" })]), null, "another service is another request");
  assert.equal(await found([request("r1", { emailFingerprint: "fp-bea" })]), null);
  assert.equal(await found([request("r1", { status: "declined" })]), null);
  assert.equal(await found([request("r1", { slotStart: "2026-10-06T14:00" })]), null, "a booked time is matched by its slot instead");
  assert.equal(await found([request("r1", { collection: { district: "SO17" } })]), null, "a fitting request is not a collection");
  assert.equal((await found([request("r1", { collection: { district: "SO17" } })], { collection: true }))?._id, "r1");
  assert.equal(await found([request("drafts.r1", {})]), null);
  // The newest copy is the one answered from
  const two = [request("r1", {}), request("r2", { createdAt: new Date(NOW - 60_000).toISOString() })];
  assert.equal((await found(two))?._id, "r2");
});

test("a picked time the diary could not hold is the same request again only for that time", async () => {
  const kept = request("r1", { preferredDate: "Tuesday 6 October at 2:00pm" });
  const params = { fingerprint: MINE, service: "Repairs", since, collection: false };
  assert.equal((await run(REPEAT_REQUEST_QUERY, [kept], { ...params, asked: "Tuesday 6 October at 2:00pm" }))?._id, "r1");
  assert.equal(await run(REPEAT_REQUEST_QUERY, [kept], { ...params, asked: "Tuesday 6 October at 3:00pm" }), null);
});

test("the booking on a slot is this customer's own only while it holds the time", () => {
  const held = holding("slot-2026-10-06-1400", { slotStart: "2026-10-06T14:00" });
  assert.equal(heldBySameCustomer(held, MINE), true);
  assert.equal(heldBySameCustomer(held, "fp-bea"), false, "somebody else's fitting");
  assert.equal(heldBySameCustomer({ ...held, status: "cancelled" }, MINE), false, "a time given back is free to book again");
  assert.equal(heldBySameCustomer({ ...held, _type: "order" }, MINE), false);
  assert.equal(heldBySameCustomer(null, MINE), false);
});

test("the answer given again is the answer the first request got", () => {
  assert.deepEqual(
    sameAnswerAgain({
      _id: "slot-2026-10-06-1400",
      slotStart: "2026-10-06T14:00",
      confirmedFor: "Tuesday 6 October at 2:00pm",
      referralDiscount: 5,
      referredBy: "Maria",
    }),
    {
      ok: true,
      emailed: true,
      confirmedFor: "Tuesday 6 October at 2:00pm",
      referral: { applied: true, discount: 5, referredBy: "Maria" },
    }
  );
  // A request: "Request sent!", with no time it does not hold
  assert.deepEqual(sameAnswerAgain({ _id: "r1", preferredDate: "Tuesday 6 October at 2:00pm" }), { ok: true, emailed: true });
  assert.deepEqual(sameAnswerAgain({ _id: "r1", collection: { terms: "Free" } }), {
    ok: true,
    emailed: true,
    collection: { terms: "Free", when: null },
  });
});
