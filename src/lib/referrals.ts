import { randomBytes } from "crypto";
import { Resend } from "resend";
import { sanityWriteClient } from "@/lib/sanity";
import { fingerprint, seal, unseal, secretsConfigured } from "@/lib/secrets";
import { emailFingerprint, maskEmail, firstNameOf, normaliseEmail, open } from "@/lib/pii";
import { generateGiftCardCode, codeFields as giftCardCodeFields, revealCode } from "@/lib/giftCards";
import { getSiteSettings } from "@/lib/siteSettings";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import {
  looksLikeReferralCode,
  normaliseReferralCode,
  referralLink,
  whatsappShareUrl,
  pounds,
} from "@/lib/friendsLink";
import {
  type ReferralSettings,
  type FriendVerdict,
  referralSettingsFrom,
  generateReferralCode,
  judgeFriend,
  creditExpiry,
  eventIdFor,
} from "@/lib/referralRules";

/**
 * Beautasy Friends — "Give £5, get £5" — the server side.
 *
 * One link per person. Whoever shares it is a `referrer`; each friend who
 * orders or comes to the atelier through it is a `referral` event, and the
 * reward is £5 on the referrer's credit: a gift card with a balance, the same
 * kind the shop already sells, so it is spent in the bag with no new code
 * path and topped up rather than reissued.
 *
 * Nothing here needs an account. A person is their email — keyed and sealed
 * like every other address in this dataset — and their link comes to them by
 * email after an order, after a fitting, or from the /refer page.
 *
 * The rules themselves (who counts as a friend, how big the discount is) are
 * pure functions in @/lib/referralRules; this file is what reads and writes.
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

export type ReferrerSource = "order" | "booking" | "page";

export interface Referrer {
  _id: string;
  displayName?: string;
  emailHint?: string;
  emailFingerprint: string;
  emailSealed?: string;
  codeHint?: string;
  codeSealed?: string;
  active?: boolean;
  rewardsCount?: number;
  creditCard?: { _ref: string };
  lastRewardAt?: string;
}

const REFERRER_FIELDS = `_id, displayName, emailHint, emailFingerprint, emailSealed, codeHint, codeSealed, active, rewardsCount, creditCard, lastRewardAt`;

/** Links and credit are keyed and sealed, so neither can exist without the key. */
export function referralsConfigured(): boolean {
  return !!process.env.SANITY_API_WRITE_TOKEN && secretsConfigured();
}

export async function referralSettings(): Promise<ReferralSettings> {
  const settings = await getSiteSettings();
  return referralSettingsFrom(settings.referral);
}

/**
 * One document per email address, whatever created it: the id is derived
 * from the address, so an order, a fitting and the /refer page all find the
 * same link, and two requests arriving together cannot mint two.
 */
export function referrerIdFor(emailFp: string): string {
  return `referrer-${emailFp}`;
}

/** The link code itself, for the emails that carry it. Null if it cannot be read back. */
export function revealReferralCode(doc: { codeSealed?: string }): string | null {
  return unseal(doc.codeSealed);
}

export async function findReferrerByCode(code: string): Promise<Referrer | null> {
  const normalised = normaliseReferralCode(code);
  if (!looksLikeReferralCode(normalised) || !secretsConfigured()) return null;
  // Past the CDN, and past the Studio's drafts: a link is live the moment it is made
  const doc = await sanityWriteClient.fetch<Referrer | null>(
    `*[_type == "referrer" && codeFingerprint == $fp && !(_id in path("drafts.**"))][0]{ ${REFERRER_FIELDS} }`,
    { fp: fingerprint(normalised) }
  );
  return doc ?? null;
}

export async function findReferrerById(id: string): Promise<Referrer | null> {
  if (!id) return null;
  const doc = await sanityWriteClient.fetch<Referrer | null>(
    `*[_type == "referrer" && _id == $id][0]{ ${REFERRER_FIELDS} }`,
    { id }
  );
  return doc ?? null;
}

/**
 * The link for this person — made now if they have none.
 *
 * Returns the code in the clear so it can go straight into an email or onto
 * the page; the document keeps only the fingerprint and a sealed copy.
 */
