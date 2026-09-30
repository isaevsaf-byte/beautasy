import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_DEFAULTS,
  collectionHeadline,
  collectionOffer,
  collectionSettingsFrom,
  collectionTerms,
  formatPostcode,
  judgeCollection,
  onItsWayTo,
  postcodeDistrict,
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
  settings.windows.push("Sunday");
  assert.equal(COLLECTION_DEFAULTS.zones[0].districts.includes("SO45"), false, "a caller changed the defaults");
  assert.equal(COLLECTION_DEFAULTS.windows.includes("Sunday"), false, "a caller changed the defaults");
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
    windows: [" Monday 7–9pm ", "", "Monday 7–9pm", 5],
    note: "  Curtains only  ",
  });
  assert.deepEqual(settings.zones, [{ name: "City", districts: ["SO17", "SO18"], fee: 700, freeFrom: 3500 }]);
  assert.deepEqual(settings.windows, ["Monday 7–9pm"]);
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
  const untimed = collectionSettingsFrom({ windows: [] });
  assert.deepEqual(untimed.windows, []);
});

test("switched off in the Studio, the form offers nothing", () => {
  assert.equal(collectionOffer(collectionSettingsFrom({ enabled: false })), null);
  const verdict = judgeCollection(collectionSettingsFrom({ enabled: false, windows: ["Tuesday 6–8pm"] }), { postcode: "SO17 1AB", window: "Tuesday 6–8pm" });
  assert.equal(verdict.ok, false);
});

test("the offer carries the price of every zone and the headline of the first", () => {
  const offer = collectionOffer(collectionSettingsFrom(null));
  assert.ok(offer);
  assert.equal(offer.headline, "Free collection & return in Southampton on orders from £40");
  assert.equal(offer.zones[0].terms, "Free on orders from £40, otherwise £8");
  assert.deepEqual(offer.windows, COLLECTION_DEFAULTS.windows);
});

/** Windows are Safar's and live only in the Studio; these stand in for his */
const timed = () => collectionSettingsFrom({ windows: ["Tuesday 6–8pm", "Thursday 6–8pm"] });

test("the defaults ask no time: the windows are Safar's, kept in the Studio", () => {
  assert.deepEqual(COLLECTION_DEFAULTS.windows, []);
  assert.deepEqual(timed().windows, ["Tuesday 6–8pm", "Thursday 6–8pm"]);
  assert.equal(timed().zones.length, 2, "setting windows alone lost the default zones");
});

test("a good request is kept as its district and terms, never its street", () => {
  const verdict = judgeCollection(timed(), { postcode: "so17 1ab", window: " Thursday 6–8pm " });
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.deepEqual(verdict.request, {
    district: "SO17",
    zone: "Southampton",
    terms: "Free on orders from £40, otherwise £8",
    window: "Thursday 6–8pm",
  });
  assert.equal(verdict.postcode, "SO17 1AB", "the full postcode is for Kristina's email");
  assert.equal(JSON.stringify(verdict.request).includes("1AB"), false, "the booking keeps the street half of the postcode");
});

test("a district nobody drives to is refused with a way forward", () => {
  const verdict = judgeCollection(timed(), { postcode: "SO45 6AB", window: "Tuesday 6–8pm" });
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.match(verdict.error, /SO45/);
  assert.match(verdict.error, /fitting|WhatsApp/);
});

test("no postcode is refused", () => {
  const settings = timed();
  assert.equal(judgeCollection(settings, { window: "Tuesday 6–8pm" }).ok, false);
  assert.equal(judgeCollection(settings, { postcode: "hello", window: "Tuesday 6–8pm" }).ok, false);
  assert.equal(judgeCollection(settings, null).ok, false);
  assert.equal(judgeCollection(settings, "SO17 1AB").ok, false);
});

test("a time that is gone, or none, is no reason to refuse — and a time nobody offered is not kept", () => {
  // A page open since the Studio changed its windows: its list is stale, and
  // refusing would leave the customer nothing they could choose
  const settings = timed();
  for (const window of [undefined, "", "Saturday 10am–12pm", "Sunday 3am", 5]) {
    const verdict = judgeCollection(settings, { postcode: "SO17 1AB", window });
    assert.equal(verdict.ok, true, `refused with the window ${String(window)}`);
    if (verdict.ok) assert.equal(verdict.request.window, undefined, "a time nobody offered reached Kristina");
  }
});

test("with no windows in the Studio, no time is asked", () => {
  const verdict = judgeCollection(collectionSettingsFrom({ windows: [] }), { postcode: "SO17 1AB", window: "anything" });
  assert.equal(verdict.ok, true);
  if (verdict.ok) assert.equal(verdict.request.window, undefined);
});
