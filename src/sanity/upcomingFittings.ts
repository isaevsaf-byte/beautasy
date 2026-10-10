import { localMinuteOf } from "@/lib/slots";

/**
 * «Ближайшие примерки» in the Studio: every confirmed visit still ahead, the
 * soonest first — a fitting at the atelier or a collection at a door, since
 * both are an hour of Kristina's day the diary has given away.
 *
 * "Ahead" is compared as text, the way the rest of the diary compares times:
 * `slotStart` is Southampton's wall clock written "2026-10-25T14:00", and
 * `$now` is this minute written the same way (`localMinuteOf`). GROQ's own
 * `now()` is UTC with seconds and a "Z", so through the summer a fitting
 * would have stayed on the list for an hour after it began.
 *
 * Only what holds a time: a request with no slot has no place in a list
 * sorted by time, and a booking whose time went to someone else
 * (`releasedAt`, see @/lib/diary) is a record, not a visit.
 */
export const UPCOMING_FITTINGS_FILTER = `_type == "atelierBooking"
  && status == "confirmed"
  && defined(slotStart)
  && slotStart >= $now
  && !defined(releasedAt)`;

/**
 * The list's parameters, worked out when the list is opened rather than when
 * the Studio loaded: a Studio left open since Monday would otherwise still
 * show Monday's fittings on Wednesday.
 */
export function upcomingFittingsParams(at: Date = new Date()): { now: string } {
  return { now: localMinuteOf(at) };
}
