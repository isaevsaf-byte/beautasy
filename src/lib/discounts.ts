import { getStripeInstance } from "@/lib/stripe";

export const WELCOME_CODE = "WELCOME10";
const WELCOME_PERCENT = 10;

/**
 * Makes sure the welcome discount exists in Stripe and returns its code.
 *
 * Checkout already runs with `allow_promotion_codes: true`, so a code created
 * here is redeemable at checkout with no further wiring. Created on demand and
 * looked up first, so repeated signups reuse the same code rather than
 * littering the Stripe account with duplicates.
 */
export async function ensureWelcomeCode(): Promise<string | null> {
  try {
    const stripe = getStripeInstance();

    const existing = await stripe.promotionCodes.list({ code: WELCOME_CODE, limit: 1 });
    if (existing.data.length > 0 && existing.data[0].active) {
      return existing.data[0].code;
    }

    const coupon = await stripe.coupons.create({
      percent_off: WELCOME_PERCENT,
      duration: "once",
      name: "Welcome — 10% off your first order",
      metadata: { source: "newsletter-welcome" },
    });

    const promotionCode = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id },
      code: WELCOME_CODE,
      metadata: { source: "newsletter-welcome" },
    });

    return promotionCode.code;
  } catch (error) {
    // A missing code is not worth failing the signup over — the subscriber is
    // saved either way and Kristina can send a code by hand.
    console.error("Could not prepare the welcome discount code:", error);
    return null;
  }
}
