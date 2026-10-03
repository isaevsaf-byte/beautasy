import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_DEFAULTS,
  COLLECTION_TRIP_MINUTES,
  DEFAULT_TRIP_MINUTES,
  WHEN_MAX,
  collectionHeadline,
  collectionOffer,
  collectionSettingsFrom,
  collectionTerms,
  formatPostcode,
  judgeCollection,
  onItsWayTo,
  postcodeDistrict,
  whenSuits,
  zoneFor,
} from "./collection";

/**
 * Collection and return is priced by postcode district, so everything rests
 * on reading a postcode the way people actually type one, and on never
 * promising a collection the Studio did not agree to: a district nobody
 * drives to, a time nobody offered, a zone nobody priced.
 */

test("a postcode is read however it is typed", () => {
  assert.equal(postcodeDistrict("SO17 1AB"), "SO17");
  assert.equal(postcodeDistrict("so171ab"), "SO17");
  assert.equal(postcodeDistrict("  so17   1ab "), "SO17");
  assert.equal(postcodeDistrict("SO17"), "SO17");
  assert.equal(postcodeDistrict("SO16 0XY"), "SO16");
  assert.equal(postcodeDistrict("SW1A 1AA"), "SW1A", "a letter after the number is a real district");
  assert.equal(postcodeDistrict("SO 17 1AB"), "SO17", "a stray space inside the district");
});

test("a zero for the O, the typo everybody in Southampton makes, is read as SO", () => {
  assert.equal(postcodeDistrict("S017 1AB"), "SO17");
  assert.equal(postcodeDistrict("s0171ab"), "SO17");
});

test("the price stays on screen while the rest of the postcode is typed", () => {
  assert.equal(postcodeDistrict("SO17 1"), "SO17");
  assert.equal(postcodeDistrict("SO17 1A"), "SO17");
});

test("something that is not a postcode is not read as one", () => {
  for (const input of ["", "   ", "12345", "hello", "SO", "SO17 1AB 2CD 3EF", "1SO7", null, undefined, 17, {}]) {
    assert.equal(postcodeDistrict(input), null, `read ${JSON.stringify(input)} as a postcode`);
  }
});

test("a postcode is written as it would be on an envelope", () => {
  assert.equal(formatPostcode("so171ab"), "SO17 1AB");
  assert.equal(formatPostcode("S017 1ab"), "SO17 1AB");
  assert.equal(formatPostcode("SO17"), "SO17");
  assert.equal(formatPostcode("SO17 1"), "SO17");
  assert.equal(formatPostcode("nonsense"), null);
});

test("nobody is turned away halfway through typing their own postcode", () => {
  const covered = COLLECTION_DEFAULTS.zones.flatMap((zone) => zone.districts);
  // SO1, SO3, SO4 and SO5 read as districts of their own, none of them covered
  for (const typing of ["S", "so", "SO1", "s01", "SO3", "SO4", "SO5", " so5 "]) {
    assert.equal(onItsWayTo(covered, typing), true, typing);
  }
  for (const done of ["SO17", "SO17 1", "SO45", "SO2", "SO531", "", "   ", "PO1"]) {
    assert.equal(onItsWayTo(covered, done), false, done);
  }
  assert.equal(onItsWayTo([], "SO1"), false, "with nothing covered, there is nothing to wait for");
});

test("a district finds its zone, and one nobody drives to finds none", () => {
  const settings = collectionSettingsFrom(null);
  assert.equal(zoneFor(settings, "SO17")?.name, "Southampton");
  assert.equal(zoneFor(settings, "SO53")?.name, "Hedge End, Totton, Eastleigh and Chandler's Ford");
  assert.equal(zoneFor(settings, "SO45"), null, "Hythe is not in either zone");
  assert.equal(zoneFor(settings, "PO1"), null);
  assert.equal(zoneFor(settings, null), null);
});

test("the terms read the way they were agreed", () => {
  assert.equal(collectionTerms({ fee: 800, freeFrom: 4000 }), "Free on orders from £40, otherwise £8");
  assert.equal(collectionTerms({ fee: 1250, freeFrom: 8000 }), "Free on orders from £80, otherwise £12.50");
  assert.equal(collectionTerms({ fee: 0, freeFrom: 4000 }), "Free");
  assert.equal(collectionTerms({ fee: 800, freeFrom: 0 }), "£8", "no free threshold means always charged, never always free");
});

test("the defaults are the terms agreed on 29 September", () => {
  const [city, outer] = COLLECTION_DEFAULTS.zones;
  assert.equal(collectionTerms(city), "Free on orders from £40, otherwise £8");
  assert.deepEqual(city.districts, ["SO14", "SO15", "SO16", "SO17", "SO18", "SO19"]);
  assert.equal(collectionTerms(outer), "Free on orders from £80, otherwise £12");
  assert.equal(collectionHeadline(city), "Free collection & return in Southampton on orders from £40");
});

test("empty settings fall back to the defaults, a copy rather than the original", () => {
  const settings = collectionSettingsFrom(undefined);
  assert.equal(settings.enabled, true);
  assert.equal(settings.zones.length, 2);
  settings.zones[0].districts.push("SO45");
  assert.equal(COLLECTION_DEFAULTS.zones[0].districts.includes("SO45"), false, "a caller changed the defaults");
});

