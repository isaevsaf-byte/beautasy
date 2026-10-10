import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPence } from "./money";

test("prices read as British pounds, with a thousands comma once they need one", () => {
  assert.equal(formatPence(2400), "£24.00");
  assert.equal(formatPence(800), "£8.00");
  assert.equal(formatPence(123456), "£1,234.56");
  assert.equal(formatPence(5), "£0.05");
});
