import { sanityWriteClient } from "./sanity";
import { fingerprint, seal } from "./secrets";
import { emailFingerprint, maskEmail, normaliseEmail, open } from "./pii";
import { revealCode } from "./giftCards";
import { pounds } from "./friendsLink";
import { eventIdFor, generateReferralCode } from "./referralRules";
import { bookingKeyOf, openLedgerDocument } from "./ledgerStore";
import {
  REFERRER_FIELDS,
  findReferrerById,
  judgeFriendFor,
  partnerCommission,
  partnerContactName,
  referralSettings,
  type PartnerOnReferrer,
  type Referrer,
} from "./referrals";
import { settleOneBooking } from "./referralSettle";
import { PARTNER_SOURCE, partnerRewardsCap, type PartnerBooking, type PartnerKind, type PartnerInput, type PartnerOrder, type PartnerPayment, type PartnerReward, type PartnerTerms } from "./partners";

/**
 * Beautasy Partners on the server: where a partner lives, how it is found by
 * its link, and how its clients are counted. The rules are in @/lib/partners.
 *
 * A partner is a `referrer` document — the same kind a friend's link is — with
 * a `partner` object on it, so every path that already pays a friend (the £5
 * off in the booking form and the bag, the credit when the work is done or
 * the order paid, the reversal when an order is refunded) pays a partner with
 * no new code. Its id comes from its link, `referrer-partner-the-hair-lounge`:
 * a link printed on cards can never be handed to a second salon.
 *
 * The dataset is public (see @/lib/pii). In the open: the salon's name, its
 * link and what kind of business it is — what its card prints anyway. Sealed:
 * the owner's first name, the percentage Kristina agreed with this salon
 * (what one partner is paid is not for the next one to read), the email the
 * credit codes go to and the phone the month's note goes to. The server opens
 * them for the Studio, through /api/studio/partners, and for the statement.
 */

export function partnerIdFor(slug: string): string {
  return `referrer-partner-${slug}`;
}

export const PARTNER_FIELDS = `${REFERRER_FIELDS}, createdAt`;

export type PartnerRecord = Referrer & { partner: PartnerOnReferrer; createdAt?: string };

export function isPartner(doc: Referrer | null | undefined): doc is PartnerRecord {
  return !!doc && !!doc.partner && typeof doc.partner.slug === "string";
}

/** Stands in for an email a partner has not given, so no customer's address can ever match it. */
function noEmailFingerprint(slug: string): string {
  return fingerprint(`partner:${slug}`);
}

/** A partner as it is written: a Friends link with a business on it. */
export interface PartnerDocument {
  _id: string;
  _type: "referrer";
  displayName: string;
  emailHint?: string;
  emailSealed?: string;
  emailFingerprint: string;
  codeFingerprint: string;
  codeSealed: string;
  source: string;
  active: boolean;
  rewardsCount: number;
  partner: {
    name: string;
    slug: string;
    kind: PartnerKind;
    commissionSealed: string;
    contactNameSealed?: string;
    phoneSealed?: string;
  };
  createdAt: string;
}

/**
 * The percentage as it is sealed: always four characters ("00.0", "07.5",
 * "30.0"). A sealed value is as long as what is inside it, so "5" and "12.5"
 * would otherwise tell a stranger which salon is paid more without opening
 * either. partnerCommission() reads it back with Number().
 */
export function commissionText(percent: number): string {
  return percent.toFixed(1).padStart(4, "0");
}

/** A partner's terms, opened — for the Studio, the statement and the month's note. */
export function partnerTerms(doc: Pick<PartnerRecord, "partner">): PartnerTerms {
  const contactName = partnerContactName(doc.partner);
  return { commissionPercent: partnerCommission(doc.partner), ...(contactName ? { contactName } : {}) };
}

