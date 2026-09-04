import { randomBytes } from "crypto";
import { getStripeInstance } from "@/lib/stripe";

/** Stripe coupon id — coupons accept a chosen id, so there is exactly one. */
const WELCOME_COUPON_ID = "welcome-10-first-order";
export const WELCOME_PERCENT = 10;
/** A welcome code is a nudge, not a standing discount */
export const WELCOME_VALID_DAYS = 60;

/**
 * One welcome code per subscriber, usable once.
 *
 * The shop used to hand every subscriber the same WELCOME10 — a promotion code
 * with no redemption limit and no expiry. That is not "10% off your first
 * order"; it is 10% off every order, for anyone who has ever seen the code,
 * forever, including whoever posts it on a voucher site. Guests have no Stripe
 * customer to pin `first_time_transaction` to, so the honest version is a
 * code that can only be redeemed once at all.
 */

/** Readable, unambiguous suffix — same alphabet as the gift cards. */
function codeSuffix(): string {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY2346789";
  return Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
}

async function ensureWelcomeCoupon(stripe: ReturnType<typeof getStripeInstance>) {
  try {
    return await stripe.coupons.retrieve(WELCOME_COUPON_ID);
  } catch {
    return stripe.coupons.create({
      id: WELCOME_COUPON_ID,
      percent_off: WELCOME_PERCENT,
      duration: "once",
      name: "Welcome — 10% off your first order",
      metadata: { source: "newsletter-welcome" },
    });
  }
}

/**
 * Mints a single-use welcome code for one new subscriber and returns it, or
 * null when Stripe is unavailable — the signup is saved either way, and
 * Kristina can send a code by hand.
 */
export async function createWelcomeCode(email: string): Promise<string | null> {
  try {
    const stripe = getStripeInstance();
    const coupon = await ensureWelcomeCoupon(stripe);

    const promotionCode = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code: `WELCOME-${codeSuffix()}`,
      max_redemptions: 1,
      expires_at: Math.floor(Date.now() / 1000) + WELCOME_VALID_DAYS * 24 * 60 * 60,
      metadata: { source: "newsletter-welcome", email },
    });

    return promotionCode.code;
  } catch (error) {
    console.error("Could not prepare a welcome discount code:", error);
    return null;
  }
}
