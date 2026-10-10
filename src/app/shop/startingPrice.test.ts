import { test } from "node:test";
import assert from "node:assert/strict";
import { startingPrice, startingPriceLabel } from "./startingPrice";

test("a piece priced per size starts from its cheapest size", () => {
  // Berry Velvet as it is in the Studio: S £18, M £25
  const berry = { price: 1800, availableSizes: ["S", "M"], sizePrices: [{ size: "S", price: 1800 }, { size: "M", price: 2500 }] };
  assert.deepEqual(startingPrice(berry), { pence: 1800, varies: true });
  assert.equal(startingPriceLabel(berry), "from £18.00");

  // Silk Road, with a base price that no size is sold at
  const silk = { price: 2500, availableSizes: ["S", "M"], sizePrices: [{ size: "S", price: 2200 }, { size: "M", price: 2900 }] };
  assert.equal(startingPriceLabel(silk), "from £22.00");
});

test("a size without its own price costs the base price", () => {
  const piece = { price: 2000, availableSizes: ["XS", "S", "M"], sizePrices: [{ size: "M", price: 2400 }] };
  assert.deepEqual(startingPrice(piece), { pence: 2000, varies: true });
  // A dearer size priced on its own still starts at the base
  assert.equal(startingPriceLabel(piece), "from £20.00");
});

test("one price for every size, or no sizes at all, says just the price", () => {
  assert.equal(startingPriceLabel({ price: 2000, availableSizes: ["S", "M"], sizePrices: [] }), "£20.00");
  assert.equal(
    startingPriceLabel({ price: 2000, availableSizes: ["S", "M"], sizePrices: [{ size: "S", price: 2000 }] }),
    "£20.00"
  );
  assert.equal(startingPriceLabel({ price: 1200, availableSizes: [], sizePrices: null }), "£12.00");
  assert.equal(startingPriceLabel({ price: 1200 }), "£12.00");
});

test("a price for a size that is not offered is not a starting price", () => {
  const piece = { price: 3000, availableSizes: ["M"], sizePrices: [{ size: "XS", price: 1000 }] };
  assert.deepEqual(startingPrice(piece), { pence: 3000, varies: false });
});
