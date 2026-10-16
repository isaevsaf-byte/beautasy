import { sanityWriteClient } from "@/lib/sanity";
import { telegramSend } from "@/lib/leadRun";
import {
  empressMillsPrices,
  newsOf,
  priceFor,
  supplyDigest,
  supplyNewsMessage,
  tiersText,
  unitWord,
  watched,
  type SupplyFind,
  type SupplyItem,
} from "@/lib/supplies";

/**
 * Monday's look at «Где брать мини-опт» (see @/lib/supplies): re-read the
 * prices of the offers the site may read, write down what it saw, and tell
 * Kristina only what fell — by a tenth or more, or to well under what she
 * pays now. Once a month, and on the very first run, the whole list goes to
 * her chat as well, cheapest first, with the eBay searches to save.
 *
 * Gentle with the shops: one page at a time, a pause between, an honest name,
 * and no more than MAX_PAGES a week.
 *
 * Leaves a mark each run (STATE_ID: when it ran, when it last read a shop
 * page, when it last sent the list) — the outside watch reads it, so a run
 * that stopped, or a shop page it can no longer read, reaches Safar.
 */

const UA = "Beautasy supplies watch (hello@beautasy.co.uk)";
const MAX_PAGES = 20;
const GAP_MS = 2_000;
/**
 * A first reading this far from the price she wrote is not news but a mix-up
 * — a pack of 10 entered as 1, a page that sells by the reel: nothing is
 * written, and Safar is told
 */
const FIRST_READING_DRIFT = 0.3;

export const STATE_ID = "supplyWatchState";

export const SUPPLY_QUERY = `*[_type == "supplyItem" && !(_id in path("drafts.**"))] | order(group asc, name asc) {
  _id, name, group, spec, unit, myPrice, note,
  "offers": coalesce(offers, [])[]{ _key, shop, url, pack, price, note, seenUnitPrice, seenAt, seenPack, seenTiers }
}`;

export interface SupplyWatchState {
  ranAt?: string | null;
  readAt?: string | null;
  digestAt?: string | null;
}

type OfferUpdate = { key: string; set: Record<string, unknown> };

export interface SupplyRunDeps {
  now?: Date;
  items?: () => Promise<SupplyItem[]>;
  page?: (url: string) => Promise<string>;
  /** Write what was read onto one item's offers */
  save?: (id: string, updates: OfferUpdate[]) => Promise<void>;
  state?: () => Promise<SupplyWatchState | null>;
  mark?: (fields: SupplyWatchState) => Promise<void>;
  telegram?: ((text: string) => Promise<void>) | null;
  pause?: (ms: number) => Promise<void>;
}

export interface SupplyRunResult {
  read: number;
  news: number;
  digest: boolean;
  telegram: number | "unconfigured" | "failed";
  problems: Record<string, string>;
}

async function readPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
  return res.text();
}

async function saveToSanity(id: string, updates: OfferUpdate[]): Promise<void> {
  const set: Record<string, unknown> = {};
  for (const { key, set: fields } of updates) {
    for (const [field, value] of Object.entries(fields)) set[`offers[_key=="${key}"].${field}`] = value;
  }
  await sanityWriteClient.patch(id).set(set).commit();
}

async function markInSanity(fields: SupplyWatchState): Promise<void> {
  await sanityWriteClient
    .transaction()
    .createIfNotExists({ _id: STATE_ID, _type: STATE_ID })
    .patch(STATE_ID, (patch) => patch.set(fields))
    .commit();
}

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_LEADS_CHAT_IDS);
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The list goes out once a calendar month: the first run of a month that has not had it */
export function digestDue(state: SupplyWatchState | null, now: Date): boolean {
  const last = state?.digestAt ? new Date(state.digestAt) : null;
  if (!last || Number.isNaN(last.getTime())) return true;
  return last.getUTCFullYear() * 12 + last.getUTCMonth() < now.getUTCFullYear() * 12 + now.getUTCMonth();
}

