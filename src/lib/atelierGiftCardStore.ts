import { fingerprint } from "./secrets";
import { normaliseCode, reservationIsLive } from "./giftCards";
import { canonicalCode, shortfall, type CardLook } from "./atelierGiftCard";
import { todayInSouthampton, dayTitle } from "./ledger";
import type { LedgerDocument } from "./ledgerStore";

/**
 * Paying with a gift card at the atelier — server only.
 *
 * Until 12.10.2026 «Записать оплату» with «Подарочная карта» wrote the
 * payment and asked Kristina to take it off the card by hand, in another
 * part of the Studio. Forget once and the card could be spent again, here or
 * in the shop. Now the card is found by its code, checked, and charged in the
 * same write as the ledger line: one transaction, so there is never a payment
 * without the card going down, or the card going down without a payment.
 *
 * The write is conditional on the revision the card was read at. If anything
 * changed the card in between — a shop order paid with it, a checkout holding
 * it, Kristina at another till — Sanity refuses the whole transaction, the
 * card is read again and judged again, and the write is tried once more.
 * Because the new balance is computed from a read that the write is pinned
 * to, and the payment is refused when it is more than the card has, a card
 * never goes below zero.
 *
 * Every `error` is shown to Kristina as it is, so it is Russian and says what
 * to do.
 */

/** Questions about a card per address per hour — a few cards a day, and a code is not guessed at this pace. */
export const CARD_TRIES = 30;
export const CARD_WINDOW_MS = 60 * 60 * 1000;

/** The part of the Sanity client this needs, so a test can stand in for it. */
export interface CardDesk {
  fetch<T>(query: string, params: Record<string, unknown>): Promise<T>;
  mutate(mutations: unknown[], options?: Record<string, unknown>): Promise<unknown>;
}

export interface AtelierCard {
  _id: string;
  _rev: string;
  codeHint?: string;
  balance?: number;
  active?: boolean;
  expiresAt?: string;
  reservedSession?: string;
  reservedAmount?: number;
  reservedUntil?: string;
}

export type CardVerdict = { ok: true; card: AtelierCard; look: CardLook } | { ok: false; status: number; error: string };

/**
 * The fingerprints a typed code could have been stored under: the code as it
 * was issued, and the code as checkout reads it, when that differs.
 */
export function fingerprintsOf(typed: string, fingerprintWith: (value: string) => string = fingerprint): string[] {
  const forms = new Set([canonicalCode(typed), normaliseCode(typed)].filter((form) => form && form.length <= 40));
  return [...forms].map(fingerprintWith);
}

export async function readCard(
  desk: CardDesk,
  typed: string,
  fingerprintWith: (value: string) => string = fingerprint
): Promise<AtelierCard | null> {
  const fingerprints = fingerprintsOf(typed, fingerprintWith);
  if (fingerprints.length === 0) return null;
  return desk.fetch<AtelierCard | null>(
    `*[_type == "giftCard" && codeFingerprint in $fingerprints && !(_id in path("drafts.**"))][0]{
      _id, _rev, codeHint, balance, active, expiresAt, reservedSession, reservedAmount, reservedUntil
    }`,
    { fingerprints }
  );
}

/** Whether this card can be paid with now, and how much of it. */
export function judgeCard(card: AtelierCard | null, now: number = Date.now()): CardVerdict {
  if (!card) {
    return {
      ok: false,
      status: 404,
      error: "Карты с таким кодом нет. Сверьте код с письмом клиента: BEAUTASY и ещё восемь букв и цифр.",
    };
  }
  if (card.active === false) {
    return {
      ok: false,
      status: 409,
      error: "Эта карта отключена, ею больше нельзя платить. Почему — видно в «Магазин» → «Подарочные карты».",
    };
  }
  if (card.expiresAt) {
    const expires = new Date(card.expiresAt);
    if (Number.isFinite(expires.getTime()) && expires.getTime() < now) {
      return { ok: false, status: 409, error: `Срок карты закончился ${dayTitle(todayInSouthampton(expires))}. Ею больше нельзя платить.` };
    }
  }
  const balance = typeof card.balance === "number" ? Math.max(0, Math.round(card.balance)) : 0;
  if (balance <= 0) return { ok: false, status: 409, error: "На карте ничего не осталось." };

  // A checkout on the site minted this much into a Stripe session before
  // anyone paid; if that session is paid, the webhook takes it off. Spending
  // it here as well would leave the card owing.
  const held = reservationIsLive({ ...card, codeHint: card.codeHint ?? "", balance }, now) ? Math.min(balance, Math.max(0, card.reservedAmount ?? 0)) : 0;
  const available = balance - held;
  if (available <= 0) {
    return {
      ok: false,
      status: 409,
      error: "Весь остаток карты сейчас ждёт оплаты заказа, который клиент оформляет на сайте. Попробуйте чуть позже.",
    };
  }
  return { ok: true, card, look: { hint: card.codeHint ?? "", balance, available, ...(held ? { held } : {}) } };
}

/**
 * The one transaction a payment by card is: the ledger line, and the card's
 * new balance written against the revision it was read at. Set, not `dec`,
 * so the number written is the number that was checked.
 */
export function redemptionMutations(card: { _id: string; _rev: string }, balanceAfter: number, entry: LedgerDocument): unknown[] {
  return [{ create: entry }, { patch: { id: card._id, ifRevisionID: card._rev, set: { balance: balanceAfter } } }];
}

/**
 * A card payment deleted from the ledger gives the money back to the card, in
 * the same write — the delete says it did not happen. `inc`, because the card
 * may have been spent since, and whatever is on it now is more by this much.
 */
export function returnMutations(entryId: string, cardId: string, amount: number): unknown[] {
  return [{ delete: { id: entryId } }, { patch: { id: cardId, inc: { balance: amount } } }];
}

export type Redemption =
  | { ok: true; card: { id: string; hint: string }; balanceAfter: number }
  | { ok: false; status: number; error: string };

const isConflict = (error: unknown) => (error as { statusCode?: number } | null)?.statusCode === 409;

/**
 * Takes `amount` off the card the typed code names and writes the ledger line
 * built by `entryFor`, together. One retry on a revision conflict, with the
 * card read and judged afresh; a second conflict is answered, not looped on.
 */
export async function redeemAtAtelier(
  desk: CardDesk,
  typed: string,
  amount: number,
  entryFor: (card: { id: string; hint: string }) => LedgerDocument,
  { now = Date.now, fingerprintWith = fingerprint }: { now?: () => number; fingerprintWith?: (value: string) => string } = {}
): Promise<Redemption> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const verdict = judgeCard(await readCard(desk, typed, fingerprintWith), now());
    if (!verdict.ok) return verdict;
    const { card, look } = verdict;
    if (amount > look.available) return { ok: false, status: 409, error: shortfall(look, amount) };

    const paidWith = { id: card._id, hint: look.hint };
    const balanceAfter = look.balance - amount;
    try {
      await desk.mutate(redemptionMutations(card, balanceAfter, entryFor(paidWith)), { visibility: "sync" });
      return { ok: true, card: paidWith, balanceAfter };
    } catch (error) {
      if (!isConflict(error)) throw error;
      // The card changed between reading and writing. Nothing was written —
      // the ledger line and the balance go together or not at all.
    }
  }
  return {
    ok: false,
    status: 409,
    error: "Карту как раз сейчас меняют (возможно, ею платят на сайте). Ничего не списано — нажмите «Записать» ещё раз.",
  };
}
