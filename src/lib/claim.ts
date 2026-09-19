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
}

export type ClaimOutcome = "sent" | "lost" | "failed";

export async function claimThenSend(
  client: ClaimClient,
  doc: { _id: string; _rev: string },
  claim: Record<string, unknown>,
  /** What to write back if sending fails: fields to set, or field names to unset */
  release: Record<string, unknown> | string[],
  send: () => Promise<unknown>
): Promise<ClaimOutcome> {
  try {
    await client.patch(doc._id).ifRevisionId(doc._rev).set(claim).commit();
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
      if (Array.isArray(release)) await client.patch(doc._id).unset(release).commit();
      else await client.patch(doc._id).set(release).commit();
    } catch (releaseErr) {
      console.error(`Could not release the claim on ${doc._id}:`, releaseErr);
    }
    return "failed";
  }
}
