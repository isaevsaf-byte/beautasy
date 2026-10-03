import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectionForKristinaHtml, collectionReceivedHtml, replyToCustomerHtml, sealedNotesText } from "./route";
import {
  PENDING_QUERY,
  bookingEmailHtml,
  bookingEmailSubject,
  bookingInvite,
  collectionEventOf,
  fittingOf,
  notifiableFromDiary,
  type NotifiableBooking,
} from "@/lib/bookingEmails";

/**
 * Collect & return, where it meets the booking route and the emails.
 *
 * A collection is a request, never a fitting: it holds no time in the diary,
 * it keeps the customer's district and never their street, and it is decided
 * on the server from the settings as they are that minute. And whatever tells
 * the customer about it must not send them looking for the atelier — nobody is
 * coming to the door.
 */

const ROUTE = readFileSync(join(process.cwd(), "src", "app", "api", "atelier-booking", "route.ts"), "utf8");

test("a collection is decided before anything is written", () => {
  const judged = ROUTE.indexOf("judgeCollection(");
  const claim = ROUTE.indexOf("claimSlot(");
  const create = ROUTE.indexOf("sanityWriteClient.create(");
  assert.notEqual(judged, -1, "the route no longer judges a collection");
  assert.ok(judged < claim && judged < create, "Judge the collection before writing anything, or a refused one is kept.");
});

