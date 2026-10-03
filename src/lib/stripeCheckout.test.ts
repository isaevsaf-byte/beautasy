import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  checkoutReturnBase,
  createCheckoutSession,
  refusedSetting,
  colourNotChosen,
  resolveLine,
  trustedImage,
  type PriceLookupGiftBox,
  type PriceLookupProduct,
} from "./stripeCheckout";
import { SITE_URL } from "./site";

/* ─── Where Stripe sends the shopper back ─── */

test("the shop sends Stripe back to itself, whatever the request claimed to come from", () => {
  assert.equal(checkoutReturnBase({ VERCEL_ENV: "production", NODE_ENV: "production" }), SITE_URL);
  assert.equal(
    checkoutReturnBase({ VERCEL_ENV: "preview", VERCEL_URL: "beautasy-git-x.vercel.app", NODE_ENV: "production" }),
    "https://beautasy-git-x.vercel.app",
    "a preview pays and comes back to the preview, at the address Vercel gave it"
  );
  assert.equal(checkoutReturnBase({ NODE_ENV: "development" }), "http://localhost:3000");
  assert.equal(checkoutReturnBase({ NODE_ENV: "production" }), SITE_URL, "unknown production falls back to the shop");
});

/* ─── What a line is, according to Sanity ─── */

const SLIP: PriceLookupProduct = {
  _id: "p-slip",
  name: "Silk Slip",
  price: 3800,
  availableSizes: ["S", "M"],
  sizePrices: [{ size: "L", price: 4200 }],
  colorNames: ["Ivory", "Lavender"],
  giftBoxAvailable: true,
  giftBoxPrice: 500,
  madeToMeasureAvailable: true,
  madeToMeasurePrice: 1000,
};
const BOX: PriceLookupGiftBox = { _id: "gb-1", name: "Keepsake Box", price: 1500 };
const products = new Map([[SLIP._id, SLIP]]);
const boxes = new Map([[BOX._id, BOX]]);

test("a line's name is Sanity's, never the one the bag sent", () => {
  const line = resolveLine({ id: "p-slip", size: "M", color: "Ivory" }, products, boxes);
  assert.deepEqual(line, { price: 3800, name: "Silk Slip", size: "M", color: "Ivory" });
  // There is no way to pass a name in: the browser's name is not an input at all
  assert.equal(resolveLine.length, 3);
});

test("a size or colour the piece is not offered in cannot be bought", () => {
  assert.equal(resolveLine({ id: "p-slip", size: "XXL", color: "Ivory" }, products, boxes), null);
  assert.equal(resolveLine({ id: "p-slip", color: "Hot pink" }, products, boxes), null);
  const noSizes = new Map([["p-scrunchie", { _id: "p-scrunchie", name: "Scrunchie", price: 1200 }]]);
  assert.equal(resolveLine({ id: "p-scrunchie", size: "M" }, noSizes, boxes), null, "a size on a piece with no sizes");
});

test("a size with its own price is charged that price", () => {
  assert.equal(resolveLine({ id: "p-slip", size: "L", color: "Ivory" }, products, boxes)?.price, 4200);
  assert.equal(resolveLine({ id: "p-slip", size: "S", color: "Ivory" }, products, boxes)?.price, 3800);
});

test("a piece that comes in colours is not sold without one, and the shopper is told which", () => {
  // As a bag saved before the shop asked for a colour, or edited by hand, holds it
  assert.equal(resolveLine({ id: "p-slip", size: "M" }, products, boxes), null);
  assert.equal(colourNotChosen({ id: "p-slip" }, products), "Silk Slip");
  assert.equal(colourNotChosen({ id: "p-slip", color: "" }, products), "Silk Slip", "an empty choice is no choice");
  assert.equal(colourNotChosen({ id: "p-slip", color: "Ivory" }, products), null);

  // Nothing to choose: no colours, or only swatches nobody named
  const plain = new Map<string, PriceLookupProduct>([
    ["p-scrunchie", { _id: "p-scrunchie", name: "Scrunchie", price: 1200 }],
    ["p-band", { _id: "p-band", name: "Hair band", price: 900, colorNames: [] }],
    ["p-mask", { _id: "p-mask", name: "Mask", price: 1500, colorNames: [null as unknown as string, " "] }],
  ]);
  for (const id of ["p-scrunchie", "p-band", "p-mask"]) {
    assert.equal(colourNotChosen({ id }, plain), null, id);
    assert.ok(resolveLine({ id }, plain, boxes), `${id} sells without a colour`);
  }

  // An add-on is priced from its piece but is not the piece: it never needs a colour
  assert.equal(colourNotChosen({ id: "p-slip-giftbox" }, products), null);
  assert.equal(colourNotChosen({ id: "p-slip-madetomeasure" }, products), null);
  assert.equal(colourNotChosen({ id: "gb-1" }, products), null);
});

