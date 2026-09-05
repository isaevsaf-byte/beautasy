import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { DEFAULT_SCHEDULE, generateSlots, type Schedule, type SlotDay } from "@/lib/slots";

/**
 * The atelier's diary, as the site sees it.
 *
 * Two readers, deliberately different. The picker may show a slot that has
 * just gone — the customer will be told when they submit — so it reads through
 * the CDN and stays cheap. Deciding whether a booking may be taken must never
 * work from a cached diary, so it reads past the CDN. This is the same split
 * that stopped duplicate emails going out, applied to appointments.
 */

const SCHEDULE_QUERY = `*[_type == "atelierSchedule"][0]{
  enabled, slotMinutes, leadTimeHours, horizonDays,
  "weekly": weekly[]{ day, from, to },
  "closures": closures[]{ date, from, to, note }
}`;

/** Slots already spoken for. A declined booking frees its time again. */
const TAKEN_QUERY = `*[
  _type == "atelierBooking"
  && defined(slotStart)
  && status in ["new", "confirmed", "completed"]
].slotStart`;

function withDefaults(raw: Partial<Schedule> | null): Schedule {
  return {
    ...DEFAULT_SCHEDULE,
    ...(raw ?? {}),
    weekly: raw?.weekly ?? [],
    closures: raw?.closures ?? [],
  };
}

export async function getSchedule(options?: { fresh?: boolean }): Promise<Schedule> {
  const client = options?.fresh ? sanityWriteClient : sanityClient;
  try {
    const raw = await client.fetch<Partial<Schedule> | null>(SCHEDULE_QUERY);
    return withDefaults(raw);
  } catch {
    // A diary we cannot read is a diary with nothing in it: the form falls
    // back to asking for a preferred time rather than offering a wrong one.
    return DEFAULT_SCHEDULE;
  }
}

export async function getTakenSlots(options?: { fresh?: boolean }): Promise<string[]> {
  const client = options?.fresh ? sanityWriteClient : sanityClient;
  try {
    return (await client.fetch<string[]>(TAKEN_QUERY)) ?? [];
  } catch {
    return [];
  }
}

/**
 * What the picker should show. `fresh` reads past the CDN — used when a
 * booking is being taken, where a stale diary would mean a double booking.
 */
export async function getAvailableSlots(options?: {
  fresh?: boolean;
  now?: Date;
}): Promise<{ schedule: Schedule; days: SlotDay[] }> {
  const [schedule, taken] = await Promise.all([
    getSchedule(options),
    getTakenSlots(options),
  ]);
  return {
    schedule,
    days: generateSlots({ schedule, now: options?.now ?? new Date(), taken }),
  };
}
