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

/**
 * A booking in one of these can be given a (new) time: moved, if it is going
 * ahead, or booked again, if it gave its time back. Only a finished one stays
 * where it was.
 */
export const MOVABLE_STATUSES = ["new", "confirmed", ...RELEASING_STATUSES] as const;

export function releasesItsTime(status: unknown): boolean {
  return (RELEASING_STATUSES as readonly unknown[]).includes(status);
}

export function canMove(status: unknown): boolean {
  return (MOVABLE_STATUSES as readonly unknown[]).includes(status);
}

function statusCodeOf(error: unknown): number | undefined {
  const said = error as { statusCode?: number; response?: { statusCode?: number } } | null;
  return said?.statusCode ?? said?.response?.statusCode;
}

/**
 * Whether Sanity refused a write because of what is already there — an id in
 * use, or a revision that has moved on — rather than because something broke.
 */
export function isConflict(error: unknown): boolean {
  return statusCodeOf(error) === 409;
}

/**
 * Whether Sanity turned a write away before doing anything with it — a token
 * it does not accept, too many requests, a write it could not read. Anything
 * else — a dropped connection, a server error — can lose the answer to a write
 * that did happen, so the diary looks before it believes such a failure.
 */
function wasTurnedAway(error: unknown): boolean {
  const code = statusCodeOf(error);
  return code !== undefined && code >= 400 && code < 500 && code !== 409;
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

/** Whether the document found is the one written: every plain field the same. */
function isTheOneWritten(written: DiaryDoc, found: DiaryDoc | null): boolean {
  if (!found || found._type !== written._type) return false;
  // The sealed contact details are encrypted with a fresh nonce each time, and
  // `createdAt` is to the millisecond, so two different bookings never match
  return Object.entries(written).every(
    ([field, value]) => field.startsWith("_") || (typeof value === "object" && value !== null) || found[field] === value
  );
}

export type Claim = "claimed" | "taken" | "failed" | "unsure";

/**
 * A write that went wrong without saying whether it happened. A dropped
 * connection can lose the answer to a write that landed, so look before
 * answering: a booking told it failed while it holds the time is a phantom
 * nobody knows about, and one told it holds a time it does not is two people
 * at the door.
 */
async function settle(store: DiaryStore, doc: DiaryDoc, error: unknown): Promise<Claim> {
  if (wasTurnedAway(error)) {
    console.error(`The database turned away the booking for ${doc._id}:`, error);
    return "failed";
  }
  let found: DiaryDoc | null;
  try {
    found = await store.read(doc._id);
  } catch (lookError) {
    console.error(`Could not write down the booking for ${doc._id}, nor look whether it landed:`, error, lookError);
    return "unsure";
  }
  if (isTheOneWritten(doc, found)) return "claimed";
  console.error(`Could not write down the booking for ${doc._id}:`, error);
  return found && !releasesItsTime(found.status) ? "taken" : "failed";
}

/**
 * Take a time for a booking whose `_id` is that time's slot id.
 *
 * "taken" means somebody holds it. "failed" means nothing was written, and
 * "unsure" that the database stopped answering mid-write, so nobody knows —
 * in neither case may a customer be told the time has gone.
 */
export async function claimSlot(store: DiaryStore, doc: DiaryDoc, now: string): Promise<Claim> {
  // A few rounds, because a freed booking can change between the read and the
  // take — its email going out moves its revision on — and then it is simply
  // looked at again. Somebody else taking it ends the rounds with "taken".
  for (let round = 0; round < 3; round++) {
    try {
      await store.create(doc);
      return "claimed";
    } catch (error) {
      if (!isConflict(error)) return settle(store, doc, error);
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

    // Gone between the two calls: the time is free, so try again
    if (!holder) continue;
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
      if (!isConflict(error)) return settle(store, doc, error);
    }
  }
  return "taken";
}

/** The same words, give or take case, spaces and punctuation. */
function sameWords(a: string, b: string): boolean {
  const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return plain(a) === plain(b);
}

/**
 * The time the customer was last told they had, if any: the slot a booking
 * held, or — for a request confirmed the old way, by typing — the words they
 * were emailed. Without it a customer moved off a typed time gets a plain
 * "you're booked in" and turns up for both.
 */
function toldTimeOf(from: DiaryDoc): string | undefined {
  if (from.slotStart) return slotLabel(from.slotStart);
  const typed = typeof from.confirmedFor === "string" ? from.confirmedFor.trim() : "";
  return typed && from.status === "confirmed" && from.notifiedStatus === "confirmed" ? typed : undefined;
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
  // The marks of past moves do not travel, and neither does a note written for
  // an earlier reply — it went with that reply. A note on a request still
  // waiting for its first answer has not gone anywhere yet, so it goes with this one.
  const noteWaits = from.status === "new" && !from.slotStart;
  const kept = without(from, [
    "releasedAt",
    "movedAt",
    "movedFrom",
    "notifiedStatus",
    ...(noteWaits ? [] : ["replyNote"]),
  ]);

  const was = toldTimeOf(from);
  const to = slotLabel(toSlot);
  return {
    ...kept,
    _id: slotDocumentId(toSlot),
    _type: from._type,
    slotStart: toSlot,
    confirmedFor: to,
    status: "confirmed",
    notifiedStatus: "confirmed",
    kristinaNotifiedAt: now,
    // "Moved from" only when they had been told another time
    ...(was && !sameWords(was, to) ? { movedFrom: was } : {}),
  };
}

export type Move = "moved" | "taken" | "changed" | "failed" | "unsure";

/**
 * Move a booking to the time in `to` (built by `movedCopy`).
 *
 * The new time is taken first and the old booking let go only after that, so
 * at no moment does the customer hold nothing. If the old booking changed
 * while this ran — Kristina edited it in another tab — the new time is handed
 * back and "changed" returned, rather than leaving two bookings for one person.
 *
 * Nothing is undone on a guess. If the database stops answering while the old
 * booking is let go, it is looked at first: gone means the move happened, and
 * handing the new time back then would leave the customer with no booking at
 * all. When even the look fails, both are left as they are and "unsure" said.
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
    if (!isConflict(error) && !wasTurnedAway(error)) {
      let old: DiaryDoc | null;
      try {
        old = await store.read(from._id);
      } catch (lookError) {
        console.error(`Lost the answer letting go of ${from._id}, and could not look:`, error, lookError);
        return "unsure";
      }
      if (!old) return "moved";
    }

    // The old booking is still there, so the new time goes back
    try {
      await store.remove(to._id);
    } catch (giveBack) {
      console.error(`Could not let go of ${from._id}, nor give back ${to._id}:`, error, giveBack);
      return "unsure";
    }
    if (isConflict(error)) return "changed";
    console.error(`Could not let go of ${from._id} after taking ${to._id}:`, error);
    return "failed";
  }
}