test("a collection is judged against the settings as they are now, past the CDN", () => {
  assert.match(
    ROUTE,
    /judgeCollection\(await collectionSettings\(\{\s*fresh:\s*true\s*\}\)/,
    "A zone Kristina switched off a minute ago must not still take collections."
  );
});

const SETTINGS = readFileSync(join(process.cwd(), "src", "lib", "siteSettings.ts"), "utf8");
const READER = SETTINGS.slice(SETTINGS.indexOf("export async function collectionSettings"));

test("a fresh read of the collection settings goes past the CDN", () => {
  assert.match(
    READER,
    /const client = fresh \? sanityWriteClient : sanityClient;/,
    "The CDN can hand back a zone that was switched off a minute ago."
  );
});

test("when the Studio cannot be read, no collection is offered", () => {
  assert.match(
    READER,
    /catch \{\s*return \{ \.\.\.collectionSettingsFrom\(null\), enabled: false \};/,
    "A collection promised from settings nobody could check is a drive nobody agreed to."
  );
});

test("a collection never holds a time in the diary", () => {
  assert.match(
    ROUTE,
    /const slot =\s*!wantsCollection && typeof body\.slot === "string"/,
    "A slot sent beside a collection would be claimed, and a fitting nobody comes to would block the diary."
  );
});

test("the booking keeps the district and the terms, never the street", () => {
  const person = ROUTE.slice(ROUTE.indexOf("const person = {"), ROUTE.indexOf("if (slot) {", ROUTE.indexOf("const person = {")));
  assert.match(person, /collection: collection\.request/);
  assert.doesNotMatch(person, /postcode/, "the full postcode reached the public database");
  // When they're in is their own words: sealed with the notes, never in a readable field
  assert.match(person, /notesSealed: sealOptional\(sealedNotesText\(collection\?\.when, notes\)\),/);
  assert.equal(person.match(/\.when\b/g)?.length, 1, "when they're in went somewhere other than the sealed notes");
  // Nowhere else in the route is it written to the booking
  assert.doesNotMatch(ROUTE, /preferredDate:[^\n]*\.when/, "when they're in went into a readable field");
});

test("Kristina's email carries the full postcode, when they're in and the terms", () => {
  const html = collectionForKristinaHtml({
    postcode: "SO17 1AB",
    request: { district: "SO17", zone: "Southampton", terms: "Free on orders from £40, otherwise £8" },
    when: "weekday mornings",
  });
  assert.match(html, /SO17 1AB/);
  assert.match(html, /When they're usually in: <strong>weekday mornings<\/strong>/);
  assert.match(html, /Free on orders from £40, otherwise £8/);
  const silent = collectionForKristinaHtml({
    postcode: "SO17 1AB",
    request: { district: "SO17", zone: "Southampton", terms: "Free" },
  });
  assert.doesNotMatch(silent, /usually in/, "an empty line about when they're in");
});

test("nothing typed into a collection can break Kristina's email", () => {
  const html = collectionForKristinaHtml({
    postcode: "SO17 1AB",
    request: { district: "SO17", zone: "<script>x</script>", terms: "<b>free</b>" },
    when: "<img src=x>",
  });
  assert.doesNotMatch(html, /<script>|<img|<b>/);
});

test("for a collection she is told to ask for their address, not to send hers", () => {
  const html = replyToCustomerHtml({ name: "Anna", phone: "07700900123", service: "Curtains", collection: true });
  // The href is escaped for HTML: undo it the way a browser would before reading the link
  const link = html
    .match(/href="([^"]+)"/)?.[1]
    ?.replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
  assert.ok(link);
  assert.equal(new URL(link).searchParams.get("text"), "Hi Anna, it's Kristina from Beautasy, about collecting your curtains. What's the address? ");
  assert.match(html, /Ask for their address/);
  assert.match(html, /«🚗 Назначить забор»/, "she is not told where to give the collection its time");
  assert.doesNotMatch(html, /Safar/, "the email still says Safar collects");
  assert.doesNotMatch(html, /send the address before the visit|Send Anna the address/);
});

const collected: NotifiableBooking = {
  _id: "b1",
  _rev: "r1",
  status: "confirmed",
  displayName: "Anna",
  service: "Curtain alterations",
  confirmedFor: "Tuesday 6 October, 6–8pm",
  collection: { district: "SO17", zone: "Southampton", terms: "Free on orders from £40, otherwise £8" },
};

test("a confirmed collection says it is arranged, and sends nobody to the atelier", () => {
  const html = bookingEmailHtml(collected, "confirmed");
  assert.match(html, /Your collection is arranged/);
  assert.match(html, /we'll collect your curtain alterations on <strong>Tuesday 6 October, 6–8pm<\/strong>/);
  assert.match(html, /From your door/);
  assert.match(html, /Free on orders from £40, otherwise £8/);
  assert.doesNotMatch(html, /how to find the door/, "a collection was told to come and find the atelier");
  assert.doesNotMatch(html, /the shoes you'll wear/);
  assert.doesNotMatch(html, /Add to Google Calendar/, "there is no fitting to put in a calendar");
  assert.equal(bookingEmailSubject(collected, "confirmed"), "Your Beautasy collection is arranged 💜");
});

test("a cancelled collection is called a collection", () => {
  const cancelled = { ...collected, status: "cancelled" };
  assert.match(bookingEmailHtml(cancelled, "cancelled"), /Your collection is cancelled/);
  assert.equal(bookingEmailSubject(cancelled, "cancelled"), "Your Beautasy collection is cancelled");
});

test("a fitting still reads as a fitting", () => {
  const fitting: NotifiableBooking = { ...collected, collection: undefined, slotStart: "2026-10-06T10:00", confirmedFor: "Tuesday 6 October at 10:00am" };
  const html = bookingEmailHtml(fitting, "confirmed");
  assert.match(html, /You're booked in/);
  assert.match(html, /how to find the door/);
  assert.ok(bookingInvite(fitting), "a fitting lost its calendar invite");
  assert.equal(bookingEmailSubject(fitting, "confirmed"), "Your Beautasy atelier appointment is confirmed 💜");
});

test("a collection is never a fitting in a calendar, even with a time on it", () => {
  // However a slot came to be on it — the rule is kept where the invite is made
  const timed: NotifiableBooking = { ...collected, slotStart: "2026-10-06T18:00", confirmedFor: undefined };
  assert.equal(fittingOf(timed), null);
  assert.equal(bookingInvite(timed), null, "a collection got an invite to the atelier");
  assert.doesNotMatch(bookingEmailHtml(timed, "confirmed"), /Add to Google Calendar|how to find the door/);
});

test("a collection confirmed without a time says only what it knows", () => {
  const untyped: NotifiableBooking = { ...collected, confirmedFor: undefined };
  const html = bookingEmailHtml(untyped, "confirmed");
  assert.match(html, /we'll collect your curtain alterations and bring it back/);
  assert.doesNotMatch(html, /collect your curtain alterations on/, "a time nobody gave was printed");
});

test("a collection timed from the diary puts the window at their door in the calendar, never the atelier", () => {
  const timed: NotifiableBooking = {
    ...collected,
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
    confirmedFor: "Tuesday 6 October, between 2:00pm and 3:00pm",
  };
  assert.equal(fittingOf(timed), null, "a collection became a fitting");
  const event = collectionEventOf(timed);
  assert.ok(event, "a timed collection has no calendar event");
  // 2pm and 3pm in Southampton in October are 13:00 and 14:00 UTC
  assert.equal(event.start.toISOString(), "2026-10-06T13:00:00.000Z");
  assert.equal(event.end.toISOString(), "2026-10-06T14:00:00.000Z");
  assert.equal(event.location, "", "the calendar sends them to an address");
  assert.match(event.title, /collects/);

  const invite = bookingInvite(timed);
  assert.ok(invite, "the confirmation lost its invite");
  assert.equal(invite.filename, "beautasy-collection.ics");
  const ics = Buffer.from(invite.content, "base64").toString("utf8");
  assert.doesNotMatch(ics, /Beautasy Atelier, Southampton/, "the invite sends them to the atelier");

  const html = bookingEmailHtml(timed, "confirmed");
  assert.match(html, /we'll collect your curtain alterations on <strong>Tuesday 6 October, between 2:00pm and 3:00pm<\/strong>/);
  assert.match(html, /Add to Google Calendar/);
  assert.doesNotMatch(html, /how to find the door|the shoes you'll wear/);
});

test("a collection whose words were changed by hand gets no invite for the old window", () => {
  const retyped: NotifiableBooking = {
    ...collected,
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
    confirmedFor: "Wednesday 7 October, 7pm",
  };
  assert.equal(collectionEventOf(retyped), null);
  assert.equal(bookingInvite(retyped), null);
  assert.equal(collectionEventOf({ ...retyped, confirmedFor: undefined, slotEnd: "2026-10-06T13:00" }), null, "a window that ends before it starts");
});

test("a friend's discount on a collection is not promised at the atelier", () => {
  const friend: NotifiableBooking = { ...collected, referralDiscount: 500, referredBy: "Mia" };
  const html = bookingEmailHtml(friend, "confirmed");
  assert.match(html, /£5 off<\/strong> from Mia is noted — it comes off when you pay\./);
  assert.doesNotMatch(html, /pay at the atelier/);
  assert.match(bookingEmailHtml({ ...friend, collection: undefined }, "confirmed"), /when you pay at the atelier/);
  assert.match(ROUTE, /it comes off when you pay\$\{collection \? "" : " at the atelier"\}/, "the first email still sends them to the atelier");
});

test("the nightly job reads the collection, so a late confirmation knows what it is", () => {
  assert.match(PENDING_QUERY, /\bcollection\b/);
});

test("the Studio's email is built with the collection, its window and Kristina's note", () => {
  const booking = notifiableFromDiary(
    {
      _id: "slot-2026-10-06-1400",
      displayName: "Anna",
      service: "Curtains",
      slotStart: "2026-10-06T14:00",
      slotEnd: "2026-10-06T15:00",
      confirmedFor: "Tuesday 6 October, between 2:00pm and 3:00pm",
      replyNote: "Could you have the hooks off?",
      collection: { district: "SO17", zone: "Southampton", terms: "Free" },
      emailSealed: "v1.secret",
    },
    30
  );
  assert.equal(booking.collection?.district, "SO17", "a collection would be written up as a visit");
  assert.equal(booking.slotEnd, "2026-10-06T15:00");
  assert.equal(booking.replyNote, "Could you have the hooks off?", "Kristina's note was dropped on the way");
  assert.equal(booking.status, "confirmed");
  assert.ok(bookingInvite(booking), "a timed collection lost its invite");
  assert.match(bookingEmailHtml(booking, "confirmed"), /Could you have the hooks off\?/);
});

test("a moved collection says it moved, and from when", () => {
  const moved: NotifiableBooking = {
    ...collected,
    slotStart: "2026-10-08T10:00",
    slotEnd: "2026-10-08T11:00",
    confirmedFor: "Thursday 8 October, between 10:00am and 11:00am",
    movedFrom: "Tuesday 6 October, between 2:00pm and 3:00pm",
  };
  const html = bookingEmailHtml(moved, "confirmed");
  assert.match(html, /Your collection has moved/);
  assert.match(html, /\(it was Tuesday 6 October, between 2:00pm and 3:00pm\)/);
  assert.match(html, /If the old time is in your calendar, you can delete it/);
  assert.equal(bookingEmailSubject(moved, "confirmed"), "Your Beautasy collection has moved 💜");
});

test("a cancelled collection is not told to choose a time it cannot choose", () => {
  const html = bookingEmailHtml({ ...collected, status: "cancelled" }, "cancelled");
  assert.match(html, /ask for a new collection and Kristina will email you a time/);
  assert.match(html, /Ask for a collection/);
  assert.doesNotMatch(html, /choosing a new time takes a minute/);
});

test("each collection is its own calendar event, and only a collection gets one", () => {
  const at = (start: string, end: string): NotifiableBooking => ({
    ...collected,
    slotStart: start,
    slotEnd: end,
    confirmedFor: undefined,
  });
  const first = collectionEventOf(at("2026-10-06T14:00", "2026-10-06T15:00"));
  const second = collectionEventOf(at("2026-10-08T10:00", "2026-10-08T11:00"));
  assert.equal(first?.uid, "slot-2026-10-06-1400@beautasy.co.uk");
  assert.notEqual(first?.uid, second?.uid);
  assert.equal(collectionEventOf({ ...at("2026-10-06T14:00", "2026-10-06T15:00"), collection: undefined }), null);
  assert.equal(collectionEventOf(at("2026-10-06T14:00", "2026-10-06T14:00")), null, "a window that ends as it starts");
});

test("their notes are never lost to when they're in, and the order is fixed", () => {
  assert.equal(sealedNotesText("mornings", " take up 2cm "), "Best time to collect: mornings\n\ntake up 2cm");
  assert.equal(sealedNotesText(undefined, "x"), "x");
  assert.equal(sealedNotesText("mornings", undefined), "Best time to collect: mornings");
  assert.equal(sealedNotesText(undefined, "  "), undefined);
});

test("what they typed is quoted, escaped, in their acknowledgement", () => {
  const html = collectionReceivedHtml("Curtains", {
    request: { district: "SO17", zone: "Southampton", terms: "Free" },
    when: '<a href="https://x">click</a>',
  });
  assert.doesNotMatch(html, /<a href/, "a link typed by anyone went out from orders@");
  assert.match(html, /You told us: &ldquo;&lt;a href=/);
  const silent = collectionReceivedHtml("Curtains", { request: { district: "SO17", zone: "Southampton", terms: "Free" } });
  assert.doesNotMatch(silent, /You told us/);
});

test("Kristina's request email carries the collection, with when they're in", () => {
  assert.match(ROUTE, /\$\{collection \? collectionForKristinaHtml\(collection\) : ""\}/);
  assert.match(ROUTE, /\.\.\.\(verdict\.when \? \{ when: verdict\.when \} : \{\}\)/);
});