/** The document a new partner is: a Friends link with a business on it, everything personal sealed. */
export function partnerDocument(input: PartnerInput, now: string): PartnerDocument {
  // Only letters make the name half of a code; the code is never seen — the /p/ link is
  const code = generateReferralCode(input.slug.replace(/[^a-z]/g, ""));
  const email = input.email ? normaliseEmail(input.email) : undefined;
  return {
    _id: partnerIdFor(input.slug),
    _type: "referrer",
    displayName: input.name,
    ...(email
      ? { emailHint: maskEmail(email), emailSealed: seal(email), emailFingerprint: emailFingerprint(email) }
      : { emailFingerprint: noEmailFingerprint(input.slug) }),
    codeFingerprint: fingerprint(code),
    codeSealed: seal(code),
    source: PARTNER_SOURCE,
    active: input.active,
    rewardsCount: 0,
    partner: {
      name: input.name,
      slug: input.slug,
      kind: input.kind,
      commissionSealed: seal(commissionText(input.commissionPercent)),
      ...(input.contactName ? { contactNameSealed: seal(input.contactName) } : {}),
      ...(input.phone ? { phoneSealed: seal(input.phone) } : {}),
    },
    createdAt: now,
  };
}

export async function createPartner(input: PartnerInput): Promise<{ outcome: "created"; id: string } | { outcome: "taken" }> {
  const doc = partnerDocument(input, new Date().toISOString());
  try {
    // The id is the link, so a second "the-hair-lounge" is refused by Sanity itself
    await sanityWriteClient.create(doc);
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 409) return { outcome: "taken" };
    throw error;
  }
  return { outcome: "created", id: doc._id };
}

/** Everything but the link, which is printed on cards and so never changes. */
export async function updatePartner(id: string, input: PartnerInput): Promise<"updated" | "missing"> {
  const existing = await findReferrerById(id);
  if (!isPartner(existing)) return "missing";
  const email = input.email ? normaliseEmail(input.email) : undefined;
  const set: Record<string, unknown> = {
    displayName: input.name,
    active: input.active,
    "partner.name": input.name,
    "partner.kind": input.kind,
    "partner.commissionSealed": seal(commissionText(input.commissionPercent)),
    emailFingerprint: email ? emailFingerprint(email) : noEmailFingerprint(existing.partner.slug),
  };
  // The open copies a partner made before sealing may still carry go with the first save
  const unset: string[] = ["partner.contactName", "partner.commissionPercent", "codeHint"];
  if (input.contactName) set["partner.contactNameSealed"] = seal(input.contactName);
  else unset.push("partner.contactNameSealed");
  if (email) {
    set.emailSealed = seal(email);
    set.emailHint = maskEmail(email);
  } else {
    unset.push("emailSealed", "emailHint");
  }
  if (input.phone) set["partner.phoneSealed"] = seal(input.phone);
  else unset.push("partner.phoneSealed");

  let patch = sanityWriteClient.patch(id).set(set);
  if (unset.length) patch = patch.unset(unset);
  await patch.commit();
  return "updated";
}

export async function listPartners(): Promise<PartnerRecord[]> {
  const docs = await sanityWriteClient.fetch<Referrer[]>(
    `*[_type == "referrer" && defined(partner.slug) && !(_id in path("drafts.**"))] | order(createdAt desc){ ${PARTNER_FIELDS} }`
  );
  return (docs ?? []).filter(isPartner);
}

export async function findPartnerById(id: string): Promise<PartnerRecord | null> {
  const doc = await findReferrerById(id);
  return isPartner(doc) ? doc : null;
}

/** For the partner's page and its card: past the CDN, so a new partner works the minute it is made. */
export async function findPartnerBySlug(slug: string): Promise<PartnerRecord | null> {
  const doc = await sanityWriteClient.fetch<Referrer | null>(
    `*[_type == "referrer" && partner.slug == $slug && !(_id in path("drafts.**"))][0]{ ${PARTNER_FIELDS} }`,
    { slug }
  );
  return isPartner(doc) ? doc : null;
}

/** The sealed half of a partner, opened for the Studio. */
export function partnerContacts(doc: PartnerRecord): { email: string | null; phone: string | null } {
  return { email: open(doc.emailSealed), phone: open(doc.partner.phoneSealed) };
}

/* ─── Their clients ─── */

export interface PartnerActivity {
  bookings: PartnerBooking[];
  orders: PartnerOrder[];
  rewards: PartnerReward[];
}

interface BookingRow {
  _id: string;
  referrer?: { _ref?: string };
  displayName?: string;
  service?: string;
  status?: string;
  createdAt?: string;
  nameSealed?: string;
}

interface OrderRow {
  _id: string;
  referrer?: { _ref?: string };
  displayName?: string;
  createdAt?: string;
  total?: number;
  refundedAmount?: number;
  refundedAt?: string;
}