test("add-ons are named and priced from their piece", () => {
  assert.deepEqual(resolveLine({ id: "p-slip-madetomeasure" }, products, boxes), {
    price: 1000,
    name: "Made to Measure — Silk Slip",
  });
  assert.deepEqual(resolveLine({ id: "p-slip-giftbox", size: "M" }, products, boxes), {
    price: 500,
    name: "Gift Box — Silk Slip",
  });
  assert.deepEqual(resolveLine({ id: "gb-1" }, products, boxes), { price: 1500, name: "Keepsake Box" });
});

test("anything Sanity does not know, or will not sell, is refused", () => {
  assert.equal(resolveLine({ id: "p-made-up" }, products, boxes), null);
  const noMtm = new Map([["p-slip", { ...SLIP, madeToMeasureAvailable: false }]]);
  assert.equal(resolveLine({ id: "p-slip-madetomeasure" }, noMtm, boxes), null);
  const unnamed = new Map([["p-slip", { ...SLIP, name: undefined }]]);
  assert.equal(resolveLine({ id: "p-slip" }, unnamed, boxes), null);
});

test("only this shop's own photographs go to Stripe", () => {
  const own = "https://cdn.sanity.io/images/5uun6fw6/production/abc-800x1000.jpg";
  assert.equal(trustedImage(own, "5uun6fw6"), own);
  assert.equal(trustedImage("https://cdn.sanity.io/images/otherproj/production/abc.jpg", "5uun6fw6"), null);
  assert.equal(trustedImage("https://evil.example/fake.jpg", "5uun6fw6"), null);
  assert.equal(trustedImage(undefined, "5uun6fw6"), null);
  assert.equal(trustedImage(`${own}?${"x".repeat(2000)}`, "5uun6fw6"), null, "Stripe's 2000-character limit");
});

/* ─── Recovery and consent ─── */

type Params = Stripe.Checkout.SessionCreateParams;

function fakeStripe(answer: (params: Params, call: number) => unknown) {
  const calls: Params[] = [];
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: Params) => {
          calls.push(params);
          return answer(params, calls.length) as Stripe.Checkout.Session;
        },
      },
    },
  } as unknown as Pick<Stripe, "checkout">;
  return { stripe, calls };
}

const BASE: Params = { mode: "payment", allow_promotion_codes: true, success_url: "x", line_items: [] };

test("a checkout asks for marketing consent and gets a recovery link", async () => {
  const { stripe, calls } = fakeStripe(() => ({ id: "cs_1", url: "https://checkout.stripe.com/c" }));
  await createCheckoutSession(stripe, BASE, { recovery: true }, new Set());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].consent_collection, { promotions: "auto" });
  assert.deepEqual(calls[0].after_expiration, { recovery: { enabled: true, allow_promotion_codes: true } });
});

test("a checkout carrying a discount gets no recovery link", async () => {
  const { stripe, calls } = fakeStripe(() => ({ id: "cs_1" }));
  await createCheckoutSession(stripe, { ...BASE, allow_promotion_codes: undefined }, { recovery: false }, new Set());
  assert.equal(calls[0].after_expiration, undefined, "a reopened copy would carry the coupon past its checks");
  assert.deepEqual(calls[0].consent_collection, { promotions: "auto" });
});

test("when Stripe refuses consent on this account, checkout still works, and stops asking", async () => {
  const refused = new Set<"consent_collection" | "after_expiration">();
  const { stripe, calls } = fakeStripe((params) => {
    if (params.consent_collection) {
      throw Object.assign(new Error("consent_collection[promotions] is only available to US merchants"), {
        type: "StripeInvalidRequestError",
        param: "consent_collection[promotions]",
      });
    }
    return { id: "cs_2", url: "https://checkout.stripe.com/c" };
  });

  const session = await createCheckoutSession(stripe, BASE, { recovery: true }, refused);
  assert.equal(session.id, "cs_2");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].consent_collection, undefined);
  assert.ok(calls[1].after_expiration, "recovery stays when only consent was refused");

  await createCheckoutSession(stripe, BASE, { recovery: true }, refused);
  assert.equal(calls.length, 3, "the refusal is remembered: one request, not two, from then on");
  assert.equal(calls[2].consent_collection, undefined);
});

test("any other Stripe error is the caller's to handle, untouched", async () => {
  const { stripe, calls } = fakeStripe(() => {
    throw Object.assign(new Error("Invalid API Key"), { type: "StripeAuthenticationError" });
  });
  await assert.rejects(createCheckoutSession(stripe, BASE, { recovery: true }, new Set()), /Invalid API Key/);
  assert.equal(calls.length, 1, "no retry for an error that is not about these settings");
});

test("a refusal is recognised by the setting it names", () => {
  const err = { type: "StripeInvalidRequestError", param: "after_expiration[recovery][enabled]" };
  assert.equal(refusedSetting(err, "after_expiration"), true);
  assert.equal(refusedSetting(err, "consent_collection"), false);
  assert.equal(
    refusedSetting({ type: "StripePermissionError", message: "consent_collection is not available for your account" }, "consent_collection"),
    true
  );
  assert.equal(refusedSetting({ type: "StripeConnectionError", message: "socket hang up" }, "after_expiration"), false);
  assert.equal(refusedSetting(new Error("after_expiration"), "after_expiration"), false, "only Stripe's own refusals");
});
