import { ATELIER_SERVICES, LEGACY_SERVICES } from "@/lib/atelierServices";
import { FIELD_LIMITS, HONEYPOT_FIELD } from "@/lib/bookingForm";
import { HOLDING_STATUSES } from "@/lib/diary";
import { LOCAL_SERVICES } from "@/lib/localServices";

/**
 * What the booking route accepts from the open internet, decided before
 * anything is written or sent.
 *
 * The form is public, it writes to the Studio and it sends two emails, one of
 * them to whatever address is typed in. So the route takes only what the form
 * itself can send: a service from its own list, fields no longer than a
 * person would type, and nothing from the field only a bot can see. A customer
 * who does trip over a limit is told which one, in words they can act on.
 */

// The limits and the hidden field live where the form can read them too
export { FIELD_LIMITS, HONEYPOT_FIELD };

/** Whether the hidden field came back filled in. Such a request is answered kindly and dropped. */
export function filledHoneypot(body: unknown): boolean {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>)[HONEYPOT_FIELD] : undefined;
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The services a booking may name: the form's own list, each landing page's
 * (the form arrives with it as the default — see @/lib/localServices), and
 * names the form used to have, which a page left open in a tab still sends.
 */
export function acceptedService(service: unknown): service is string {
  return (
    typeof service === "string" &&
    (ATELIER_SERVICES.includes(service) ||
      LEGACY_SERVICES.includes(service) ||
      LOCAL_SERVICES.some((page) => page.serviceName === service))
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface BookingFields {
  name: string;
  email: string;
  phone?: string;
  service: string;
  notes?: string;
  preferredDate?: string;
  /** A friend's link code, left on the device by /r/CODE */
  referralCode?: string;
}

/** A string, trimmed, or nothing. Anything that is not a string is nothing. */
function typed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * The form's fields, checked: what the route works from, or the one thing to
 * tell the customer. Checked in the order they appear on the form, so the
 * first thing said is the first thing they would look at.
 */
export function readBookingFields(body: unknown): { ok: true; fields: BookingFields } | { ok: false; error: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const name = typed(raw.name);
  if (!name || name.length < 2) return { ok: false, error: "Please enter your name" };
  if (name.length > FIELD_LIMITS.name) {
    return { ok: false, error: `Please shorten your name to ${FIELD_LIMITS.name} characters or fewer.` };
  }

  const email = typed(raw.email);
  if (email && email.length > FIELD_LIMITS.email) {
    return { ok: false, error: "That email address is too long. Please check it." };
  }
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email" };

  const phone = typed(raw.phone);
  if (phone && phone.length > FIELD_LIMITS.phone) {
    return { ok: false, error: `That phone number is too long. Please keep it to ${FIELD_LIMITS.phone} characters.` };
  }

  if (!typed(raw.service)) return { ok: false, error: "Please select a service" };
  const service = typed(raw.service);
  if (!acceptedService(service)) return { ok: false, error: "Please choose a service from the list." };

  const preferredDate = typed(raw.preferredDate);
  if (preferredDate && preferredDate.length > FIELD_LIMITS.preferredDate) {
    return { ok: false, error: "Please pick your preferred date from the calendar." };
  }

  const notes = typed(raw.notes);
  if (notes && notes.length > FIELD_LIMITS.notes) {
    return {
      ok: false,
      error: `Your notes are a little long. Please keep them under ${FIELD_LIMITS.notes.toLocaleString("en-GB")} characters, and send Kristina the rest on WhatsApp.`,
    };
  }

  const code = typed(raw.referralCode);
  return {
    ok: true,
    fields: {
      name,
      email,
      service,
      ...(phone ? { phone } : {}),
      ...(notes ? { notes } : {}),
      ...(preferredDate ? { preferredDate } : {}),
      // A code is never typed — it comes from a link — so one too long to be
      // real is simply not a code, rather than something to bother them about
      ...(code && code.length <= 40 ? { referralCode: code } : {}),
    },
  };
}

/** Whether a postcode is short enough to be one. Anything longer is answered as a postcode not recognised. */
export function postcodeFits(collection: unknown): boolean {
  const postcode = collection && typeof collection === "object" ? (collection as { postcode?: unknown }).postcode : undefined;
  return typeof postcode !== "string" || postcode.trim().length <= FIELD_LIMITS.postcode;
}

/* ─── More than one booking ─── */

/**
 * How many future booked times one email address may hold at once. Two
 * covers a fitting and its follow-up; past that, somebody is filling the
 * diary, and a real customer is asked to message instead.
 */
export const MAX_FUTURE_HOLDS = 2;

/**
 * The booked times still ahead for one address — by its fingerprint, since
 * the address itself is sealed (see @/lib/pii). `$now` is Southampton's wall
 * clock written as a slot is, so the two compare as text.
 */
export const FUTURE_HOLDS_QUERY = `count(*[
  _type == "atelierBooking"
  && !(_id in path("drafts.**"))
  && emailFingerprint == $fingerprint
  && defined(slotStart)
  && slotStart > $now
  && status in ${JSON.stringify(HOLDING_STATUSES)}
])`;

export const TOO_MANY_HOLDS =
  "You already have two appointments booked with us. To add another, reply to one of your confirmation emails or message Kristina on WhatsApp.";
