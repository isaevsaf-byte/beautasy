/**
 * The bag's two decisions about codes, kept here so they can be tested
 * without a browser. Client-safe: nothing here touches Stripe or Sanity.
 */

export interface FriendOffer {
  /** Pence off, as the server set it; 0 when the shop discount is switched off */
  discount: number;
  /** The smallest basket, in pence, the discount is given on */
  minBasket: number;
}

/**
 * Whether a friend's or a salon's discount applies to this basket.
 *
 * The bag used to ask for the friend's email whenever a referral cookie was
 * on the device — but it only shows the email box once the basket reaches the
 * minimum. Below £15, checkout said "Add the email you'll check out with" and
 * there was no such field anywhere on screen: a dead end, from a salon QR card
 * that leaves the cookie for 30 days. Below the minimum the code is simply not
 * sent, the order goes through at full price, and the cookie stays, so the
 * £5 is still there if the basket grows.
 */
export function friendDiscountApplies(friend: FriendOffer | null, subtotal: number): boolean {
  return !!friend && friend.discount > 0 && subtotal >= friend.minBasket;
}

/**
 * A newsletter welcome code: "WELCOME-" and six characters from the gift card
 * alphabet, minted by @/lib/discounts. It is a Stripe promotion code, so it
 * goes in on Stripe's payment page — the bag cannot check or apply it, and
 * used to send it to the gift card lookup, which answered "That code isn't
 * valid" to someone holding a perfectly good code.
 */
export const WELCOME_CODE_SHAPE = /^WELCOME-[A-Z0-9]{6}$/;

export function looksLikeWelcomeCode(code: string): boolean {
  return WELCOME_CODE_SHAPE.test(code.trim().toUpperCase().replace(/\s+/g, ""));
}

/**
 * Where a welcome code goes instead. Stripe takes one discount per order, and
 * once a friend's discount or a gift card is applied in the bag, the payment
 * page no longer offers "Add promotion code" at all — so that case says so.
 */
export function welcomeCodeNote(code: string, held: { friendDiscount: boolean; giftCard: boolean }): string {
  const where = `press Checkout, then enter ${code} under "Add promotion code" on the payment page.`;
  if (held.friendDiscount || held.giftCard) {
    const other = held.friendDiscount && held.giftCard
      ? "the friend discount and gift card"
      : held.friendDiscount
      ? "the friend discount"
      : "the gift card";
    return `A welcome code can't be combined with ${other}. To use it instead, remove ${other} above, then ${where}`;
  }
  return `Welcome codes are used at payment: ${where}`;
}
