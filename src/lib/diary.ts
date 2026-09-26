import type { SanityClient } from "next-sanity";
import { slotDocumentId, slotLabel } from "@/lib/slots";

/**
 * The atelier's diary, as bookings hold it.
 *
 * A booking the customer picked a time for is written with its id derived
 * from that time — `slot-2026-10-06-1400` — so Sanity itself refuses a
 * second document for the same fitting. That is what stops two people
 * booking one slot in the same second, and it stays.
 *
 * What it did not cover, and this file does:
 *
 * - A booking that gave its time back — declined by Kristina, cancelled by
 *   the customer — still sat on the id. The picker offered the time again
 *   and the next person was told "that time has just been taken", for every
 *   such time, until the day passed. `claimSlot` now moves such a booking
 *   aside, keeping it as a record, and takes the id.
 * - A booking agreed on WhatsApp or Nextdoor never reached the diary at all,
 *   so the site kept offering its time. Bookings made in the Studio go
 *   through the same `claimSlot`, with the same id.
 * - Moving a booking meant typing a new time into "Confirmed For", which held
 *   nothing: the new time stayed open online. `moveBooking` takes the new
 *   slot first and only then lets go of the old one.
 * - Any failure to write was answered "that time has just been taken",
 *   including the database simply being down. `claimSlot` says which it was.
 *
 * Every write that decides who holds a time is a single Sanity transaction
 * guarded by the revision that was read, so two people reaching for a freed
 * time at once still end with one booking. Sanity's answers were checked
 * against the live API as a dry run on 26 September 2026: an id that exists
 * and a revision that moved on are both refused with 409, and deleting a
 * draft that does not exist is not an error.
 */

/** A booking in one of these holds its time; the diary offers it to nobody else. */
export const HOLDING_STATUSES = ["new", "confirmed", "completed"] as const;

/** A booking in one of these has given its time back. */
export const RELEASING_STATUSES = ["declined", "cancelled"] as const;

/** Only a booking still going ahead can be moved; a finished one stays where it was. */
export const MOVABLE_STATUSES = ["new", "confirmed"] as const;

export function releasesItsTime(status: unknown): boolean {
  return (RELEASING_STATUSES as readonly unknown[]).includes(status);
}

export function canMove(status: unknown): boolean {
  return (MOVABLE_STATUSES as readonly unknown[]).includes(status);
}

/**
 * Whether Sanity refused a write because of what is already there — an id in
 * use, or a revision that has moved on — rather than because something broke.
 */
export function isConflict(error: unknown): boolean {
  const said = error as { statusCode?: number; response?: { statusCode?: number } } | null;
  return said?.statusCode === 409 || said?.response?.statusCode === 409;
}

export interface DiaryDoc {
  _id: string;
  _type: string;
  _rev?: string;
  status?: string;
  slotStart?: string;
  confirmedFor?: string;
  [field: string]: unknown;
}

/** One write in a transaction: all of them happen, or none do. */
export type DiaryWrite =
  | { create: DiaryDoc }
  | { replace: DiaryDoc }
  /** Fails the whole transaction unless the document is still at this revision */
  | { guard: { id: string; rev: string; mark: Record<string, unknown> } }
  | { remove: string };

/**
 * The four things the diary asks of the database. A seam, so the tests can
 * run the real claim and move against a store with revisions and refusals,
 * rather than against a mock that agrees with whatever it is told.
 */
export interface DiaryStore {
  create(doc: DiaryDoc): Promise<void>;
  read(id: string): Promise<DiaryDoc | null>;
  remove(id: string): Promise<void>;
  commit(writes: DiaryWrite[]): Promise<void>;
}

/** The diary's store, backed by Sanity. Reads go past the CDN: the write client never uses it. */
export function sanityDiaryStore(client: SanityClient): DiaryStore {
  return {
    async create(doc) {
      await client.create(doc);
    },
    async read(id) {
      return (await client.getDocument<DiaryDoc>(id)) ?? null;
    },
    async remove(id) {
      await client.delete(id);
    },
    async commit(writes) {
      const tx = client.transaction();
      for (const write of writes) {
        if ("create" in write) tx.create(write.create);
        else if ("replace" in write) tx.createOrReplace(write.replace);
        else if ("guard" in write) {
          const { id, rev, mark } = write.guard;
          tx.patch(id, (patch) => patch.ifRevisionId(rev).set(mark));
        } else tx.delete(write.remove);
      }
      await tx.commit();
    },
  };
}

