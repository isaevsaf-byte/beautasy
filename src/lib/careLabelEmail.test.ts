import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { PENDING_ONE_QUERY, PENDING_QUERY, bookingEmailHtml, reminderEmailHtml, type NotifiableBooking } from "./bookingEmails";
import { linesFrom, whyNotDone } from "./markDone";

/**
 * The care label reaching the thank-you (11.10.2026): it is on the
 * thank-you and nowhere else, it is read from the booking by the same query
 * that finds who is owed an email, and «✓ Работа готова» finishes only a
 * booking that can still be thanked.
 */

const OCT = new Date(Date.UTC(2026, 9, 11, 10));
const anna: NotifiableBooking = {
  _id: "atelierBooking-1",
  _rev: "r1",
  status: "completed",
  displayName: "Anna",
  service: "Jeans and Trouser Alterations",
  careLabel: [{ phrase: "jeans-original", a: 6 }],
};
const thanks = (booking: NotifiableBooking) => bookingEmailHtml(booking, "completed", null, "https://g.page/r/x", OCT);

test("the thank-you opens with the label, under the heading and before the words", () => {
  const html = thanks(anna);
  const label = html.indexOf("BEAUTASY &middot; SOUTHAMPTON");
  assert.ok(label > html.indexOf(">Thank you</h1>"), "under the heading");
  assert.ok(label < html.lastIndexOf(">Anna, thank you for trusting us"), "before the first line");
  assert.match(html, />Altered by hand for Anna</);
  assert.match(html, />Taken up 6&nbsp;cm, original hem sewn back&nbsp;on</);
  assert.match(html, />OCTOBER 2026</);
  // The inbox shows the greeting beside the subject, not the label's capitals
  const preheader = /<body[^>]*>\s*<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">([^<]*)<\/div>/.exec(html);
  assert.equal(preheader?.[1], "Anna, thank you for trusting us with your jeans and trouser alterations.");
  // The review is asked for after it, as before
  assert.ok(html.indexOf("Leave a Google review") > label);
});

test("no other email carries a label, and a look with no line picked carries none", () => {
  for (const status of ["confirmed", "declined", "cancelled"] as const) {
    const html = bookingEmailHtml({ ...anna, status }, status, null, null, OCT);
    assert.doesNotMatch(html, /SOUTHAMPTON|by hand for|mso-hide/, status);
  }
  const look = thanks({ ...anna, service: "Not sure — free 10-minute look", careLabel: undefined });
  assert.doesNotMatch(look, /SOUTHAMPTON|mso-hide/);
  assert.match(look, /Anna, thank you for trusting us with your free 10-minute look/);
  // No line, a service: its own line
  assert.match(thanks({ ...anna, service: "Wedding Dress Alterations", careLabel: undefined }), />Ready for the&nbsp;wedding</);
});

test("a name is written as a name in the greeting too, as on the label", () => {
  const html = thanks({ ...anna, displayName: "anna" });
  assert.match(html, />Altered by hand for Anna</);
  assert.match(html, /Anna, thank you for trusting us/);
  assert.match(thanks({ ...anna, displayName: undefined }), /there, thank you for trusting us/);
  // The reminder the day before greets her the same way as the confirmation did
  assert.match(reminderEmailHtml({ displayName: "anna", service: "Alterations", slotStart: "2026-10-25T14:00" }), /Anna, a little reminder/);
  assert.doesNotMatch(thanks({ ...anna, displayName: undefined }), /for there/, "never 'Altered by hand for there'");
});

/** The queries run as Sanity runs them */
async function ask(query: string, dataset: object[], params: Record<string, unknown>) {
  return (await (await evaluate(parse(query), { dataset, params })).get()) as Record<string, unknown>[];
}

const owed = (id: string, extra: object = {}) => ({
  _id: id,
  _type: "atelierBooking",
  status: "completed",
  emailSealed: "sealed",
  createdAt: "2026-10-01T10:00:00Z",
  careLabel: [{ _key: "line1", _type: "careLine", phrase: "hem", a: 4, b: 2 }],
  ...extra,
});

test("the queue reads the label with the booking, and never reads a draft", async () => {
  const dataset = [owed("a"), owed("drafts.a", { careLabel: [] }), owed("b", { notifiedStatus: "completed" })];
  // groq-js slices by constant numbers only, as the other queue tests do
  const pending = await ask(PENDING_QUERY.replace("$limit", "25"), dataset, {});
  assert.deepEqual(pending.map((row) => row._id), ["a"], "a draft is never sent, the thanked never again");
  assert.deepEqual(pending[0].careLabel, [{ _key: "line1", _type: "careLine", phrase: "hem", a: 4, b: 2 }]);
});

