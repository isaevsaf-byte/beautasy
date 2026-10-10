import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import {
  FIELD_LIMITS,
  FUTURE_HOLDS_QUERY,
  REPEAT_REQUEST_QUERY,
  TOO_MANY_HOLDS,
  acceptedService,
  filledHoneypot,
  heldBySameCustomer,
  postcodeFits,
  readBookingFields,
  requestFingerprint,
  requestKeyOf,
  sameAnswerAgain,
  type BookingFields,
} from "./bookingRequest";
import { LOCAL_SERVICES } from "./localServices";
import { FOUND_US_OPTIONS, bookingBody, foundUsOf } from "./bookingForm";

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

test("'How did you find us?' keeps only the form's own answers, and never refuses a booking over it", () => {
  for (const answer of FOUND_US_OPTIONS) {
    const read = readBookingFields({ ...GOOD, foundUs: answer });
    assert.ok(read.ok);
    assert.equal(read.fields.foundUs, answer);
  }
  // Case, spaces, a made-up source, the empty choice, not text, a page from before the question
  for (const odd of ["google", " Google", "TikTok", "", "x".repeat(5000), 3, { source: "Google" }, null, undefined]) {
    const read = readBookingFields({ ...GOOD, foundUs: odd });
    assert.ok(read.ok, `a booking with foundUs ${JSON.stringify(odd)} was refused`);
    assert.equal("foundUs" in read.fields, false, `${JSON.stringify(odd)} was kept`);
  }
  assert.equal(foundUsOf("Walked past / local"), "Walked past / local");
  assert.equal(foundUsOf("Walked past"), undefined);
});

