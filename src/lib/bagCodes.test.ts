import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { friendDiscountApplies, looksLikeWelcomeCode, welcomeCodeNote } from "./bagCodes";
import { looksLikeReferralCode } from "./friendsLink";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("a friend's discount applies only from the minimum basket up", () => {
  const friend = { discount: 500, minBasket: 1500 };
  // Seven of sixteen pieces cost under £15: a kids' brief alone is £10
  assert.equal(friendDiscountApplies(friend, 1000), false);
  assert.equal(friendDiscountApplies(friend, 1500), true);
  assert.equal(friendDiscountApplies(friend, 3000), true);
  assert.equal(friendDiscountApplies(null, 3000), false);
  // Switched off in Site Settings: nothing applies, so nothing is asked for
  assert.equal(friendDiscountApplies({ discount: 0, minBasket: 0 }, 3000), false);
});

test("a welcome code is recognised as one, and not as a friend's code", () => {
  for (const code of ["WELCOME-ACDEFG", "welcome-k7p2xy", " WELCOME-2346QR "]) {
    assert.equal(looksLikeWelcomeCode(code), true, code);
  }
  for (const code of ["ANNA-K7P2", "WELCOME10", "WELCOME-ABC", "GIFT-ABCD-EFGH"]) {
    assert.equal(looksLikeWelcomeCode(code), false, code);
  }
  assert.equal(looksLikeReferralCode("WELCOME-ACDEFG"), false, "the bag checks the welcome shape first anyway");
});

test("every code the newsletter mints has the shape the bag recognises", () => {
  const source = read("src/lib/discounts.ts");
  assert.match(source, /code: `WELCOME-\$\{codeSuffix\(\)\}`/);
  const length = Number(/randomBytes\((\d+)\)/.exec(source)?.[1]);
  const alphabet = /const alphabet = "([^"]+)"/.exec(source)?.[1] ?? "";
  assert.ok(length > 0 && alphabet.length > 0, "found how the suffix is made");
  for (let i = 0; i < 50; i++) {
    const suffix = Array.from({ length }, (_, j) => alphabet[(i * 7 + j * 13) % alphabet.length]).join("");
    assert.equal(looksLikeWelcomeCode(`WELCOME-${suffix}`), true, suffix);
  }
});

test("a welcome code is told where it goes, never that it isn't valid", () => {
  const plain = welcomeCodeNote("WELCOME-ACDEFG", { friendDiscount: false, giftCard: false });
  assert.match(plain, /WELCOME-ACDEFG/);
  assert.match(plain, /"Add promotion code" on the payment page/);
  assert.doesNotMatch(plain, /valid/i);

  // Stripe takes one discount per order, and hides its promo field once ours is applied
  const withFriend = welcomeCodeNote("WELCOME-ACDEFG", { friendDiscount: true, giftCard: false });
  assert.match(withFriend, /can't be combined with the friend discount/);
  assert.match(withFriend, /remove the friend discount above/);
  assert.match(welcomeCodeNote("WELCOME-ACDEFG", { friendDiscount: false, giftCard: true }), /the gift card/);
  assert.match(
    welcomeCodeNote("WELCOME-ACDEFG", { friendDiscount: true, giftCard: true }),
    /the friend discount and gift card/
  );
});
