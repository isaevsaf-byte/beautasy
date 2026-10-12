import { formatPounds } from "./ledger";

/**
 * A gift card paid with at the atelier — the parts the Studio and the server
 * both need: reading the code the way a person reads it out, and saying what
 * the card will hold after this payment.
 *
 * Browser-safe on purpose: nothing here touches a key or the database. The
 * card is looked up and charged by @/lib/atelierGiftCardStore, on the server,
 * because the code is money and the dataset is public.
 */

const PREFIX = "BEAUTASY";

/** Upper case, and nothing but letters and digits: how a code is compared, whatever was typed between them. */
function bare(typed: string): string {
  return typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The code as it was issued, "BEAUTASY-AB12-CD34", from however it was typed.
 *
 * Online checkout only trims and upper-cases (see normaliseCode), so a code
 * typed with spaces where the dashes go is not found there. At the atelier
 * Kristina copies it off a client's phone, so dashes, spaces and case are
 * all forgiven here, and so is leaving out the "BEAUTASY" every card starts
 * with. Anything that is not that shape is returned trimmed and upper-cased,
 * exactly as checkout would read it, so a card issued some other way is
 * still found.
 */
export function canonicalCode(typed: string): string {
  const letters = bare(typed);
  const body = letters.startsWith(PREFIX) ? letters.slice(PREFIX.length) : letters;
  if (body.length === 8) return `${PREFIX}-${body.slice(0, 4)}-${body.slice(4)}`;
  return typed.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Whether there is enough typed to be worth asking the server about. Every
 * question counts against a small allowance (the code is money, so guessing
 * is kept slow), and half a code is never a card.
 */
export function codeLooksComplete(typed: string): boolean {
  const letters = bare(typed);
  if (letters.startsWith(PREFIX)) return letters.length >= PREFIX.length + 8;
  return letters.length >= 8;
}

/** What the server says about a card that can be paid with. Pence throughout. */
export interface CardLook {
  /** Last four characters, the way the card is named in the Studio */
  hint: string;
  balance: number;
  /** What can be taken off it now: the balance less anything an open checkout on the site holds */
  available: number;
  /** Held by a checkout on the site that has not been paid or run out yet */
  held?: number;
}

/**
 * The line under the code: what is on the card and what will be left, or
 * why this payment cannot come off it. A card is never taken below zero —
 * when the price is more than the card holds, she records what the card
 * covers and takes the rest another way, as a second payment.
 */
export function cardLine(look: CardLook, pence: number | null): { text: string; ok: boolean } {
  const heldNote = look.held ? ` ${formatPounds(look.held)} из них ждут оплаты заказа на сайте.` : "";
  if (pence === null) {
    return { text: `На карте ${formatPounds(look.balance)}.${heldNote}`, ok: true };
  }
  if (pence <= look.available) {
    return {
      text: `На карте ${formatPounds(look.balance)} — после оплаты останется ${formatPounds(look.balance - pence)}.${heldNote}`,
      ok: true,
    };
  }
  return { text: shortfall(look, pence), ok: false };
}

/** Why `pence` cannot come off this card, and what to do instead. */
export function shortfall(look: CardLook, pence: number): string {
  const covers = look.held
    ? `На карте ${formatPounds(look.balance)}, но ${formatPounds(look.held)} из них ждут оплаты заказа на сайте — списать можно ${formatPounds(look.available)}.`
    : `На карте только ${formatPounds(look.available)}.`;
  return `${covers} Запишите здесь ${formatPounds(look.available)}, а остальные ${formatPounds(pence - look.available)} — второй оплатой другим способом.`;
}
