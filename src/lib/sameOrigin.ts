/**
 * Whether a request came from a page on this very deployment.
 *
 * A few routes exist for buttons in the Studio — "Email the customer now",
 * "Post to Instagram now" — and carry no secret, because the Studio has
 * nowhere safe to keep one. They were open to the whole internet on the
 * argument that they only do what the daily job would do anyway. That is
 * true, but "anyone can make Kristina's customers get an email right now"
 * is still not a thing to leave lying around. Browsers send Origin on every
 * POST (and Referer on the rest), so a check that the caller is a page on
 * the same host keeps the buttons working — on production, previews and
 * localhost alike — and turns away a bare curl from elsewhere.
 */
export function fromThisSite(req: Request): boolean {
  const source = req.headers.get("origin") ?? req.headers.get("referer");
  if (!source) return false;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return false;

  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}