export async function runSupplyWatch(deps: SupplyRunDeps = {}): Promise<SupplyRunResult> {
  const now = deps.now ?? new Date();
  const items = await (deps.items ?? (() => sanityWriteClient.fetch<SupplyItem[]>(SUPPLY_QUERY)))();
  const page = deps.page ?? readPage;
  const save = deps.save ?? saveToSanity;
  const mark = deps.mark ?? markInSanity;
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const telegram = deps.telegram === undefined ? (telegramConfigured() ? telegramSend : null) : deps.telegram;
  const state = await (deps.state ?? (() => sanityWriteClient.fetch<SupplyWatchState | null>(`*[_id == $id][0]{ ranAt, readAt, digestAt }`, { id: STATE_ID })))();

  const finds: SupplyFind[] = [];
  const problems: Record<string, string> = {};
  const pending: { id: string; updates: (OfferUpdate & { news: boolean })[] }[] = [];
  let read = 0;
  let readOk = 0;

  for (const item of items) {
    const updates: (OfferUpdate & { news: boolean })[] = [];
    for (const offer of item.offers) {
      if (!watched(offer.url) || !(offer.pack > 0) || read >= MAX_PAGES) continue;
      if (read > 0) await pause(GAP_MS);
      read++;
      let reading;
      try {
        reading = empressMillsPrices(await page(offer.url));
      } catch (error) {
        problems[offer.url] = messageOf(error);
        continue;
      }
      // A page that no longer says its price changed its layout: Safar's to look at, not Kristina's
      if (!reading.ok) {
        problems[offer.url] = reading.why;
        continue;
      }
      readOk++;
      const unit = priceFor(reading.prices, offer.pack);
      // A different size of buy is a different price: measured afresh, not against the old one
      const seen = offer.seenPack === offer.pack ? offer.seenUnitPrice : null;
      if (typeof seen !== "number" && offer.price > 0 && Math.abs(unit * offer.pack - offer.price) > offer.price * FIRST_READING_DRIFT) {
        problems[offer.url] =
          `${item.name}: на сайте ${unitWord(item.unit, offer.pack)} стоят £${round2(unit * offer.pack).toFixed(2)}, в списке £${offer.price.toFixed(2)} — ` +
          `проверьте «Сколько единиц в покупке» и «Цена считается»; пока не исправлено, цена не обновляется`;
        continue;
      }
      const news = newsOf(unit, seen, item.myPrice);
      if (news) finds.push({ item, offer, news });
      // The list keeps today's price for the same buy, so the Studio is never out of date
      const fields = {
        seenUnitPrice: Math.round(unit * 10_000) / 10_000,
        seenAt: now.toISOString(),
        seenPack: offer.pack,
        seenTiers: tiersText(reading.prices, item.unit),
        price: round2(unit * offer.pack),
      };
      Object.assign(offer, fields);
      updates.push({ key: offer._key, set: fields, news: Boolean(news) });
    }
    if (updates.length) pending.push({ id: item._id, updates });
  }

  const digest = items.length > 0 && digestDue(state, now);
  let told: SupplyRunResult["telegram"] = telegram ? 0 : "unconfigured";
  let digestSent = false;
  if (telegram) {
    try {
      if (finds.length) {
        await telegram(supplyNewsMessage(finds));
        told = (told as number) + 1;
      }
      if (digest) {
        await telegram(supplyDigest(items));
        told = (told as number) + 1;
        digestSent = true;
      }
    } catch (error) {
      console.error("Supplies watch: Telegram refused:", messageOf(error));
      told = "failed";
    }
  }

  // Written after telling: a fall that could not be sent keeps its old price as
  // the one to beat, so next Monday it is news again rather than lost
  const untold = told === "failed";
  for (const { id, updates } of pending) {
    try {
      await save(
        id,
        updates.map(({ key, set, news }) => ({
          key,
          set: news && untold ? Object.fromEntries(Object.entries(set).filter(([field]) => field !== "seenUnitPrice" && field !== "seenPack")) : set,
        }))
      );
    } catch (error) {
      problems[id] = messageOf(error);
    }
  }

  // The mark for the outside watch; the list is marked sent only once it was
  try {
    await mark({
      ranAt: now.toISOString(),
      ...(readOk ? { readAt: now.toISOString() } : {}),
      ...(digestSent ? { digestAt: now.toISOString() } : {}),
    });
  } catch (error) {
    problems[STATE_ID] = messageOf(error);
  }

  return { read, news: finds.length, digest, telegram: told, problems };
}