interface RewardRow {
  referrer?: { _ref?: string };
  bookingId?: string;
  orderId?: string;
  outcome?: string;
  reward?: number;
  createdAt?: string;
}

/**
 * Every client these partners sent, with what each paid. A booking's payments
 * are in «Касса», sealed and tied to it by a key that names no booking (see
 * @/lib/ledgerStore), so they are found by that key and opened here.
 */
export async function readPartnerActivity(ids: string[]): Promise<Map<string, PartnerActivity>> {
  const activity = new Map<string, PartnerActivity>(ids.map((id) => [id, { bookings: [], orders: [], rewards: [] }]));
  if (!ids.length) return activity;

  const [bookings, orders, rewards] = await Promise.all([
    sanityWriteClient.fetch<BookingRow[]>(
      // A copy kept when a booking's time went to someone else is a record, not a client
      `*[_type == "atelierBooking" && referrer._ref in $ids && !defined(releasedAt) && !(_id in path("drafts.**"))]{ _id, referrer, displayName, service, status, createdAt, nameSealed }`,
      { ids }
    ),
    sanityWriteClient.fetch<OrderRow[]>(
      `*[_type == "order" && referrer._ref in $ids && !(_id in path("drafts.**"))]{ _id, referrer, displayName, createdAt, total, refundedAmount, refundedAt }`,
      { ids }
    ),
    sanityWriteClient.fetch<RewardRow[]>(
      `*[_type == "referral" && referrer._ref in $ids && !(_id in path("drafts.**"))]{ referrer, bookingId, orderId, outcome, reward, createdAt }`,
      { ids }
    ),
  ]);

  const keyOf = new Map<string, string>();
  for (const booking of bookings ?? []) keyOf.set(bookingKeyOf(booking), booking._id);
  const paymentsOf = new Map<string, PartnerPayment[]>();
  if (keyOf.size) {
    const stored = await sanityWriteClient.fetch<Array<{ _id: string; date?: string; sealed?: string; bookingKey?: string }>>(
      `*[_type == "ledgerEntry" && bookingKey in $keys && !(_id in path("drafts.**"))]{ _id, date, sealed, bookingKey }`,
      { keys: [...keyOf.keys()] }
    );
    for (const doc of stored ?? []) {
      const entry = openLedgerDocument(doc);
      const bookingId = doc.bookingKey ? keyOf.get(doc.bookingKey) : undefined;
      if (!entry || !bookingId) continue;
      const list = paymentsOf.get(bookingId) ?? [];
      list.push({ date: entry.date, kind: entry.kind, amount: entry.amount, method: entry.method });
      paymentsOf.set(bookingId, list);
    }
  }

  for (const b of bookings ?? []) {
    activity.get(b.referrer?._ref ?? "")?.bookings.push({
      id: b._id,
      name: b.displayName,
      service: b.service,
      status: b.status,
      createdAt: b.createdAt,
      payments: paymentsOf.get(b._id) ?? [],
    });
  }
  for (const o of orders ?? []) {
    activity.get(o.referrer?._ref ?? "")?.orders.push({
      id: o._id,
      name: o.displayName,
      createdAt: o.createdAt,
      total: o.total,
      refundedAmount: o.refundedAmount,
      refundedAt: o.refundedAt,
    });
  }
  for (const r of rewards ?? []) {
    activity.get(r.referrer?._ref ?? "")?.rewards.push({
      bookingId: r.bookingId,
      orderId: r.orderId,
      outcome: r.outcome,
      reward: r.reward,
      createdAt: r.createdAt,
    });
  }
  return activity;
}

export interface PartnerCredit {
  balance: number;
  expiresAt?: string;
  /** The code itself — it is the partner's money, and Kristina may need to give it to them */
  code: string | null;
}

export async function creditOf(doc: PartnerRecord): Promise<PartnerCredit | null> {
  const cardId = doc.creditCard?._ref;
  if (!cardId) return null;
  const card = await sanityWriteClient.fetch<{ balance?: number; expiresAt?: string; codeSealed?: string } | null>(
    `*[_id == $id][0]{ balance, expiresAt, codeSealed }`,
    { id: cardId }
  );
  if (!card) return null;
  return { balance: card.balance ?? 0, expiresAt: card.expiresAt, code: revealCode(card) };
}

