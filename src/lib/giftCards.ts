import { randomBytes } from "crypto";
import { sanityWriteClient } from "@/lib/sanity";
import { fingerprint, seal, unseal } from "@/lib/secrets";

/**
 * Gift cards with a real balance.
 *
 * Deliberately not plain Stripe promotion codes: those apply once and any
 * unspent value is lost, which is the wrong behaviour for a £50 card used on a
 * £28 bra. Balances live here, checkout applies whatever is left (up to the
 * order subtotal), and the webhook deducts what was actually spent.
 *
 * One checkout at a time per card. The discount is minted into a Stripe
 * session before anyone has paid, and a session lives for hours — so without
 * a reservation two checkouts opened with the same code both got the full
 * balance, both could be paid, and the shop covered the difference. A card
 * now records which session holds it; a new checkout for the same card expires
 * the previous session at Stripe first, so it can no longer be paid, and takes
 * the card over. The reservation itself is written with `ifRevisionId`, so two
 * checkouts started in the same instant cannot both win.
 *
 * The code itself is never stored in the clear. Sanity's dataset is public on
 * this plan, and a readable gift card code is readable money — see
 * @/lib/secrets. The document keeps a keyed fingerprint to look the card up
 * by, a sealed copy so a scheduled card can still be emailed weeks later, and
 * the last four characters so Kristina can tell two cards apart.
 */

/** Face values offered on the gift card page, in pence. */
export const PRESET_AMOUNTS = [2500, 5000, 10000] as const;
export const MIN_AMOUNT = 1000; // £10
export const MAX_AMOUNT = 50000; // £500
/** Cards are valid for a year from purchase. */
export const VALIDITY_MONTHS = 12;

export interface GiftCard {
  _id: string;
  /** Last four characters, for telling cards apart in the Studio */
  codeHint: string;
  balance: number;
  active?: boolean;
  expiresAt?: string;
  recipientName?: string;
  /** The checkout session that currently holds this card, if any */
  reservedSession?: string;
  reservedAmount?: number;
  /** When that session expires at Stripe — after this the hold means nothing */
  reservedUntil?: string;
}

/** A card as read for checkout: carries the revision the reservation is conditional on. */
export interface SpendableCard extends GiftCard {
  _rev: string;
}

/** A card as read for delivery: carries the sealed code so it can be emailed. */
export interface SealedCard extends GiftCard {
  codeSealed?: string;
}

/** Human-friendly, unambiguous code: no O/0, I/1 confusion. */
export function generateGiftCardCode(): string {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY2346789";
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `BEAUTASY-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
}

/** What a gift card document stores in place of the code itself. */
export function codeFields(code: string): {
  codeFingerprint: string;
  codeSealed: string;
  codeHint: string;
} {
  const normalised = normaliseCode(code);
  return {
    codeFingerprint: fingerprint(normalised),
    codeSealed: seal(normalised),
    codeHint: normalised.slice(-4),
  };
}

/** The code itself, for the email that delivers it. Null if it cannot be read back. */
export function revealCode(card: { codeSealed?: string }): string | null {
  return unseal(card.codeSealed);
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Rounds a requested custom amount into the allowed range, in whole pounds. */
export function sanitiseAmount(pence: unknown): number | null {
  const value = typeof pence === "number" ? pence : Number(pence);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value / 100) * 100; // whole pounds
  if (rounded < MIN_AMOUNT || rounded > MAX_AMOUNT) return null;
  return rounded;
}

/** Looks up a card that can actually be spent right now. */
export async function findSpendableCard(code: string): Promise<SpendableCard | null> {
  const normalised = normaliseCode(code);
  if (!normalised || normalised.length > 40) return null;

  // Matched on the fingerprint, because the code itself is not in the document
  const card = await sanityWriteClient.fetch(
    `*[_type == "giftCard" && codeFingerprint == $fingerprint][0]{
      _id, _rev, codeHint, balance, active, expiresAt, recipientName,
      reservedSession, reservedAmount, reservedUntil
    }`,
    { fingerprint: fingerprint(normalised) }
  );

  const found = card as SpendableCard | null;
  if (!found) return null;
  if (found.active === false) return null;
  if (found.balance <= 0) return null;
  if (found.expiresAt && new Date(found.expiresAt).getTime() < Date.now()) return null;

  return found;
}

/** How much of a card can be put against an order of this size. */
export function redeemableAmount(card: GiftCard, orderSubtotal: number): number {
  return Math.max(0, Math.min(card.balance, orderSubtotal));
}

/** True while another checkout holds the card and its session has not run out. */
export function reservationIsLive(card: GiftCard, now: number = Date.now()): boolean {
  if (!card.reservedSession || !card.reservedUntil) return false;
  const until = new Date(card.reservedUntil).getTime();
  return Number.isFinite(until) && until > now;
}

/**
 * Records that `sessionId` now holds the card.
 *
 * Conditional on the revision the card was read at: if another checkout got
 * here first the document has changed, Sanity refuses the patch, and the
 * caller must not let its session be paid.
 */
export async function reserveCard(
  card: SpendableCard,
  sessionId: string,
  amount: number,
  /** Stripe's expires_at, unix seconds */
  expiresAt: number
): Promise<boolean> {
  try {
    await sanityWriteClient
      .patch(card._id)
      .ifRevisionId(card._rev)
      .set({
        reservedSession: sessionId,
        reservedAmount: amount,
        reservedUntil: new Date(expiresAt * 1000).toISOString(),
      })
      .commit();
    return true;
  } catch {
    return false;
  }
}

/** Frees the card, but only if `sessionId` is still the one holding it. */
export async function releaseCard(cardId: string, sessionId: string): Promise<void> {
  const card = await sanityWriteClient.fetch<{ _rev: string; reservedSession?: string } | null>(
    `*[_id == $id][0]{ _rev, reservedSession }`,
    { id: cardId }
  );
  if (!card || card.reservedSession !== sessionId) return;
  try {
    await sanityWriteClient
      .patch(cardId)
      .ifRevisionId(card._rev)
      .unset(["reservedSession", "reservedAmount", "reservedUntil"])
      .commit();
  } catch {
    // Changed under us — a newer checkout holds it now, and that hold stands
  }
}

/**
 * Takes the spent amount off the card, atomically, and frees the hold the
 * paying session had on it.
 *
 * `dec` is a single server-side operation, so two orders paid with the same
 * card in the same second both land. A balance below zero afterwards means
 * more was redeemed than the card held — the case the reservation prevents —
 * so it is floored and logged loudly rather than hidden.
 */
export async function deductFromCard(cardId: string, spent: number, sessionId?: string): Promise<void> {
  if (spent <= 0) return;
  await sanityWriteClient.patch(cardId).dec({ balance: spent }).commit();

  const after = await sanityWriteClient.fetch<{ balance?: number } | null>(
    `*[_id == $id][0]{ balance }`,
    { id: cardId }
  );
  const balance = after?.balance ?? 0;
  if (balance < 0) {
    console.error(
      `Gift card ${cardId} over-redeemed by £${(-balance / 100).toFixed(2)} — flooring to zero. Check the orders that used it.`
    );
    await sanityWriteClient.patch(cardId).set({ balance: 0 }).commit();
  }

  if (sessionId) await releaseCard(cardId, sessionId);
}

export function expiryFromNow(): string {
  const expires = new Date();
  expires.setMonth(expires.getMonth() + VALIDITY_MONTHS);
  return expires.toISOString();
}
