import { randomBytes } from "crypto";
import { CODE_SHAPE, normaliseReferralCode } from "@/lib/friendsLink";

/**
 * The rules of Beautasy Friends, with nothing attached.
 *
 * Pure functions: what a link code looks like, how big a friend's discount is
 * on a given basket, whether a friend counts, and how a single Stripe discount
 * is divided between a friend's £5 and a gift card. Kept free of Sanity and
 * Stripe so the rules can be tested on their own — see referralRules.test.ts.
 */

export interface ReferralSettings {
  enabled: boolean;
  /** Off the friend's first shop order, in pence */
  friendShopDiscount: number;
  /** The smallest basket that discount applies to, in pence (0 = none) */
  friendMinBasket: number;
  /** Off the friend's first alteration, in pence — taken by hand at the atelier */
  friendAtelierDiscount: number;
  /** Credited to the referrer per friend, in pence */
  referrerReward: number;
  /** How long the credit lasts, from the last time it was topped up */
  creditValidityMonths: number;
  /** Rewards per referrer per rolling year */
  maxRewardsPerYear: number;
}

/** "Give £5, get £5" — the defaults the proposal was costed on. */
export const REFERRAL_DEFAULTS: ReferralSettings = {
  enabled: true,
  friendShopDiscount: 500,
  friendMinBasket: 1500,
  friendAtelierDiscount: 500,
  referrerReward: 500,
  creditValidityMonths: 12,
  maxRewardsPerYear: 20,
};

function pence(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

/** Site Settings as saved in the Studio, made whole. Missing fields keep the defaults. */
export function referralSettingsFrom(raw: Partial<ReferralSettings> | null | undefined): ReferralSettings {
  if (!raw) return { ...REFERRAL_DEFAULTS };
  return {
    enabled: raw.enabled !== false,
    friendShopDiscount: pence(raw.friendShopDiscount, REFERRAL_DEFAULTS.friendShopDiscount),
    friendMinBasket: pence(raw.friendMinBasket, REFERRAL_DEFAULTS.friendMinBasket),
    friendAtelierDiscount: pence(raw.friendAtelierDiscount, REFERRAL_DEFAULTS.friendAtelierDiscount),
    referrerReward: pence(raw.referrerReward, REFERRAL_DEFAULTS.referrerReward),
    creditValidityMonths: Math.max(1, pence(raw.creditValidityMonths, REFERRAL_DEFAULTS.creditValidityMonths)),
    maxRewardsPerYear: Math.max(1, pence(raw.maxRewardsPerYear, REFERRAL_DEFAULTS.maxRewardsPerYear)),
  };
}

/* ─── Codes ─── */

/** Same alphabet as gift cards: no O/0, I/1, B/8, S/5 look-alikes. */
export const CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY2346789";

/**
 * The name half of a code: "Anna" → "ANNA", "Zoë" → "ZOE", "李" → "FRIEND".
 * Letters only, so the code stays typeable; a name that leaves fewer than two
 * falls back to a word rather than a stub.
 */
export function codeNamePart(firstName: string | null | undefined): string {
  const cleaned = (firstName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 8);
  return cleaned.length >= 2 ? cleaned : "FRIEND";
}

/** "ANNA-K7P2" — personal enough to be recognised, random enough not to be guessed. */
export function generateReferralCode(firstName: string | null | undefined): string {
  const suffix = Array.from(randomBytes(4), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  const code = `${codeNamePart(firstName)}-${suffix}`;
  if (!CODE_SHAPE.test(code)) throw new Error(`Generated an invalid referral code: ${code}`);
  return code;
}

export { normaliseReferralCode };

/* ─── Does this friend count? ─── */

export type FriendVerdict = "ok" | "disabled" | "inactive" | "self" | "repeat" | "capped";

export interface FriendCase {
  settings: ReferralSettings;
  referrerActive: boolean;
  /** Keyed fingerprint of the referrer's email */
  referrerFingerprint: string;
  /** Keyed fingerprint of the friend's email — empty when it is not known yet */
  friendFingerprint: string;
  /** Whether this email has already ordered (shop) or visited (atelier) */
  friendHasHistory: boolean;
  /** Rewards already paid to this referrer in the last year */
  rewardsThisYear: number;
}

/**
 * Whether a friend earns their discount and the referrer their reward.
 *
 * The order matters only for what gets reported: a paused programme is
 * reported before a paused link, and "your own email" before "not your first
 * order", because that is the reason the person can actually act on.
 */
export function judgeFriend(c: FriendCase): FriendVerdict {
  if (!c.settings.enabled) return "disabled";
  if (!c.referrerActive) return "inactive";
  if (c.friendFingerprint && c.friendFingerprint === c.referrerFingerprint) return "self";
  if (c.friendHasHistory) return "repeat";
  if (c.rewardsThisYear >= c.settings.maxRewardsPerYear) return "capped";
  return "ok";
}

/** What the verdict means, in the friend's own words. */
export function verdictMessage(verdict: FriendVerdict, kind: "order" | "booking" = "order"): string | null {
  const thing = kind === "order" ? "order" : "booking";
  switch (verdict) {
    case "ok":
      return null;
    case "disabled":
      return "Friend links are paused at the moment.";
    case "inactive":
      return "That friend link isn't active any more.";
    case "self":
      return `This link is for friends — it can't be used on your own ${thing}.`;
    case "repeat":
      return kind === "order"
        ? "Friend discounts are for a first order, and this email has ordered before. Welcome back!"
        : "Friend discounts are for a first visit, and this email has booked with us before. Welcome back!";
    case "capped":
      return "This friend link has reached its limit for the year.";
  }
}

/* ─── Money ─── */

/** The friend's discount on a basket of this size — 0 when it does not apply. */
export function friendShopDiscount(subtotal: number, settings: ReferralSettings): number {
  if (!settings.enabled || settings.friendShopDiscount <= 0) return 0;
  if (subtotal < settings.friendMinBasket) return 0;
  return Math.max(0, Math.min(settings.friendShopDiscount, subtotal));
}

/** How much more the basket needs before the friend discount applies (0 when it already does). */
export function shortOfMinBasket(subtotal: number, settings: ReferralSettings): number {
  return Math.max(0, settings.friendMinBasket - subtotal);
}

/**
 * Stripe Checkout takes exactly one discount per session, so a friend's £5
 * and a gift card are minted as one coupon. The webhook sees only the total
 * and has to know which part the card actually paid: the friend's part is
 * taken first, the card covers the rest.
 */
export function splitDiscount(amountDiscount: number, referralPlanned: number): { referral: number; giftCard: number } {
  const total = Math.max(0, amountDiscount);
  const referral = Math.max(0, Math.min(referralPlanned, total));
  return { referral, giftCard: total - referral };
}

/** When credit topped up now runs out. */
export function creditExpiry(months: number, from: Date = new Date()): string {
  const expires = new Date(from);
  expires.setMonth(expires.getMonth() + months);
  return expires.toISOString();
}

/** Sanity document ids allow letters, digits, dots, dashes and underscores. */
export function eventIdFor(kind: "order" | "booking", sourceId: string): string {
  const safe = sourceId.replace(/^drafts\./, "").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 96);
  return `referral-${kind}-${safe}`;
}
