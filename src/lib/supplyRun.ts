import { sanityWriteClient } from "@/lib/sanity";
import { telegramToAny } from "@/lib/leadRun";
import {
  empressMillsPrices,
  newsOf,
  priceFor,
  supplyDigest,
  supplyNewsMessage,
  tiersText,
  unitWord,
  watched,
  type ShopReading,
  type SupplyFind,
  type SupplyItem,
  type SupplyOffer,
} from "@/lib/supplies";

/**
 * Monday's look at «Где брать мини-опт» (see @/lib/supplies): re-read the
 * prices of the offers the site may read, write down what it saw, and tell
 * Kristina only what fell — by a tenth or more, or to well under what she
 * pays now. Once a calendar month the whole list goes to her chat as well,
 * cheapest first, with the eBay searches to save.
 *
 * Gentle with the shops: one page at a time, a pause between, an honest name,
 * each page once a run, no more than MAX_PAGES a week — the longest-unread
 * first, so a long list is read in turns rather than its tail never.
 *
 * Leaves a mark each run (STATE_ID): when it ran, when it last sent the list,
 * and every problem with the run it was first met on and the last. The outside
 * watch reads it: a run that stopped, a problem met again a Monday later, or
 * one that cannot pass by itself (a chat that blocked the bot) is an issue
 * that emails Safar. Kristina hears about prices, never about faults.
 *
 * A product sold in options (colours, lengths) is read only while every
 * option costs the same. Options come and go with stock; while the ones listed
 * overlap the ones read last time it is the same product, and a fall is a
 * fall. Once its options were seen at different prices, which one she buys
 * cannot be known: the offer is no longer read, and Safar is told.
 */

const UA = "Beautasy supplies watch (hello@beautasy.co.uk)";
const MAX_PAGES = 20;
const GAP_MS = 2_000;
const PAGE_TIMEOUT_MS = 8_000;
/**
 * The route may run 60 s: no new page after this, so what was read is still
 * told (two messages, 10 s each at worst), saved and marked
 */
const READ_BUDGET_MS = 25_000;
/** A watched offer left unread this long, because the run ran out of pages or time, is a problem */
const UNREAD_TOO_LONG_DAYS = 13;
/**
 * A reading of a page this far from the price in the list is not news but a
 * mix-up — a pack of 10 entered as 1, a page that sells by the reel, an option
 * gone out of stock and another left: nothing is written, and Safar is told
 */
const FIRST_READING_DRIFT = 0.3;

export const STATE_ID = "supplyWatchState";

export const SUPPLY_QUERY = `*[_type == "supplyItem" && !(_id in path("drafts.**"))] | order(group asc, name asc) {
  _id, name, group, spec, unit, myPrice, note,
  "offers": coalesce(offers, [])[]{ _key, shop, url, pack, price, note, seenUnitPrice, seenAt, seenPack, seenTiers, seenFrom, seenYours }
}`;

/**
 * One fault, as the outside watch reads it: what, why, the run it was first
 * met on and the last run that met it — a week between the two is a fault
 * that did not pass. `urgent`: one that cannot pass by itself.
 */
export interface SupplyProblem {
  _key: string;
  key: string;
  why: string;
  since: string;
  lastMet: string;
  urgent?: boolean;
}

export interface SupplyWatchState {
  ranAt?: string | null;
  digestAt?: string | null;
  problems?: SupplyProblem[] | null;
}

type OfferUpdate = { key: string; set: Record<string, unknown> };

/** Throws when no chat got it; a chat that refused while another got it comes back in `failed` */
export type SupplyTelegram = (text: string) => Promise<void | { failed?: string[] }>;

