import { test } from "node:test";
import assert from "node:assert/strict";
import { generateReviewToken, orderContainsProduct, type TokenOrder } from "./reviewToken";

const order: TokenOrder = {
  _id: "order-1",
  createdAt: "2026-08-01T10:00:00Z",
  items: [
    { productId: "prod-a", name: "Silk Bralette", quantity: 1 },
    { productId: "prod-b", name: "Cotton Briefs", quantity: 2 },
  ],
};

test("a review token is long, URL-safe and unique per call", () => {
  const a = generateReviewToken();
  const b = generateReviewToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32, `token too short: ${a.length}`);
  assert.match(a, /^[A-Za-z0-9_-]+$/, "token must be URL-safe");
});

test("a piece bought on the order can be reviewed with it", () => {
  assert.equal(orderContainsProduct(order, "prod-a"), true);
  assert.equal(orderContainsProduct(order, "prod-b"), true);
});

test("a piece that isn't on the order cannot", () => {
  assert.equal(orderContainsProduct(order, "prod-c"), false);
});

test("an order with no product ids reviews nothing", () => {
  const legacy: TokenOrder = {
    _id: "order-2",
    createdAt: "2026-08-01T10:00:00Z",
    items: [{ name: "Gift Box", quantity: 1 }],
  };
  assert.equal(orderContainsProduct(legacy, "prod-a"), false);
});
