import { sanityWriteClient } from "./sanity";
import { open } from "./pii";
import { eventIdFor } from "./referralRules";
import { referralsConfigured, rewardReferral, type RewardInput, type RewardOutcome } from "./referrals";

/**
 * Credits whoever sent a client to the atelier once the work is marked done —
 * including the clients who never gave an email.
 *
 * The reward used to be paid only on the way out of the thank-you email, so a
 * client with no email had no thank-you and earned nobody anything. That was
 * harmless while every recommended client came through a link and typed an
 * address; it is not now that a salon's clients write on WhatsApp and are put
 * down to the salon by hand. This settles every finished, recommended booking:
 * at once when it has no email, and after its thank-you when it has one, so
 * the friend still hears after the client does.
 *
 * Exactly once, twice over: `rewardReferral` claims an event keyed on the
 * booking before a penny moves, and the booking is marked settled afterwards
 * so it stops being asked about. When the email path got there first, the
 * reward answers "duplicate" and the booking takes the outcome already
 * decided, read off the event.
 */

const SETTLE_CONDITIONS = `_type == "atelierBooking" && status == "completed" && defined(referrer._ref)
  && !defined(referralSettledAt) && !defined(releasedAt)
  && (!defined(emailSealed) || notifiedStatus == "completed")
  && !(_id in path("drafts.**"))`;

const SETTLE_FIELDS = `_id, referrer, displayName, nameSealed, emailSealed, createdAt, referralDiscount`;

/** Exported so a test can read what is waiting rather than trust it. */
export const SETTLE_QUERY = `*[${SETTLE_CONDITIONS}] | order(createdAt asc) [0...$limit] { ${SETTLE_FIELDS} }`;

const SETTLE_ONE_QUERY = `*[_id == $id && ${SETTLE_CONDITIONS}][0]{ ${SETTLE_FIELDS} }`;

export interface SettleRow {
  _id: string;
  referrer?: { _ref?: string };
  displayName?: string;
  nameSealed?: string;
  emailSealed?: string;
  createdAt?: string;
  referralDiscount?: number;
}

interface SettleClient {
  fetch<T>(query: string, params?: Record<string, unknown>): Promise<T>;
  patch(id: string): { set(fields: Record<string, unknown>): { commit(): Promise<unknown> } };
}

export interface SettleDeps {
  client: SettleClient;
  reward: (input: RewardInput) => Promise<RewardOutcome>;
  configured: () => boolean;
  now: () => string;
}

const realDeps: SettleDeps = {
  client: sanityWriteClient as unknown as SettleClient,
  reward: rewardReferral,
  configured: referralsConfigured,
  now: () => new Date().toISOString(),
};

/**
 * One booking: reward, then mark. Returns what was decided, or null when
 * nothing was — the keys are missing, or Sanity failed, and the next run will
 * ask again.
 */
export async function settleBooking(row: SettleRow, deps: SettleDeps = realDeps): Promise<string | null> {
  const referrerId = row.referrer?._ref;
  if (!referrerId) return null;

  let outcome: RewardOutcome;
  try {
    outcome = await deps.reward({
      kind: "booking",
      referrerId,
      friend: { name: open(row.nameSealed) ?? row.displayName, email: open(row.emailSealed) },
      sourceId: row._id,
      createdAt: row.createdAt,
      discount: row.referralDiscount ?? 0,
    });
  } catch (error) {
    console.error(`Could not settle the recommendation for booking ${row._id}:`, error);
    return null;
  }
  if (outcome === "unconfigured") return null;

  // Written in the words the booking's field offers — the event's own words,
  // "rewarded" rather than the reward's "ok" — or the Studio flags the booking
  // and will not publish it again
  let decided: string = outcome === "ok" ? "rewarded" : outcome;
  if (outcome === "duplicate") {
    const event = await deps.client
      .fetch<{ outcome?: string } | null>(`*[_id == $id][0]{ outcome }`, { id: eventIdFor("booking", row._id) })
      .catch(() => null);
    // Decided, but not readable now: leave it for the next run to mark
    if (!event?.outcome) return null;
    decided = event.outcome;
  }

  try {
    await deps.client.patch(row._id).set({ referralSettledAt: deps.now(), referralOutcome: decided }).commit();
  } catch (error) {
    // The reward itself is safe — its event is the lock — so the next run only marks it
    console.error(`Rewarded booking ${row._id}, but could not mark it settled:`, error);
  }
  return decided;
}

/** Every finished, recommended booking still waiting, oldest first. */
export async function settleReferredBookings(
  limit = 25,
  deps: SettleDeps = realDeps
): Promise<{ checked: number; settled: number }> {
  if (!deps.configured()) return { checked: 0, settled: 0 };
  const rows = await deps.client.fetch<SettleRow[]>(SETTLE_QUERY, { limit });
  let settled = 0;
  for (const row of rows ?? []) {
    if (await settleBooking(row, deps)) settled += 1;
  }
  return { checked: (rows ?? []).length, settled };
}

/** The one booking, if it is due — for a booking put down to a partner after its work was already done. */
export async function settleOneBooking(id: string, deps: SettleDeps = realDeps): Promise<string | null> {
  if (!deps.configured()) return null;
  const row = await deps.client.fetch<SettleRow | null>(SETTLE_ONE_QUERY, { id });
  return row ? settleBooking(row, deps) : null;
}
