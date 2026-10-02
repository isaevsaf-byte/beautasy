import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_COMMISSION_PERCENT,
  PARTNER_MAX_REWARDS_PER_YEAR,
  commissionOn,
  defaultCommission,
  isMonth,
  isPartnerSlug,
  judgePartner,
  parseCommission,
  partnerCardPath,
  partnerLink,
  partnerLinkShown,
  partnerReportText,
  partnerRewardsCap,
  partnerStatement,
  partnerWhatsappText,
  shiftMonth,
  slugFrom,
  whatsappNumberFrom,
  type PartnerBooking,
  type PartnerOrder,
  type PartnerReward,
} from "./partners";
import { REFERRAL_DEFAULTS, settingsForReferrer } from "./referralRules";

/**
 * Beautasy Partners: the rules that decide what a salon is owed. What reaches
 * the database is in partnerStore.test.ts, the Studio in
 * src/sanity/partnersStudio.test.ts, and the card's code in qrSvg.test.ts.
 */

/* ─── The link ─── */

test("a salon's name becomes a link worth printing", () => {
  assert.equal(slugFrom("The Hair Lounge"), "the-hair-lounge");
  assert.equal(slugFrom("Rosé & Co."), "rose-and-co");
  assert.equal(slugFrom("Emma's  Bridal"), "emmas-bridal");
  assert.equal(slugFrom("  ONYX   bridal  "), "onyx-bridal");
  assert.equal(slugFrom("Салон"), "", "no Latin letters, so she is asked to type one");
  // Whole words up to thirty characters, so the QR code stays small
  const long = slugFrom("The Most Wonderful Hair And Beauty Salon In Shirley");
  assert.ok(long.length <= 30 && isPartnerSlug(long), long);
  assert.equal(long, "the-most-wonderful-hair-and");
});

test("only a tidy link is a link", () => {
  for (const good of ["ab", "the-hair-lounge", "salon-42", "a".repeat(30)]) assert.equal(isPartnerSlug(good), true, good);
  for (const bad of ["a", "The-Hair", "the--hair", "-hair", "hair-", "hair lounge", "a".repeat(31), "hair/lounge", "", 42]) {
    assert.equal(isPartnerSlug(bad), false, String(bad));
  }
});

test("the link, as printed and as said", () => {
  assert.equal(partnerLink("onyx-bridal"), "https://www.beautasy.co.uk/p/onyx-bridal");
  assert.equal(partnerLinkShown("onyx-bridal"), "beautasy.co.uk/p/onyx-bridal");
  assert.equal(partnerCardPath("onyx-bridal"), "/p/onyx-bridal/card");
  assert.equal(partnerCardPath("onyx-bridal", "a6"), "/p/onyx-bridal/card?size=a6");
});

/* ─── The form ─── */

const FORM = { name: "The Hair Lounge", slug: "", kind: "salon", commissionPercent: "0" };

test("a partner is a name, a link, a kind and a percentage — the rest is optional", () => {
  const verdict = judgePartner(FORM);
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.deepEqual(verdict.value, {
    name: "The Hair Lounge",
    slug: "the-hair-lounge",
    kind: "salon",
    commissionPercent: 0,
    active: true,
  });
});

test("the form says what is wrong in Russian, one thing at a time", () => {
  const error = (raw: Record<string, unknown>) => {
    const v = judgePartner(raw);
    return v.ok ? null : v.error;
  };
  assert.match(error({ ...FORM, name: " " }) ?? "", /название/);
  assert.match(error({ ...FORM, name: "Салон", slug: "" }) ?? "", /латинские/);
  assert.match(error({ ...FORM, slug: "Hair Lounge!" }) ?? "", /латинские/);
  assert.match(error({ ...FORM, kind: "spa" }) ?? "", /что это за партнёр/);
  assert.match(error({ ...FORM, commissionPercent: "50" }) ?? "", /от 0 до 30/);
  assert.match(error({ ...FORM, email: "emma@" }) ?? "", /почта/);
  assert.match(error({ ...FORM, phone: "call me" }) ?? "", /Телефон/);
  assert.equal(error(FORM), null);
});

