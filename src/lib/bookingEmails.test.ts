import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingEmailHtml,
  bookingInvite,
  fittingOf,
  sendConfirmation,
  whatsappNumberOf,
  type NotifiableBooking,
} from "./bookingEmails";
import { replyToCustomerHtml } from "../app/api/atelier-booking/route";

/**
 * The confirmation used to give a time and "we're at the atelier in
 * Southampton" — and the atelier's address is not published, so a customer who
 * booked themselves online knew when to come and not where.
 */

/** The first link in some HTML, read the way a browser reads the attribute. */
function whatsappHrefIn(html: string): URL | null {
  const raw = html.match(/href="(https:\/\/wa\.me\/[^"]+)"/)?.[1];
  return raw ? new URL(raw.replace(/&#39;/g, "'").replace(/&amp;/g, "&")) : null;
}

const booked: NotifiableBooking = {
  _id: "pending",
  _rev: "pending",
  status: "confirmed",
  displayName: "Anna",
  service: "Alterations",
  confirmedFor: "Tuesday 6 October at 10:00am",
  slotStart: "2026-10-06T10:00",
  slotMinutes: 30,
};

test("a booked customer is told where, what to bring, and how to move it", () => {
  const html = bookingEmailHtml(booked, "confirmed");
  assert.match(html, /Tuesday 6 October at 10:00am/);
  assert.match(html, /will send you the exact address and how to find the door before your visit/);
  assert.match(html, /the shoes you'll wear with it/);
  assert.match(html, /Reply to this email, or WhatsApp Kristina on \+44 7729 741116/);
  assert.match(html, /href="https:\/\/wa\.me\/447729741116\?text=/);
  assert.match(html, /href="tel:\+447729741116"/);
  assert.doesNotMatch(html, /About the atelier/);
});

test("a picked time gets a calendar: a Google link and an invite for everyone else", () => {
  const html = bookingEmailHtml(booked, "confirmed");
  assert.match(html, /href="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&amp;/);
  assert.match(html, /dates=20261006T090000Z%2F20261006T093000Z/);
  assert.match(html, /Open the invite attached to this email/);

  const invite = bookingInvite(booked, new Date(Date.UTC(2026, 8, 26, 19)));
  assert.ok(invite);
  assert.equal(invite.filename, "beautasy-fitting.ics");
  assert.match(invite.contentType ?? "", /^text\/calendar/);
  const ics = Buffer.from(invite.content, "base64").toString("utf8");
  assert.match(ics, /DTSTART:20261006T090000Z/);
});

test("a time Kristina typed by hand gets the same directions and no calendar", () => {
  const byHand: NotifiableBooking = { ...booked, slotStart: undefined, confirmedFor: "Tues around 3" };
  const html = bookingEmailHtml(byHand, "confirmed");
  assert.match(html, /exact address/);
  assert.doesNotMatch(html, /calendar\.google\.com/);
  assert.doesNotMatch(html, /invite attached/);
  assert.match(html, />WhatsApp Kristina</);
  assert.equal(bookingInvite(byHand), null);
});

test("declined and thank-you emails are not given directions", () => {
  for (const status of ["declined", "completed"] as const) {
    const html = bookingEmailHtml({ ...booked, status }, status);
    assert.doesNotMatch(html, /exact address/, status);
    assert.doesNotMatch(html, /calendar\.google\.com/, status);
  }
});

test("what a customer typed stays text in the confirmation", () => {
  const html = bookingEmailHtml(
    { ...booked, displayName: "<img src=x onerror=alert(1)>", service: "<b>Hem</b>" },
    "confirmed"
  );
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<b>Hem<\/b>/);
});

test("a phone number becomes the number WhatsApp wants", () => {
  assert.equal(whatsappNumberOf("07700 900123"), "447700900123");
  assert.equal(whatsappNumberOf("+44 7700 900123"), "447700900123");
  assert.equal(whatsappNumberOf("+44 (0)7700 900123"), "447700900123");
  assert.equal(whatsappNumberOf("0044 7700 900123"), "447700900123");
  assert.equal(whatsappNumberOf("447700900123"), "447700900123");
  assert.equal(whatsappNumberOf("+33 6 12 34 56 78"), "33612345678");
  assert.equal(whatsappNumberOf("7700 900123"), null, "no country and no zero: could be anywhere");
  assert.equal(whatsappNumberOf("12"), null);
  assert.equal(whatsappNumberOf(undefined), null);
});

test("Kristina's email reminds her to send the address, one tap from the customer", () => {
  const html = replyToCustomerHtml({
    name: "Anna Smith",
    phone: "07700 900123",
    slot: "2026-10-06T10:00",
    service: "Alterations",
  });
  assert.match(html, /Send Anna the address/);
  const link = whatsappHrefIn(html);
  assert.equal(link?.pathname, "/447700900123");
  assert.equal(
    link?.searchParams.get("text"),
    "Hi Anna, it's Kristina from Beautasy. Looking forward to seeing you on Tuesday 6 October at 10:00am. Here's how to find me: "
  );
});

test("without a readable number she is told to reply to the email", () => {
  const html = replyToCustomerHtml({ name: "Anna", slot: "2026-10-06T10:00", service: "Alterations" });
  assert.match(html, /Send Anna the address/);
  assert.match(html, /Reply to this email to reach them/);
  assert.doesNotMatch(html, /wa\.me/);
});

test("a request with no time gets the WhatsApp link and no address reminder", () => {
  const html = replyToCustomerHtml({ name: "Anna", phone: "07700900123", service: "Repairs" });
  assert.doesNotMatch(html, /Send Anna the address/);
  assert.equal(
    whatsappHrefIn(html)?.searchParams.get("text"),
    "Hi Anna, it's Kristina from Beautasy, about your repairs request: "
  );
});

test("a name typed with markup cannot break Kristina's email", () => {
  const html = replyToCustomerHtml({
    name: "<script>x</script>",
    phone: "07700900123",
    slot: "2026-10-06T10:00",
    service: "Alterations",
  });
  assert.doesNotMatch(html, /<script>/);
});

test("both ways a confirmation leaves carry the calendar invite, and survive its refusal", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const route = readFileSync(join(process.cwd(), "src/app/api/atelier-booking/route.ts"), "utf8");
  const nightly = readFileSync(join(process.cwd(), "src/lib/bookingEmails.ts"), "utf8");

  // Straight away, from the booking itself…
  assert.match(route, /const invite = confirmation \? bookingInvite\(confirmation\) : null;/);
  assert.match(route, /await sendConfirmation\(\{[\s\S]*?\}, invite\);\s*confirmed = true;/);
  assert.match(route, /slotStart: slot,/);
  // …and from the nightly job, when the first attempt was refused
  assert.match(nightly, /const invite = status === "confirmed" \? bookingInvite\(booking\) : null;/);
  assert.match(nightly, /sendConfirmation\(\{[\s\S]*?\}, invite\)/);
  assert.match(nightly, /confirmedFor, slotStart, replyNote/);
  // Nothing sends an attachment except through the fallback
  assert.doesNotMatch(route + nightly, /attachments: \[invite\] \} : \{\}/);
});

test("the first line reads as a sentence", () => {
  assert.match(
    bookingEmailHtml(booked, "confirmed"),
    /Anna, your appointment for alterations is confirmed for <strong>Tuesday 6 October at 10:00am<\/strong>\./
  );
  assert.match(bookingEmailHtml({ ...booked, status: "declined" }, "declined"), /Anna, we're so sorry — we can't take your alterations on Tuesday/);
  assert.match(bookingEmailHtml({ ...booked, status: "completed" }, "completed"), /Anna, thank you for trusting us with your alterations\./);
  assert.match(
    bookingEmailHtml({ ...booked, service: undefined }, "confirmed"),
    /your appointment for fitting is confirmed/
  );
});


test("a refused attachment does not cost the customer their confirmation", async () => {
  const invite = bookingInvite(booked, new Date(Date.UTC(2026, 8, 26)))!;
  const message = { from: "a@b.c", to: "anna@example.com", subject: "s", html: "h" };

  // Taken with the file: one send, file attached
  const once: unknown[] = [];
  await sendConfirmation(message, invite, async (m) => void once.push(m));
  assert.equal(once.length, 1);
  assert.deepEqual((once[0] as { attachments?: unknown[] }).attachments, [invite]);

  // Refused with the file: sent again without it
  const twice: { attachments?: unknown[] }[] = [];
  await sendConfirmation(message, invite, async (m) => {
    twice.push(m);
    if (m.attachments) throw new Error("Invalid attachment");
  });
  assert.equal(twice.length, 2);
  assert.equal(twice[1].attachments, undefined);

  // Refused either way: the caller hears about it, and hands its claim back
  await assert.rejects(
    sendConfirmation(message, invite, async () => {
      throw new Error("Domain not verified");
    }),
    /Domain not verified/
  );

  // No invite: one plain send
  const plain: { attachments?: unknown[] }[] = [];
  await sendConfirmation(message, null, async (m) => void plain.push(m));
  assert.equal(plain.length, 1);
  assert.equal(plain[0].attachments, undefined);
});

test("a slot Kristina moved by hand gets no calendar for the old time", () => {
  const moved: NotifiableBooking = { ...booked, confirmedFor: "Thursday 8 October, 2pm" };
  assert.equal(fittingOf(moved), null);
  assert.equal(bookingInvite(moved), null);
  const html = bookingEmailHtml(moved, "confirmed");
  assert.match(html, /Thursday 8 October, 2pm/);
  assert.doesNotMatch(html, /calendar\.google\.com/);

  // The label the booking was born with is the slot itself
  assert.ok(fittingOf({ ...booked, confirmedFor: "Tuesday 6 October at 10:00am" }));
  assert.ok(fittingOf({ ...booked, confirmedFor: undefined }));
});

test("a wrongly typed number gets no link rather than a stranger's", () => {
  assert.equal(whatsappNumberOf("087 123 4567"), null, "an Irish mobile typed without its country");
  assert.equal(whatsappNumberOf("044 7700 900123"), null);
  assert.equal(whatsappNumberOf("07700 900123 ext 12"), null);
  assert.equal(whatsappNumberOf("+353 (0)87 123 4567"), "353871234567");
  assert.equal(whatsappNumberOf("+44 07700 900123"), "447700900123");
});

test("Kristina is reminded about the address for a request too", () => {
  const html = replyToCustomerHtml({ name: "Anna", phone: "07700900123", service: "Repairs" });
  assert.match(html, /When you confirm a time in the Studio, their email says you'll send the address/);
});
