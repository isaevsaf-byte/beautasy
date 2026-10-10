import { test } from "node:test";
import assert from "node:assert/strict";
import { useCart, type CartItem } from "./useCart";

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
