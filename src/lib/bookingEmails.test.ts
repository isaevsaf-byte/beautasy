import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingEmailHtml,
  bookingEmailSubject,
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
  assert.match(nightly, /confirmedFor, slotStart, slotEnd, movedFrom, replyNote/);
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

test("a customer who cancelled is told kindly, and invited back", () => {
  const cancelled = { ...booked, status: "cancelled" };
  const html = bookingEmailHtml(cancelled, "cancelled");
  assert.match(html, /Your appointment is cancelled/);
  assert.match(html, /Anna, your appointment on <strong>Tuesday 6 October at 10:00am<\/strong> is cancelled, as you asked\./);
  assert.match(html, /href="https:\/\/www\.beautasy\.co\.uk\/atelier#book"[^>]*>Book another time</);
  assert.doesNotMatch(html, /we can't take/, "cancelling is theirs, not a refusal from Kristina");
  assert.equal(bookingEmailSubject(cancelled, "cancelled"), "Your Beautasy atelier appointment is cancelled");
});

test("a moved fitting says so, with the new time in the calendar and the old one named", () => {
  const moved: NotifiableBooking = {
    ...booked,
    slotStart: "2026-10-08T11:30",
    confirmedFor: "Thursday 8 October at 11:30am",
    movedFrom: "Tuesday 6 October at 10:00am",
  };
  const html = bookingEmailHtml(moved, "confirmed");
  assert.match(html, /Your fitting has moved/);
  assert.match(html, /has moved to <strong>Thursday 8 October at 11:30am<\/strong> \(it was Tuesday 6 October at 10:00am\)/);
  assert.match(html, /dates=20261008T103000Z%2F20261008T110000Z/, "the calendar is for the new time");
  assert.match(html, /exact address/);
  assert.equal(bookingEmailSubject(moved, "confirmed"), "Your Beautasy atelier appointment has moved 💜");
  assert.equal(bookingEmailSubject(booked, "confirmed"), "Your Beautasy atelier appointment is confirmed 💜");
});

test("a cancelled or declined booking is not a previous visit, so a friend's discount still applies", async () => {
  const { evaluate, parse } = await import("groq-js");
  const { BOOKING_HISTORY_QUERY } = await import("./referrals");
  const visit = (status: string) => ({
    _id: `b-${status}`,
    _type: "atelierBooking",
    emailFingerprint: "fp1",
    status,
    createdAt: "2026-09-01T09:00:00Z",
  });
  const count = async (docs: object[]) =>
    (await evaluate(parse(BOOKING_HISTORY_QUERY), {
      dataset: docs,
      params: { fp: "fp1", exclude: "", before: "2026-12-31T00:00:00Z" },
    })).get();

  assert.equal(await count([visit("declined"), visit("cancelled")]), 0);
  assert.equal(await count([visit("confirmed")]), 1);
  assert.equal(await count([visit("completed")]), 1);
});

/* ─── A bride's two slots ─── */

const bride: NotifiableBooking = {
  ...booked,
  service: "Bridal fitting",
  confirmedFor: "Tuesday 6 October at 10:00am",
  slotEnd: "2026-10-06T11:00",
};

test("a bride's confirmation says she is expected at the start, and that it takes about an hour", () => {
  const html = bookingEmailHtml(bride, "confirmed");
  assert.match(html, /is confirmed for <strong>Tuesday 6 October at 10:00am<\/strong>\. It takes about an hour\./);
  assert.doesNotMatch(html, /between/, "a fitting is a moment, not a window");
  // A fitting of one slot says nothing about length, as it never has
  assert.doesNotMatch(bookingEmailHtml(booked, "confirmed"), /It takes/);
  // Moved, she is still told how long it takes
  const moved = bookingEmailHtml({ ...bride, movedFrom: "Monday 5 October at 2:00pm" }, "confirmed");
  assert.match(moved, /\(it was Monday 5 October at 2:00pm\)\. It takes about an hour\. If the old time/);
  // Only a confirmation talks about the visit
  assert.doesNotMatch(bookingEmailHtml(bride, "cancelled"), /It takes/);
});

test("a bride's calendar holds her whole hour", () => {
  const event = fittingOf(bride);
  assert.ok(event);
  assert.equal(event.end.getTime() - event.start.getTime(), 60 * 60_000);
  const invite = Buffer.from(bookingInvite(bride)!.content, "base64").toString("utf8");
  // 10:00 and 11:00 in Southampton on 6 October are 09:00 and 10:00 UTC
  assert.match(invite, /DTSTART:20261006T090000Z/);
  assert.match(invite, /DTEND:20261006T100000Z/);
  // One slot is as long as the diary's slot, as before
  const single = fittingOf(booked)!;
  assert.equal(single.end.getTime() - single.start.getTime(), 30 * 60_000);
});