test("«✓ Работа готова» sends its own booking's thank-you, on the queue's own terms, and nobody else's", async () => {
  const dataset = [owed("a"), owed("b"), owed("c", { notifiedStatus: "completed" }), owed("drafts.b")];
  assert.deepEqual((await ask(PENDING_ONE_QUERY, dataset, { id: "b" })).map((row) => row._id), ["b"]);
  assert.deepEqual(await ask(PENDING_ONE_QUERY, dataset, { id: "c" }), [], "already thanked");
  assert.deepEqual(await ask(PENDING_ONE_QUERY, dataset, { id: "drafts.b" }), [], "a draft is not the booking");
  assert.deepEqual(await ask(PENDING_ONE_QUERY, [owed("x", { emailSealed: undefined })], { id: "x" }), [], "no email, nobody to tell");
  // The same fields as the queue: one email, built one way
  const fields = (query: string) => query.slice(query.lastIndexOf("{"));
  assert.equal(fields(PENDING_ONE_QUERY), fields(PENDING_QUERY));
});

test("only a confirmed booking is finished, or one marked done whose thank-you has not gone", () => {
  const doc = { _id: "a", _rev: "r", _type: "atelierBooking" };
  assert.equal(whyNotDone({ ...doc, status: "confirmed" }), null);
  assert.equal(whyNotDone({ ...doc, status: "completed", emailSealed: "sealed" }), null, "the radio got there first: the label can still go");
  assert.match(whyNotDone({ ...doc, status: "completed" })!, /эл\. почты в ней нет/, "no email: no thank-you for a label to go with");
  assert.equal(whyNotDone({ ...doc, status: "confirmed" }), null, "a confirmed booking with no email can still be finished");
  assert.match(whyNotDone({ ...doc, status: "completed", notifiedStatus: "completed", emailSealed: "sealed" })!, /уже ушло/);
  for (const status of ["new", "declined", "cancelled", undefined]) {
    assert.match(whyNotDone({ ...doc, status })!, /только подтверждённую/, String(status));
  }
  assert.match(whyNotDone({ ...doc, status: "confirmed", releasedAt: "2026-10-01T10:00:00Z" })!, /занял другой клиент/);
  assert.match(whyNotDone(null)!, /не найдена/);
  assert.match(whyNotDone({ ...doc, _type: "order", status: "confirmed" })!, /не найдена/);
});

test("the lines arrive as keys and numbers, whole, and at most two", () => {
  assert.deepEqual(linesFrom(undefined), { ok: true, lines: [] });
  assert.deepEqual(linesFrom([]), { ok: true, lines: [] });
  assert.deepEqual(linesFrom([{ phrase: "hem", a: 4, b: 2, note: "<b>hi</b>" }]), { ok: true, lines: [{ phrase: "hem", a: 4, b: 2 }] }, "nothing else is kept");
  assert.deepEqual(linesFrom([{ phrase: "taper", a: null }]), { ok: true, lines: [{ phrase: "taper" }] });
  const refused = (value: unknown) => {
    const result = linesFrom(value);
    assert.equal(result.ok, false, JSON.stringify(value));
    return (result as { error: string }).error;
  };
  assert.match(refused([{ phrase: "taper" }, { phrase: "darts" }, { phrase: "bustle" }]), /одна или две строки/);
  assert.match(refused({ phrase: "taper" }), /одна или две строки/);
  assert.match(refused([{ phrase: "hem", a: "4" }]), /не числом/);
  assert.match(refused([{ phrase: "hem" }]), /Укажите/);
  assert.match(refused([{ phrase: "Hem taken up 4 cm" }]), /Такой строки/, "words are never taken, only a key");
  assert.match(refused([{ phrase: "hem", a: 4 }, { phrase: "hem", a: 4 }]), /уже на бирке/, "the same line twice");
  assert.deepEqual(linesFrom([{ phrase: "hem", a: 4 }, { phrase: "hem", a: 6 }]), { ok: true, lines: [{ phrase: "hem", a: 4 }, { phrase: "hem", a: 6 }] }, "two pieces, two hems");
});