/* ─── Who sent this client ─── */

interface BookingForAttribution {
  _id: string;
  _type?: string;
  _rev?: string;
  status?: string;
  referrer?: { _ref?: string };
  referredBy?: string;
  emailSealed?: string;
  createdAt?: string;
  releasedAt?: string;
  referralSettledAt?: string;
}

const ATTRIBUTION_FIELDS = `_id, _type, _rev, status, referrer, referredBy, emailSealed, createdAt, releasedAt, referralSettledAt`;

async function bookingForAttribution(id: string): Promise<BookingForAttribution | null> {
  const doc = await sanityWriteClient.fetch<BookingForAttribution | null>(`*[_id == $id][0]{ ${ATTRIBUTION_FIELDS} }`, { id });
  return doc && doc._type === "atelierBooking" ? doc : null;
}

/** Once the reward for a booking is decided, who sent the client is history. */
async function rewardDecided(booking: BookingForAttribution): Promise<boolean> {
  if (booking.referralSettledAt) return true;
  const event = await sanityWriteClient.fetch<string | null>(`*[_id == $id][0]._id`, {
    id: eventIdFor("booking", booking._id),
  });
  return !!event;
}

export interface Attribution {
  partnerId: string | null;
  referredBy: string | null;
  /** A friend's link, not a partner's: that friend is owed the reward, so it stays */
  friendLink: boolean;
  /** The reward is decided, so this can no longer change */
  decided: boolean;
  status: string | null;
}

export async function attributionOf(bookingId: string): Promise<Attribution | null> {
  const booking = await bookingForAttribution(bookingId);
  if (!booking) return null;
  const ref = booking.referrer?._ref;
  const referrer = ref ? await findReferrerById(ref) : null;
  return {
    partnerId: ref && isPartner(referrer) ? ref : null,
    referredBy: booking.referredBy ?? null,
    friendLink: !!referrer && !isPartner(referrer),
    decided: await rewardDecided(booking),
    status: booking.status ?? null,
  };
}

export type AttributeOutcome = { ok: true; message: string } | { ok: false; status: number; error: string };

/**
 * Why a client cannot be put down to a partner, in Kristina's words. The same
 * rules a click on the partner's link meets: a link that is refused there
 * leaves no partner on the booking, so a refusal here writes nothing either —
 * otherwise the statement would count a client, and a percentage, that the
 * link would never have counted.
 */
export function attributionRefusal(name: string, verdict: string, cap: number): string {
  switch (verdict) {
    case "self":
      return `Не записано: у клиентки та же почта, что у «${name}», — салон не приводит сам себя.`;
    case "repeat":
      return `Не записано: эта клиентка уже приходила к вам раньше, а салону засчитываются только новые клиентки.`;
    case "capped":
      return `Не записано: у «${name}» кончился лимит — ${cap} клиенток за год.`;
    case "disabled":
      return `Не записано: программа «Beautasy Friends» выключена в разделе «Сайт и настройки» → «Настройки сайта». Включите её — и партнёры снова заработают.`;
    default:
      return `Не записано: партнёр «${name}» сейчас не принимает клиенток.`;
  }
}

/** What she is told when the client is put down to the partner. */
export function attributionMessage(args: {
  name: string;
  discount: number;
  reward: number;
  /** The work is already done, so the £5 can no longer be taken off the price */
  done: boolean;
  /** No email: whether this is her first visit cannot be checked */
  noEmail: boolean;
}): string {
  const parts = [`Готово: клиентку прислал «${args.name}».`];
  if (args.discount > 0 && !args.done) parts.push(`Скидка клиентке ${pounds(args.discount)} — вычтите её при оплате.`);
  if (!args.done) parts.push(`Салону ${pounds(args.reward)} кредита, когда отметите запись «Выполнена».`);
  if (args.noEmail) {
    parts.push(
      "У клиентки нет почты, поэтому сайт не может проверить, первый ли это визит. Если она уже бывала у вас, уберите салон: «🤝 Кто прислал» → «никто»."
    );
  }
  return parts.join(" ");
}

