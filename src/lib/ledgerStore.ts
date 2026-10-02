import { fingerprint, seal, unseal } from "./secrets";
import { sanityWriteClient } from "./sanity";
import {
  addDays,
  automaticEntries,
  newestFirst,
  type EntryInput,
  type GiftCardRow,
  type LedgerEntry,
  type LedgerKind,
  type OrderRow,
} from "./ledger";

/**
 * How a «Касса» entry sits in Sanity — server only.
 *
 * The dataset is readable by anyone (see @/lib/pii), so everything that says
 * how much, from whom, for which booking and why is one sealed blob. What
 * stays readable is what the queries need and nothing more:
 *   - the day, so a month can be fetched without opening the whole year;
 *   - `bookingKey`, an HMAC of the booking's lasting marks, so "what has been
 *     paid for this booking" can be asked without saying which booking it is.
 *
 * Two leaks closed after review. A booking's id used to sit here in the
 * clear, and a booking shows its customer's first name and service publicly,
 * so a stranger could read "Anna, wedding dress, paid on 2 October". And the
 * sealed blob grew with the number of digits in the amount, so its length
 * told £15 from £1,500. The key now names no booking, and the blob is padded
 * to a fixed size.
 *
 * `sealWith`, `openWith` and `fingerprintWith` default to the real key and
 * exist so a test can prove what reaches the database.
 */

export const LEDGER_TYPE = "ledgerEntry";

/** "ledger-" and a random UUID: the only ids the route will edit or delete. */
export const LEDGER_ID = /^ledger-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every sealed entry is a whole number of these, so its length says nothing about the amount. */
export const SEAL_BLOCK = 256;

export interface LedgerDocument {
  _id: string;
  _type: typeof LEDGER_TYPE;
  date: string;
  bookingKey?: string;
  sealed: string;
  createdAt: string;
  updatedAt?: string;
}

interface SealedPart {
  kind: LedgerKind;
  amount: number;
  method: string;
  category: string;
  who?: string;
  note?: string;
  bookingId?: string;
}

/**
 * What ties a payment to a booking for good. Not the booking's id: that is
 * its time slot, so a moved booking gets a new one, and a customer who books
 * a freed slot inherits the old one along with somebody else's payment. Its
 * creation instant and sealed name are kept through a move and are new for a
 * new customer — the same marks the diary uses to know a booking is itself.
 */
export function bookingKeyOf(
  booking: { _id: string; createdAt?: string; nameSealed?: string },
  fingerprintWith: (value: string) => string = fingerprint
): string {
  return fingerprintWith(`ledger-booking|${booking.createdAt ?? booking._id}|${booking.nameSealed ?? ""}`);
}

/** JSON padded with spaces to a whole number of blocks; JSON.parse ignores them. */
export function padded(json: string): string {
  const bytes = Buffer.byteLength(json, "utf8");
  const size = Math.max(SEAL_BLOCK, Math.ceil(bytes / SEAL_BLOCK) * SEAL_BLOCK);
  return json + " ".repeat(size - bytes);
}

export function ledgerDocument(
  id: string,
  input: EntryInput,
  now: string,
  bookingKey?: string,
  sealWith: (value: string) => string = seal
): LedgerDocument {
  const secret: SealedPart = {
    kind: input.kind,
    amount: input.amount,
    method: input.method,
    category: input.category,
    ...(input.who ? { who: input.who } : {}),
    ...(input.note ? { note: input.note } : {}),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
  };
  return {
    _id: id,
    _type: LEDGER_TYPE,
    date: input.date,
    ...(bookingKey ? { bookingKey } : {}),
    sealed: sealWith(padded(JSON.stringify(secret))),
    createdAt: now,
  };
}

/**
 * An entry read back, or null when it cannot be — a different key, or a blob
 * that was not ours. The route counts those rather than show a wrong total.
 */
