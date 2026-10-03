/**
 * Copies the shop's whole Sanity dataset into a private R2 bucket every
 * night, and lets copies older than thirty days go.
 *
 * Sanity's free plan keeps no backups — those come with Enterprise plans
 * only. Everything Kristina has typed into the Studio lives in that one
 * dataset: products and prices, the diary, reviews, partners, the ledger.
 * A wrong import, a script with --replace or a deleted dataset would take it
 * all, and Sanity would have no copy to give back. This keeps one somewhere
 * Sanity is not.
 *
 * Putting a copy back is a person's job, written down step by step in
 * README.md next to this folder.
 *
 * The rule throughout: the log gets counts and file names, never the token
 * and never a line of what was exported. The copies hold customers' names.
 */

import {
  BACKUP_FOLDER,
  backupKey,
  expiredBackups,
  exportTally,
  streamToBucket,
  type BackupBucket,
} from "./backup";

export interface Env {
  SANITY_PROJECT_ID: string;
  SANITY_DATASET: string;
  /**
   * A Viewer token made for this Worker alone, set with `wrangler secret put`.
   * Optional: without it the copy holds every published document — orders,
   * the diary, the ledger — and only unpublished drafts are missing.
   */
  SANITY_READ_TOKEN?: string;
  BACKUPS: BackupBucket;
}

// The two fields of what the runtime hands a scheduled handler that are
// used here; the full types package is not worth a dependency for them.
interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

/**
 * Pinned on purpose: this version of the export hands back every document as
 * it is stored, drafts included. Newer API versions default to showing only
 * published documents, and a backup without drafts would lose unpublished
 * work.
 */
const API_VERSION = "v2021-06-07";

async function storedBackups(bucket: BackupBucket, dataset: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: `${BACKUP_FOLDER}${dataset}-`, cursor });
    keys.push(...page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

export async function backUp(env: Env, now: Date): Promise<void> {
  // The dataset is public, so without a token Sanity still hands over every
  // published document. A copy without drafts beats no copy while the token
  // is waiting to be made; each night's log line says which kind it took.
  const token = env.SANITY_READ_TOKEN;
  const res = await fetch(
    `https://${env.SANITY_PROJECT_ID}.api.sanity.io/${API_VERSION}/data/export/${env.SANITY_DATASET}`,
    {
      // With a token the export includes drafts; the public dataset's open
      // door would hand back published documents only. The token goes in a
      // header, never the address, so it cannot end up in a log of URLs.
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      // Today's export takes about a second. Ten minutes is a hung
      // connection, not a big dataset.
      signal: AbortSignal.timeout(10 * 60_000),
    }
  );

  if (!res.ok || !res.body) {
    // The status only. 401 or 403 is the token, 404 the dataset's name; the
    // body is not read, so nothing from Sanity's reply reaches the log.
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Sanity's export answered ${res.status}${res.body ? "" : " with nothing"}, so no backup was taken`);
  }

  const key = backupKey(env.SANITY_DATASET, now);
  const { documents, bytes } = await streamToBucket(env.BACKUPS, key, res.body, exportTally());
  // A sudden drop in documents from one night to the next is the thing to
  // look for in these lines.
  console.log(JSON.stringify({ saved: key, documents, bytes, drafts: Boolean(token) }));

  // Old copies go only after tonight's is safely in. A night that failed
  // never gets here, so a run of failures can never prune the bucket empty.
  const expired = expiredBackups(await storedBackups(env.BACKUPS, env.SANITY_DATASET), env.SANITY_DATASET, now);
  if (expired.length > 0) {
    await env.BACKUPS.delete(expired);
    console.log(JSON.stringify({ deleted: expired }));
  }
}

const worker = {
  // Awaited rather than handed to waitUntil: the run's outcome is then the
  // backup's outcome, so a failed night shows as a failed run in the
  // Cloudflare dashboard.
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await backUp(env, new Date(controller.scheduledTime));
  },
};

export default worker;