test("the owner is kept by her first name only — the dataset is public", () => {
  const verdict = judgePartner({ ...FORM, contactName: "Emma Louise Watson", email: " Emma@Salon.co.uk ", phone: "07700 900123" });
  assert.ok(verdict.ok);
  if (!verdict.ok) return;
  assert.equal(verdict.value.contactName, "Emma");
  assert.equal(verdict.value.email, "emma@salon.co.uk");
  assert.equal(verdict.value.phone, "07700 900123");
});

test("text that turns itself around, or hides, is taken out of the name", () => {
  const verdict = judgePartner({ ...FORM, name: "Hair\u202eLounge\u200b", slug: "hair-lounge" });
  assert.ok(verdict.ok);
  if (!verdict.ok) return;
  assert.equal(verdict.value.name, "HairLounge");
});

test("a percentage is read the way she would type it", () => {
  assert.equal(parseCommission("10"), 10);
  assert.equal(parseCommission("10%"), 10);
  assert.equal(parseCommission("7,5"), 7.5);
  assert.equal(parseCommission(12.5), 12.5);
  assert.equal(parseCommission(""), 0);
  assert.equal(parseCommission(undefined), 0);
  assert.equal(parseCommission(String(MAX_COMMISSION_PERCENT)), MAX_COMMISSION_PERCENT);
  for (const bad of ["31", "-5", "ten", "10.25", "1e1", "100"]) assert.equal(parseCommission(bad), null, bad);
  assert.equal(defaultCommission("bridal"), 10);
  assert.equal(defaultCommission("salon"), 0);
});

test("a paused partner stays paused through a save", () => {
  const verdict = judgePartner({ ...FORM, active: false });
  assert.ok(verdict.ok && verdict.value.active === false);
});

/* ─── The rules the money runs on ─── */

test("a partner's yearly allowance is a business's, and a friend's is untouched", () => {
  const friend = settingsForReferrer(REFERRAL_DEFAULTS, {});
  assert.equal(friend, REFERRAL_DEFAULTS, "a friend plays by the settings as they are");
  const partner = settingsForReferrer(REFERRAL_DEFAULTS, { partner: { slug: "x" } });
  assert.equal(partner.maxRewardsPerYear, PARTNER_MAX_REWARDS_PER_YEAR);
  assert.equal(partner.referrerReward, REFERRAL_DEFAULTS.referrerReward, "the £5 is the same £5");
  assert.equal(partnerRewardsCap(500), 500, "raised for friends past it, partners follow");
});

/* ─── The month ─── */

const MONTH = "2026-10";

function booking(over: Partial<PartnerBooking> = {}): PartnerBooking {
  return { id: "b1", name: "Sarah", service: "Alterations", status: "completed", createdAt: "2026-10-03T10:00:00Z", payments: [], ...over };
}

test("a client who came this month and paid this month is the month's", () => {
  const s = partnerStatement({
    month: MONTH,
    commissionPercent: 10,
    bookings: [booking({ payments: [{ date: "2026-10-06", kind: "income", amount: 4550, method: "cash" }] })],
    orders: [],
    rewards: [{ bookingId: "b1", outcome: "rewarded", reward: 500, createdAt: "2026-10-06T18:00:00Z" }],
  });
  assert.deepEqual(s.totals, { clients: 1, paid: 4550, credit: 500, commission: 455 });
  assert.equal(s.lines.length, 1);
  assert.equal(s.lines[0].credit, "rewarded");
  assert.equal(s.lines[0].paidInMonth, 4550);
});

test("money belongs to the day it came in, as in «Касса»: a September client who pays in October is October's money", () => {
  const b = booking({
    createdAt: "2026-09-28T10:00:00Z",
    payments: [
      { date: "2026-09-28", kind: "income", amount: 1000, method: "cash" },
      { date: "2026-10-02", kind: "income", amount: 3000, method: "card" },
    ],
  });
  const october = partnerStatement({ month: MONTH, commissionPercent: 0, bookings: [b], orders: [], rewards: [] });
  assert.equal(october.totals.clients, 0, "she came in September");
  assert.equal(october.totals.paid, 3000);
  assert.equal(october.lines.length, 1, "still listed: she paid this month");
  const september = partnerStatement({ month: "2026-09", commissionPercent: 0, bookings: [b], orders: [], rewards: [] });
  assert.equal(september.totals.clients, 1);
  assert.equal(september.totals.paid, 1000);
  assert.equal(october.allTime.paid, 4000);
});

