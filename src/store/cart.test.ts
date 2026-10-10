import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PER_LINE, useCart, type CartItem } from "./useCart";

/**
 * "Clear bag" used to empty the bag on one tap, and with it a made-to-measure
 * line's measurements and a gift line's message. The bag now offers Undo for
 * a few seconds, and Undo is `restore`.
 */

const dress: CartItem = {
  id: "dress",
  name: "Linen dress",
  price: 6400,
  image: "/dress.jpg",
  measurements: "Bust 88 · Waist 70 · Hips 96",
  quantity: 1,
};
const scrunchie: CartItem = {
  id: "scrunchie",
  name: "Silk scrunchie",
  price: 1200,
  image: "/scrunchie.jpg",
  color: "Lilac",
  giftMessage: "For Anna",
  quantity: 2,
};

test("Undo after Clear bag puts every line back as it was, measurements and gift note included", () => {
  useCart.setState({ items: [dress, scrunchie] });
  const before = useCart.getState().items;
  useCart.getState().clearCart();
  assert.deepEqual(useCart.getState().items, []);
  useCart.getState().restore(before);
  assert.deepEqual(useCart.getState().items, [dress, scrunchie]);
});

test("a piece added between Clear bag and Undo is kept, and the same line adds up", () => {
  useCart.setState({ items: [dress, scrunchie] });
  const before = useCart.getState().items;
  useCart.getState().clearCart();
  useCart.getState().addItem({ ...scrunchie, quantity: 1 });
  useCart.getState().addItem({ id: "mask", name: "Sleep mask", price: 1800, image: "/mask.jpg" });
  useCart.getState().restore(before);
  const items = useCart.getState().items;
  assert.deepEqual(items.map((i) => [i.id, i.quantity]), [["dress", 1], ["scrunchie", 3], ["mask", 1]]);
  assert.equal(items[0].measurements, dress.measurements);
  assert.equal(items[1].giftMessage, "For Anna");
});

/**
 * Ten of one line is the most the bag takes (MAX_PER_LINE): Kristina sews
 * each one, so more is a WhatsApp conversation. Every way in is capped.
 */

const mask = { id: "mask", name: "Sleep mask", price: 1800, image: "/mask.jpg" };

test("the cap is ten", () => {
  assert.equal(MAX_PER_LINE, 10);
});

test("adding to a line stops at ten, however many arrive at once", () => {
  useCart.setState({ items: [] });
  useCart.getState().addItem({ ...mask, quantity: 8 });
  useCart.getState().addItem({ ...mask, quantity: 5 });
  assert.equal(useCart.getState().items[0].quantity, 10);
  useCart.getState().addItem(mask);
  assert.equal(useCart.getState().items[0].quantity, 10);
});

test("a new line of more than ten comes in at ten", () => {
  useCart.setState({ items: [] });
  useCart.getState().addItem({ ...mask, quantity: 25 });
  assert.equal(useCart.getState().items[0].quantity, 10);
});

test("the + in the bag cannot take a line past ten, and - still works from there", () => {
  useCart.setState({ items: [{ ...mask, quantity: 10 }] });
  useCart.getState().updateQuantity({ id: "mask" }, 11);
  assert.equal(useCart.getState().items[0].quantity, 10);
  useCart.getState().updateQuantity({ id: "mask" }, 9);
  assert.equal(useCart.getState().items[0].quantity, 9);
});

test("the cap is per line: ten in one colour leaves another colour free", () => {
  useCart.setState({ items: [] });
  useCart.getState().addItem({ ...mask, color: "Lilac", quantity: 10 });
  useCart.getState().addItem({ ...mask, color: "Ivory", quantity: 3 });
  assert.deepEqual(useCart.getState().items.map((i) => i.quantity), [10, 3]);
});

test("Undo that meets the same line added since stays at ten", () => {
  useCart.setState({ items: [{ ...mask, quantity: 7 }] });
  const before = useCart.getState().items;
  useCart.getState().clearCart();
  useCart.getState().addItem({ ...mask, quantity: 6 });
  useCart.getState().restore(before);
  assert.equal(useCart.getState().items[0].quantity, 10);
});

test("one removed line goes back in its old place, not at the top", () => {
  useCart.setState({ items: [dress, scrunchie, { ...mask, quantity: 1 }] });
  const line = useCart.getState().items[1];
  useCart.getState().removeItem(line);
  useCart.getState().restore([line], 1);
  assert.deepEqual(useCart.getState().items.map((i) => i.id), ["dress", "scrunchie", "mask"]);
});

test("a place past the end puts the line last", () => {
  useCart.setState({ items: [dress, scrunchie] });
  const line = useCart.getState().items[1];
  useCart.getState().removeItem(line);
  useCart.getState().restore([line], 7);
  assert.deepEqual(useCart.getState().items.map((i) => i.id), ["dress", "scrunchie"]);
});
