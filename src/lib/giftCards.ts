import { randomBytes } from "crypto";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";

/**
 * Gift cards with a real balance.
 *
 * Deliberately not plain Stripe promotion codes: those apply once and any
 * unspent value is lost, which is the wrong behaviour for a £50 card used on a
 * £28 bra. Balances live here, checkout applies whatever is left (up to the
 * order subtotal), and the webhook deducts what was actually spent.
 */

/** Face values offered on the gift card page, in pence. */
export const PRESET_AMOUNTS = [2500, 5000, 10000] as const;
export const MIN_AMOUNT = 1000; // £10
export const MAX_AMOUNT = 50000; // £500
/** Cards are valid for a year from purchase. */
export const VALIDITY_MONTHS = 12;

export interface GiftCard {
  _id: string;
  code: string;
  balance: number;
  active?: boolean;
  expiresAt?: string;
  recipientName?: string;
}

/** Human-friendly, unambiguous code: no O/0, I/1 confusion. */
export function generateGiftCardCode(): string {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY2346789";
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `BEAUTASY-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}`;
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
export async function findSpendableCard(code: string): Promise<GiftCard | null> {
  const normalised = normaliseCode(code);
  if (!normalised || normalised.length > 40) return null;

  const card = await sanityClient.fetch(
    `*[_type == "giftCard" && code == $code][0]{ _id, code, balance, active, expiresAt, recipientName }`,
    { code: normalised }
  );

  const found = card as GiftCard | null;
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

/** Deducts what was actually spent, never below zero. */
export async function deductFromCard(cardId: string, spent: number): Promise<void> {
  if (spent <= 0) return;
  const card = await sanityClient.fetch(
    `*[_id == $id][0]{ balance }`,
    { id: cardId }
  );
  const balance = (card as { balance?: number } | null)?.balance ?? 0;
  await sanityWriteClient
    .patch(cardId)
    .set({ balance: Math.max(0, balance - spent) })
    .commit();
}

export function expiryFromNow(): string {
  const expires = new Date();
  expires.setMonth(expires.getMonth() + VALIDITY_MONTHS);
  return expires.toISOString();
}
