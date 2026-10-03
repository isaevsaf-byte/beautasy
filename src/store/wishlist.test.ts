import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardAction } from "@/lib/shopCard";
import { useWishlist, wishlistEntry, type WishlistItem } from "./useWishlist";

/**
 * "Add to Bag" on the wishlist, for a piece that comes in colours.
 *
 * The shop card sends a coloured piece to its page and checkout refuses a
 * coloured piece with no colour, but the wishlist kept only the sizes: the
 * Cloud sleeping mask (four colours, no sizes) hearted on the grid showed
 * "Add to Bag" on /wishlist, went into the bag with no colour, and checkout
 * then answered 400 for the whole bag until she found the line and took it out.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

// As the shop grid has it: every listing maps a missing count to 0
const mask = {
  _id: "product-cloud-mask",
  name: "Cloud sleeping mask",
  price: 1800,
  slug: "cloud-sleeping-mask",
  availableSizes: [],
  colorCount: 4,
};

test("a piece hearted with a colour to choose sends the shopper to choose it", () => {
  useWishlist.getState().clearWishlist();
  useWishlist.getState().toggleItem(wishlistEntry(mask, "/mask.jpg"));
  const [saved] = useWishlist.getState().items;
  assert.equal(saved.colorCount, 4, "the wishlist has to keep how many colours there are");
  assert.deepEqual(cardAction(saved), { kind: "page", label: "Choose Colour" });
});

test("only a piece with nothing to choose goes straight from the wishlist into the bag", () => {
  const plain = wishlistEntry({ ...mask, _id: "product-plain", colorCount: 0 }, "/plain.jpg");
  assert.deepEqual(cardAction(plain), { kind: "add" });
  const sized = wishlistEntry({ ...mask, availableSizes: ["S", "M"], colorCount: 0 }, "/sized.jpg");
  assert.deepEqual(cardAction(sized), { kind: "page", label: "Choose Size" });
});

test("anything saved before colours were kept, and a gift box, goes to its page", () => {
  // What a heart saved before this change left in localStorage
  const old: WishlistItem = { id: "product-cloud-mask", name: "Cloud sleeping mask", price: 1800, image: "/m.jpg", slug: "cloud-sleeping-mask", availableSizes: [] };
  assert.equal(cardAction(old).kind, "page", "it cannot know the mask has no colour to choose");
  // How the gift box pages save one: no sizes, no colours said
  const box: WishlistItem = { id: "giftBox-1", name: "Pamper box", price: 4500, image: "/b.jpg", slug: "gift-boxes/pamper-box" };
  assert.equal(cardAction(box).kind, "page");
  // A count the listing didn't give is not "none"
  assert.equal("colorCount" in wishlistEntry({ ...mask, colorCount: null }, "/m.jpg"), false);
});

test("the shop card and the product page both save through wishlistEntry, with the colours", () => {
  const card = read("src/app/shop/ShopContent.tsx");
  assert.match(card, /<WishlistButton\s+product=\{wishlistEntry\(product, activeImage\)\}/);
  const page = read("src/app/shop/[param]/ProductDetail.tsx");
  assert.match(
    page,
    /<WishlistButton\s+product=\{wishlistEntry\(\s*\{ \.\.\.product, colorCount: product\.availableColors\?\.length \?\? 0 \},/,
    "the product page knows the colours itself; without them its heart saves a mask that can be bagged colourless"
  );
});

test("the wishlist decides with the shop card's own rule, not sizes alone", () => {
  const wishlist = read("src/app/wishlist/page.tsx");
  assert.match(wishlist, /const action = cardAction\(item\);/);
  assert.match(wishlist, /\{action\.kind === "page" \? \(/);
  assert.doesNotMatch(wishlist, /availableSizes\.length > 0/, "sizes alone let a colourless mask into the bag");
});
