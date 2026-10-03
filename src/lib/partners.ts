import { SITE_URL } from "./site";
import { localDateOf } from "./slots";
import { formatPounds } from "./ledger";

/**
 * Beautasy Partners — salons and shops that send Kristina their clients.
 *
 * A partner is a Beautasy Friends link with a business behind it. The money
 * runs exactly as it does for a friend, through code that has already been
 * paid with and refunded against: their client gets the friend's £5 off a
 * first alteration or a first order, and the partner gets £5 of credit when
 * the work is marked done or the order is paid, taken back if it is refunded.
 * What a partner adds is the business around it: its real name, a link worth
 * printing (/p/the-hair-lounge), a card, clients from WhatsApp counted by
 * hand, and a month's statement — how many clients, what they paid, and what
 * the partner is owed.
 *
 * Every function here is pure. This file is imported by the Studio's
 * «Партнёры» pane, which is browser code, so nothing here may seal, open or
 * fingerprint — that is @/lib/partnerStore, on the server.
 */

export type PartnerKind = "salon" | "bridal" | "other";

export interface PartnerKindChoice {
  value: PartnerKind;
  title: string;
}

export const PARTNER_KINDS: PartnerKindChoice[] = [
  { value: "salon", title: "Салон красоты или парикмахерская" },
  { value: "bridal", title: "Свадебный или вечерний салон" },
  { value: "other", title: "Другое: химчистка, отель, магазин" },
];

/** What a partner's link document is marked as, beside "order", "booking" and "page". */
export const PARTNER_SOURCE = "partner";

/**
 * A friend's link earns at most twenty rewards a year, which guards against
 * someone farming £5s through made-up friends. A partner is a business
 * Kristina signed up in person, and a busy bridal salon can outgrow twenty
 * honestly — so the allowance is wider, but not open-ended: a partner's link
 * pasted onto a coupon site still stops paying out.
 */
export const PARTNER_MAX_REWARDS_PER_YEAR = 100;

/** A partner's yearly allowance: the wider of the two, should the friends' one ever be raised past it. */
export function partnerRewardsCap(friendsCap: number): number {
  return Math.max(friendsCap, PARTNER_MAX_REWARDS_PER_YEAR);
}

/** Bridal salons take about this much from a dress shop's referral; nothing reasonable is above it. */
export const MAX_COMMISSION_PERCENT = 30;

export function defaultCommission(kind: PartnerKind): number {
  return kind === "bridal" ? 10 : 0;
}

export function kindTitle(kind: string | undefined): string {
  return PARTNER_KINDS.find((choice) => choice.value === kind)?.title ?? "Партнёр";
}

/**
 * What the referrer document keeps in the open about its business: what is
 * printed on its card anyway. The dataset is public (see @/lib/pii).
 */
export interface PartnerInfo {
  name: string;
  slug: string;
  kind: PartnerKind;
}

/**
 * What a partner agreed with Kristina, and who to greet: sealed on the
 * document, because what one salon is paid is nobody else's business and the
 * owner is a person. The server opens them for the Studio and the statement.
 */
export interface PartnerTerms {
  commissionPercent: number;
  /** The owner's first name, for "Hi Emma" */
  contactName?: string;
}

/** A partner as the Studio sees it in the list: its terms opened by the server, its contacts still sealed. */
export interface PartnerSummary {
  id: string;
  name: string;
  slug: string;
  kind: PartnerKind;
  commissionPercent: number;
  contactName?: string;
  emailHint?: string;
  active: boolean;
  link: string;
  createdAt?: string;
}

/* ─── The link ─── */

export const SLUG_MIN = 2;
export const SLUG_MAX = 30;
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "the-hair-lounge": lower-case letters and digits, joined by single hyphens. */
export function isPartnerSlug(value: unknown): value is string {
  return typeof value === "string" && value.length >= SLUG_MIN && value.length <= SLUG_MAX && SLUG_SHAPE.test(value);
}

/**
 * "The Hair Lounge" → "the-hair-lounge", "Rosé & Co." → "rose-and-co".
 * Whole words only, up to the length a QR code stays small at; a name with no
 * Latin letters gives nothing, and the form asks for a link to be typed.
 */
export function slugFrom(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > SLUG_MAX) break;
    slug = next;
  }
  if (!slug && words[0]) slug = words[0].slice(0, SLUG_MAX);
  return slug;
}

export function partnerPath(slug: string): string {
  return `/p/${slug}`;
}