test("what the form sends carries 'How did you find us?' only once something is chosen", () => {
  const form = {
    name: "Anna",
    email: "anna@example.com",
    phone: "",
    service: "Alterations",
    notes: "",
    trap: "",
    requestKey: "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f",
    collection: null,
    slot: "2026-10-06T14:00",
    preferredDate: "",
    referralCode: null,
  };
  assert.equal("foundUs" in bookingBody(form), false);
  assert.equal("foundUs" in bookingBody({ ...form, foundUs: "" }), false);
  const sent = bookingBody({ ...form, foundUs: "Nextdoor" });
  assert.equal(sent.foundUs, "Nextdoor");
  const read = readBookingFields(sent);
  assert.ok(read.ok && read.fields.foundUs === "Nextdoor", "what the form sends is what the route keeps");
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

test("the limit on times ahead is said as the rule, not as what this address holds", () => {
  assert.match(TOO_MANY_HOLDS, /up to two upcoming appointments/);
  assert.match(TOO_MANY_HOLDS, /WhatsApp/);
  assert.doesNotMatch(TOO_MANY_HOLDS, /you already have|you have/i);
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

test("a request with no time is the same one again only from the same form and address, within fifteen minutes", async () => {
  const params = { fingerprint: MINE, request: "rq-1", since };
  const found = (dataset: Record<string, unknown>[], over: Record<string, unknown> = {}) =>
    run(REPEAT_REQUEST_QUERY, dataset, { ...params, ...over });

  assert.equal((await found([request("r1", { requestFingerprint: "rq-1" })]))?._id, "r1");
  assert.equal(
    await found([request("r1", { requestFingerprint: "rq-1", createdAt: new Date(NOW - 16 * 60_000).toISOString() })]),
    null,
    "older than the window"
  );
  assert.equal(await found([request("r1", { requestFingerprint: "rq-2" })]), null, "another form, or other words, is another request");
  assert.equal(await found([request("r1", {})]), null, "a request from before forms had keys is never somebody's repeat");
  assert.equal(await found([request("r1", { requestFingerprint: "rq-1", emailFingerprint: "fp-bea" })]), null);
  assert.equal(await found([request("r1", { requestFingerprint: "rq-1", status: "declined" })]), null);
  assert.equal(
    await found([request("r1", { requestFingerprint: "rq-1", slotStart: "2026-10-06T14:00" })]),
    null,
    "a booked time is matched by its slot instead"
  );
  assert.equal(await found([request("drafts.r1", { requestFingerprint: "rq-1" })]), null);
  // The newest copy is the one answered from
  const two = [
    request("r1", { requestFingerprint: "rq-1" }),
    request("r2", { requestFingerprint: "rq-1", createdAt: new Date(NOW - 60_000).toISOString() }),
  ];
  assert.equal((await found(two))?._id, "r2");
});

/** Runs with a key of its own, as the route does — see @/lib/secrets. */
function withSecret<T>(run: () => T): T {
  const was = process.env.DATA_SECRET;
  process.env.DATA_SECRET = "a passphrase for these tests only";
  try {
    return run();
  } finally {
    if (was === undefined) delete process.env.DATA_SECRET;
    else process.env.DATA_SECRET = was;
  }
}

const FIELDS: BookingFields = { name: "Anna Smith", email: "anna@example.com", service: "Repairs", notes: "Jacket lining", preferredDate: "2026-11-02" };
const KEY = "0b6f3c1e-2a4d-4e5f-9a8b-7c6d5e4f3a2b";

test("a form's key is taken only when it looks like one", () => {
  assert.equal(requestKeyOf({ requestKey: KEY }), KEY);
  assert.equal(requestKeyOf({ requestKey: "0123456789abcdef0123456789abcdef" }), "0123456789abcdef0123456789abcdef");
  for (const key of [undefined, "", "short", "x".repeat(65), "has spaces in it, so no", 42, { key: KEY }]) {
    assert.equal(requestKeyOf({ requestKey: key }), null, String(key));
  }
  assert.equal(requestKeyOf(null), null);
});

test("a booked time is known again by the form's key and the time, whatever else changed", () => {
  withSecret(() => {
    const first = requestFingerprint({ key: KEY, slot: "2026-10-06T14:00", fields: FIELDS });
    assert.equal(first, requestFingerprint({ key: KEY, slot: "2026-10-06T14:00", fields: { ...FIELDS, notes: "Also the cuffs" } }));
    assert.notEqual(first, requestFingerprint({ key: KEY, slot: "2026-10-06T14:30", fields: FIELDS }), "another time");
    assert.notEqual(
      first,
      requestFingerprint({ key: "ffffffff-2a4d-4e5f-9a8b-7c6d5e4f3a2b", slot: "2026-10-06T14:00", fields: FIELDS }),
      "somebody else's form, with the same address and the same time"
    );
    assert.doesNotMatch(first, new RegExp(KEY), "the key itself would be readable in a public dataset");
  });
});

test("a request with no time is known again only with every word the same", () => {
  withSecret(() => {
    const first = requestFingerprint({ key: KEY, fields: FIELDS });
    assert.equal(first, requestFingerprint({ key: KEY, fields: { ...FIELDS } }));
    for (const [changed, why] of [
      [{ ...FIELDS, preferredDate: "2026-11-20" }, "another date"],
      [{ ...FIELDS, notes: "Also a second coat, different job" }, "other notes"],
      [{ ...FIELDS, phone: "07700 900123" }, "a phone number added"],
      [{ ...FIELDS, name: "Anna Smyth" }, "a name corrected"],
      [{ ...FIELDS, service: "Alterations" }, "another service"],
    ] as const) {
      assert.notEqual(requestFingerprint({ key: KEY, fields: changed }), first, why);
    }
    // A collection: its postcode and when they are in are words too
    const collect = requestFingerprint({ key: KEY, fields: FIELDS, collection: { postcode: "SO17 1AB", when: "mornings" } });
    assert.notEqual(collect, first, "a collection is not a fitting request");
    assert.equal(collect, requestFingerprint({ key: KEY, fields: FIELDS, collection: { postcode: " SO17 1AB", when: "mornings " } }));
    assert.notEqual(collect, requestFingerprint({ key: KEY, fields: FIELDS, collection: { postcode: "SO17 1AB", when: "evenings" } }));
    // And a booked time is never the same as a request
    assert.notEqual(requestFingerprint({ key: KEY, slot: "2026-10-06T14:00", fields: FIELDS }), first);
  });
});

test("the booking on a slot is this form's own only while it holds the time", () => {
  const held = holding("slot-2026-10-06-1400", { slotStart: "2026-10-06T14:00", requestFingerprint: "rq-1" });
  assert.equal(heldBySameCustomer(held, MINE, "rq-1"), true);
  assert.equal(heldBySameCustomer(held, "fp-bea", "rq-1"), false, "somebody else's fitting");
  assert.equal(heldBySameCustomer(held, MINE, "rq-2"), false, "somebody else who knows this customer's address");
  assert.equal(
    heldBySameCustomer({ ...held, requestFingerprint: undefined }, MINE, "rq-1"),
    false,
    "a booking made before forms had keys, or in the Studio"
  );
  assert.equal(heldBySameCustomer({ ...held, status: "cancelled" }, MINE, "rq-1"), false, "a time given back is free to book again");
  assert.equal(heldBySameCustomer({ ...held, _type: "order" }, MINE, "rq-1"), false);
  assert.equal(heldBySameCustomer(null, MINE, "rq-1"), false);
});

test("the answer given again is the answer the first request got, without the friend's name", () => {
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
      referral: { applied: true, discount: 5 },
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
