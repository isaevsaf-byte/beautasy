import { refusedTheEmail } from "@/lib/sendEmail";

/**
 * Claim a document before acting on it, so nothing is done twice.
 *
 * Every email job here used to send first and mark afterwards. That leaves a
 * window — the length of one Resend call — in which a second caller reads the
 * same "not yet told" document and sends the same email. The window is real:
 * the Studio button, the Sanity webhook and the daily job all run the same
 * queries, and Kristina publishing a status and pressing "Email the customer
 * now" is exactly the timing that hits it.
 *
 * `ifRevisionId` makes the claim atomic: Sanity accepts the patch only if the
 * document is unchanged since it was read, so of two callers exactly one wins.
 * If sending then fails, the claim is handed back so the next run retries.
 *
 * "Fails" used to mean "threw", and for three of the four callers that branch
 * could never run in production: they all send through Resend, and Resend
 * answers a refusal rather than throwing it (see @/lib/sendEmail). So a
 * revoked key or an unverified domain claimed the document, resolved, and left
 * it marked as told — the order was right and the verdict was wrong. Everyone
 * goes through `sendEmail` now, which throws, but the answer is read here as
 * well: this is the one place all of it funnels through, and a caller that
 * hands a raw `emails.send` straight to it must not be able to bring the bug
 * back on its own.
 */

export interface ClaimClient {
  patch(id: string): {
    ifRevisionId(rev: string): {
      set(fields: Record<string, unknown>): { commit(): Promise<unknown> };
    };
    set(fields: Record<string, unknown>): { commit(): Promise<unknown> };
    unset(fields: string[]): { commit(): Promise<unknown> };
  };
  getDocument(id: string): Promise<Record<string, unknown> | null | undefined>;
}

export type ClaimOutcome = "sent" | "lost" | "failed";

type Doc = Record<string, unknown>;

/** Whether the document still has every field of the claim, as claimed. */
function carries(doc: Doc | null | undefined, claim: Doc): boolean {
  return Boolean(doc) && Object.entries(claim).every(([field, value]) => JSON.stringify(doc![field]) === JSON.stringify(value));
}

/**
 * Whether it is still the record that was claimed, and not another one that
 * came to carry the same mark — two bookings can both say "confirmed". Told
 * apart by when they were made, where the record says so.
 */
function sameRecord(claimed: Doc | undefined, doc: Doc | null | undefined): boolean {
  return claimed?.createdAt === undefined || doc?.createdAt === claimed.createdAt;
}

/**
 * Which document to hand a claim back to: the one that still carries it.
 *
 * Usually that is the document claimed. But a booking's id can pass to
 * another customer while its email is out — a freed time booked again, see
 * @/lib/diary — and a blind write-back would then land on the new customer's
 * booking: their confirmation sent twice, and the first customer's email never
 * tried again. The diary keeps the old booking as `<id>-released-<revision>`,
 * named after the revision it took over, which is the one this claim left.
 * A document that carries a later claim instead is somebody else's business.
 */
async function holderOfClaim(client: ClaimClient, id: string, claim: Doc, claimed: Doc | undefined): Promise<string | null> {
  const current = await client.getDocument(id);
  if (carries(current, claim) && sameRecord(claimed, current)) return id;
  if (typeof claimed?._rev !== "string") return null;
  // Named after the claimed revision, so it can only be a copy of that record
  const kept = `${id}-released-${claimed._rev}`;
  return carries(await client.getDocument(kept), claim) ? kept : null;
}

export async function claimThenSend(
  client: ClaimClient,
  doc: { _id: string; _rev: string },
  claim: Record<string, unknown>,
  /** What to write back if sending fails: fields to set, or field names to unset */
  release: Record<string, unknown> | string[],
  send: () => Promise<unknown>
): Promise<ClaimOutcome> {
  /** The document as the claim left it — Sanity answers a patch with it */
  let claimed: Doc | undefined;
  try {
    const answer = await client.patch(doc._id).ifRevisionId(doc._rev).set(claim).commit();
    claimed = answer && typeof answer === "object" ? (answer as Doc) : undefined;
  } catch {
    // Somebody else claimed it in the meantime — their send, not ours
    return "lost";
  }

  try {
    const refused = refusedTheEmail(await send());
    if (refused) throw new Error(refused);
    return "sent";
  } catch (err) {
    console.error(`Send failed for ${doc._id}, releasing the claim:`, err);
    try {
      const holder = await holderOfClaim(client, doc._id, claim, claimed);
      if (!holder) console.error(`Nothing carries the claim on ${doc._id} any more — nothing to hand back`);
      else if (Array.isArray(release)) await client.patch(holder).unset(release).commit();
      else await client.patch(holder).set(release).commit();
    } catch (releaseErr) {
      console.error(`Could not release the claim on ${doc._id}:`, releaseErr);
    }
    return "failed";
  }
}