/** The address printed under the QR and sent on WhatsApp. */
export function partnerLink(slug: string): string {
  return `${SITE_URL}${partnerPath(slug)}`;
}

/** The same, the way a person would write it: "beautasy.co.uk/p/the-hair-lounge". */
export function partnerLinkShown(slug: string): string {
  return partnerLink(slug).replace(/^https?:\/\/(www\.)?/, "");
}

export type CardSize = "card" | "a6";

/** The print page: a business card, front and back, or an A6 card for the counter. */
export function partnerCardPath(slug: string, size: CardSize = "card"): string {
  return size === "a6" ? `/p/${slug}/card?size=a6` : `/p/${slug}/card`;
}

/**
 * A UK number as WhatsApp wants it: "07700 900123" → "447700900123". Null
 * when it does not look like one, so no button opens a chat with a stranger.
 */
export function whatsappNumberFrom(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (/^0\d{10}$/.test(digits)) return `44${digits.slice(1)}`;
  if (/^44\d{10}$/.test(digits)) return digits;
  if (phone.trim().startsWith("+") && /^\d{10,15}$/.test(digits)) return digits;
  return null;
}

/**
 * What a salon's client sends when she would rather write than book: the
 * salon's name is in the first line, so Kristina knows who to put her down to.
 */
export function partnerWhatsappText(name: string): string {
  return `Hi Kristina! ${name} recommended you — I'd love to ask about an alteration.`;
}

/* ─── What she types ─── */

export interface PartnerInput {
  name: string;
  slug: string;
  kind: PartnerKind;
  commissionPercent: number;
  contactName?: string;
  /** Sealed on the server; the reward emails go here */
  email?: string;
  /** Sealed on the server; the statement can be sent here on WhatsApp */
  phone?: string;
  active: boolean;
}

export type PartnerVerdict = { ok: true; value: PartnerInput } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9 ()-]{6,19}$/;
// Control characters, including the invisible ones that turn text around
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** "10", "10%", "7,5" → a percentage with one decimal; empty is 0; anything else is null. */
export function parseCommission(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return 0;
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim().replace(/%$/, "").replace(",", ".").trim() : "";
  if (!/^\d{1,2}(\.\d)?$/.test(text)) return null;
  const value = Number(text);
  return value >= 0 && value <= MAX_COMMISSION_PERCENT ? value : null;
}

/**
 * The partner form, judged the same way in the Studio (to say what is wrong
 * as she types) and on the server (which decides). Errors are Russian and go
 * straight into the Studio.
 */
export function judgePartner(raw: unknown): PartnerVerdict {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const name = clean(input.name, 60);
  if (name.length < 2) return { ok: false, error: "Напишите название салона." };

  const typedSlug = clean(input.slug, 60).toLowerCase();
  const slug = typedSlug || slugFrom(name);
  if (!isPartnerSlug(slug)) {
    return {
      ok: false,
      error: `Ссылка — латинские буквы и цифры через дефис, от ${SLUG_MIN} до ${SLUG_MAX} знаков, например the-hair-lounge.`,
    };
  }

  const kind = PARTNER_KINDS.find((choice) => choice.value === input.kind)?.value;
  if (!kind) return { ok: false, error: "Выберите, что это за партнёр." };

  const commissionPercent = parseCommission(input.commissionPercent);
  if (commissionPercent === null) {
    return { ok: false, error: `Комиссия — число от 0 до ${MAX_COMMISSION_PERCENT}, например 10. Без комиссии — 0.` };
  }

  // Only the first name: "Hi Emma" needs nothing more, and less kept is less to seal
  const contactName = clean(input.contactName, 40).split(" ")[0] || undefined;

  const email = clean(input.email, 200).toLowerCase() || undefined;
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: "Эл. почта выглядит неправильно. Если её нет, оставьте поле пустым." };
  }

  const phone = clean(input.phone, 30) || undefined;
  if (phone && !PHONE_RE.test(phone)) {
    return { ok: false, error: "Телефон выглядит неправильно. Например: 07700 900123. Если его нет, оставьте поле пустым." };
  }

  return {
    ok: true,
    value: {
      name,
      slug,
      kind,
      commissionPercent,
      ...(contactName ? { contactName } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      active: input.active !== false,
    },
  };
}

/* ─── The month's statement ─── */

/** One payment for a partner's client, opened from «Касса» on the server. */
export interface PartnerPayment {
  date: string;
  kind: "income" | "expense";
  amount: number;
  method: string;
}

