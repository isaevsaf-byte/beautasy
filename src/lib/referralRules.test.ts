import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REFERRAL_DEFAULTS,
  referralSettingsFrom,
  codeNamePart,
  generateReferralCode,
  judgeFriend,
  friendShopDiscount,
  shortOfMinBasket,
  splitDiscount,
  eventIdFor,
  creditExpiry,
} from "./referralRules";
import {
  CODE_SHAPE,
  normaliseReferralCode,
  looksLikeReferralCode,
  referralLink,
  whatsappShareUrl,
  pounds,
} from "./friendsLink";

test("a link code is a first name and four unambiguous characters", () => {
  const code = generateReferralCode("Anna");
  assert.match(code, CODE_SHAPE);
  assert.ok(code.startsWith("ANNA-"));
  assert.equal(/[O0I1BS5]/.test(code.slice(5)), false, "no look-alike characters in the suffix");
  assert.notEqual(generateReferralCode("Anna"), generateReferralCode("Anna"));
});

test("names are made typeable, and a name that leaves nothing falls back to a word", () => {
  assert.equal(codeNamePart("Zoë"), "ZOE");
  assert.equal(codeNamePart("  anna-maria "), "ANNAMARI");
  assert.equal(codeNamePart("李"), "FRIEND");
  assert.equal(codeNamePart("A"), "FRIEND");
  assert.equal(codeNamePart(undefined), "FRIEND");
  assert.match(generateReferralCode("Кристина"), /^FRIEND-[A-Z2-9]{4}$/);
});

test("codes are matched however the friend types them", () => {
  assert.equal(normaliseReferralCode(" anna-k7p2 "), "ANNA-K7P2");
  assert.ok(looksLikeReferralCode("anna - k7p2".replace(/ /g, "")));
  assert.equal(looksLikeReferralCode("BEAUTASY-AB12-CD34"), false, "a gift card is not a friend code");
  assert.equal(looksLikeReferralCode("ANNA"), false);
});

test("the link and the share message point at the canonical host", () => {
  assert.equal(referralLink("anna-k7p2"), "https://www.beautasy.co.uk/r/ANNA-K7P2");
  const share = decodeURIComponent(whatsappShareUrl("ANNA-K7P2"));
  assert.ok(share.startsWith("https://wa.me/?text="));
  assert.ok(share.includes("https://www.beautasy.co.uk/r/ANNA-K7P2"));
  assert.ok(share.includes("£5"));
});

test("settings saved in the Studio keep their defaults where a field is missing or broken", () => {
  assert.deepEqual(referralSettingsFrom(undefined), REFERRAL_DEFAULTS);
  const merged = referralSettingsFrom({ friendShopDiscount: 1000, creditValidityMonths: 0, maxRewardsPerYear: -3 });
  assert.equal(merged.friendShopDiscount, 1000);
  assert.equal(merged.friendMinBasket, REFERRAL_DEFAULTS.friendMinBasket);
  assert.equal(merged.creditValidityMonths, 1, "credit must last at least a month");
  assert.equal(merged.maxRewardsPerYear, REFERRAL_DEFAULTS.maxRewardsPerYear, "a negative cap is not a cap");
  assert.equal(referralSettingsFrom({ enabled: false }).enabled, false);
});

const base = {
  settings: REFERRAL_DEFAULTS,
  referrerActive: true,
  referrerFingerprint: "anna",
  friendFingerprint: "maria",
  friendHasHistory: false,
  rewardsThisYear: 0,
};

test("a friend counts when the programme is on, the link is live, and it is their first time", () => {
  assert.equal(judgeFriend(base), "ok");
});

test("a person cannot refer themselves", () => {
  assert.equal(judgeFriend({ ...base, friendFingerprint: "anna" }), "self");
});

test("a returning customer is welcome, but not as a new friend", () => {
  assert.equal(judgeFriend({ ...base, friendHasHistory: true }), "repeat");
});

test("a paused link and a paused programme stop everything, and are reported as such", () => {
  assert.equal(judgeFriend({ ...base, referrerActive: false }), "inactive");
  assert.equal(judgeFriend({ ...base, settings: { ...REFERRAL_DEFAULTS, enabled: false } }), "disabled");
});

test("a link that has paid out its yearly limit stops paying", () => {
  assert.equal(judgeFriend({ ...base, rewardsThisYear: REFERRAL_DEFAULTS.maxRewardsPerYear }), "capped");
  assert.equal(judgeFriend({ ...base, rewardsThisYear: REFERRAL_DEFAULTS.maxRewardsPerYear - 1 }), "ok");
});

test("an unknown friend email cannot be judged a self-referral", () => {
  assert.equal(judgeFriend({ ...base, friendFingerprint: "" }), "ok");
});

test("the friend's discount needs the minimum basket and never exceeds it", () => {
  assert.equal(friendShopDiscount(1499, REFERRAL_DEFAULTS), 0);
  assert.equal(friendShopDiscount(1500, REFERRAL_DEFAULTS), 500);
  assert.equal(friendShopDiscount(2500, REFERRAL_DEFAULTS), 500);
  assert.equal(shortOfMinBasket(1200, REFERRAL_DEFAULTS), 300);
  assert.equal(shortOfMinBasket(1800, REFERRAL_DEFAULTS), 0);
  assert.equal(friendShopDiscount(2500, { ...REFERRAL_DEFAULTS, enabled: false }), 0);
  assert.equal(friendShopDiscount(300, { ...REFERRAL_DEFAULTS, friendMinBasket: 0 }), 300, "capped at the basket");
});

test("one Stripe discount is divided friend-first, gift card for the rest", () => {
  assert.deepEqual(splitDiscount(2500, 500), { referral: 500, giftCard: 2000 });
  assert.deepEqual(splitDiscount(500, 500), { referral: 500, giftCard: 0 });
  assert.deepEqual(splitDiscount(300, 500), { referral: 300, giftCard: 0 });
  assert.deepEqual(splitDiscount(0, 500), { referral: 0, giftCard: 0 });
  assert.deepEqual(splitDiscount(2000, 0), { referral: 0, giftCard: 2000 });
});

test("the reward event's id comes from the order or booking, so it can only exist once", () => {
  assert.equal(eventIdFor("order", "cs_test_a1B2"), "referral-order-cs_test_a1B2");
  assert.equal(eventIdFor("booking", "drafts.slot-2026-09-10-1430"), "referral-booking-slot-2026-09-10-1430");
  assert.equal(eventIdFor("order", "cs/with spaces"), "referral-order-cs-with-spaces");
});

test("credit runs out a set number of months after it was last topped up", () => {
  const from = new Date("2026-09-06T10:00:00Z");
  assert.equal(creditExpiry(12, from), "2027-09-06T10:00:00.000Z");
});

test("amounts read as pounds, with pence only when they matter", () => {
  assert.equal(pounds(500), "£5");
  assert.equal(pounds(1500), "£15");
  assert.equal(pounds(550), "£5.50");
});
