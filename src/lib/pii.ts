import { fingerprint, seal, unseal } from "@/lib/secrets";

/**
 * Customer details, kept out of a readable dataset.
 *
 * Sanity's dataset is public on this plan and cannot be made private — see
 * @/lib/secrets. Anyone with the project id, which is in every product image
 * URL, can read every document. Most of the dataset is meant to be public.
 * Names, emails, phone numbers, delivery addresses and gift messages are not:
 * that is customer data Kristina is responsible for under UK data protection
 * law, and a ready-made list for anyone who wants to spam or scam her
 * customers.
 *
 * So those fields are sealed. What stays readable is deliberately chosen to
 * keep the Studio usable while being close to worthless to a harvester:
 *
 *   displayName   a first name — enough to tell two bookings apart, not
 *                 enough to find anyone
 *   emailHint     "an…@gmail.com" — recognisable to the person who already
 *                 knows the address, not deliverable to
 *   emailFingerprint  keyed and one-way, so "have we seen this address?"
 *                 still works as a GROQ query
 *
 * The full values are read back server-side when an email has to be sent, and
 * in the Studio through "Show contact details", which checks the person asking
 * is a member of this Sanity project.
 */

/** Seals a value that may be absent, so call sites stay free of conditionals. */
export function sealOptional(value: string | undefined | null): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? seal(trimmed) : undefined;
}

/** Reads a sealed value back, or null when there is nothing trustworthy to read. */
export function open(sealed: string | undefined | null): string | null {
  return unseal(sealed);
}

/** Addresses are compared lowercased, so the fingerprint has to be too. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Keyed, one-way, stable: lets a query ask "do we already have this address?" */
export function emailFingerprint(email: string): string {
  return fingerprint(normaliseEmail(email));
}

/**
 * "anna.smith@gmail.com" → "an…@gmail.com".
 *
 * Enough for Kristina to recognise a row she is already looking at; not an
 * address anyone can send to. A very short local part is masked entirely
 * rather than being handed over whole.
 */
export function maskEmail(email: string | undefined | null): string | undefined {
  if (!email) return undefined;
  const [local, domain] = normaliseEmail(email).split("@");
  if (!domain) return undefined;
  const head = local.length > 3 ? local.slice(0, 2) : local.slice(0, 1);
  return `${head}…@${domain}`;
}

/**
 * The part of a name that goes in a Studio list.
 *
 * A first name alone identifies a row for the person who took the booking and
 * almost nobody else. Everything after it is sealed with the rest.
 */
export function firstNameOf(name: string | undefined | null): string | undefined {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || undefined;
}
