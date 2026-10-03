import type { SanityClient } from "next-sanity";
import { slotsFor } from "@/lib/atelierServices";
import {
  instantOf,
  slotDocumentId,
  slotLabel,
  spanEnd,
  spanLabel,
  spanMinutes,
  spansOffered,
  startsCovered,
  type SlotDay,
} from "@/lib/slots";

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

/**
 * The slots a booking holds right now: none once it has given its time back,
 * one for a fitting, every slot of the trip for a collection. Handed to the
 * diary as free for this booking alone, so it can move without tripping over
 * its own time.
 */
export function heldBy(booking: { slotStart?: string; slotEnd?: string; status?: string }, slotMinutes: number): string[] {
  if (!booking.slotStart || releasesItsTime(booking.status)) return [];
  return startsCovered(booking.slotStart, booking.slotEnd, slotMinutes);
}

/**
 * How long a fitting holds the diary, in minutes: its own span when it has
 * one, a single slot when it holds a single time, and — for a request with no
 * time yet — as many slots as its service takes (see slotsFor). Moved or
 * booked again, a fitting keeps its own length, so a bride booked for two
 * slots is moved with both.
 */
export function fittingMinutes(
  booking: { slotStart?: string; slotEnd?: string; service?: unknown },
  slotMinutes: number
): number {
  if (booking.slotStart) return spanMinutes(booking.slotStart, booking.slotEnd) ?? slotMinutes;
  return slotsFor(typeof booking.service === "string" ? booking.service : undefined) * slotMinutes;
}

/** Where a fitting of `minutes` from `slot` ends — only when it holds more than one slot; a single slot keeps no end. */
export function fittingEnd(slot: string, minutes: number, slotMinutes: number): string | undefined {
  return minutes > slotMinutes ? spanEnd(slot, minutes, slotMinutes) : undefined;
}

/**
 * The starts a fitting can be given — moved to, or booked again at — as of
 * `nowMs`: every slot of its own length free, its own slots counting as its
 * own (so a bride's hour can move half an hour either way), and nothing that
 * has begun. The very start it holds now is left out: moving onto it is not
 * a move.
 */
export function startsToMoveTo(
  days: SlotDay[],
  booking: { slotStart?: string; slotEnd?: string; status?: string; service?: unknown },
  slotMinutes: number,
  nowMs: number
): SlotDay[] {
  const minutes = fittingMinutes(booking, slotMinutes);
  const holding = booking.slotStart && !releasesItsTime(booking.status) ? booking.slotStart : null;
  return spansOffered(days, minutes, slotMinutes, heldBy(booking, slotMinutes), nowMs)
    .map((day) => ({
      ...day,
      slots: day.slots.filter((slot) => slot.start !== holding && instantOf(slot.start).getTime() > nowMs),
    }))
    .filter((day) => day.slots.length > 0);
}

/**
 * A booking's time in the customer's words. A collection is a window —
 * Kristina is at their door some time in it — so "between 2:00pm and
 * 3:00pm". A fitting is a moment however many slots it holds: a bride is
 * expected at 2:00pm, and her email says separately how long it takes.
 */
export function timeTold(booking: { [field: string]: unknown }, slot: string, end?: string | null): string {
  return end && booking.collection ? spanLabel(slot, end) : slotLabel(slot);
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
  /** Where a booking holding more than one slot ends — a collection: Kristina is out for all of it */
  slotEnd?: string;
  confirmedFor?: string;
  [field: string]: unknown;
}

/** One write in a transaction: all of them happen, or none do. */
export type DiaryWrite =
  | { create: DiaryDoc }
  | { replace: DiaryDoc }
  /** Fails the whole transaction unless the document is still at this revision */
  | { guard: { id: string; rev: string; mark: Record<string, unknown>; unset?: string[] } }
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
          const { id, rev, mark, unset } = write.guard;
          tx.patch(id, (patch) => {
            const guarded = patch.ifRevisionId(rev).set(mark);
            return unset && unset.length > 0 ? guarded.unset(unset) : guarded;
          });
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
export function sameWords(a: string, b: string): boolean {
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
  // Told it is off — cancelled, or declined — they hold no time to move from
  if (releasesItsTime(from.status) && from.notifiedStatus === from.status) return undefined;
  if (from.slotStart) return timeTold(from, from.slotStart, from.slotEnd);
  const typed = typeof from.confirmedFor === "string" ? from.confirmedFor.trim() : "";
  return typed && from.status === "confirmed" && from.notifiedStatus === "confirmed" ? typed : undefined;
}

