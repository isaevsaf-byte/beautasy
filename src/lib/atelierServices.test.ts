import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATELIER_SERVICES,
  BRIDAL_SERVICES,
  LEGACY_SERVICES,
  pieceInSentence,
  serviceInSentence,
  slotsFor,
  startForService,
  startsFor,
} from "./atelierServices";
import { LOCAL_SERVICES, getLocalService } from "./localServices";
import type { SlotDay } from "./slots";

/**
 * How long each service holds the diary. The owner's decision: a bride gets
 * two slots in a row, everyone else one — prom dresses included.
 */

test("a bride takes two slots, and nobody else does", () => {
  assert.equal(slotsFor("Bridal fitting"), 2);
  assert.equal(slotsFor("Wedding Dress Alterations"), 2);
  for (const service of ["Alterations", "Repairs", "Custom Sewing", "Home Textiles", "Not sure — free 10-minute look"]) {
    assert.equal(slotsFor(service), 1, `${service} took two slots`);
  }
  assert.equal(slotsFor("Prom and Evening Dress Alterations"), 1, "a prom dress is one slot");
  assert.equal(slotsFor(undefined), 1);
  assert.equal(slotsFor("bridal fitting"), 1, "only the names the form sends");
});

test("the wedding page's bookings take two slots, the prom page's one", () => {
  // The landing page sends its own serviceName as the form's default service.
  // Renamed there and not here, brides from Google would quietly book one slot.
  const wedding = getLocalService("wedding-dress-southampton");
  assert.ok(wedding, "the wedding landing page has gone");
  assert.ok(BRIDAL_SERVICES.includes(wedding.serviceName), `"${wedding.serviceName}" is not in BRIDAL_SERVICES`);
  const prom = getLocalService("prom-and-evening-dress-southampton");
  assert.ok(prom);
  assert.equal(slotsFor(prom.serviceName), 1);
  // And no other landing page is a bride by accident
  const bridal = LOCAL_SERVICES.filter((service) => slotsFor(service.serviceName) > 1).map((s) => s.slug);
  assert.deepEqual(bridal, ["wedding-dress-southampton"]);
});

test("the form offers a bridal fitting and a free ten-minute look, and the old 'not sure' is kept for older pages", () => {
  assert.ok(ATELIER_SERVICES.includes("Bridal fitting"));
  assert.ok(ATELIER_SERVICES.includes("Not sure — free 10-minute look"));
  assert.ok(!ATELIER_SERVICES.includes("Other / Not Sure"), "the old wording is still on the form");
  assert.ok(LEGACY_SERVICES.includes("Other / Not Sure"), "a page open since before the rename would be refused");
});

/** Tuesday: 2:00pm and 2:30pm free in a row, 3:30pm free on its own (4:00pm taken). */
const DAYS: SlotDay[] = [
  {
    date: "2026-10-06",
    label: "Tuesday 6 October",
    slots: [
      { start: "2026-10-06T14:00", label: "2:00pm" },
      { start: "2026-10-06T14:30", label: "2:30pm" },
      { start: "2026-10-06T15:30", label: "3:30pm" },
    ],
  },
  { date: "2026-10-07", label: "Wednesday 7 October", slots: [{ start: "2026-10-07T10:00", label: "10:00am" }] },
];

const starts = (days: SlotDay[]) => days.flatMap((day) => day.slots.map((slot) => slot.start));

test("a bride is offered only starts where both slots are free", () => {
  assert.deepEqual(starts(startsFor(DAYS, "Bridal fitting", 30)), ["2026-10-06T14:00"]);
  assert.deepEqual(starts(startsFor(DAYS, "Wedding Dress Alterations", 30)), ["2026-10-06T14:00"]);
  assert.deepEqual(starts(startsFor(DAYS, "Alterations", 30)), starts(DAYS), "a fitting of one slot lost a time");
  // In the diary's own slot length: hour-long slots make a bride's fitting two hours
  const hourly: SlotDay[] = [
    {
      date: "2026-10-06",
      label: "Tuesday 6 October",
      slots: ["10:00", "11:00", "13:00"].map((time) => ({ start: `2026-10-06T${time}`, label: time })),
    },
  ];
  assert.deepEqual(starts(startsFor(hourly, "Bridal fitting", 60)), ["2026-10-06T10:00"]);
});

test("a start that no longer fits once the service changes is let go", () => {
  assert.equal(startForService(DAYS, "Alterations", 30, "2026-10-06T14:30"), "2026-10-06T14:30");
  assert.equal(startForService(DAYS, "Bridal fitting", 30, "2026-10-06T14:30"), null, "2:30pm has no free 3:00pm after it");
  assert.equal(startForService(DAYS, "Bridal fitting", 30, "2026-10-06T14:00"), "2026-10-06T14:00");
  assert.equal(startForService(DAYS, "Bridal fitting", 30, null), null);
  assert.equal(startForService(DAYS, "Alterations", 30, "2026-10-08T09:00"), null, "a time the diary no longer has");
});

test("a service reads as words mid-sentence, the 'not sure' choices as what they are", () => {
  assert.equal(serviceInSentence("Alterations"), "alterations");
  assert.equal(serviceInSentence("Bridal fitting"), "bridal fitting");
  assert.equal(serviceInSentence("Not sure — free 10-minute look"), "free 10-minute look");
  assert.equal(serviceInSentence("Other / Not Sure"), "visit");
  assert.equal(serviceInSentence(undefined), "fitting");
  assert.equal(serviceInSentence(""), "fitting");
  // What Kristina collects is a piece when nobody has named the job yet
  assert.equal(pieceInSentence("Repairs"), "repairs");
  assert.equal(pieceInSentence("Not sure — free 10-minute look"), "piece");
  assert.equal(pieceInSentence("Other / Not Sure"), "piece");
  assert.equal(pieceInSentence(undefined), "piece");
  // Every name the form offers, or ever offered, reads without the button's dash and slash
  for (const service of [...ATELIER_SERVICES, ...LEGACY_SERVICES]) {
    assert.doesNotMatch(serviceInSentence(service), /not sure|\//, service);
    assert.doesNotMatch(pieceInSentence(service), /not sure|\//, service);
  }
});