export async function ensureReferrer(input: {
  firstName?: string | null;
  email: string;
  source: ReferrerSource;
}): Promise<{ referrer: Referrer; code: string | null; created: boolean }> {
  const email = normaliseEmail(input.email);
  const fp = emailFingerprint(email);
  const _id = referrerIdFor(fp);

  const existing = await findReferrerById(_id);
  if (existing) return { referrer: existing, code: revealReferralCode(existing), created: false };

  const code = generateReferralCode(input.firstName);
  await sanityWriteClient.createIfNotExists({
    _id,
    _type: "referrer",
    displayName: firstNameOf(input.firstName),
    emailHint: maskEmail(email),
    emailFingerprint: fp,
    emailSealed: seal(email),
    codeHint: code.slice(-4),
    codeFingerprint: fingerprint(code),
    codeSealed: seal(code),
    source: input.source,
    active: true,
    rewardsCount: 0,
    createdAt: new Date().toISOString(),
  });

  // Two callers at once both get here; whichever create landed is the link
  const saved = await findReferrerById(_id);
  if (!saved) throw new Error(`Referrer ${_id} was not saved`);
  const savedCode = revealReferralCode(saved);
  return { referrer: saved, code: savedCode, created: savedCode === code };
}

/**
 * This person's own link code, for the emails and pages that offer it — or
 * null when the programme is off or cannot run. Never throws: a missing
 * share block must not cost anyone their order confirmation.
 */
export async function ownLinkFor(
  firstName: string | null | undefined,
  email: string | null | undefined,
  source: ReferrerSource
): Promise<string | null> {
  if (!email || !referralsConfigured()) return null;
  try {
    const settings = await referralSettings();
    if (!settings.enabled) return null;
    const { code } = await ensureReferrer({ firstName, email, source });
    return code;
  } catch (err) {
    console.error("Could not prepare a Friends link:", err);
    return null;
  }
}

/* ─── Who counts as a friend ─── */

/** "Before" defaults to the end of time: with no source to compare against, all history counts. */
const ALWAYS = "9999-12-31T00:00:00Z";

async function orderHistoryExists(fp: string, excludeId = "", before = ALWAYS): Promise<boolean> {
  const count = await sanityWriteClient.fetch<number>(
    // An order is excluded by its document id or by its Stripe session, whichever the caller has
    `count(*[_type == "order" && emailFingerprint == $fp && _id != $exclude && stripeSessionId != $exclude && createdAt < $before && !(_id in path("drafts.**"))])`,
    { fp, exclude: excludeId, before }
  );
  return count > 0;
}

async function bookingHistoryExists(fp: string, excludeId = "", before = ALWAYS): Promise<boolean> {
  // A declined request never became a visit, so it does not make anyone a regular
  const count = await sanityWriteClient.fetch<number>(
    `count(*[_type == "atelierBooking" && emailFingerprint == $fp && status != "declined" && _id != $exclude && createdAt < $before && !(_id in path("drafts.**"))])`,
    { fp, exclude: excludeId, before }
  );
  return count > 0;
}

async function rewardsThisYear(referrerId: string): Promise<number> {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  return sanityWriteClient.fetch<number>(
    `count(*[_type == "referral" && referrer._ref == $id && outcome in ["rewarded", "pending"] && createdAt > $since])`,
    { id: referrerId, since }
  );
}

/**
 * Whether this friend, arriving through this link, earns the discount and
 * the reward. Asked twice on purpose: before the discount is minted, when it
 * can still be refused, and again before the reward is credited.
 */
