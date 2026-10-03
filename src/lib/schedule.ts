import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { DEFAULT_SCHEDULE, generateSlots, startsCovered, type Schedule, type SlotDay } from "@/lib/slots";

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

/**
 * Slots already spoken for. A booking declined or cancelled frees its time
 * again — see HOLDING_STATUSES in @/lib/diary, which this list must match.
 * A collection also says where it ends: Kristina is out for all of it.
 */
export const TAKEN_QUERY = `*[
  _type == "atelierBooking"
  && defined(slotStart)
  && status in ["new", "confirmed", "completed"]
]{ "start": slotStart, "end": slotEnd }`;

/** A booking's hold on the diary: where it starts, and where it ends if it holds more than one slot. */
export interface TakenTime {
  start: string;
  end?: string | null;
}

/** Every slot the bookings hold, spans spelt out slot by slot. */
export function heldStarts(taken: TakenTime[], slotMinutes: number): string[] {
  return taken.flatMap((held) =>
    held && typeof held.start === "string"
      ? startsCovered(held.start, typeof held.end === "string" ? held.end : undefined, slotMinutes)
      : []
  );
}

function withDefaults(raw: Partial<Schedule> | null): Schedule {
  return {
    ...DEFAULT_SCHEDULE,
    ...(raw ?? {}),
    weekly: raw?.weekly ?? [],
    closures: raw?.closures ?? [],
  };
}

/**
 * `strict` is for deciding whether a booking may be taken. The picker can shrug
 * off a diary it cannot read — it falls back to asking for a preferred time —
 * but a booking cannot: an unreadable diary used to read as an empty one, so
 * every slot looked unoffered and every customer was told "that time has just
 * been taken" while the database was simply not answering. Strict readers get
 * the error and say what actually happened.
 */
interface DiaryReadOptions {
  fresh?: boolean;
  strict?: boolean;
}

export async function getSchedule(options?: DiaryReadOptions): Promise<Schedule> {
  const client = options?.fresh ? sanityWriteClient : sanityClient;
  try {
    const raw = await client.fetch<Partial<Schedule> | null>(SCHEDULE_QUERY);
    return withDefaults(raw);
  } catch (error) {
    if (options?.strict) throw error;
    // A diary we cannot read is a diary with nothing in it: the form falls
    // back to asking for a preferred time rather than offering a wrong one.
    return DEFAULT_SCHEDULE;
  }
}

export async function getTakenSlots(options?: DiaryReadOptions): Promise<TakenTime[]> {
  const client = options?.fresh ? sanityWriteClient : sanityClient;
  try {
    return (await client.fetch<TakenTime[]>(TAKEN_QUERY)) ?? [];
  } catch (error) {
    if (options?.strict) throw error;
    return [];
  }
}

/**
 * What the picker should show. `fresh` reads past the CDN — used when a
 * booking is being taken, where a stale diary would mean a double booking.
 */
export async function getAvailableSlots(
  options?: DiaryReadOptions & {
    now?: Date;
    /**
     * The notice the atelier needs is for customers booking themselves.
     * Kristina booking someone she has just agreed a time with on WhatsApp
     * needs none, so the Studio passes 0.
     */
    leadTimeHours?: number;
  }
): Promise<{ schedule: Schedule; days: SlotDay[] }> {
  const [schedule, taken] = await Promise.all([
    getSchedule(options),
    getTakenSlots(options),
  ]);
  const rules =
    options?.leadTimeHours === undefined ? schedule : { ...schedule, leadTimeHours: options.leadTimeHours };
  return {
    schedule,
    days: generateSlots({ schedule: rules, now: options?.now ?? new Date(), taken: heldStarts(taken, schedule.slotMinutes) }),
  };
}
