import { localDateOf } from "@/lib/slots";

/**
 * Days as the atelier counts them — Southampton's calendar, whatever clock
 * the server keeps — for the morning jobs that ask "what is on today and
 * tomorrow?" and "what is two years old?".
 *
 * Everything below works on "2026-10-25" strings and never on instants. A
 * day is not always 24 hours here: 25 October 2026 has 25 of them, and adding
 * 86,400,000 ms to a moment late on the 24th lands on the 25th in one place and
 * the 26th in another. Only the first step, "which day is it in Southampton
 * now?", touches a clock, and it goes through `localDateOf`, which asks the
 * Europe/London zone. After that it is calendar arithmetic, done at noon UTC
 * where no change of clocks can reach it.
 */

const DAY_MS = 86_400_000;

/** Today in Southampton, as "2026-10-10". */
export function londonToday(now: Date = new Date()): string {
  return localDateOf(now);
}

/** "2026-10-25" and 1 → "2026-10-26". Negative steps go back. */
export function addDaysTo(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * "2026-10-10" and 12 → "2027-10-10": the same date that many months on.
 *
 * A date the later month does not have falls back to that month's last day —
 * 29 February 2028 plus two years is 28 February 2030, not 1 March. This is
 * used for how long records may be kept, so of the two possible answers it
 * takes the earlier one: a record goes a day early, never a day late.
 */
export function addMonthsTo(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(date, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Today, tomorrow and the day after, in Southampton — the window a morning list covers is [today, dayAfter). */
export function londonDays(now: Date = new Date()): { today: string; tomorrow: string; dayAfter: string } {
  const today = londonToday(now);
  return { today, tomorrow: addDaysTo(today, 1), dayAfter: addDaysTo(today, 2) };
}

const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether this is a real day written "2026-10-25" — not "2026-02-30", not a time. */
export function isDayString(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_SHAPE.test(value)) return false;
  const noon = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(noon.getTime()) && noon.toISOString().slice(0, 10) === value;
}
