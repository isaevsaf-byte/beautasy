import { test } from "node:test";
import assert from "node:assert/strict";
import { HONEYPOT_FIELD, NO_ANSWER, REQUEST_KEY_FIELD, bookingBody, newRequestKey, sendBooking, whatsappAboutBooking } from "./bookingForm";
import { requestKeyOf } from "./bookingRequest";

/**
 * A booking sent from a phone on a bad connection. The browser's own words
 * for a dropped request — "Load failed" — used to be shown as they were; now
 * only a real answer from the route is shown as one, and no answer at all is
 * said plainly, with WhatsApp beside it.
 */

const BODY = { name: "Anna Smith", email: "anna@example.com", service: "Alterations", slot: "2026-10-06T14:00" };

const answering = (status: number, body: string, type = "application/json") =>
  (async () => new Response(body, { status, headers: { "content-type": type } })) as unknown as typeof fetch;

test("a connection that dropped is no answer, whatever the browser called it", async () => {
  for (const message of ["Load failed", "Failed to fetch", "NetworkError when attempting to fetch resource."]) {
    const dropped = (async () => {
      throw new TypeError(message);
    }) as unknown as typeof fetch;
    assert.deepEqual(await sendBooking(BODY, dropped), { reached: false });
  }
});

test("a gateway's error page in place of the route's answer is no answer either", async () => {
  assert.deepEqual(await sendBooking(BODY, answering(504, "<html>An error occurred</html>", "text/html")), { reached: false });
  assert.deepEqual(await sendBooking(BODY, answering(502, "")), { reached: false });
  assert.deepEqual(await sendBooking(BODY, answering(200, "null")), { reached: false });
});

test("the route's own answer is passed on as it is, refusals included", async () => {
  const taken = await sendBooking(BODY, answering(409, JSON.stringify({ error: "Sorry — that time has just been taken.", slotTaken: true })));
  assert.deepEqual(taken, { reached: true, ok: false, data: { error: "Sorry — that time has just been taken.", slotTaken: true } });
  const booked = await sendBooking(BODY, answering(201, JSON.stringify({ ok: true, confirmedFor: "Tuesday 6 October at 2:00pm" })));
  assert.deepEqual(booked, { reached: true, ok: true, data: { ok: true, confirmedFor: "Tuesday 6 October at 2:00pm" } });
});

test("the booking is posted to the booking route as JSON", async () => {
  let seen: { url: string; init?: RequestInit } | null = null;
  const watching = (async (url: string, init?: RequestInit) => {
    seen = { url, init };
    return new Response("{}", { status: 201, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  await sendBooking(BODY, watching);
  assert.ok(seen);
  const { url, init } = seen as { url: string; init?: RequestInit };
  assert.equal(url, "/api/atelier-booking");
  assert.equal(init?.method, "POST");
  assert.deepEqual(JSON.parse(String(init?.body)), BODY);
});

test("the line says what probably happened, that trying again is fine, and where else to go", () => {
  assert.match(NO_ANSWER, /connection may have dropped/);
  assert.match(NO_ANSWER, /Please try again \(if your first one got through, we'll spot it\)/);
  assert.match(NO_ANSWER, /WhatsApp/);
  assert.doesNotMatch(NO_ANSWER, /Load failed|fetch/i);
  // Not a promise: a copy that reached Kristina's inbox and not the Studio, or a
  // database that could not be asked, leaves nothing to recognise it by
  assert.doesNotMatch(NO_ANSWER, /won't be booked twice|never|guarantee/i);
});

const FORM = {
  name: "Anna Smith",
  email: "anna@example.com",
  phone: "",
  service: "Alterations",
  notes: "Hem",
  trap: "",
  requestKey: "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f",
  collection: null,
  slot: "2026-10-06T14:00",
  preferredDate: "",
  referralCode: null,
};

test("what the form sends carries the hidden field's value, so a bot that fills in the page is caught", () => {
  assert.equal(bookingBody({ ...FORM, trap: "http://spam.example" })[HONEYPOT_FIELD], "http://spam.example");
  assert.equal(bookingBody(FORM)[HONEYPOT_FIELD], "");
});

test("what the form sends carries its key, a time or a date, and a collection with no time", () => {
  const booked = bookingBody(FORM);
  assert.equal(booked[REQUEST_KEY_FIELD], FORM.requestKey);
  assert.equal(requestKeyOf(booked), FORM.requestKey, "the route would not recognise the key the form sends");
  assert.equal(booked.slot, "2026-10-06T14:00");
  assert.equal("preferredDate" in booked, false);
  assert.equal("referralCode" in booked, false);

  const asked = bookingBody({ ...FORM, slot: null, preferredDate: "2026-11-02", referralCode: "ANNA-K7P2" });
  assert.equal(asked.preferredDate, "2026-11-02");
  assert.equal("slot" in asked, false);
  assert.equal(asked.referralCode, "ANNA-K7P2");

  const collect = bookingBody({ ...FORM, collection: { postcode: "SO17 1AB", when: "  " } });
  assert.deepEqual(collect.collection, { postcode: "SO17 1AB" }, "an empty 'when' is not sent");
  assert.equal("slot" in collect, false, "a collection holds no time in the diary");
  assert.deepEqual(bookingBody({ ...FORM, collection: { postcode: "SO17 1AB", when: "mornings" } }).collection, {
    postcode: "SO17 1AB",
    when: "mornings",
  });
});

test("a form's key cannot be guessed, and is one the route takes, with or without randomUUID", () => {
  const keys = new Set(Array.from({ length: 50 }, () => newRequestKey()));
  assert.equal(keys.size, 50);
  for (const key of keys) assert.equal(requestKeyOf({ [REQUEST_KEY_FIELD]: key }), key);
  // An older browser without randomUUID
  const older = { getRandomValues: (bytes: Uint8Array) => globalThis.crypto.getRandomValues(bytes) } as unknown as Crypto;
  const key = newRequestKey(older);
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(requestKeyOf({ [REQUEST_KEY_FIELD]: key }), key);
});

/** The message a wa.me link opens with. */
const typed = (link: string) => new URL(link).searchParams.get("text");

test("the WhatsApp message already says who they are and what they were booking", () => {
  const link = whatsappAboutBooking({ name: " Anna Smith", service: "Bridal fitting", slot: "2026-10-06T14:00", collecting: false });
  assert.match(link, /^https:\/\/wa\.me\/447729741116\?/);
  assert.equal(
    typed(link),
    "Hi Kristina, it's Anna. I tried to book on your website (Bridal fitting, Tuesday 6 October at 2:00pm), but it didn't go through."
  );
  assert.equal(
    typed(whatsappAboutBooking({ name: "", service: "Repairs", slot: null, collecting: false })),
    "Hi Kristina. I tried to send a booking request on your website (Repairs), but it didn't go through."
  );
  assert.equal(
    typed(whatsappAboutBooking({ name: "Anna", service: "Home Textiles", slot: "2026-10-06T14:00", collecting: true })),
    "Hi Kristina, it's Anna. I tried to ask for a collection on your website (Home Textiles), but it didn't go through."
  );
});
