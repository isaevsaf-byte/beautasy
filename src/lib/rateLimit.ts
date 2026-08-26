/**
 * Small in-memory rate limiter for the public, unauthenticated endpoints
 * (stock alerts, atelier bookings, reviews).
 *
 * Those endpoints write to Sanity and send email from orders@beautasy.co.uk, so
 * without a limit a script can flood the studio's inbox, burn the Resend quota,
 * and drag the sending domain's reputation down with it.
 *
 * Scope and honesty about it: state lives in the serverless instance's memory,
 * so the effective limit is per warm instance rather than global, and it resets
 * on cold start. That stops casual abuse and accidental double-submits, which is
 * what we're after here; a determined attacker spreading requests across
 * instances needs a shared store (Upstash Redis or similar) to stop properly.
 */

type Hits = { count: number; resetAt: number };

const buckets = new Map<string, Hits>();

/** Drop expired buckets so the map can't grow without bound. */
function sweep(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, hits] of buckets) {
    if (hits.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry — only meaningful when ok is false. */
  retryAfter: number;
}

/**
 * Records a hit for `key` and reports whether it is within the allowance.
 *
 * @param key    identifies the caller, e.g. `stock-alerts:1.2.3.4`
 * @param limit  hits allowed per window
 * @param windowMs length of the window in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const hits = buckets.get(key);

  if (!hits || hits.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  hits.count++;
  if (hits.count > limit) {
    return { ok: false, retryAfter: Math.ceil((hits.resetAt - now) / 1000) };
  }

  return { ok: true, retryAfter: 0 };
}

/**
 * Best-effort client IP. Vercel sets x-forwarded-for; the first entry is the
 * client. Falls back to a constant so a missing header degrades to a shared
 * bucket rather than to no limit at all.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