export async function judgeFriendFor(args: {
  referrer: Referrer;
  friendEmail: string | null | undefined;
  kind: "order" | "booking";
  /** The order or booking being judged, so it does not count as its own history */
  excludeId?: string;
  /**
   * When the order or booking was made. A fitting is rewarded weeks after it
   * was booked, and a second booking made in between must not turn the first
   * into "not your first visit" after the fact.
   */
  before?: string;
  settings: ReferralSettings;
}): Promise<FriendVerdict> {
  const friendFp = args.friendEmail ? emailFingerprint(normaliseEmail(args.friendEmail)) : "";
  const history = friendFp
    ? args.kind === "order"
      ? await orderHistoryExists(friendFp, args.excludeId, args.before)
      : await bookingHistoryExists(friendFp, args.excludeId, args.before)
    : false;
  return judgeFriend({
    settings: args.settings,
    referrerActive: args.referrer.active !== false,
    referrerFingerprint: args.referrer.emailFingerprint,
    friendFingerprint: friendFp,
    friendHasHistory: history,
    rewardsThisYear: await rewardsThisYear(args.referrer._id),
  });
}

/* ─── The reward ─── */

export interface RewardInput {
  kind: "order" | "booking";
  referrerId: string;
  friend: { name?: string | null; email?: string | null };
  /** The paid order or the completed booking — also what makes this happen once */
  sourceId: string;
  /** When the source was made; history is only counted before it. Defaults to now. */
  createdAt?: string;
  /** What the friend was given, for the record */
  discount: number;
}

export type RewardOutcome = FriendVerdict | "duplicate" | "missing" | "unconfigured" | "failed";
export type ReversalOutcome =
  | "reversed"
  | "already-reversed"
  | "not-found"
  | "not-rewarded"
  | "unconfigured"
  | "failed";

interface Credit {
  cardId: string;
  code: string | null;
  balance: number;
  expiresAt: string;
  created: boolean;
}

/** Adds the reward to the referrer's credit, making the card on the first reward. */
async function topUpCredit(referrer: Referrer, settings: ReferralSettings): Promise<Credit> {
  const reward = settings.referrerReward;
  const expiresAt = creditExpiry(settings.creditValidityMonths);
  const now = new Date().toISOString();

  if (referrer.creditCard?._ref) {
    const card = await sanityWriteClient.fetch<{ _id: string; codeSealed?: string; balance?: number } | null>(
      `*[_type == "giftCard" && _id == $id][0]{ _id, codeSealed, balance }`,
      { id: referrer.creditCard._ref }
    );
    if (card) {
      // inc is one server-side operation: two rewards in the same second both land
      await sanityWriteClient
        .transaction()
        .patch(card._id, (p) => p.setIfMissing({ balance: 0, initialAmount: 0 }))
        .patch(card._id, (p) => p.inc({ balance: reward, initialAmount: reward }).set({ expiresAt, active: true }))
        .commit();
      const after = await sanityWriteClient.fetch<{ balance?: number } | null>(
        `*[_id == $id][0]{ balance }`,
        { id: card._id }
      );
      return {
        cardId: card._id,
        code: revealCode(card),
        balance: after?.balance ?? (card.balance ?? 0) + reward,
        expiresAt,
        created: false,
      };
    }
  }

  // Generated here and stored only keyed and sealed, exactly like a bought card
  const code = generateGiftCardCode();
  const created = await sanityWriteClient.create({
    _type: "giftCard",
    ...giftCardCodeFields(code),
    initialAmount: reward,
    balance: reward,
    source: "referral",
    referrer: { _type: "reference", _ref: referrer._id, _weak: true },
    recipientHint: referrer.emailHint,
    recipientEmailSealed: referrer.emailSealed,
    recipientNameSealed: referrer.displayName ? seal(referrer.displayName) : undefined,
    expiresAt,
    active: true,
    // Delivered by the reward email below, never by the scheduled-card job
    sentAt: now,
    createdAt: now,
  });
  return { cardId: created._id, code, balance: reward, expiresAt, created: true };
}

/**
 * Decides and pays the reward for one friend, exactly once.
 *
 * The event document's id comes from the order or booking, so a retried
 * webhook or a second run of the daily job finds it already there. A nonce
 * written with the document and read straight back is what tells the caller
 * who created it apart from the one who merely found it — of two callers
 * arriving together, only one goes on to credit the card.
 */