export interface SupplyRunDeps {
  now?: Date;
  /** Milliseconds since the run began */
  elapsed?: () => number;
  items?: () => Promise<SupplyItem[]>;
  page?: (url: string) => Promise<string>;
  /** Write what was read onto one item's offers */
  save?: (id: string, updates: OfferUpdate[]) => Promise<void>;
  state?: () => Promise<SupplyWatchState | null>;
  mark?: (fields: { ranAt: string; problems: SupplyProblem[]; digestAt?: string }) => Promise<void>;
  telegram?: SupplyTelegram | null;
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
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
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

async function markInSanity(fields: { ranAt: string; problems: SupplyProblem[]; digestAt?: string }): Promise<void> {
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
const DAY = 24 * 60 * 60 * 1000;
/**
 * What a fall nobody was told of must not overwrite: the price it is measured
 * against, and when it was read — so it stays at the front of next week's queue
 */
const BASELINE = ["seenUnitPrice", "seenPack", "seenFrom", "seenYours", "seenAt"];
/** Telegram's answers that no retry will change: the token, a blocked bot, a chat that is gone */
const WILL_NOT_PASS = /Telegram 40[013]\b/;

/** The page itself: a link copied from a tab («…#reviews») is the same page */
function pageOf(url: string): string {
  try {
    const page = new URL(url);
    page.hash = "";
    return page.toString();
  } catch {
    return url;
  }
}

/** What `seenFrom` says: the page, its options when read («a,b,c»), or that they were seen at different prices */
function readFrom(seenFrom: string | null | undefined): { url: string; options: string[]; mixed: boolean } | null {
  if (typeof seenFrom !== "string" || !seenFrom) return null;
  const [url, rest = ""] = seenFrom.split("#");
  return { url, options: rest.startsWith("options=") ? rest.slice(8).split(",").filter(Boolean) : [], mixed: rest === "mixed" };
}

/** The same product as last time: the same page, and options that overlap the ones read then (or none, both times) */
function sameProduct(seenFrom: string | null | undefined, url: string, options: string): boolean {
  const last = readFrom(seenFrom);
  if (!last || last.url !== url) return false;
  const now = options ? options.split(",") : [];
  if (!now.length || !last.options.length) return now.length === last.options.length;
  return now.some((id) => last.options.includes(id));
}

/** A short, stable array key for a problem's subject (a URL is too long and full of dots) */
function keyFor(subject: string): string {
  let hash = 5381;
  for (let k = 0; k < subject.length; k++) hash = ((hash * 33) ^ subject.charCodeAt(k)) >>> 0;
  return `p${hash.toString(36)}`;
}

/** The list goes out once a calendar month: the first run of a month that has not had it */
export function digestDue(state: SupplyWatchState | null, now: Date): boolean {
  const last = state?.digestAt ? new Date(state.digestAt) : null;
  if (!last || Number.isNaN(last.getTime())) return true;
  return last.getUTCFullYear() * 12 + last.getUTCMonth() < now.getUTCFullYear() * 12 + now.getUTCMonth();
}

export async function runSupplyWatch(deps: SupplyRunDeps = {}): Promise<SupplyRunResult> {
  const now = deps.now ?? new Date();
  const started = Date.now();
  const elapsed = deps.elapsed ?? (() => Date.now() - started);
  const items = await (deps.items ?? (() => sanityWriteClient.fetch<SupplyItem[]>(SUPPLY_QUERY)))();
  const page = deps.page ?? readPage;
  const save = deps.save ?? saveToSanity;
  const mark = deps.mark ?? markInSanity;
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const telegram = deps.telegram === undefined ? (telegramConfigured() ? telegramToAny : null) : deps.telegram;
  const state = await (deps.state ?? (() => sanityWriteClient.fetch<SupplyWatchState | null>(`*[_id == $id][0]{ ranAt, digestAt, problems }`, { id: STATE_ID })))();

  const problems: Record<string, string> = {};
  /** Problems no retry will change: Safar hears of them at once */
  const urgent = new Set<string>();
  /** Problems not looked at again this run: what was wrong last time still stands, unmet */
  const unlooked = new Set<string>();
  /** Pages waiting longer than they should, because the list outgrew one run */
  const unread = new Set<string>();

  // Every watched offer, the longest-unread first
  const queue = items
    .flatMap((item) => (item.offers ?? []).map((offer) => ({ item, offer })))
    .filter(({ offer }) => watched(offer.url) && typeof offer.pack === "number" && offer.pack > 0)
    .sort((a, b) => (Date.parse(a.offer.seenAt ?? "") || 0) - (Date.parse(b.offer.seenAt ?? "") || 0));

  const readings = new Map<string, ShopReading | { error: string }>();
  const finds: (SupplyFind & { itemId: string; key: string })[] = [];
  const pending = new Map<string, OfferUpdate[]>();

  for (const { item, offer } of queue) {
    const url = pageOf(offer.url);
    // Seen once at different prices per option: which one she buys cannot be known
    const last = readFrom(offer.seenFrom);
    if (last?.mixed && last.url === url) {
      problems[url] =
        `${item.name}: у товара варианты с разной ценой, сторож его больше не читает — ` +
        `замените ссылку Empress Mills на товар без вариантов разной цены или уберите её`;
      continue;
    }
    let reading = readings.get(url);
    if (!reading) {
      if (readings.size >= MAX_PAGES || elapsed() > READ_BUDGET_MS) {
        // Read next time, first in the queue; only a list too long to be read within two weeks is a fault
        const read = Date.parse(offer.seenAt ?? "");
        if (!read || now.getTime() - read > UNREAD_TOO_LONG_DAYS * DAY) unread.add(url);
        unlooked.add(url);
        continue;
      }
      if (readings.size > 0) await pause(GAP_MS);
      try {
        reading = empressMillsPrices(await page(url));
      } catch (error) {
        reading = { error: messageOf(error) };
      }
      readings.set(url, reading);
    }
    // A page that no longer says its price changed its layout: Safar's to look at, not Kristina's
    if ("error" in reading) {
      problems[url] = reading.error;
      continue;
    }
    if (!reading.ok) {
      problems[url] = reading.why;
      // Remembered on the offer: should one option sell out later, the rest must not pass for hers
      if (reading.mixed) pending.set(item._id, [...(pending.get(item._id) ?? []), { key: offer._key, set: { seenFrom: `${url}#mixed` } }]);
      continue;
    }
    const unit = priceFor(reading.prices, offer.pack);
    const from = reading.options ? `${url}#options=${reading.options}` : url;
    // The same product as last time: a price to compare with. Anything else is read afresh
    const sameThing = sameProduct(offer.seenFrom, url, reading.options);
    const seen = sameThing && offer.seenPack === offer.pack ? offer.seenUnitPrice : null;
    // Read afresh, the page must agree with the list's price: a mix-up is not news
    if (!sameThing && typeof offer.price === "number" && offer.price > 0 && Math.abs(unit * offer.pack - offer.price) > offer.price * FIRST_READING_DRIFT) {
      problems[url] =
        `${item.name}: на сайте ${unitWord(item.unit, offer.pack)} стоят £${round2(unit * offer.pack).toFixed(2)}, в списке £${offer.price.toFixed(2)} — ` +
        `проверьте «Сколько единиц в покупке», «Цена считается» и вариант товара; пока не исправлено, цена не обновляется`;
      continue;
    }
    const news = newsOf(unit, seen, item.myPrice, offer.seenYours);
    if (news) finds.push({ item, offer, news, itemId: item._id, key: offer._key });
    // The list keeps today's price for the same buy, so the Studio is never out of date
    const fields: Partial<SupplyOffer> = {
      seenUnitPrice: Math.round(unit * 10_000) / 10_000,
      seenAt: now.toISOString(),
      seenPack: offer.pack,
      seenTiers: tiersText(reading.prices, item.unit),
      seenFrom: from,
      seenYours: typeof item.myPrice === "number" && item.myPrice > 0 ? item.myPrice : null,
      price: round2(unit * offer.pack),
    };
    Object.assign(offer, fields);
    pending.set(item._id, [...(pending.get(item._id) ?? []), { key: offer._key, set: fields }]);
  }

  // Both messages are made before anything is sent: a fault in making one is not Telegram's refusal
  const digestWanted = items.length > 0 && digestDue(state, now);
  let newsText: string | null = null;
  let digestText: string | null = null;
  try {
    newsText = finds.length ? supplyNewsMessage(finds) : null;
    digestText = digestWanted ? supplyDigest(items, now) : null;
  } catch (error) {
    problems.message = `сообщение не собралось: ${messageOf(error)}`;
  }

  let sent = 0;
  let refused = false;
  /** A chat that did not get it is a fault; one that cannot pass by itself, Safar hears of at once */
  const fault = (why: string[], nobody: boolean) => {
    const urgentNow = why.some((one) => WILL_NOT_PASS.test(one));
    problems.telegram =
      `${nobody ? "ни один чат не получил" : "не во все чаты"}: ${why.join("; ")}` +
      (urgentNow ? " — проверьте, не заблокирован ли бот в чате; отметка сойдёт со следующим сообщением сторожа, когда его получат все чаты" : "");
    if (urgentNow) urgent.add("telegram");
  };
  /**
   * Told when every chat got it. A chat that missed it for a passing reason
   * (a timeout, Telegram busy) gets it again next Monday, and so does the
   * other; a chat that refuses for good (the bot blocked, the chat gone) would
   * make that every Monday — so the message counts as told, and Safar hears
   * of the chat at once.
   */
  const send = async (text: string): Promise<boolean> => {
    try {
      const answer = await telegram!(text);
      const failed = answer && Array.isArray(answer.failed) ? answer.failed : [];
      sent++;
      if (!failed.length) return true;
      fault(failed, false);
      refused = true;
      return failed.every((why) => WILL_NOT_PASS.test(why));
    } catch (error) {
      console.error("Supplies watch: Telegram refused:", messageOf(error));
      fault([messageOf(error)], true);
      refused = true;
      return false;
    }
  };
  const newsTold = Boolean(telegram && newsText && (await send(newsText)));
  const digestTold = Boolean(telegram && digestText && (await send(digestText)));
  // Nothing to send this week: whether every chat takes the bot's messages is not known, and the old word stands
  if (!(telegram && (newsText || digestText))) unlooked.add("telegram");
  if (unread.size) problems.unread = `${unread.size} стр. Empress Mills не проверялись дольше ${UNREAD_TOO_LONG_DAYS} дней: в списке больше, чем помещается в один запуск`;

  // Written after telling: a fall nobody was told of keeps its old price as the
  // one to beat, so next Monday it is news again rather than lost
  const untold = new Set(newsTold ? [] : finds.map((find) => `${find.itemId}/${find.key}`));
  for (const [id, updates] of pending) {
    try {
      await save(
        id,
        updates.map(({ key, set }) => ({
          key,
          set: untold.has(`${id}/${key}`) ? Object.fromEntries(Object.entries(set).filter(([field]) => !BASELINE.includes(field))) : set,
        }))
      );
    } catch (error) {
      problems[`save:${id}`] = `не записалось в Studio: ${messageOf(error)}`;
    }
  }

  // The mark: each problem keeps the run it was first met on; met again a Monday later, it reaches Safar
  const before = new Map((Array.isArray(state?.problems) ? state.problems : []).filter((p) => p && typeof p.key === "string").map((p) => [p.key, p]));
  const at = now.toISOString();
  const marked: SupplyProblem[] = [
    ...Object.entries(problems).map(([key, why]) => ({
      _key: keyFor(key),
      key,
      why,
      since: before.get(key)?.since ?? at,
      lastMet: at,
      ...(urgent.has(key) ? { urgent: true } : {}),
    })),
    ...[...unlooked].flatMap((key) => (before.has(key) && !(key in problems) ? [before.get(key)!] : [])),
  ];
  try {
    await mark({ ranAt: now.toISOString(), problems: marked, ...(digestTold ? { digestAt: now.toISOString() } : {}) });
  } catch (error) {
    problems[STATE_ID] = messageOf(error);
  }

  return { read: readings.size, news: finds.length, digest: digestWanted, telegram: !telegram ? "unconfigured" : refused ? "failed" : sent, problems };
}