export function openLedgerDocument(
  doc: { _id?: unknown; date?: unknown; sealed?: unknown },
  openWith: (sealed: string) => string | null = unseal
): LedgerEntry | null {
  if (typeof doc._id !== "string" || typeof doc.date !== "string" || typeof doc.sealed !== "string") return null;
  const text = openWith(doc.sealed);
  if (!text) return null;
  let part: Partial<SealedPart>;
  try {
    part = JSON.parse(text) as Partial<SealedPart>;
  } catch {
    return null;
  }
  if (
    !part ||
    typeof part !== "object" ||
    (part.kind !== "income" && part.kind !== "expense") ||
    typeof part.amount !== "number" ||
    !(part.amount > 0) ||
    typeof part.method !== "string" ||
    typeof part.category !== "string"
  ) {
    return null;
  }
  const bookingId = typeof part.bookingId === "string" ? part.bookingId : undefined;
  return {
    id: doc._id,
    date: doc.date,
    kind: part.kind,
    amount: part.amount,
    method: part.method,
    category: part.category,
    ...(typeof part.who === "string" ? { who: part.who } : {}),
    ...(typeof part.note === "string" ? { note: part.note } : {}),
    ...(bookingId ? { bookingId } : {}),
    source: bookingId ? "booking" : "manual",
  };
}

const ENTRY_FIELDS = `_id, date, sealed`;

function opened(docs: unknown[]): { entries: LedgerEntry[]; unreadable: number } {
  const entries: LedgerEntry[] = [];
  let unreadable = 0;
  for (const doc of docs) {
    const entry = openLedgerDocument((doc ?? {}) as Record<string, unknown>);
    if (entry) entries.push(entry);
    else unreadable += 1;
  }
  return { entries, unreadable };
}

/**
 * Everything in the ledger between two Southampton days, her entries opened
 * and the site's own beside them, newest first. Used by the Studio and by the
 * monthly copy that goes by email.
 */
export async function readLedger(from: string, to: string): Promise<{ entries: LedgerEntry[]; unreadable: number }> {
  // Orders and cards carry instants; a day either side, then each is placed
  // on its Southampton day, so nothing near midnight falls off the edge
  const start = `${addDays(from, -1)}T00:00:00Z`;
  const end = `${addDays(to, 2)}T00:00:00Z`;
  const window = `((createdAt >= $start && createdAt < $end) || (refundedAt >= $start && refundedAt < $end))`;
  const [stored, orders, cards] = await Promise.all([
    sanityWriteClient.fetch<unknown[]>(
      // Newest-entered first, so a day reads the way she wrote it, latest on top
      `*[_type == $type && date >= $from && date <= $to && !(_id in path("drafts.**"))] | order(createdAt desc){ ${ENTRY_FIELDS} }`,
      { type: LEDGER_TYPE, from, to }
    ),
    sanityWriteClient.fetch<OrderRow[]>(
      `*[_type == "order" && ${window} && !(_id in path("drafts.**"))]{ _id, createdAt, total, displayName, refundedAmount, refundedAt }`,
      { start, end }
    ),
    // A card given as a friend's reward is credit, not money; a bought card
    // is written without a source, so "not a reward" is the test
    sanityWriteClient.fetch<GiftCardRow[]>(
      `*[_type == "giftCard" && !(source == "referral") && ${window} && !(_id in path("drafts.**"))]{ _id, createdAt, initialAmount, refundedAmount, refundedAt }`,
      { start, end }
    ),
  ]);
  const own = opened(stored ?? []);
  return {
    entries: newestFirst([...own.entries, ...automaticEntries(orders ?? [], cards ?? [], from, to)]),
    unreadable: own.unreadable,
  };
}

/** What has been recorded against one booking's key, newest first. */
export async function readBookingPayments(bookingKey: string): Promise<LedgerEntry[]> {
  const stored = await sanityWriteClient.fetch<unknown[]>(
    `*[_type == $type && bookingKey == $bookingKey && !(_id in path("drafts.**"))] | order(date desc){ ${ENTRY_FIELDS} }`,
    { type: LEDGER_TYPE, bookingKey }
  );
  return opened(stored ?? []).entries;
}

/**
 * Notes a Stripe refund on the order or gift card it was for, so «Касса»
 * shows the money going back. `refunded` is Stripe's running total for the
 * charge, so a second partial refund replaces the first figure rather than
 * adding to it.
 */
export async function stampRefund(sessionId: string, refunded: number, at: string): Promise<number> {
  const ids = await sanityWriteClient.fetch<string[]>(
    `*[_type in ["order", "giftCard"] && stripeSessionId == $sessionId && !(_id in path("drafts.**"))]._id`,
    { sessionId }
  );
  for (const id of ids ?? []) {
    await sanityWriteClient.patch(id).set({ refundedAmount: refunded, refundedAt: at }).commit();
  }
  return (ids ?? []).length;
}