export async function rewardReferral(input: RewardInput): Promise<RewardOutcome> {
  if (!referralsConfigured()) return "unconfigured";
  const settings = await referralSettings();
  const referrer = await findReferrerById(input.referrerId);
  if (!referrer) return "missing";

  const friendEmail = input.friend.email ? normaliseEmail(input.friend.email) : null;
  const verdict = await judgeFriendFor({
    referrer,
    friendEmail,
    kind: input.kind,
    excludeId: input.sourceId,
    before: input.createdAt ?? new Date().toISOString(),
    settings,
  });

  const eventId = eventIdFor(input.kind, input.sourceId);
  const claim = randomBytes(8).toString("hex");
  const now = new Date().toISOString();
  await sanityWriteClient.createIfNotExists({
    _id: eventId,
    _type: "referral",
    claim,
    referrer: { _type: "reference", _ref: referrer._id, _weak: true },
    kind: input.kind,
    orderId: input.kind === "order" ? input.sourceId : undefined,
    bookingId: input.kind === "booking" ? input.sourceId : undefined,
    friendName: firstNameOf(input.friend.name),
    friendEmailHint: maskEmail(friendEmail),
    friendEmailFingerprint: friendEmail ? emailFingerprint(friendEmail) : undefined,
    discount: input.discount,
    reward: verdict === "ok" ? settings.referrerReward : 0,
    outcome: verdict === "ok" ? "pending" : verdict,
    createdAt: now,
  });
  const event = await sanityWriteClient.fetch<{ claim?: string } | null>(
    `*[_id == $id][0]{ claim }`,
    { id: eventId }
  );
  if (!event || event.claim !== claim) return "duplicate";
  if (verdict !== "ok") return verdict;

  try {
    const credit = await topUpCredit(referrer, settings);
    await sanityWriteClient
      .transaction()
      .patch(referrer._id, (p) => p.setIfMissing({ rewardsCount: 0 }))
      .patch(referrer._id, (p) =>
        p.inc({ rewardsCount: 1 }).set({
          lastRewardAt: now,
          ...(credit.created
            ? { creditCard: { _type: "reference", _ref: credit.cardId, _weak: true } }
            : {}),
        })
      )
      .patch(eventId, (p) => p.set({ outcome: "rewarded" }))
      .commit();

    await emailReward(referrer, credit, input, settings, eventId);
    return "ok";
  } catch (err) {
    // The event stays "pending" where Kristina can see it in Friend Rewards
    console.error(`Referral ${eventId}: could not credit the reward`, err);
    return "failed";
  }
}

/**
 * Takes the reward back when the friend's order is refunded.
 *
 * Without this, £15 paid and then refunded still leaves £5 of real credit on
 * someone's card: the cheapest way there is to buy money. The reversal has to
 * be as careful as the payment was, because Stripe retries refund webhooks and
 * a second run must not take the £5 twice.
 *
 * The event document is the lock. Moving its outcome off "rewarded" is done
 * with ifRevisionId, so of two callers arriving together exactly one wins the
 * patch and goes on to touch the money; the loser is told the work is already
 * done. Only then is the balance changed.
 *
 * A partial refund is deliberately not handled here — the caller decides what
 * counts as the order coming undone.
 */