/** The document without the fields Sanity keeps for itself, and any others named. */
function without(doc: DiaryDoc, fields: string[]): { _type: string; [field: string]: unknown } {
  const dropped = new Set(["_id", "_rev", "_createdAt", "_updatedAt", ...fields]);
  const kept = Object.fromEntries(Object.entries(doc).filter(([field]) => !dropped.has(field)));
  return { ...kept, _type: doc._type };
}

export type Claim = "claimed" | "taken" | "failed";

/**
 * Take a time for a booking whose `_id` is that time's slot id.
 *
 * "taken" means somebody holds it; "failed" means the database did not answer
 * and nothing is known — the caller must not tell a customer the time has gone.
 */
export async function claimSlot(store: DiaryStore, doc: DiaryDoc, now: string): Promise<Claim> {
  try {
    await store.create(doc);
    return "claimed";
  } catch (error) {
    if (!isConflict(error)) {
      console.error(`Could not write down the booking for ${doc._id}:`, error);
      return "failed";
    }
  }

  // Something holds this id. Only a booking that has given its time back may
  // be moved aside for a new one.
  let holder: DiaryDoc | null;
  try {
    holder = await store.read(doc._id);
  } catch (error) {
    console.error(`Could not read who holds ${doc._id}:`, error);
    return "failed";
  }

  if (!holder) {
    // Gone between the two calls: the time is free, so try once more
    try {
      await store.create(doc);
      return "claimed";
    } catch (error) {
      if (isConflict(error)) return "taken";
      console.error(`Could not write down the booking for ${doc._id}:`, error);
      return "failed";
    }
  }

  if (!holder._rev || !releasesItsTime(holder.status)) return "taken";

  // Keep the old booking as a record under an id of its own, and take the
  // slot's id — all at once, and only if nobody changed it since it was read.
  // The record's id carries the revision, so two people racing for the same
  // freed time also collide on that id: whoever is second fails whole.
  const { _id, _rev } = holder;
  try {
    await store.commit([
      { create: { ...without(holder, []), _id: `${_id}-released-${_rev}`, releasedAt: now } },
      { guard: { id: _id, rev: _rev, mark: { releasedAt: now } } },
      { replace: doc },
      // An open draft of the old booking would otherwise publish its old
      // content straight over the new one
      { remove: `drafts.${_id}` },
    ]);
    return "claimed";
  } catch (error) {
    if (isConflict(error)) return "taken";
    console.error(`Could not take over the freed time ${doc._id}:`, error);
    return "failed";
  }
}

/**
 * The booking, at a new time: everything it had, the new slot, and a note of
 * where it came from. Born confirmed and marked as told — a claim, the same
 * as the booking route makes; the sender hands it back if the email is refused.
 *
 * Kristina moves bookings herself, so she knows: `kristinaNotifiedAt` is now,
 * and the morning check does not chase her about her own change.
 */
export function movedCopy(from: DiaryDoc, toSlot: string, now: string): DiaryDoc {
  // A note written for the old time, and the marks of past moves, do not travel
  const kept = without(from, ["releasedAt", "movedAt", "movedFrom", "replyNote", "notifiedStatus"]);

  return {
    ...kept,
    _id: slotDocumentId(toSlot),
    _type: from._type,
    slotStart: toSlot,
    confirmedFor: slotLabel(toSlot),
    status: "confirmed",
    notifiedStatus: "confirmed",
    kristinaNotifiedAt: now,
    // Only a booked time is "moved from"; a request had no time to move from
    ...(from.slotStart ? { movedFrom: slotLabel(from.slotStart) } : {}),
  };
}

export type Move = "moved" | "taken" | "changed" | "failed";

/**
 * Move a booking to the time in `to` (built by `movedCopy`).
 *
 * The new time is taken first and the old booking let go only after that, so
 * at no moment does the customer hold nothing. If the old booking changed
 * while this ran — Kristina edited it in another tab — the new time is handed
 * back and "changed" returned, rather than leaving two bookings for one person.
 */
export async function moveBooking(
  store: DiaryStore,
  input: { from: DiaryDoc; to: DiaryDoc; now: string }
): Promise<Move> {
  const { from, to, now } = input;
  if (!from._rev) return "changed";

  const claim = await claimSlot(store, to, now);
  if (claim !== "claimed") return claim;

  try {
    await store.commit([
      { guard: { id: from._id, rev: from._rev, mark: { movedAt: now } } },
      { remove: from._id },
      { remove: `drafts.${from._id}` },
    ]);
    return "moved";
  } catch (error) {
    try {
      await store.remove(to._id);
    } catch (giveBack) {
      console.error(`Moved ${from._id} but could not give back ${to._id}:`, giveBack);
    }
    if (isConflict(error)) return "changed";
    console.error(`Could not let go of ${from._id} after taking ${to._id}:`, error);
    return "failed";
  }
}