test("a gift card pays nothing new, and a turned-down request was never a client", () => {
  const s = partnerStatement({
    month: MONTH,
    commissionPercent: 10,
    bookings: [
      booking({ payments: [{ date: "2026-10-04", kind: "income", amount: 2500, method: "giftcard" }] }),
      booking({ id: "b2", status: "declined", payments: [{ date: "2026-10-04", kind: "income", amount: 9000, method: "cash" }] }),
      booking({ id: "b3", status: "cancelled" }),
    ],
    orders: [],
    rewards: [],
  });
  assert.equal(s.totals.clients, 1);
  assert.equal(s.totals.paid, 0);
  assert.equal(s.totals.commission, 0);
  assert.deepEqual(s.lines.map((l) => l.id), ["b1"]);
});

test("a shop order counts on the day it was placed, and its refund on the day the money went back", () => {
  const order: PartnerOrder = {
    id: "o1",
    name: "Amy",
    createdAt: "2026-09-30T22:30:00Z", // 23:30 in Southampton: still September
    total: 2000,
    refundedAmount: 2000,
    refundedAt: "2026-10-01T09:00:00Z",
  };
  const september = partnerStatement({ month: "2026-09", commissionPercent: 10, bookings: [], orders: [order], rewards: [] });
  assert.equal(september.totals.paid, 2000);
  assert.equal(september.totals.commission, 200);
  const october = partnerStatement({ month: MONTH, commissionPercent: 10, bookings: [], orders: [order], rewards: [] });
  assert.equal(october.totals.paid, -2000);
  assert.equal(october.totals.commission, 0, "a month where more went back than came in owes nothing, rather than a debt");
  assert.equal(october.allTime.paid, 0);
});

test("a reward counts when it is paid, and a reward taken back counts for nothing", () => {
  const rewards: PartnerReward[] = [
    { bookingId: "b1", outcome: "rewarded", reward: 500, createdAt: "2026-10-05T10:00:00Z" },
    { orderId: "o1", outcome: "reversed", reward: 500, createdAt: "2026-10-06T10:00:00Z" },
    { bookingId: "b2", outcome: "repeat", reward: 0, createdAt: "2026-10-07T10:00:00Z" },
    { bookingId: "b4", outcome: "rewarded", reward: 500, createdAt: "2026-09-05T10:00:00Z" },
  ];
  const s = partnerStatement({
    month: MONTH,
    commissionPercent: 0,
    bookings: [booking(), booking({ id: "b2" }), booking({ id: "b5", status: "confirmed" })],
    orders: [{ id: "o1", createdAt: "2026-10-01T10:00:00Z", total: 1500, refundedAmount: 1500, refundedAt: "2026-10-06T10:00:00Z" }],
    rewards,
  });
  assert.equal(s.totals.credit, 500);
  assert.equal(s.allTime.credit, 1000);
  const credit = Object.fromEntries(s.lines.map((l) => [l.id, l.credit]));
  assert.equal(credit.b1, "rewarded");
  assert.equal(credit.b2, undefined, "not her first visit: by the rules she is not the partner's client at all");
  assert.equal(credit.b5, "waiting", "the work is not done yet");
  assert.equal(credit.o1, "reversed");
});

test("a client the rules turned away counts for nothing: not a client, not money, not a percentage", () => {
  const s = partnerStatement({
    month: MONTH,
    commissionPercent: 10,
    bookings: [
      booking({ id: "owner", payments: [{ date: "2026-10-06", kind: "income", amount: 25000, method: "card" }] }),
      booking({ id: "regular", payments: [{ date: "2026-10-07", kind: "income", amount: 4000, method: "cash" }] }),
      booking({ id: "new", payments: [{ date: "2026-10-08", kind: "income", amount: 3000, method: "cash" }] }),
    ],
    orders: [{ id: "o-own", name: "Emma", createdAt: "2026-10-09T10:00:00Z", total: 5000 }],
    rewards: [
      { bookingId: "owner", outcome: "self", reward: 0, createdAt: "2026-10-06T18:00:00Z" },
      { bookingId: "regular", outcome: "repeat", reward: 0, createdAt: "2026-10-07T18:00:00Z" },
      { bookingId: "new", outcome: "capped", reward: 0, createdAt: "2026-10-08T18:00:00Z" },
      { orderId: "o-own", outcome: "self", reward: 0, createdAt: "2026-10-09T10:00:00Z" },
    ],
  });
  assert.deepEqual(s.lines.map((l) => l.id), ["new"], "a client past the yearly limit is still theirs, only without the credit");
  assert.deepEqual(s.totals, { clients: 1, paid: 3000, credit: 0, commission: 300 });
});

