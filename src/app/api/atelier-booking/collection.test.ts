import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectionForKristinaHtml, replyToCustomerHtml } from "./route";
import {
  PENDING_QUERY,
  bookingEmailHtml,
  bookingEmailSubject,
  bookingInvite,
  fittingOf,
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
});

test("Kristina's email carries the full postcode, the window and the terms", () => {
  const html = collectionForKristinaHtml({
    postcode: "SO17 1AB",
    request: { district: "SO17", zone: "Southampton", window: "Tuesday 6–8pm", terms: "Free on orders from £40, otherwise £8" },
  });
  assert.match(html, /SO17 1AB/);
  assert.match(html, /Tuesday 6–8pm/);
  assert.match(html, /Free on orders from £40, otherwise £8/);
});

test("nothing typed into a collection can break Kristina's email", () => {
  const html = collectionForKristinaHtml({
    postcode: "SO17 1AB",
    request: { district: "SO17", zone: "<script>x</script>", window: "<img src=x>", terms: "<b>free</b>" },
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
  assert.doesNotMatch(html, /send the address before the visit|Send Anna the address/);
});

const collected: NotifiableBooking = {
  _id: "b1",
  _rev: "r1",
  status: "confirmed",
  displayName: "Anna",
  service: "Curtain alterations",
  confirmedFor: "Tuesday 6 October, 6–8pm",
  collection: { district: "SO17", zone: "Southampton", window: "Tuesday 6–8pm", terms: "Free on orders from £40, otherwise £8" },
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

test("a collection confirmed without a day still says when: the window the customer chose", () => {
  const untyped: NotifiableBooking = { ...collected, confirmedFor: undefined };
  assert.match(bookingEmailHtml(untyped, "confirmed"), /we'll collect your curtain alterations on <strong>Tuesday 6–8pm<\/strong>/);
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