test("the Studio's own zones are read, tidied, and the unfinished ones left out", () => {
  const settings = collectionSettingsFrom({
    enabled: true,
    zones: [
      { name: " City ", districts: ["so17", "SO18 ", "nonsense", "SO17"], fee: 700, freeFrom: 3500 },
      { name: "No price", districts: ["SO30"] },
      { name: "", districts: ["SO40"], fee: 500 },
      { name: "No districts", districts: [], fee: 500 },
      { name: "Negative", districts: ["SO50"], fee: -100 },
    ],
    note: "  Curtains only  ",
  });
  assert.deepEqual(settings.zones, [{ name: "City", districts: ["SO17", "SO18"], fee: 700, freeFrom: 3500 }]);
  assert.equal(settings.note, "Curtains only");
});

test("a zone with no free threshold is charged, not free", () => {
  const settings = collectionSettingsFrom({ zones: [{ name: "City", districts: ["SO17"], fee: 800 }] });
  assert.equal(settings.zones[0].freeFrom, 0);
  assert.equal(collectionTerms(settings.zones[0]), "£8");
});

test("an empty list in the Studio is taken at its word", () => {
  const nowhere = collectionSettingsFrom({ zones: [] });
  assert.equal(nowhere.zones.length, 0);
  assert.equal(collectionOffer(nowhere), null, "no zones, and the form still offered to collect");
});

test("switched off in the Studio, the form offers nothing", () => {
  assert.equal(collectionOffer(collectionSettingsFrom({ enabled: false })), null);
  const verdict = judgeCollection(collectionSettingsFrom({ enabled: false }), { postcode: "SO17 1AB" });
  assert.equal(verdict.ok, false);
});

test("the windows Safar used to drive in are no longer read or offered", () => {
  // Kristina drives from 3 October 2026 and picks each time from her diary;
  // the old windows may still be saved in the Studio
  const settings = collectionSettingsFrom({ windows: ["Tuesday 6–8pm", "Thursday 6–8pm"] });
  assert.equal("windows" in settings, false, "the settings still carry Safar's windows");
  assert.equal(settings.zones.length, 2, "old windows lost the default zones");
  const offer = collectionOffer(settings);
  assert.ok(offer);
  assert.equal("windows" in offer, false, "the form is still handed windows to offer");
  const verdict = judgeCollection(settings, { postcode: "SO17 1AB", window: "Tuesday 6–8pm" });
  assert.equal(verdict.ok, true);
  if (verdict.ok) {
    assert.equal(JSON.stringify(verdict).includes("Tuesday"), false, "a window from an old page reached the booking");
  }
});

test("the offer carries the price of every zone and the headline of the first", () => {
  const offer = collectionOffer(collectionSettingsFrom(null));
  assert.ok(offer);
  assert.equal(offer.headline, "Free collection & return in Southampton on orders from £40");
  assert.equal(offer.zones[0].terms, "Free on orders from £40, otherwise £8");
});

test("a good request is kept as its district and terms, never its street or their words", () => {
  const verdict = judgeCollection(collectionSettingsFrom(null), { postcode: "so17 1ab", when: " weekday\n  mornings " });
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.deepEqual(verdict.request, {
    district: "SO17",
    zone: "Southampton",
    terms: "Free on orders from £40, otherwise £8",
  });
  assert.equal(verdict.postcode, "SO17 1AB", "the full postcode is for Kristina's email");
  assert.equal(verdict.when, "weekday mornings", "when they are in is tidied into one line for Kristina");
  assert.equal(JSON.stringify(verdict.request).includes("1AB"), false, "the booking keeps the street half of the postcode");
  assert.equal(JSON.stringify(verdict.request).includes("mornings"), false, "their own words went into the public booking");
});

test("a district nobody drives to is refused with a way forward", () => {
  const verdict = judgeCollection(collectionSettingsFrom(null), { postcode: "SO45 6AB" });
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.error, /SO45/);
  assert.match(verdict.error, /fitting|WhatsApp/);
});

test("no postcode is refused", () => {
  const settings = collectionSettingsFrom(null);
  assert.equal(judgeCollection(settings, { when: "mornings" }).ok, false);
  assert.equal(judgeCollection(settings, { postcode: "hello" }).ok, false);
  assert.equal(judgeCollection(settings, null).ok, false);
  assert.equal(judgeCollection(settings, "SO17 1AB").ok, false);
});

test("saying nothing about when, or nonsense, is never a reason to refuse", () => {
  const settings = collectionSettingsFrom(null);
  for (const when of [undefined, "", "   ", 5, null, { day: "Monday" }]) {
    const verdict = judgeCollection(settings, { postcode: "SO17 1AB", when });
    assert.equal(verdict.ok, true, `refused with when = ${JSON.stringify(when)}`);
    if (verdict.ok) assert.equal(verdict.when, undefined, `kept when = ${JSON.stringify(when)}`);
  }
});

test("when they are in is one tidy line, cut to length", () => {
  assert.equal(whenSuits("  after   5pm\r\n or Saturdays "), "after 5pm or Saturdays");
  assert.equal(whenSuits("a\u0000b\u0007c"), "a b c", "control characters went into Kristina's email");
  assert.equal(whenSuits("x".repeat(500))?.length, WHEN_MAX);
  assert.equal(whenSuits("   "), undefined);
  assert.equal(whenSuits(42), undefined);
});

test("the trip lengths Kristina can pick are whole half hours, the default among them", () => {
  assert.deepEqual([...COLLECTION_TRIP_MINUTES], [30, 60, 90, 120]);
  assert.ok((COLLECTION_TRIP_MINUTES as readonly number[]).includes(DEFAULT_TRIP_MINUTES));
  for (const minutes of COLLECTION_TRIP_MINUTES) assert.equal(minutes % 30, 0);
});

test("a line cut on a space does not keep the space", () => {
  assert.equal(whenSuits("x".repeat(119) + " yz"), "x".repeat(119));
});
