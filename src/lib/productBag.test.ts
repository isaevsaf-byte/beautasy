import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_MEASUREMENTS,
  bagBlockers,
  bagButtonLabel,
  bagLines,
  isBlocked,
  listMeasurements,
  measurementFieldsFor,
  measurementSummary,
  missingMeasurements,
  type BagChoice,
} from "./productBag";

/**
 * With "Made to your measurements" ticked and a measurement missing, a tap
 * on Add to Bag used to add the standard piece and drop the +£10 line without
 * a word. These are the rules that now stop it.
 */

const chosen: BagChoice = {
  hasSizes: true,
  size: "M",
  hasColors: false,
  color: null,
  madeToMeasure: false,
  measurementsMissing: [],
};

test("a missing measurement stops the add while made to measure is ticked", () => {
  const halfFilled = { ...EMPTY_MEASUREMENTS, bust: "86cm" };
  const missing = missingMeasurements(halfFilled, "Lingerie");
  assert.deepEqual(missing, ["waist", "hips"]);

  const blockers = bagBlockers({ ...chosen, madeToMeasure: true, measurementsMissing: missing });
  assert.equal(blockers.measurements, true);
  assert.equal(isBlocked(blockers), true);
  assert.equal(bagButtonLabel(blockers, 3000), "Add Your Measurements");
  assert.equal(bagButtonLabel(blockers), "Add Your Measurements", "the sticky bar says the same");

  // Unticked, the same half-filled form is no obstacle: it is not being used
  assert.equal(isBlocked(bagBlockers({ ...chosen, madeToMeasure: false, measurementsMissing: missing })), false);
});

test("spaces are not a measurement", () => {
  assert.deepEqual(missingMeasurements({ ...EMPTY_MEASUREMENTS, bust: " ", waist: "70", hips: "94" }, "Lingerie"), ["bust"]);
});

test("a child's piece asks for no bust", () => {
  assert.deepEqual(measurementFieldsFor("Kids").map(([field]) => field), ["waist", "hips", "height"]);
  assert.deepEqual(missingMeasurements(EMPTY_MEASUREMENTS, "Kids"), ["waist", "hips"]);
  assert.equal(listMeasurements(["waist", "hips"]), "waist and hips");
  assert.equal(listMeasurements(["bust", "waist", "hips"]), "bust, waist and hips");
});

test("size and colour come first, and the label says what is missing", () => {
  const both = bagBlockers({ ...chosen, size: null, hasColors: true });
  assert.equal(bagButtonLabel(both), "Select Size & Colour");
  assert.equal(bagButtonLabel(bagBlockers({ ...chosen, size: null })), "Select a Size");
  assert.equal(bagButtonLabel(bagBlockers({ ...chosen, hasColors: true })), "Select a Colour");
  assert.equal(bagButtonLabel(bagBlockers(chosen), 3000), "Add to Bag — £30.00");
  assert.equal(bagButtonLabel(bagBlockers(chosen)), "Add to Bag");
});

const order = {
  product: { _id: "p1", name: "Pearl Blossom Thong", slug: "pearl-blossom-thong" },
  price: 2000,
  image: "https://cdn.sanity.io/images/x/y/a.jpg",
  size: "M",
  color: null,
  giftBox: null,
  madeToMeasure: null,
};

test("made to measure ticked puts its £10 line in the bag, measurements and all", () => {
  const measurements = { bust: "86cm", waist: "70cm", hips: "94cm", height: "", notes: "Longer straps" };
  const lines = bagLines({ ...order, madeToMeasure: { price: 1000, measurements } });
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1], {
    id: "p1-madetomeasure",
    name: "Made to Measure — Pearl Blossom Thong",
    price: 1000,
    image: order.image,
    // The exact string checkout passes on to Stripe — unchanged from before
    measurements: "Bust 86cm · Waist 70cm · Hips 94cm · Notes: Longer straps",
  });
  assert.equal(measurementSummary(measurements), lines[1].measurements);
});

test("the piece itself carries its size and colour; a gift box carries its message", () => {
  const lines = bagLines({ ...order, color: "Ivory", giftBox: { price: 500, message: "  Happy birthday  " } });
  assert.deepEqual(lines[0], {
    id: "p1",
    name: "Pearl Blossom Thong",
    slug: "pearl-blossom-thong",
    price: 2000,
    image: order.image,
    size: "M",
    color: "Ivory",
  });
  assert.equal(lines[1].id, "p1-giftbox");
  assert.equal(lines[1].giftMessage, "Happy birthday");
  assert.equal(bagLines({ ...order, giftBox: { price: 500, message: "" } })[1].giftMessage, undefined);
  assert.equal(bagLines({ ...order, giftBox: { price: 0, message: "x" } }).length, 1, "a free gift box is no line");
});
