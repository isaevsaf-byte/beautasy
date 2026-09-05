/**
 * Turning Kristina's opening hours into times a customer can actually pick.
 *
 * The atelier is a room in Southampton, so every time here is Southampton
 * wall-clock time: "Thursday at half past two" means the same thing to the
 * person bringing a dress and to the person altering it. Slots are therefore
 * generated and stored as local date and time, and converted to an instant
 * only to answer one question — has it already gone past?
 *
 * That conversion has to respect British Summer Time, or every slot silently
 * shifts by an hour twice a year. `Intl` knows the rules; the two-pass offset
 * below is the standard way to ask it. The one hour that does not exist on the
 * spring-forward morning is at 1am, which is not an hour anyone books a
 * fitting in, so it is left alone rather than special-cased.
 *
 * Everything in this file is a pure function of its arguments, `now` included,
 * so the awkward cases — a closure on the chosen day, a slot that has just
 * passed, the last slot of the day — are tested rather than hoped about.
 */

export const ATELIER_TIME_ZONE = "Europe/London";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const WEEKDAY_ORDER: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface DayHours {
  day: Weekday;
  /** "09:00" — Southampton wall clock */
  from: string;
  /** "18:00" — the last slot starts before this, never on it */
  to: string;
}

export interface Closure {
  /** "2026-12-25" */
  date: string;
  /** Both absent means the whole day is closed */
  from?: string;
  to?: string;
  note?: string;
}

export interface Schedule {
  /** Off until Kristina has actually filled in her hours */
  enabled: boolean;
  slotMinutes: number;
  /** How much notice she needs before an appointment */
  leadTimeHours: number;
  /** How far ahead the picker offers */
  horizonDays: number;
  weekly: DayHours[];
  closures: Closure[];
}

export interface Slot {
  /** "2026-09-10T14:30" — local, and the identity of the appointment */
  start: string;
  /** "2:30pm" */
  label: string;
}

export interface SlotDay {
  /** "2026-09-10" */
  date: string;
  /** "Thursday 10 September" */
  label: string;
  slots: Slot[];
}

export const DEFAULT_SCHEDULE: Schedule = {
  enabled: false,
  slotMinutes: 30,
  leadTimeHours: 24,
  horizonDays: 28,
  weekly: [],
  closures: [],
};

/* ─── Time zone ─── */

/** How far ahead of UTC Southampton is at this instant, in minutes. */
function offsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ATELIER_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour") % 24, // en-US renders midnight as 24 in this mode
    value("minute"),
    value("second")
  );
  return (asIfUtc - instant.getTime()) / 60000;
}

/**
 * The instant a local "2026-09-10T14:30" happens.
 *
 * Two passes: guess with the offset that applies to the naive reading, then
 * re-check with the offset that actually applies at the resulting instant.
 * Only the clocks-change weekend needs the second pass, and only then does it
 * move anything.
 */
export function instantOf(localMinute: string): Date {
  const naive = Date.parse(`${localMinute}:00Z`);
  if (Number.isNaN(naive)) return new Date(NaN);
  const firstGuess = naive - offsetMinutes(new Date(naive)) * 60000;
  return new Date(naive - offsetMinutes(new Date(firstGuess)) * 60000);
}

/** Today in Southampton, as "2026-09-10", whatever the server thinks it is. */
export function localDateOf(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATELIER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/* ─── Labels ─── */

/** "14:30" → "2:30pm", because nobody says "fourteen thirty" about a fitting. */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "2026-09-10" → "Thursday 10 September" */
export function dayLabel(date: string): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00Z`));
  // en-GB gives "Thursday, 10 September"; the comma reads as a list, not a date
  return formatted.replace(",", "");
}

/** The whole appointment in one line, for an email or the Studio. */
export function slotLabel(localMinute: string): string {
  const [date, time] = localMinute.split("T");
  return `${dayLabel(date)} at ${timeLabel(time)}`;
}

/** Sanity ids allow no colons, so a slot becomes "slot-2026-09-10-1430". */
export function slotDocumentId(localMinute: string): string {
  return `slot-${localMinute.replace("T", "-").replace(":", "")}`;
}

/* ─── Generating ─── */

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function hhmmOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(date: string): Weekday {
  return WEEKDAY_ORDER[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/** True when this minute of this day is closed. */
function isClosed(closures: Closure[], date: string, minute: number): boolean {
  return closures.some((closure) => {
    if (closure.date !== date) return false;
    if (!closure.from || !closure.to) return true; // the whole day
    return minute >= minutesOf(closure.from) && minute < minutesOf(closure.to);
  });
}

/**
 * Every slot a customer may pick, grouped by day and already filtered:
 * closed days and hours are gone, so are slots inside the notice period and
 * slots somebody else has taken.
 */
export function generateSlots(options: {
  schedule: Schedule;
  now: Date;
  /** Local minutes already booked, e.g. ["2026-09-10T14:30"] */
  taken?: string[];
}): SlotDay[] {
  const { schedule, now } = options;
  if (!schedule.enabled || schedule.weekly.length === 0) return [];
  if (schedule.slotMinutes <= 0) return [];

  const taken = new Set(options.taken ?? []);
  const earliest = now.getTime() + schedule.leadTimeHours * 60 * 60 * 1000;
  const today = localDateOf(now);
  const days: SlotDay[] = [];

  for (let offset = 0; offset <= schedule.horizonDays; offset++) {
    const date = addDays(today, offset);
    const weekday = weekdayOf(date);
    const slots: Slot[] = [];

    for (const hours of schedule.weekly.filter((h) => h.day === weekday)) {
      const from = minutesOf(hours.from);
      const to = minutesOf(hours.to);
      // A slot has to finish within opening hours, not merely start inside them
      for (let minute = from; minute + schedule.slotMinutes <= to; minute += schedule.slotMinutes) {
        if (isClosed(schedule.closures, date, minute)) continue;

        const start = `${date}T${hhmmOf(minute)}`;
        if (taken.has(start)) continue;
        if (instantOf(start).getTime() < earliest) continue;

        slots.push({ start, label: timeLabel(hhmmOf(minute)) });
      }
    }

    if (slots.length > 0) {
      slots.sort((a, b) => a.start.localeCompare(b.start));
      days.push({ date, label: dayLabel(date), slots });
    }
  }

  return days;
}

/** Whether a slot a customer sent back is one the schedule actually offers. */
export function slotIsOffered(days: SlotDay[], start: string): boolean {
  return days.some((day) => day.slots.some((slot) => slot.start === start));
}
