import { sanityWriteClient } from "@/lib/sanity";
import { localDateOf } from "@/lib/slots";
import { addMonthsTo, isDayString, londonToday } from "@/lib/londonDays";

/**
 * Deleting what the Privacy Policy says we stop keeping.
 *
 * The policy (Sanity legalPage "Privacy Policy", "How long we keep it",
 * published 03.10.2026) promises, word for word:
 *
 *   "Bookings, collection details and messages: two years after your last
 *    visit, unless we still need them for the accounts."
 *   "Back in stock: twelve months at most."
 *   "Friends links: while the programme runs, and up to two years after your
 *    link was last used."
 *
 * Until this job nothing was ever deleted, so every one of those was a promise
 * the site did not keep. This keeps the first two.
 *
 * Bookings are kept per person, not per booking: "after your LAST visit". A
 * client who came in 2026 and again in 2027 keeps both bookings until two
 * years after 2027 — her history with the atelier goes as one. A person is
 * their email's fingerprint (see @/lib/pii); a booking without one stands
 * alone. A booking's day is its diary time, or the day it was asked for when
 * it never had one. A booking still ahead is never due, whatever its age.
 * Nothing here needs the accounts: «Касса» keeps its own sealed entries and
 * does not point at bookings (see @/lib/ledgerStore).
 *
 * Friends links are not deleted here, on purpose. "Last used" is not written
 * down anywhere as such — a link is used when a friend books or buys through
 * it, which may never become a reward — and a link can carry a credit card
 * holding money its owner has earned. Deciding what "used" means and what
 * happens to an unspent credit is the owner's call, not a cron's.
 *
 * Every date is Southampton's (see @/lib/londonDays): a booking made at
 * 11:30pm UTC on 10 October in summer was made on 11 October in Southampton,
 * and it is that day it is counted from. A record is due ON its anniversary —
 * two years to the day, at most — and a date the anniversary month lacks
 * (29 February) falls to the month's last day, a day early rather than late.
 *
 * Safety. At most MAX_DELETIONS documents a run, so a wrong date or a bug can
 * never take more than that in one morning; the rest wait for tomorrow. A
 * record that cannot be dated is kept. Each record goes on its own, with its
 * Studio draft if it has one, so one refusal does not stop the others, and
 * the counts are logged.
 *
 * Nothing is due yet. The oldest stock alert was made on 24 August 2026, so
 * the first deletion is due on 24 August 2027; the oldest booking dates from
 * 26 August 2026, so bookings start going on 26 August 2028 at the earliest.
 * Until then this runs every morning and deletes nothing.
 *
 * 🚨 Deleting a document does not erase its history: Sanity keeps past
 * revisions, and on this plan they can be read without a token for as long as
 * Sanity retains them (see the sanity-dataset-cannot-be-private note). The
 * fields that matter are sealed, so what history shows is a first name, a
 * masked email, a service and a time.
 */

export const BOOKING_YEARS = 2;
export const STOCK_ALERT_MONTHS = 12;
/** The most documents one morning may delete — drafts included. */
export const MAX_DELETIONS = 50;

export interface DatedBooking {
  _id: string;
  emailFingerprint?: string;
  slotStart?: string;
  createdAt?: string;
  _createdAt?: string;
}

export interface DatedAlert {
  _id: string;
  createdAt?: string;
  _createdAt?: string;
}

/** Every booking, drafts too: whether one is due depends on the same person's others. */
export const RETENTION_BOOKINGS_QUERY = `*[_type == "atelierBooking"]{ _id, emailFingerprint, slotStart, createdAt, _createdAt }`;

/**
 * Stock alerts old enough to be worth judging. `$before` is generous — a
 * month past the line — and the exact London-day judgement is made below.
 */
export const RETENTION_ALERTS_QUERY = `*[_type == "stockAlert" && coalesce(createdAt, _createdAt) < $before]{ _id, createdAt, _createdAt }`;

/** The published id a draft belongs to. */
function publishedIdOf(id: string): string {
  return id.startsWith("drafts.") ? id.slice("drafts.".length) : id;
}

/** "2026-10-10T23:30:00Z" → the Southampton day it happened on, or null for anything that is not a moment. */
function londonDayOfInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : localDateOf(new Date(ms));
}

/**
 * The day a booking is counted from: its diary time ("2026-10-10T14:00" is
 * already Southampton's wall clock), or the day it was asked for. Null when
 * neither can be read — and a record that cannot be dated is kept.
 */
export function bookingDay(booking: DatedBooking): string | null {
  if (typeof booking.slotStart === "string" && isDayString(booking.slotStart.slice(0, 10))) {
    return booking.slotStart.slice(0, 10);
  }
  return londonDayOfInstant(booking.createdAt) ?? londonDayOfInstant(booking._createdAt);
}

export function alertDay(alert: DatedAlert): string | null {
  return londonDayOfInstant(alert.createdAt) ?? londonDayOfInstant(alert._createdAt);
}

/** Whether a record dated `day` is due on `today`: on the anniversary itself, or after it. */
export function dueOn(day: string, months: number, today: string): boolean {
  return today >= addMonthsTo(day, months);
}

