/**
 * The meta tags that prove beautasy.co.uk is ours.
 *
 * Each platform wants the same thing in its own tag: a token it generated,
 * served from the domain it is asked to trust. They are public by design —
 * they are meant to be read by anyone who views the page source — so the
 * Pinterest one sits here as a literal, the way it always has.
 *
 * Meta is the one that is not just housekeeping. Instagram will not attach a
 * product catalogue to the account — no shoppable tags on a post, no shop tab —
 * until the domain the products link to is verified in Business Manager, and
 * the meta-tag route is the only one of the three that does not need DNS
 * access. The token comes from Business Manager, so it is read from
 * META_DOMAIN_VERIFICATION rather than committed: it is issued after this code
 * ships, and setting an environment variable is something Kristina can be
 * walked through without a deploy.
 *
 * An unset variable must produce no tag at all rather than an empty one.
 * Meta's checker reads `content=""` as a token that does not match and reports
 * the domain as failing verification, which looks like a broken integration
 * instead of one that has not been set up yet.
 *
 * `env` is a parameter so tests can ask both questions without reaching into
 * the real process environment.
 */

/**
 * The token out of whatever was pasted into META_DOMAIN_VERIFICATION.
 *
 * Business Manager does not show the bare token. It shows the finished tag,
 * `<meta name="facebook-domain-verification" content="abc123..." />`, next to
 * a copy button — so the thing most likely to arrive in the environment
 * variable is the whole tag. Handing that to Next as the content attribute
 * produces `content="&lt;meta name=..."` in the head: markup that renders as
 * gibberish, verification that fails, and nothing anywhere saying why. The
 * empty case was already guarded; this is the likelier mistake.
 *
 * So pull the content attribute out when a tag is what we were given, and if
 * what is left still has a bracket, a quote or a space in it, treat it the
 * same as unset and emit no tag — a wrong token and a missing token both fail
 * verification, but only the missing one is obvious from the page source.
 */
function metaToken(raw: string | undefined): string | undefined {
  const pasted = raw?.trim();
  if (!pasted) return undefined;

  const fromTag = /content\s*=\s*["']([^"']*)["']/i.exec(pasted);
  const token = (fromTag ? fromTag[1] : pasted).trim();

  if (!token || /[<>"'\s]/.test(token)) return undefined;
  return token;
}

export const PINTEREST_DOMAIN_VERIFY = "3cac142afd3077ef4fb7bc5dab4807e5";

/**
 * Just enough of an environment to read one variable from. The real
 * `ProcessEnv` type insists on NODE_ENV, which a test calling this has no
 * business inventing.
 */
type EnvLike = Readonly<Record<string, string | undefined>>;

export function domainVerificationTags(
  env: EnvLike = process.env,
): Record<string, string> {
  const tags: Record<string, string> = {
    "p:domain_verify": PINTEREST_DOMAIN_VERIFY,
  };

  const meta = metaToken(env.META_DOMAIN_VERIFICATION);
  if (meta) tags["facebook-domain-verification"] = meta;

  return tags;
}