/**
 * Puts a booking down to a partner — the client who wrote on WhatsApp "Emma
 * at the salon sent me". The same rules a link click would have met decide
 * the £5 off and the partner's credit; who the client is stays sealed.
 *
 * A client who came through a friend's link stays that friend's, and a
 * booking whose reward is already decided cannot be moved to someone else:
 * either would pay twice for one client.
 */
export async function attributeBooking(bookingId: string, partnerId: string | null): Promise<AttributeOutcome> {
  const booking = await bookingForAttribution(bookingId);
  if (!booking) return { ok: false, status: 404, error: "Этой записи в ателье больше нет." };
  if (booking.releasedAt) {
    return { ok: false, status: 400, error: "Это старая копия записи — её время ушло другому клиенту. Откройте действующую запись." };
  }
  if (booking.status === "declined" || booking.status === "cancelled") {
    return { ok: false, status: 400, error: "Запись отменена — приписывать её салону незачем." };
  }
  if (await rewardDecided(booking)) {
    return { ok: false, status: 409, error: "Бонус за эту запись уже решён — поменять, кто прислал клиентку, уже нельзя." };
  }

  const currentRef = booking.referrer?._ref;
  const current = currentRef ? await findReferrerById(currentRef) : null;
  if (current && !isPartner(current)) {
    return {
      ok: false,
      status: 409,
      error: `Клиентка пришла по ссылке друга (${current.displayName ?? "друг"}) — бонус за неё ждёт этого друга, приписать её салону нельзя.`,
    };
  }

  if (partnerId === null) {
    if (!currentRef) return { ok: true, message: "Запись и так не приписана салону." };
    await sanityWriteClient
      .patch(booking._id)
      .ifRevisionId(booking._rev ?? "")
      .unset(["referrer", "referredBy", "referralDiscount", "referralSource"])
      .commit()
      .catch(conflict);
    return { ok: true, message: "Готово: запись больше не приписана салону." };
  }

  const partner = await findPartnerById(partnerId);
  if (!partner) return { ok: false, status: 404, error: "Такого партнёра нет — обновите список в «Друзья и партнёры» → «Партнёры»." };
  const name = partner.partner.name;
  if (partner.active === false) {
    return { ok: false, status: 400, error: `Партнёр «${name}» на паузе — сначала включите его в «Друзья и партнёры» → «Партнёры».` };
  }
  if (currentRef === partner._id) return { ok: true, message: `Запись уже приписана «${name}».` };

  const settings = await referralSettings();
  const email = open(booking.emailSealed);
  const verdict = await judgeFriendFor({
    referrer: partner,
    friendEmail: email,
    kind: "booking",
    excludeId: booking._id,
    before: booking.createdAt,
    settings,
  });
  // Refused by the rules: nothing is written, exactly as for a link click
  if (verdict !== "ok") {
    return { ok: false, status: 409, error: attributionRefusal(name, verdict, partnerRewardsCap(settings.maxRewardsPerYear)) };
  }
  const discount = settings.friendAtelierDiscount;

  let patch = sanityWriteClient
    .patch(booking._id)
    .ifRevisionId(booking._rev ?? "")
    .set({
      referrer: { _type: "reference", _ref: partner._id, _weak: true },
      referredBy: name,
      referralSource: "studio",
      ...(discount > 0 ? { referralDiscount: discount } : {}),
    });
  if (discount <= 0) patch = patch.unset(["referralDiscount"]);
  await patch.commit().catch(conflict);

  const done = booking.status === "completed";
  let message = attributionMessage({ name, discount, reward: settings.referrerReward, done, noEmail: !email });

  // Already done: no status change is coming to set the reward off, so settle it now
  if (done) {
    const outcome = await settleOneBooking(booking._id).catch(() => null);
    if (outcome === "rewarded") message += ` Работа уже выполнена — кредит ${pounds(settings.referrerReward)} салону начислен.`;
    else message += " Работа уже выполнена — кредит салону начислится утром.";
  }
  return { ok: true, message };
}

/** A booking changed between reading and writing: say so rather than write over it. */
function conflict(error: unknown): never {
  if ((error as { statusCode?: number }).statusCode === 409) {
    throw Object.assign(new Error("changed"), { attributionConflict: true });
  }
  throw error;
}

export function isAttributionConflict(error: unknown): boolean {
  return !!(error as { attributionConflict?: boolean })?.attributionConflict;
}