export interface PartnerBooking {
  id: string;
  name?: string;
  service?: string;
  status?: string;
  createdAt?: string;
  payments: PartnerPayment[];
}

export interface PartnerOrder {
  id: string;
  name?: string;
  createdAt?: string;
  /** What Stripe took, in pence */
  total?: number;
  refundedAmount?: number;
  refundedAt?: string;
}

/** A Friends reward for one of the partner's clients — see the `referral` type. */
export interface PartnerReward {
  bookingId?: string;
  orderId?: string;
  outcome?: string;
  reward?: number;
  createdAt?: string;
}

export interface PartnerTotals {
  /** New clients: bookings made and orders placed */
  clients: number;
  /** Money that came in from them, after refunds, in pence */
  paid: number;
  /** Credit added to the partner's card, in pence */
  credit: number;
  /** What the partner is owed at their percentage, in pence */
  commission: number;
}

export type CreditState = "rewarded" | "pending" | "reversed" | "none" | "waiting" | "soon";

export interface StatementLine {
  id: string;
  kind: "booking" | "order";
  name: string;
  /** The service booked, or "Заказ в магазине" */
  what: string;
  /** The day they came: the booking made, or the order placed */
  day: string | null;
  status?: string;
  paidInMonth: number;
  paidAllTime: number;
  credit: CreditState;
}

export interface PartnerStatement {
  month: string;
  lines: StatementLine[];
  totals: PartnerTotals;
  allTime: PartnerTotals;
}

/** "2026-10" from "2026-10-02". */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** "2026-10" moved by whole months: shiftMonth("2026-01", -1) = "2025-12". */
export function shiftMonth(month: string, by: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function dayOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : localDateOf(instant);
}

/** A request that was turned away, or that the client called off, was never a client. */
const NOT_A_CLIENT = ["declined", "cancelled"];

/**
 * A reward refused because the client was the partner herself, or had come
 * before: by the programme's own rules she is not the partner's new client,
 * so she counts for nothing here — not a client, not money, not commission.
 */
const NOT_THEIRS = ["self", "repeat"];

/**
 * Money in from a booking: what was paid at the atelier, as written into
 * «Касса». A gift card is not counted — that money came in when the card was
 * bought, not through the partner.
 */
function bookingMoney(payments: PartnerPayment[], inMonth: (day: string) => boolean): number {
  let sum = 0;
  for (const p of payments) {
    if (!inMonth(p.date) || p.method === "giftcard") continue;
    sum += p.kind === "income" ? p.amount : -p.amount;
  }
  return sum;
}

/** Money in from an order: what Stripe took on the day, less what went back on the day it went back. */
function orderMoney(order: PartnerOrder, inMonth: (day: string) => boolean): number {
  let sum = 0;
  const placed = dayOf(order.createdAt);
  if (placed && inMonth(placed) && typeof order.total === "number") sum += Math.round(order.total);
  const refunded = dayOf(order.refundedAt);
  if (refunded && inMonth(refunded) && typeof order.refundedAmount === "number") sum -= Math.round(order.refundedAmount);
  return sum;
}

/** Commission on what came in; a month where more went back than came in owes nothing, rather than a debt. */
export function commissionOn(paid: number, percent: number): number {
  return paid > 0 && percent > 0 ? Math.round((paid * percent) / 100) : 0;
}

/**
 * One partner's month: who came, what they paid, what the partner earned.
 *
 * Counted the way «Касса» counts, so the two never disagree about a pound:
 * a payment belongs to the day it was written down, an order to the day it
 * was placed, a refund to the day it went back. A client belongs to the month
 * they booked or ordered; a later month still shows them if they paid then.
 */
