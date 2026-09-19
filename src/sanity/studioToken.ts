import { sanityConfig } from "@/lib/sanity";

/**
 * The session token the Studio is already using for its own requests.
 *
 * Two things in the Studio need the site to do something only the server can
 * do — read a sealed contact detail, read the shop's takings — and neither can
 * carry a secret, because both are pages in a browser. What they can do is
 * hand over the token Sanity gave this browser when Kristina signed in, which
 * the server spends on one question to Sanity: is this a member of the
 * project? See @/lib/studioMember.
 *
 * Where it lives: the Studio keeps it in localStorage under a key that
 * includes the project id. Current versions store a JSON object there and
 * older ones a bare string, so both are read — a Studio upgrade that changed
 * the shape once made "Show contact details" fail with no message at all.
 *
 * Every access is wrapped because localStorage throws outright in a browser
 * with site data blocked, and a dashboard that cannot get a token should say
 * so rather than take the whole page down.
 */
export function studioToken(configToken?: string): string | null {
  if (configToken) return configToken;
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(`__studio_auth_token_${sanityConfig.projectId}`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { token?: string };
      return parsed.token ?? null;
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}
