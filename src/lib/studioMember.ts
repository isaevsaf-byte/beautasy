import { sanityConfig } from "@/lib/sanity";

/**
 * Is the person asking actually a member of this Sanity project?
 *
 * The Studio has nowhere to keep a secret of its own — it is a page in the
 * browser — so the routes it calls cannot be protected by one. What it does
 * have is the session token it is already using to talk to Sanity, and that
 * token can be spent on a single question to Sanity's management API, which
 * answers 200 for a member of this project and nothing else for anybody else.
 * It is the same check Sanity itself makes when Kristina opens the Studio.
 *
 * The token is never stored, never logged and never used for anything else.
 *
 * 🚨 This, and not `fromThisSite`, is what actually guards a route. An Origin
 * header is one line of curl; only this asks Sanity who the caller is. Any
 * route that answers with something Kristina would not put on a poster —
 * takings, order counts, visitor numbers — needs this one as well.
 */
const MANAGEMENT_API = "https://api.sanity.io/v2021-06-07/projects";

/**
 * Is this string shaped like a Sanity token at all?
 *
 * Not the security check — the request below is. This is here so that rubbish
 * is thrown away without spending an outgoing request on it. A route that
 * calls this can be reached by anyone willing to forge an Origin header, and
 * without this line they can make the site ask api.sanity.io about a string of
 * their choosing, over and over, with Vercel's address on the request rather
 * than their own: a slow, free, anonymous way to sort stolen tokens from dead
 * ones. Deliberately loose, because the cost of turning away a real token is
 * Kristina locked out of her own numbers, and the cost of letting a wrong one
 * through is one request Sanity answers with 401.
 */
export function looksLikeAToken(value: string): boolean {
  return value.length >= 20 && value.length <= 500 && /^[A-Za-z0-9._-]+$/.test(value);
}

/**
 * How long Sanity gets to answer before the caller is turned away.
 *
 * Without a deadline this fetch inherits undici's, which is five minutes —
 * measured against a socket that accepts and never replies, it was still
 * waiting after twenty seconds. The route that calls this runs inside a
 * function Vercel kills at sixty, so a silent socket here does not fail the
 * check, it fails the whole request with a gateway error. Five seconds is
 * long enough for a management API that normally answers in under one, and
 * short enough to leave the route time to say something useful instead.
 */
export const MEMBERSHIP_TIMEOUT_MS = 5_000;

/**
 * `ask` exists so a test can exercise what this returns rather than grep for
 * the call. The check is the only real door on the numbers route, and a
 * mutation turning it into `return true` used to leave the whole suite green.
 */
export async function isProjectMember(
  token: string,
  ask: typeof fetch = fetch
): Promise<boolean> {
  if (!looksLikeAToken(token)) return false;
  try {
    const res = await ask(`${MANAGEMENT_API}/${sanityConfig.projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(MEMBERSHIP_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