test("finished work waiting for the morning shows as on its way, not as nothing", () => {
  const s = partnerStatement({ month: MONTH, commissionPercent: 0, bookings: [booking()], orders: [], rewards: [] });
  assert.equal(s.lines[0].credit, "soon");
});

test("the statement reads newest first, and commission is rounded to the penny", () => {
  const s = partnerStatement({
    month: MONTH,
    commissionPercent: 7.5,
    bookings: [
      booking({ id: "early", createdAt: "2026-10-01T10:00:00Z", payments: [{ date: "2026-10-01", kind: "income", amount: 1333, method: "cash" }] }),
      booking({ id: "late", createdAt: "2026-10-20T10:00:00Z" }),
    ],
    orders: [],
    rewards: [],
  });
  assert.deepEqual(s.lines.map((l) => l.id), ["late", "early"]);
  assert.equal(s.totals.commission, 100, "7.5% of £13.33 is £0.99975");
  assert.equal(commissionOn(1333, 0), 0);
});

test("months turn over at the year's end", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
  assert.equal(shiftMonth("2026-10", -13), "2025-09");
  assert.equal(isMonth("2026-10"), true);
  for (const bad of ["2026-13", "2026-1", "26-10", "2026-10-01", 202610]) assert.equal(isMonth(bad), false, String(bad));
});

/* ─── The note to the salon ─── */

test("the month's note is warm, in English, and says only what is true", () => {
  const statement = partnerStatement({
    month: MONTH,
    commissionPercent: 10,
    bookings: [booking({ payments: [{ date: "2026-10-06", kind: "income", amount: 12000, method: "transfer" }] }), booking({ id: "b2" })],
    orders: [],
    rewards: [{ bookingId: "b1", outcome: "rewarded", reward: 500, createdAt: "2026-10-06T18:00:00Z" }],
  });
  const text = partnerReportText({
    partner: { name: "Onyx Bridal", slug: "onyx-bridal", contactName: "Emma", commissionPercent: 10 },
    statement,
    creditBalance: 1500,
  });
  assert.match(text, /^Hi Emma! 💜 Your Beautasy update for October 2026:/);
  assert.match(text, /2 clients came to me from Onyx Bridal/);
  assert.match(text, /£5\.00 of credit added to your Beautasy card \(your balance is £15\.00\)/);
  assert.match(text, /Your 10%: £12\.00/);
  assert.match(text, /beautasy\.co\.uk\/p\/onyx-bridal$/);

  const quiet = partnerReportText({
    partner: { name: "The Hair Lounge", slug: "the-hair-lounge", commissionPercent: 0 },
    statement: partnerStatement({ month: MONTH, commissionPercent: 0, bookings: [], orders: [], rewards: [] }),
  });
  assert.match(quiet, /^Hi The Hair Lounge!/);
  assert.match(quiet, /Nobody new came through your link this month/);
  assert.equal(/credit|Your 0%/.test(quiet), false, "no credit or percentage line when there is none");
});

test("a WhatsApp number is made only from something that looks like one", () => {
  assert.equal(whatsappNumberFrom("07700 900123"), "447700900123");
  assert.equal(whatsappNumberFrom("+44 7700 900123"), "447700900123");
  assert.equal(whatsappNumberFrom("+33 6 12 34 56 78"), "33612345678");
  assert.equal(whatsappNumberFrom("0770 090"), null);
  assert.equal(whatsappNumberFrom("0770 090012"), null, "a digit short of a UK mobile");
  assert.equal(whatsappNumberFrom(""), null);
  assert.equal(whatsappNumberFrom(null), null);
});

test("a client who writes instead of booking says who sent her in her first line", () => {
  assert.equal(partnerWhatsappText("Onyx Bridal"), "Hi Kristina! Onyx Bridal recommended you — I'd love to ask about an alteration.");
});
