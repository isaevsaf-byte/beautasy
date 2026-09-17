import { ATELIER_TIME_ZONE, instantOf, localDateOf } from "@/lib/slots";

/**
 * When the site may send an approved post on its own.
 *
 * Kristina sets two things in Site Settings: how many posts a day, and the
 * hours when nothing goes out. Before this, the only rule was "one post in
 * twenty hours", which had two faults. A second post planned for the same
 * day waited twenty hours and went out at six in the morning, and nobody
 * could change the number without a developer.
 *
 * "A day" is a Southampton calendar day, and every hour here is Southampton
 * wall-clock time, so quiet hours from 22:00 mean 22:00 in both summer and
 * winter.
 *
 * Three more rules sit underneath and are not settings, because getting them
 * wrong is how a feed turns into spam:
 *   - one post per run, and at least MIN_GAP_HOURS between automatic posts,
 *     so an approved backlog does not all leave in the same quarter hour;
 *   - nothing new starts while another post is still going out;
 *   - "Post this now" in the Studio ignores all of it — that is Kristina
 *     asking, and she is the rule.
 *
 * Everything here is a pure function of its arguments, `now` included.
 */

export interface PostingSettings {
  /** Automatic posts per Southampton calendar day */
  postsPerDay: number;
  quietHoursEnabled: boolean;
  /** Hour (0–23, Southampton) when quiet hours begin */
  quietFrom: number;
  /** Hour (0–23, Southampton) when posting may resume */
  quietUntil: number;
}

export const POSTING_DEFAULTS: PostingSettings = {
  postsPerDay: 1,
  quietHoursEnabled: true,
  quietFrom: 22,
  quietUntil: 8,
};

export const MAX_POSTS_PER_DAY = 5;

/** The least time between two automatic posts, whatever the daily number. */
export const MIN_GAP_HOURS = 3;

function wholeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Site Settings as saved, made whole.
 *
 * A field Kristina never touched is missing, not zero, and a missing number
 * must mean the default — a daily limit of 0 would silently stop every post.
 */
export function postingSettingsFrom(
  raw: Partial<Record<keyof PostingSettings, unknown>> | null | undefined
): PostingSettings {
  if (!raw) return { ...POSTING_DEFAULTS };
  return {
    postsPerDay: wholeNumber(raw.postsPerDay, POSTING_DEFAULTS.postsPerDay, 1, MAX_POSTS_PER_DAY),
    quietHoursEnabled: raw.quietHoursEnabled !== false,
    quietFrom: wholeNumber(raw.quietFrom, POSTING_DEFAULTS.quietFrom, 0, 23),
    quietUntil: wholeNumber(raw.quietUntil, POSTING_DEFAULTS.quietUntil, 0, 23),
  };
}

/** The hour on a Southampton clock at this instant, 0–23. */
export function southamptonHour(instant: Date): number {
  const part = new Intl.DateTimeFormat("en-GB", {
    timeZone: ATELIER_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(instant)
    .find((p) => p.type === "hour");
  return Number(part?.value ?? 0) % 24;
}

/**
 * Whether this instant falls in quiet hours.
 *
 * The usual window crosses midnight (22:00 → 08:00), so "from" is later in
 * the day than "until". Equal hours mean no window at all rather than a
 * whole day of silence: nobody sets "quiet from 9 until 9" to mean "never
 * post".
 */
export function inQuietHours(instant: Date, settings: PostingSettings): boolean {
  const { quietHoursEnabled, quietFrom, quietUntil } = settings;
  if (!quietHoursEnabled || quietFrom === quietUntil) return false;
  const hour = southamptonHour(instant);
  return quietFrom < quietUntil
    ? hour >= quietFrom && hour < quietUntil
    : hour >= quietFrom || hour < quietUntil;
}

/** Midnight in Southampton at the start of this instant's day, as an instant. */
export function startOfSouthamptonDay(instant: Date): Date {
  return instantOf(`${localDateOf(instant)}T00:00`);
}

export type PostingHold = "in-flight" | "quiet-hours" | "daily-limit" | "too-soon";

export type PostingVerdict = { ok: true } | { ok: false; hold: PostingHold };

/**
 * May the schedule send one more post right now?
 *
 * The order of the checks decides only what is reported, not the answer: a
 * post still going out is named first because it clears itself, and quiet
 * hours before the daily limit because that is the one Kristina set on
 * purpose and will recognise.
 */
export function mayPublish(state: {
  now: Date;
  settings: PostingSettings;
  /** Automatic and manual posts published since Southampton midnight */
  publishedToday: number;
  /** When the most recent post went out, if ever */
  lastPublishedAt?: string | null;
  /** Posts claimed and still on their way to Instagram */
  inFlight: number;
}): PostingVerdict {
  if (state.inFlight > 0) return { ok: false, hold: "in-flight" };
  if (inQuietHours(state.now, state.settings)) return { ok: false, hold: "quiet-hours" };
  if (state.publishedToday >= state.settings.postsPerDay) return { ok: false, hold: "daily-limit" };

  if (state.lastPublishedAt) {
    const last = Date.parse(state.lastPublishedAt);
    if (Number.isFinite(last) && state.now.getTime() - last < MIN_GAP_HOURS * 60 * 60 * 1000) {
      return { ok: false, hold: "too-soon" };
    }
  }

  return { ok: true };
}