export async function reverseReferralReward(
  kind: "order" | "booking",
  sourceId: string
): Promise<ReversalOutcome> {
  if (!referralsConfigured()) return "unconfigured";

  const eventId = eventIdFor(kind, sourceId);
  const event = await sanityWriteClient.fetch<{
    _id: string;
    _rev: string;
    outcome?: string;
    reward?: number;
    referrer?: { _ref?: string };
  } | null>(`*[_id == $id][0]{ _id, _rev, outcome, reward, referrer }`, { id: eventId });

  if (!event) return "not-found";
  if (event.outcome === "reversed") return "already-reversed";
  if (event.outcome !== "rewarded") return "not-rewarded";

  const reward = event.reward ?? 0;
  const now = new Date().toISOString();

  // Claim the reversal before moving a penny. Losing this race means someone
  // else is already doing it, which is the right answer, not an error.
  try {
    await sanityWriteClient
      .patch(event._id)
      .ifRevisionId(event._rev)
      .set({ outcome: "reversed", reversedAt: now })
      .commit();
  } catch {
    return "already-reversed";
  }

  if (reward <= 0) return "reversed";

  try {
    const referrerId = event.referrer?._ref;
    const referrer = referrerId ? await findReferrerById(referrerId) : null;
    const cardId = referrer?.creditCard?._ref;

    if (cardId) {
      const card = await sanityWriteClient.fetch<{ balance?: number; initialAmount?: number } | null>(
        `*[_id == $id][0]{ balance, initialAmount }`,
        { id: cardId }
      );
      // Only what is still there can be taken back: credit already spent on a
      // real order is Kristina's cost of the refund, not a debt to chase.
      const take = Math.max(0, Math.min(reward, card?.balance ?? 0));
      if (take > 0) {
        await sanityWriteClient
          .patch(cardId)
          .dec({ balance: take, initialAmount: Math.min(take, card?.initialAmount ?? take) })
          .commit();
      }
    }

    if (referrerId) {
      const current = await sanityWriteClient.fetch<{ rewardsCount?: number } | null>(
        `*[_id == $id][0]{ rewardsCount }`,
        { id: referrerId }
      );
      // The yearly cap counts rewards, so a reversed one must stop counting —
      // otherwise a refunded order quietly uses up someone's allowance.
      await sanityWriteClient
        .patch(referrerId)
        .set({ rewardsCount: Math.max(0, (current?.rewardsCount ?? 1) - 1) })
        .commit();
    }

    return "reversed";
  } catch (err) {
    // The event already reads "reversed", so nothing will try to take the
    // money twice; what is left is a card Kristina can correct by hand.
    console.error(`Referral ${eventId}: could not take the reward back`, err);
    return "failed";
  }
}

/* ─── Emails ─── */

function button(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 26px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${label}</a>`;
}

/** "£5 off their first order or first alteration", or the two amounts when they differ. */
export function friendOfferText(settings: ReferralSettings): string {
  const shop = pounds(settings.friendShopDiscount);
  const atelier = pounds(settings.friendAtelierDiscount);
  return shop === atelier
    ? `${shop} off their first order or first alteration`
    : `${shop} off their first order, or ${atelier} off their first alteration`;
}

/**
 * The "Give £5, get £5" block that goes at the foot of an order confirmation,
 * a delivery note and the thank-you after a fitting.
 */
export function friendsBlockHtml(code: string, settings: ReferralSettings): string {
  const link = referralLink(code);
  const shown = link.replace(/^https?:\/\/(www\.)?/, "");
  return `
      <div style="background:#f7f3ff;border-radius:12px;padding:22px 24px;margin:28px 0 0;text-align:center;">
        <p style="margin:0 0 6px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">Give ${pounds(settings.friendShopDiscount)}, get ${pounds(settings.referrerReward)}</p>
        <p style="margin:0 0 14px;color:#3d3d3d;line-height:1.7;font-size:14px;">
          Know someone who'd love a piece made for them, or has a dress that doesn't quite fit?
          Send them your link: they get ${friendOfferText(settings)}, and ${pounds(settings.referrerReward)} of Beautasy credit
          lands with you when they do.
        </p>
        <p style="margin:0 0 14px;font-size:15px;letter-spacing:0.5px;"><a href="${escapeHtml(link)}" style="color:#2d2d2d;">${escapeHtml(shown)}</a></p>
        <p style="margin:0;">${button(whatsappShareUrl(code), "Share on WhatsApp")}</p>
      </div>`;
}

function shell(heading: string, body: string, eyebrow = "Beautasy Friends"): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:34px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">${eyebrow}</p>
      <h1 style="margin:0;font-size:25px;font-weight:400;color:#2d2d2d;font-style:italic;">${heading}</h1>
    </div>
    <div style="padding:32px 40px;">${body}</div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Made with 💜 in Southampton · <a href="${SITE_URL}/refer" style="color:#aaa;">how Beautasy Friends works</a></p>
    </div>
  </div>
</body>
</html>`;
}

