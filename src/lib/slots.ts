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
  /**
   * Off (or absent) closes England and Wales bank holidays by themselves —
   * see bankHolidays below. Christmas Day and Boxing Day stay closed either way.
   */
  workBankHolidays?: boolean;
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
  workBankHolidays: false,
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

/* ─── Bank holidays ─── */

/*
 * England and Wales bank holidays, worked out rather than typed in.
 *
 * Kristina used to have to remember to close each one under "Выходные и
 * перерывы", and a forgotten Easter Monday is a customer booked on a day the
 * atelier was meant to be shut. The rules are fixed and public, so
 * the diary keeps them itself: New Year's Day, Good Friday, Easter Monday, the
 * first and last Mondays of May, the last Monday of August, Christmas Day and
 * Boxing Day — each moved to the next free weekday when it falls at a weekend,
 * the way gov.uk lists them.
 *
 * A one-off holiday the government adds (a coronation, a jubilee) cannot be
 * worked out, and still goes in by hand as a closure.
 */

function dateOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Easter Sunday in the Gregorian calendar — the anonymous algorithm, as printed in Meeus. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateOf(year, month, day);
}

function firstMondayOf(year: number, month: number): string {
  let date = dateOf(year, month, 1);
  while (weekdayOf(date) !== "mon") date = addDays(date, 1);
  return date;
}

function lastMondayOf(year: number, month: number): string {
  let date = addDays(month === 12 ? dateOf(year + 1, 1, 1) : dateOf(year, month + 1, 1), -1);
  while (weekdayOf(date) !== "mon") date = addDays(date, -1);
  return date;
}

function isWeekend(date: string): boolean {
  const day = weekdayOf(date);
  return day === "sat" || day === "sun";
}

const holidaysByYear = new Map<number, string[]>();

/** The year's bank holidays in England and Wales, as the days off actually fall: "2026-12-28", not the Saturday. */
export function bankHolidays(year: number): string[] {
  const known = holidaysByYear.get(year);
  if (known) return known;

  const easter = easterSunday(year);
  const days = new Set([
    addDays(easter, -2), // Good Friday
    addDays(easter, 1), // Easter Monday
    firstMondayOf(year, 5),
    lastMondayOf(year, 5),
    lastMondayOf(year, 8),
  ]);

  // The three that can fall at a weekend. Those on a weekday keep their own
  // day first, so that a Sunday Christmas moves to the Tuesday: Boxing Day
  // already has the Monday.
  const movable = [dateOf(year, 1, 1), dateOf(year, 12, 25), dateOf(year, 12, 26)];
  for (const date of movable) if (!isWeekend(date)) days.add(date);
  for (const date of movable.filter(isWeekend)) {
    let kept = date;
    while (isWeekend(kept) || days.has(kept)) kept = addDays(kept, 1);
    days.add(kept);
  }

  const sorted = [...days].sort();
  holidaysByYear.set(year, sorted);
  return sorted;
}

/**
 * Whether the diary is shut on this day for a holiday. Christmas Day and
 * Boxing Day always are, whatever day of the week they fall on; the other bank
 * holidays (and the days Christmas moves to) only while Kristina has not said
 * she works them.
 */
export function closedForHoliday(date: string, workBankHolidays: boolean | undefined): boolean {
  const monthDay = date.slice(5);
  if (monthDay === "12-25" || monthDay === "12-26") return true;
  if (workBankHolidays === true) return false;
  return bankHolidays(Number(date.slice(0, 4))).includes(date);
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
    if (closedForHoliday(date, schedule.workBankHolidays)) continue;
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

/* ─── Spans ─── */

/*
 * A fitting holds one slot. A collection holds more: Kristina drives to the
 * customer's door and back, and nobody can be pinned in the atelier while she
 * is out. So such a booking keeps where it ends as well as where it starts,
 * and every slot in between counts as taken.
 */

/** "2026-10-06T14:00" and 90 minutes → "2026-10-06T15:30". Spans stay inside one day's hours. */
export function addMinutesLocal(localMinute: string, minutes: number): string {
  const [date, time] = localMinute.split("T");
  return `${date}T${hhmmOf(minutesOf(time) + minutes)}`;
}

/**
 * Every slot a booking holds: just its start, or each slot from its start up
 * to its end — 14:00 to 15:00 in half-hour slots holds 14:00 and 14:30.
 */
export function startsCovered(start: string, end: string | undefined | null, slotMinutes: number): string[] {
  if (!end || !(slotMinutes > 0)) return [start];
  const [date, time] = start.split("T");
  const [endDate, endTime] = end.split("T");
  if (endDate !== date || !time || !endTime) return [start];
  const covered: string[] = [];
  for (let minute = minutesOf(time); minute < minutesOf(endTime); minute += slotMinutes) {
    covered.push(`${date}T${hhmmOf(minute)}`);
  }
  return covered.length > 0 ? covered : [start];
}

/** Where a span of `minutes` from `start` ends, rounded up to whole slots: the diary has no half slots. */
export function spanEnd(start: string, minutes: number, slotMinutes: number): string {
  return addMinutesLocal(start, Math.max(1, Math.ceil(minutes / slotMinutes)) * slotMinutes);
}

/**
 * The starts from which a span of `minutes` fits: every slot it would hold is
 * free and on the same day.
 *
 * `alsoFree` are the slots the booking being changed holds itself (see heldBy
 * in @/lib/diary). They count as free for it, and those still ahead of
 * `nowMs` can be starts too, so a collection can move half an hour either way,
 * or keep its start and take longer, without tripping over its own time.
 *
 * The diary leaves out a day with no free slot, and a collection that fills
 * the rest of its day is exactly that — so its own days are put back, or it
 * could never be shortened or shifted inside its own trip.
 */
export function spansOffered(
  days: SlotDay[],
  minutes: number,
  slotMinutes: number,
  alsoFree: string[] = [],
  nowMs?: number
): SlotDay[] {
  const own = alsoFree.filter((start) => nowMs === undefined || instantOf(start).getTime() > nowMs);
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const start of own) {
    const date = start.split("T")[0];
    if (!byDate.has(date)) byDate.set(date, { date, label: dayLabel(date), slots: [] });
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const free = new Set([...day.slots.map((slot) => slot.start), ...alsoFree]);
      const candidates = [
        ...day.slots,
        ...own
          .filter((start) => start.startsWith(`${day.date}T`) && !day.slots.some((slot) => slot.start === start))
          .map((start) => ({ start, label: timeLabel(start.split("T")[1]) })),
      ].sort((a, b) => a.start.localeCompare(b.start));
      const slots = candidates.filter((slot) =>
        startsCovered(slot.start, spanEnd(slot.start, minutes, slotMinutes), slotMinutes).every((start) => free.has(start))
      );
      return { ...day, slots };
    })
    .filter((day) => day.slots.length > 0);
}

/** Whether a span sent back is one the diary can hold. */
export function spanIsOffered(
  days: SlotDay[],
  start: string,
  minutes: number,
  slotMinutes: number,
  alsoFree: string[] = [],
  nowMs?: number
): boolean {
  return slotIsOffered(spansOffered(days, minutes, slotMinutes, alsoFree, nowMs), start);
}

/** "Tuesday 6 October, between 2:00pm and 3:00pm" — a collection is a window, not a moment. */
export function spanLabel(start: string, end: string): string {
  const [date, time] = start.split("T");
  const endTime = end.split("T")[1] ?? time;
  return `${dayLabel(date)}, between ${timeLabel(time)} and ${timeLabel(endTime)}`;
}