/**
 * Whether the note on a booking still waits for its first reply. A note
 * written for an earlier reply went with that reply; one on a request with
 * no answer and no time yet has gone nowhere, so it goes with this one.
 */
function noteWaits(from: DiaryDoc): boolean {
  return from.status === "new" && !from.slotStart;
}

/**
 * The booking, at a new time: everything it had, the new slot, and a note of
 * where it came from. Born confirmed and marked as told — a claim, the same
 * as the booking route makes; the sender hands it back if the email is refused.
 *
 * Kristina moves bookings herself, so she knows: `kristinaNotifiedAt` is now,
 * and the morning check does not chase her about her own change.
 *
 * `toEnd` is for a booking that holds more than one slot: it holds the diary
 * until then. A collection's customer is told the window, "between 2:00pm and
 * 3:00pm"; a bride the moment she is expected (see timeTold).
 */
export function movedCopy(from: DiaryDoc, toSlot: string, now: string, toEnd?: string): DiaryDoc {
  // The marks of past moves do not travel, and neither does a note written for
  // an earlier reply (see noteWaits)
  const kept = without(from, [
    "releasedAt",
    "movedAt",
    "movedFrom",
    "notifiedStatus",
    // A span belongs to the time it was given with, never to the next one
    "slotEnd",
    ...(noteWaits(from) ? [] : ["replyNote"]),
  ]);

  const was = toldTimeOf(from);
  const to = timeTold(from, toSlot, toEnd);
  return {
    ...kept,
    _id: slotDocumentId(toSlot),
    _type: from._type,
    slotStart: toSlot,
    ...(toEnd ? { slotEnd: toEnd } : {}),
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
 * Whether a booking read back under an id is this booking, rather than a new
 * one somebody made there since — a freed time is on offer the moment it is
 * let go. Undefined when the booking carries nothing to tell it by.
 */
function isSameBooking(mine: DiaryDoc, found: DiaryDoc): boolean | undefined {
  const marks = ["createdAt", "nameSealed"].filter((field) => typeof mine[field] === "string");
  if (marks.length === 0) return undefined;
  return mine._type === found._type && marks.every((field) => mine[field] === found[field]);
}

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
      const same = isSameBooking(from, old);
      // Let go, and its time already booked by somebody else: the move happened
      if (same === false) return "moved";
      if (same === undefined) {
        console.error(`Lost the answer letting go of ${from._id}, and cannot tell what is there now:`, error);
        return "unsure";
      }
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

/** A change made in place: the fields set, and the fields taken off. */
export interface InPlace {
  mark: Record<string, unknown>;
  unset: string[];
}

/**
 * A booking given a time at its own slot, so nothing has to move: one that
 * gave its time back and is booked again for the same time, or a collection
 * whose trip got longer or shorter from the same start. It used to be enough
 * to set the status back by hand, while a booking held a single slot. A
 * collection holds the rest of its trip only through `slotEnd`, and a fitting
 * may have been booked into it meanwhile, so the diary is asked first (by the
 * caller) and the booking is changed in place, guarded by the revision read.
 */
export function reheldMark(
  from: DiaryDoc,
  slot: string,
  now: string,
  end?: string
): InPlace {
  const was = toldTimeOf(from);
  const to = timeTold(from, slot, end);
  const movedFrom = was && !sameWords(was, to) ? was : undefined;
  return {
    mark: {
      status: "confirmed",
      // A claim, as on a move: handed back if the email is refused
      notifiedStatus: "confirmed",
      slotStart: slot,
      confirmedFor: to,
      kristinaNotifiedAt: now,
      ...(end ? { slotEnd: end } : {}),
      ...(movedFrom ? { movedFrom } : {}),
    },
    // A note went with the reply it was written for; an old move or span does
    // not belong to this time
    unset: ["replyNote", "movedAt", "releasedAt", ...(end ? [] : ["slotEnd"]), ...(movedFrom ? [] : ["movedFrom"])],
  };
}

/** The booking as it stands once `change` is written — what its email is written from. */
export function withChange(from: DiaryDoc, change: InPlace): DiaryDoc {
  const kept = Object.fromEntries(Object.entries(from).filter(([field]) => !change.unset.includes(field)));
  return { ...kept, ...change.mark, _id: from._id, _type: from._type };
}

/** The booking as it stands after `reholdBooking` — what its email is written from. */
export function reheldDoc(from: DiaryDoc, slot: string, now: string, end?: string): DiaryDoc {
  return withChange(from, reheldMark(from, slot, now, end));
}

/**
 * Change a booking in place, guarded by the revision read, and drop any open
 * draft of it. "changed" when it was edited meanwhile.
 *
 * Every change made here carries this request's own `kristinaNotifiedAt` —
 * now, to the millisecond — and that is how a lost answer is looked at. A
 * slot's id is on offer the moment its booking lets go of the time, so the
 * document found there may be somebody else's booking with the very same time
 * on it: the same status, the same words. Only our own mark says the change
 * landed, and a booking that is plainly not this one says the time has gone.
 */
export async function changeInPlace(store: DiaryStore, input: { from: DiaryDoc } & InPlace): Promise<Move> {
  const { from, mark, unset } = input;
  if (!from._rev) return "changed";
  try {
    await store.commit([
      { guard: { id: from._id, rev: from._rev, mark, unset } },
      // An open draft would publish the old status straight back over it
      { remove: `drafts.${from._id}` },
    ]);
    return "moved";
  } catch (error) {
    if (isConflict(error)) return "changed";
    if (wasTurnedAway(error)) {
      console.error(`The database turned away changing ${from._id}:`, error);
      return "failed";
    }
    let found: DiaryDoc | null;
    try {
      found = await store.read(from._id);
    } catch (lookError) {
      console.error(`Lost the answer changing ${from._id}, and could not look:`, error, lookError);
      return "unsure";
    }
    if (found && isSameBooking(from, found) === false) {
      console.error(`Lost the answer changing ${from._id}, and another booking holds it now:`, error);
      return "taken";
    }
    const landed =
      !!found &&
      Object.entries(mark).every(([field, value]) => found[field] === value) &&
      unset.every((field) => found[field] === undefined);
    if (landed) return "moved";
    console.error(`Could not change ${from._id}:`, error);
    return found && found._rev !== from._rev ? "changed" : "failed";
  }
}

/**
 * Change a booking in place to the time in `reheldMark`. "changed" when it was
 * edited meanwhile, "taken" when the time went to somebody else; a lost answer
 * is looked at before anything is said (see changeInPlace).
 */
export async function reholdBooking(
  store: DiaryStore,
  input: { from: DiaryDoc; slot: string; now: string; end?: string }
): Promise<Move> {
  const { from, slot, now, end } = input;
  return changeInPlace(store, { from, ...reheldMark(from, slot, now, end) });
}

/*
 * A collection outside the diary's hours: "Can you come at 7:30pm? I work
 * till 7." The picker offers only the hours for fittings, so Kristina types
 * the time — in English, since the words go to the customer as they are —
 * and it holds nothing in the diary. Such a booking never sits on a slot's
 * id: a confirmed booking there with no time would turn away every customer
 * who picked that slot, for good.
 */

/** The change that gives a booking an out-of-hours time in words, holding no slot. */
export function outsideMark(from: DiaryDoc, told: string, now: string): InPlace {
  const was = toldTimeOf(from);
  const movedFrom = was && !sameWords(was, told) ? was : undefined;
  return {
    mark: {
      status: "confirmed",
      // A claim, as on a move: handed back if the email is refused
      notifiedStatus: "confirmed",
      confirmedFor: told,
      kristinaNotifiedAt: now,
      ...(movedFrom ? { movedFrom } : {}),
    },
    unset: [
      "slotStart",
      "slotEnd",
      "movedAt",
      "releasedAt",
      ...(noteWaits(from) ? [] : ["replyNote"]),
      ...(movedFrom ? [] : ["movedFrom"]),
    ],
  };
}

/**
 * A timed booking given an out-of-hours time: a copy under `id`, an id of its
 * own rather than a slot's, so that once moveBooking lets go of the old one
 * the slot's id — and with it the whole trip — is free for customers again.
 */
export function outsideCopy(from: DiaryDoc, told: string, now: string, id: string): DiaryDoc {
  return { ...without(withChange(from, outsideMark(from, told, now)), []), _id: id, _type: from._type };
}
