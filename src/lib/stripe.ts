import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
  }
  return new Stripe(key, {
    typescript: true,
  });
}

// Lazy initialization — only creates the instance when actually used (at runtime),
// not at build time when env vars might not be available.
let _stripe: Stripe | null = null;

export function getStripeInstance(): Stripe {
  if (!_stripe) {
    _stripe = getStripe();
  }
  return _stripe;
}