/**
 * The bookings due on `today`, every id of each (published and draft),
 * grouped per record so a record and its draft go together.
 */
export function bookingsDue(bookings: DatedBooking[], today: string): string[][] {
  // One record per published id: a draft is the same booking, being edited
  const records = new Map<string, DatedBooking[]>();
  for (const booking of bookings) {
    const id = publishedIdOf(booking._id);
    records.set(id, [...(records.get(id) ?? []), booking]);
  }

  // A person's last day, across every booking they have. An undatable
  // booking makes the whole person undatable: kept.
  const lastDayOf = new Map<string, string | null>();
  const personOf = (copies: DatedBooking[], id: string) =>
    copies.find((copy) => copy.emailFingerprint)?.emailFingerprint ?? `booking:${id}`;
  for (const [id, copies] of records) {
    const person = personOf(copies, id);
    // The published copy says when it is; a draft only when there is nothing else
    const published = copies.find((copy) => copy._id === id) ?? copies[0];
    const day = bookingDay(published);
    if (!lastDayOf.has(person)) {
      lastDayOf.set(person, day);
      continue;
    }
    const before = lastDayOf.get(person)!;
    lastDayOf.set(person, before === null || day === null ? null : day > before ? day : before);
  }

  const due: string[][] = [];
  for (const [id, copies] of records) {
    const last = lastDayOf.get(personOf(copies, id));
    if (last && dueOn(last, BOOKING_YEARS * 12, today)) due.push(copies.map((copy) => copy._id).sort());
  }
  return due.sort((a, b) => a[0].localeCompare(b[0]));
}

/** The stock alerts due on `today`, grouped as bookings are. */
export function alertsDue(alerts: DatedAlert[], today: string): string[][] {
  const records = new Map<string, DatedAlert[]>();
  for (const alert of alerts) {
    const id = publishedIdOf(alert._id);
    records.set(id, [...(records.get(id) ?? []), alert]);
  }
  const due: string[][] = [];
  for (const copies of records.values()) {
    const days = copies.map(alertDay);
    if (days.some((day) => day === null)) continue;
    // The earliest copy says when they asked; a draft opened later does not make it younger
    const day = (days as string[]).sort()[0];
    if (dueOn(day, STOCK_ALERT_MONTHS, today)) due.push(copies.map((copy) => copy._id).sort());
  }
  return due.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Records, whole, until the next would take the morning past `max` documents. */
export function withinCap(groups: string[][], max: number): string[][] {
  const taken: string[][] = [];
  let count = 0;
  for (const group of groups) {
    if (count + group.length > max) break;
    taken.push(group);
    count += group.length;
  }
  return taken;
}

export interface RetentionDeps {
  now?: Date;
  fetch?: <T>(query: string, params?: Record<string, unknown>) => Promise<T>;
  /** Deletes one record and its draft together */
  remove?: (ids: string[]) => Promise<unknown>;
}

export interface RetentionResult {
  today: string;
  bookingsDue: number;
  alertsDue: number;
  /** Documents deleted, drafts included */
  deleted: number;
  /** Records a refusal kept for tomorrow */
  failed: number;
  /** Records left for tomorrow by the cap */
  waiting: number;
}

export async function runRetentionCleanup(deps: RetentionDeps = {}): Promise<RetentionResult> {
  const today = londonToday(deps.now ?? new Date());
  if (!deps.fetch && !process.env.SANITY_API_WRITE_TOKEN) {
    return { today, bookingsDue: 0, alertsDue: 0, deleted: 0, failed: 0, waiting: 0 };
  }
  const fetch = deps.fetch ?? (<T>(query: string, params?: Record<string, unknown>) => sanityWriteClient.fetch<T>(query, params ?? {}));
  const remove =
    deps.remove ??
    ((ids: string[]) => {
      const transaction = sanityWriteClient.transaction();
      for (const id of ids) transaction.delete(id);
      return transaction.commit();
    });

  // A month's slack on the alerts: the exact line is drawn in London days below
  const before = `${addMonthsTo(today, -(STOCK_ALERT_MONTHS - 1))}T00:00:00Z`;
  const [bookings, alerts] = await Promise.all([
    fetch<DatedBooking[]>(RETENTION_BOOKINGS_QUERY),
    fetch<DatedAlert[]>(RETENTION_ALERTS_QUERY, { before }),
  ]);
  const dueBookings = bookingsDue(bookings ?? [], today);
  const dueAlerts = alertsDue(alerts ?? [], today);
  const all = [...dueBookings, ...dueAlerts];
  const now = withinCap(all, MAX_DELETIONS);

  let deleted = 0;
  let failed = 0;
  for (const ids of now) {
    try {
      await remove(ids);
      deleted += ids.length;
    } catch (error) {
      failed++;
      console.error(`Retention: could not delete ${ids.join(", ")}:`, error instanceof Error ? error.message : error);
    }
  }

  const result = {
    today,
    bookingsDue: dueBookings.length,
    alertsDue: dueAlerts.length,
    deleted,
    failed,
    waiting: all.length - now.length,
  };
  if (all.length > 0) console.log("Retention cleanup:", JSON.stringify(result));
  return result;
}
