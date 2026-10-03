import { ATELIER_SERVICES, LEGACY_SERVICES } from "@/lib/atelierServices";
import { FIELD_LIMITS, HONEYPOT_FIELD } from "@/lib/bookingForm";
import { HOLDING_STATUSES, releasesItsTime } from "@/lib/diary";
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

/* ─── The same request, sent again ─── */

/**
 * How long a request with no time counts as the same one sent again. Long
 * enough for a phone that lost signal in a shop doorway to try again, short
 * enough that a second request on another day is its own.
 */
export const REPEAT_WINDOW_MS = 15 * 60 * 1000;

/**
 * A request with no booked time from the same address, for the same service,
 * in the last fifteen minutes — the same request, sent again because the
 * answer to the first never arrived. `$asked` is the time a customer picked
 * that the diary could not hold, kept as a request in its place (see the
 * route): sent again, it is the same request, and nothing else is.
 */
export const REPEAT_REQUEST_QUERY = `*[
  _type == "atelierBooking"
  && !(_id in path("drafts.**"))
  && emailFingerprint == $fingerprint
  && service == $service
  && createdAt > $since
  && !defined(slotStart)
  && status == "new"
  && defined(collection) == $collection
  && ($asked == null || preferredDate == $asked)
] | order(createdAt desc)[0]`;

/** A booking as the repeat check reads it back. */
export interface EarlierBooking {
  _id: string;
  _type?: string;
  status?: string;
  slotStart?: string;
  emailFingerprint?: string;
  confirmedFor?: string;
  preferredDate?: string;
  collection?: { terms?: string } | null;
  referredBy?: string;
  referralDiscount?: number;
}

/**
 * Whether the booking holding a slot is this customer's own — the same
 * request sent again after its answer was lost, rather than somebody else's
 * fitting. Only one still holding its time counts: a cancelled one is a time
 * given back, and the diary hands it out again.
 */
export function heldBySameCustomer(holder: EarlierBooking | null | undefined, fingerprint: string): boolean {
  return (
    !!holder &&
    holder._type === "atelierBooking" &&
    typeof holder.slotStart === "string" &&
    holder.emailFingerprint === fingerprint &&
    !releasesItsTime(holder.status)
  );
}

/**
 * The answer the first request got, given again: the same "you're booked in"
 * or "request sent", so a customer who pressed the button twice — or whose
 * phone lost the first answer — sees one booking, gets one email, and is not
 * told their own time has been taken.
 */
export function sameAnswerAgain(earlier: EarlierBooking): Record<string, unknown> {
  const booked = typeof earlier.slotStart === "string" && typeof earlier.confirmedFor === "string";
  return {
    ok: true,
    emailed: true,
    ...(booked ? { confirmedFor: earlier.confirmedFor } : {}),
    ...(earlier.collection ? { collection: { terms: earlier.collection.terms ?? "", when: null } } : {}),
    ...(typeof earlier.referralDiscount === "number" && earlier.referralDiscount > 0
      ? { referral: { applied: true, discount: earlier.referralDiscount, referredBy: earlier.referredBy } }
      : {}),
  };
}
