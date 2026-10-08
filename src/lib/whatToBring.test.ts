import { test } from "node:test";
import assert from "node:assert/strict";
import { BRING, whatToBring } from "./whatToBring";
import { ATELIER_SERVICES, LEGACY_SERVICES } from "./atelierServices";
import { LOCAL_SERVICES } from "./localServices";
import { bookingEmailHtml, bookingInvite, fittingOf, notifiableFromDiary, type NotifiableBooking } from "./bookingEmails";
import { movedCopy } from "./diary";

test("every service a booking can arrive with has its own words for what to bring", () => {
  const names = [...ATELIER_SERVICES, ...LEGACY_SERVICES, ...LOCAL_SERVICES.map((service) => service.serviceName)];
  for (const name of names) assert.ok(BRING[name], `${name} has no "what to bring"`);
  assert.deepEqual(Object.keys(BRING).sort(), [...new Set(names)].sort(), "and nothing in the list that cannot be booked");
  // Short enough for a lock screen after "Beautasy fitting · "
  for (const [name, bring] of Object.entries(BRING)) {
    assert.ok(`Beautasy fitting · ${bring.title}`.length <= 60, `${name}: ${bring.title}`);
    assert.match(bring.title, /^bring /, `${name}: the reminder names what to bring`);
    assert.match(bring.sentence, /^[A-Z].*\.$/, `${name}: a sentence`);
  }
  assert.equal(whatToBring("Something new"), whatToBring("Alterations"), "an unknown name gets the general words");
});

test("the words are the service pages' own: shoes for a hem, the right underwear for a bride", () => {
  assert.match(whatToBring("Wedding Dress Alterations").sentence, /wedding shoes and the underwear/);
  assert.equal(whatToBring("Bridal fitting"), whatToBring("Wedding Dress Alterations"));
  assert.match(whatToBring("Prom and Evening Dress Alterations").sentence, /shoes/);
  assert.match(whatToBring("Jeans and Trouser Alterations").sentence, /shoes you wear with them/);
  assert.match(whatToBring("School Uniform Alterations").sentence, /child/);
  // Home textiles are curtains, blinds, cushions and runners: the words fit them all, as the page's own FAQ does
  assert.match(whatToBring("Home Textiles").sentence, /hooks out/);
  assert.match(whatToBring("Home Textiles").sentence, /fabric/);
  assert.match(whatToBring("Home Textiles").sentence, /cushion pad's size/);
  assert.match(whatToBring("Home Textiles").sentence, /to where the hem should land/);
  assert.match(whatToBring("Jeans and Trouser Alterations").title, /trousers/);
  for (const service of LOCAL_SERVICES) {
    const page = [service.priceNote ?? "", ...service.steps.map((s) => s.text), ...service.faqs.map((f) => f.a)].join(" ");
    if (/shoes/i.test(page)) assert.match(whatToBring(service.serviceName).sentence, /shoes/, `${service.slug}: its page asks for the shoes`);
  }
});

const booking: NotifiableBooking = {
  _id: "slot-2026-10-06-1000",
  _rev: "r1",
  status: "confirmed",
  displayName: "Anna",
  service: "Wedding Dress Alterations",
  confirmedFor: "Tuesday 6 October at 10:00am",
  slotStart: "2026-10-06T10:00",
  slotEnd: "2026-10-06T11:00",
  slotMinutes: 30,
  createdAt: "2026-09-30T18:02:11.456Z",
};

test("a booked fitting: the words in its title and first in its notes, and the email's Bring the same", () => {
  const event = fittingOf(booking);
  assert.ok(event);
  assert.equal(event.title, "Beautasy fitting · bring dress, wedding shoes & underwear");
  assert.ok(event.description.startsWith(`Bring: ${whatToBring(booking.service).sentence} `));
  assert.equal(event.uid, "booking-20260930T180211456Z@beautasy.co.uk");
  const html = bookingEmailHtml(booking, "confirmed").replace(/&#39;|&#x27;/g, "'");
  assert.ok(html.includes(whatToBring(booking.service).sentence));
});

test("moved by Kristina, the booking keeps its event: the invite the Studio sends updates the old one", () => {
  const stored = { ...booking, _type: "atelierBooking" };
  // The way the Studio reads a booking for its email (notifiableFromDiary), before and after a move
  const before = notifiableFromDiary(stored, 30);
  const moved = movedCopy(stored as never, "2026-10-08T14:00", "2026-10-02T09:00:00.000Z");
  assert.equal(moved._id, "slot-2026-10-08-1400", "a new document at the new time");
  const after = notifiableFromDiary(moved as never, 30);
  assert.equal(fittingOf(after)?.uid, fittingOf(before)?.uid, "the same event");
  assert.equal(fittingOf(after)?.uid, "booking-20260930T180211456Z@beautasy.co.uk");
});

test("a collection gets the evening-before alarm and the same lasting name", () => {
  const collection: NotifiableBooking = {
    ...booking,
    service: "Repairs",
    collection: { district: "SO17", zone: "Southampton", terms: "Free on orders from £40" },
    slotStart: "2026-10-06T14:00",
    slotEnd: "2026-10-06T15:00",
    confirmedFor: undefined,
  };
  const ics = (now: Date) => Buffer.from(bookingInvite(collection, now)!.content, "base64").toString("utf8").replace(/\r\n /g, "");
  const dayBefore = ics(new Date(Date.UTC(2026, 9, 5, 9)));
  assert.match(dayBefore, /\r\nUID:booking-20260930T180211456Z@beautasy\.co\.uk\r\n/);
  // 7pm on Monday to 2pm on Tuesday (BST) is 19 hours
  assert.deepEqual([...dayBefore.matchAll(/TRIGGER:(\S+)/g)].map((m) => m[1]), ["-PT2H", "-PT1140M"]);
  assert.deepEqual([...ics(new Date(Date.UTC(2026, 9, 5, 18, 30))).matchAll(/TRIGGER:(\S+)/g)].map((m) => m[1]), ["-PT2H"]);
});

test("called off, a booked time is taken out of the calendar by hand, so its reminders don't go off", () => {
  const hint = "If it&#39;s in your calendar, delete it there too, so its reminders don&#39;t go off.";
  const normal = (html: string) => html.replace(/&#x27;/g, "&#39;").replace(/'/g, "&#39;");
  assert.ok(normal(bookingEmailHtml(booking, "cancelled")).includes(hint));
  assert.ok(normal(bookingEmailHtml(booking, "declined")).includes(hint));
  // A request that never had a time was never in a calendar
  const request = { ...booking, slotStart: undefined, slotEnd: undefined, confirmedFor: undefined, preferredDate: "next week" };
  assert.ok(!normal(bookingEmailHtml(request, "declined")).includes(hint));
  assert.ok(!normal(bookingEmailHtml(request, "cancelled")).includes(hint));
  // A time Kristina typed by hand never went into a calendar either
  assert.ok(!normal(bookingEmailHtml({ ...request, confirmedFor: "Thursday at 3pm" }, "cancelled")).includes(hint));
  assert.ok(!normal(bookingEmailHtml(booking, "confirmed")).includes(hint));
  // A collection given a time did, with its evening alarm
  const collected = { ...booking, collection: { district: "SO17", zone: "Southampton" }, slotStart: "2026-10-06T14:00", slotEnd: "2026-10-06T15:00" };
  assert.ok(normal(bookingEmailHtml(collected, "cancelled")).includes(hint));
});