function rulesLine(settings: ReferralSettings): string {
  const min =
    settings.friendMinBasket > 0 ? ` on a basket of ${pounds(settings.friendMinBasket)} or more` : "";
  return `Friend discounts are for a first order${min} or a first visit, one per person, and can't be combined with other codes. Credit lasts ${settings.creditValidityMonths} months from the last time it was topped up, and up to ${settings.maxRewardsPerYear} friends a year can earn it for you.`;
}

export function linkEmailHtml(firstName: string | undefined, code: string, settings: ReferralSettings): string {
  const name = escapeHtml(firstName ?? "there");
  return shell(
    "Your link is ready",
    `
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">
        ${name}, here's your Beautasy Friends link. Send it to anyone who'd love something made by hand,
        or who has a piece in the wardrobe that never quite fitted.
      </p>
      ${friendsBlockHtml(code, settings)}
      <p style="color:#777;font-size:13px;line-height:1.7;margin:24px 0 0;">${rulesLine(settings)}</p>`
  );
}

export function rewardEmailHtml(args: {
  referrerName?: string;
  friendName?: string;
  kind: "order" | "booking";
  credit: Credit;
  code: string;
  settings: ReferralSettings;
}): string {
  const name = escapeHtml(args.referrerName ?? "there");
  const friend = escapeHtml(args.friendName ?? "A friend");
  const did = args.kind === "order" ? "just ordered through your link" : "came to the atelier through your link";
  const expires = new Date(args.credit.expiresAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return shell(
    `${pounds(args.settings.referrerReward)} is yours`,
    `
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">
        ${name}, ${friend} ${did}, so ${pounds(args.settings.referrerReward)} has landed on your Beautasy credit.
        Your balance is now <strong>${pounds(args.credit.balance)}</strong>.
      </p>
      <div style="border:1px dashed #cfc0f0;border-radius:14px;padding:22px;text-align:center;margin:24px 0;">
        <p style="margin:0 0 6px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">Your credit code</p>
        <p style="margin:0 0 10px;font-size:20px;letter-spacing:3px;color:#2d2d2d;">${escapeHtml(args.credit.code ?? "see your earlier email")}</p>
        <p style="margin:0;font-size:13px;color:#777;">Enter it in your bag at checkout, or tell Kristina at the atelier. Valid until ${expires}.</p>
      </div>
      <p style="text-align:center;margin:0;">${button(`${SITE_URL}/shop`, "Choose something")}</p>
      ${friendsBlockHtml(args.code, args.settings)}`
  );
}

async function emailReward(
  referrer: Referrer,
  credit: Credit,
  input: RewardInput,
  settings: ReferralSettings,
  eventId: string
): Promise<void> {
  const email = open(referrer.emailSealed);
  const code = revealReferralCode(referrer);
  if (!email || !code || !process.env.RESEND_API_KEY) return;
  try {
    const friendName = firstNameOf(input.friend.name) ?? "A friend";
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: KRISTINA_EMAIL,
      subject:
        input.kind === "order"
          ? `${friendName} just ordered — ${pounds(settings.referrerReward)} is yours 💜`
          : `${friendName} came to the atelier — ${pounds(settings.referrerReward)} is yours 💜`,
      html: rewardEmailHtml({
        referrerName: referrer.displayName,
        friendName,
        kind: input.kind,
        credit,
        code,
        settings,
      }),
    });
    await sanityWriteClient.patch(eventId).set({ rewardEmailedAt: new Date().toISOString() }).commit();
  } catch (err) {
    console.error(`Referral ${eventId}: reward credited but the email failed`, err);
  }
}

/** Emails someone their own link. Best-effort: the link exists either way. */
export async function sendReferralLinkEmail(
  email: string,
  firstName: string | undefined,
  code: string,
  settings: ReferralSettings
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: KRISTINA_EMAIL,
      subject: "Your Beautasy Friends link 💜",
      html: linkEmailHtml(firstName, code, settings),
    });
    return true;
  } catch (err) {
    console.error("Failed to email a Friends link:", err);
    return false;
  }
}