export function partnerStatement(args: {
  month: string;
  commissionPercent: number;
  bookings: PartnerBooking[];
  orders: PartnerOrder[];
  rewards: PartnerReward[];
}): PartnerStatement {
  const inMonth = (day: string) => monthOf(day) === args.month;
  const always = () => true;

  const rewardFor = (kind: "booking" | "order", id: string) =>
    args.rewards.find((r) => (kind === "booking" ? r.bookingId === id : r.orderId === id));
  const creditState = (kind: "booking" | "order", id: string, status?: string): CreditState => {
    const reward = rewardFor(kind, id);
    // Done but not yet credited: the morning job decides it
    if (!reward) return kind === "booking" ? (status === "completed" ? "soon" : "waiting") : "none";
    if (reward.outcome === "rewarded") return "rewarded";
    if (reward.outcome === "pending") return "pending";
    if (reward.outcome === "reversed") return "reversed";
    return "none";
  };

  const lines: StatementLine[] = [];
  const totals: PartnerTotals = { clients: 0, paid: 0, credit: 0, commission: 0 };
  const allTime: PartnerTotals = { clients: 0, paid: 0, credit: 0, commission: 0 };

  for (const booking of args.bookings) {
    if (NOT_A_CLIENT.includes(booking.status ?? "")) continue;
    if (NOT_THEIRS.includes(rewardFor("booking", booking.id)?.outcome ?? "")) continue;
    const day = dayOf(booking.createdAt);
    const paidInMonth = bookingMoney(booking.payments, inMonth);
    const paidAllTime = bookingMoney(booking.payments, always);
    allTime.clients += 1;
    allTime.paid += paidAllTime;
    const isNew = day !== null && inMonth(day);
    if (isNew) totals.clients += 1;
    totals.paid += paidInMonth;
    if (isNew || paidInMonth !== 0) {
      lines.push({
        id: booking.id,
        kind: "booking",
        name: booking.name ?? "Клиентка",
        what: booking.service ?? "Ателье",
        day,
        status: booking.status,
        paidInMonth,
        paidAllTime,
        credit: creditState("booking", booking.id, booking.status),
      });
    }
  }

  for (const order of args.orders) {
    if (NOT_THEIRS.includes(rewardFor("order", order.id)?.outcome ?? "")) continue;
    const day = dayOf(order.createdAt);
    const paidInMonth = orderMoney(order, inMonth);
    const paidAllTime = orderMoney(order, always);
    allTime.clients += 1;
    allTime.paid += paidAllTime;
    const isNew = day !== null && inMonth(day);
    if (isNew) totals.clients += 1;
    totals.paid += paidInMonth;
    if (isNew || paidInMonth !== 0) {
      lines.push({
        id: order.id,
        kind: "order",
        name: order.name ?? "Покупательница",
        what: "Заказ в магазине",
        day,
        paidInMonth,
        paidAllTime,
        credit: creditState("order", order.id),
      });
    }
  }

  for (const reward of args.rewards) {
    if (reward.outcome !== "rewarded" || typeof reward.reward !== "number") continue;
    allTime.credit += reward.reward;
    const day = dayOf(reward.createdAt);
    if (day && inMonth(day)) totals.credit += reward.reward;
  }

  totals.commission = commissionOn(totals.paid, args.commissionPercent);
  allTime.commission = commissionOn(allTime.paid, args.commissionPercent);

  lines.sort((a, b) => (b.day ?? "").localeCompare(a.day ?? ""));
  return { month: args.month, lines, totals, allTime };
}

/* ─── The note to the partner ─── */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-10" → "October 2026", for the partner, who reads English. */
export function monthInEnglish(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/**
 * The month's news for the partner, in Kristina's voice, ready for WhatsApp.
 * Warm and short — it is a thank-you that happens to have numbers in it.
 */
export function partnerReportText(args: {
  partner: Pick<PartnerInfo, "name" | "slug"> & PartnerTerms;
  statement: PartnerStatement;
  /** What is on their Beautasy card now, in pence, when there is a card */
  creditBalance?: number | null;
}): string {
  const { partner, statement } = args;
  const t = statement.totals;
  const hello = partner.contactName ? `Hi ${partner.contactName}! 💜` : `Hi ${partner.name}! 💜`;
  const lines = [`${hello} Your Beautasy update for ${monthInEnglish(statement.month)}:`];
  if (t.clients > 0) {
    lines.push(`✨ ${t.clients === 1 ? "1 client" : `${t.clients} clients`} came to me from ${partner.name}`);
  } else {
    lines.push(`✨ Nobody new came through your link this month — thank you for keeping my cards on show`);
  }
  if (t.credit > 0) {
    const balance = typeof args.creditBalance === "number" ? ` (your balance is ${formatPounds(args.creditBalance)})` : "";
    lines.push(`🎁 ${formatPounds(t.credit)} of credit added to your Beautasy card${balance}`);
  }
  if (t.commission > 0) {
    lines.push(`🤝 Your ${partner.commissionPercent}%: ${formatPounds(t.commission)} — I'll send it over this week`);
  }
  lines.push("Thank you so much for recommending me!", "Kristina", partnerLinkShown(partner.slug));
  return lines.join("\n");
}
