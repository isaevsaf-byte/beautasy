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
    await send();
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
