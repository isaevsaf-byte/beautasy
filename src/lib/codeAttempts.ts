/**
 * How many wrong codes one address may try at checkout.
 *
 * The bag sends a gift card code and a friend's code straight to
 * POST /api/checkout, and that route answered every guess with "isn't valid"
 * or with a payment link — as many guesses as anyone cared to send. A gift
 * card code is eight characters, and a right one is spendable money; the
 * balance check at /api/gift-cards was already limited, and this was the door
 * beside it left open.
 *
 * Only wrong codes count, so a shopper who goes back and forth to Stripe with
 * a good card is never held up. And the limit is checked before a code is
 * looked up, not after: a guesser who is over it must not be able to tell a
 * right code from a wrong one by which answer comes back.
 *
 * In memory, per server instance, like @/lib/rateLimit, and for the same
 * reason: it stops a script, not a determined attacker spread across many
 * instances. That needs a shared store.
 */

export const WRONG_CODE_LIMIT = 10;
export const WRONG_CODE_WINDOW_MS = 60 * 60 * 1000;

export interface WrongCodeCounter {
  /** Whether this address has used up its wrong guesses; checked before any lookup. */
  blocked(ip: string, now?: number): { blocked: boolean; retryAfter: number };
  /** Counts one wrong code against this address. */
  miss(ip: string, now?: number): void;
}

export function wrongCodeCounter(
  limit: number = WRONG_CODE_LIMIT,
  windowMs: number = WRONG_CODE_WINDOW_MS
): WrongCodeCounter {
  const misses = new Map<string, { count: number; resetAt: number }>();

  return {
    blocked(ip, now = Date.now()) {
      const entry = misses.get(ip);
      if (!entry || entry.resetAt <= now) return { blocked: false, retryAfter: 0 };
      return entry.count >= limit
        ? { blocked: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
        : { blocked: false, retryAfter: 0 };
    },
    miss(ip, now = Date.now()) {
      // Expired entries go once the map is big enough to matter
      if (misses.size >= 500) {
        for (const [key, entry] of misses) if (entry.resetAt <= now) misses.delete(key);
      }
      const entry = misses.get(ip);
      if (!entry || entry.resetAt <= now) {
        misses.set(ip, { count: 1, resetAt: now + windowMs });
      } else {
        entry.count++;
      }
    },
  };
}

/** The one counter checkout uses. */
export const checkoutWrongCodes = wrongCodeCounter();
