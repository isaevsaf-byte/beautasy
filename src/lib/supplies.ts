/**
 * «Где брать мини-опт» (16.10.2026): where Kristina can buy what she sews
 * with by the roll and the box — more than a retail card, less than a
 * pallet — and a weekly look at whether any of it got cheaper.
 *
 * What the research found, and why this is a list first and a watch second:
 * the savings are real and open to anyone, Ltd or not — 5 cm pencil tape at
 * Merrick & Day's 50-metre rate is about a ninth of the retail price, 25 mm
 * elastic by the 25-metre roll about half — but prices like these move a
 * few times a year. Knowing where to buy is most of the gain. So the Studio
 * keeps the list (each thing, its shops, what a mid-size buy costs per unit
 * with VAT, since she cannot reclaim VAT), and on Mondays the site re-reads
 * the prices it may read and says only what moved.
 *
 * It reads only what a shop lets a program read. Empress Mills publishes its
 * volume prices in its product pages and its robots.txt allows those pages;
 * that is the one shop read automatically. Thread & Trimmings and Kleins
 * forbid robots in their terms, Morplan answers programs with 403, Amazon's
 * and eBay's terms forbid scraping — they stay in the list as links she
 * opens. For eBay's job lots each item carries a ready search to save in
 * the eBay app, which then sends her its own alerts.
 *
 * Pure: the Studio, the weekly run (@/lib/supplyRun) and the tests read it.
 */

export type SupplyUnit = "metre" | "piece" | "thousandMetres";

export const SUPPLY_UNITS: readonly { value: SupplyUnit; title: string; short: string }[] = [
  { value: "metre", title: "за метр", short: "м" },
  { value: "piece", title: "за штуку", short: "шт" },
  { value: "thousandMetres", title: "за 1000 м нитки", short: "1000 м" },
];

export const SUPPLY_GROUPS = [
  { value: "curtains", title: "Шторы" },
  { value: "elastic", title: "Резинки" },
  { value: "thread", title: "Нитки" },
  { value: "zips", title: "Молнии" },
  { value: "other", title: "Другое" },
] as const;
export type SupplyGroup = (typeof SUPPLY_GROUPS)[number]["value"];

export interface SupplyOffer {
  _key: string;
  shop: string;
  url: string;
  /** How many units this buy is: 25 for a 25-metre roll, 1000 for a box of hooks, 5 for a 5000 m cone */
  pack: number;
  /** What that buy costs, £, with VAT */
  price: number;
  /** Delivery, minimums, trade terms — in Russian */
  note?: string;
  /**
   * Written by the weekly run, null until then (as Sanity returns a field
   * that is not there): the unit price it last read, with VAT, when, for
   * which size of buy, and the shop's volume prices as it read them
   */
  seenUnitPrice?: number | null;
  seenAt?: string | null;
  seenPack?: number | null;
  seenTiers?: string | null;
  /** The page and, for a product sold in options, which options it listed — a different one is read afresh */
  seenFrom?: string | null;
  /** «Сколько плачу сейчас» at that reading — changed since, and a price well under it is news again */
  seenYours?: number | null;
}

export interface SupplyItem {
  _id: string;
  name: string;
  group: SupplyGroup;
  /** What exactly, in the words a shop or eBay uses */
  spec: string;
  unit: SupplyUnit;
  /** What she pays now per unit, £ — hers to fill in; a find is measured against it */
  myPrice?: number | null;
  offers: SupplyOffer[];
  note?: string;
}

/**
 * £ per unit, with VAT — or null when the buy has no price yet. The Studio
 * saves as she types, so a half-filled offer reaches here with nulls; a
 * missing price is not a free one.
 */
export function unitPrice(offer: Pick<SupplyOffer, "pack" | "price">): number | null {
  const { pack, price } = offer as { pack: unknown; price: unknown };
  return typeof pack === "number" && pack > 0 && typeof price === "number" && price > 0 ? price / pack : null;
}

const filled = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** An offer whole enough to send her to: a shop, a link, a size of buy and its price */
export function listable(offer: SupplyOffer): boolean {
  return filled(offer.shop) && filled(offer.url) && /^https:\/\//.test(offer.url) && unitPrice(offer) !== null;
}

/** "£0.55/м", "2.2p/шт" */
export function perUnit(price: number, unit: SupplyUnit): string {
  const short = SUPPLY_UNITS.find((u) => u.value === unit)?.short ?? "";
  return price < 0.1 ? `${(price * 100).toFixed(1)}p/${short}` : `£${price.toFixed(2)}/${short}`;
}

/** The cheapest buy per unit in the list */
export function bestOffer(item: Pick<SupplyItem, "offers">): SupplyOffer | null {
  let best: SupplyOffer | null = null;
  for (const offer of item.offers) {
    const price = unitPrice(offer);
    if (price !== null && (!best || price < (unitPrice(best) ?? Infinity))) best = offer;
  }
  return best;
}

/**
 * An eBay search for job lots of this thing: in the UK, Buy It Now, cheapest
 * with postage first. Opened in the eBay app and saved with notifications on,
 * eBay itself tells her when a new lot is listed — no program reads eBay.
 */
export function ebaySearchUrl(words: string): string {
  const params = new URLSearchParams({ _nkw: words, LH_BIN: "1", LH_PrefLoc: "1", _sop: "15" });
  return `https://www.ebay.co.uk/sch/i.html?${params}`;
}

// ─── Reading a shop's own prices

/** The shops the weekly run may read, by host; every other offer is a link she opens */
export const WATCHED_HOSTS = ["www.empressmills.co.uk"] as const;

export function watched(url: string): boolean {
  try {
    return (WATCHED_HOSTS as readonly string[]).includes(new URL(url).host);
  } catch {
    return false;
  }
}

export interface ShopPrices {
  /** One unit, £ with VAT */
  single: number;
  /** "From 10, £0.85 each" — £ per unit with VAT, smallest quantity first */
  tiers: { qty: number; price: number }[];
}

/**
 * What a page said: its prices and, for a product sold in options, which
 * options it listed ("" for a plain product) — or why it cannot be trusted,
 * for Safar, in Russian
 */
export type ShopReading = { ok: true; prices: ShopPrices; options: string } | { ok: false; why: string; mixed?: true };

/** Said of a product whose options cost differently: which one she buys, the page cannot tell */
export const MIXED_OPTIONS = "у товара варианты с разной ценой — смотреть вручную";

const CHANGED = "на странице не нашлась цена — сменилась вёрстка?";

/** The JSON object that follows `marker`, found by counting braces outside strings — a regex cannot */
function objectAfter(html: string, marker: string): unknown {
  const at = html.indexOf(marker);
  const start = at < 0 ? -1 : html.indexOf("{", at + marker.length);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, k + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function tiersOf(raw: unknown): { qty: number; price: number }[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((t): t is { qty: number; price: number } => typeof t?.qty === "number" && typeof t?.price === "number" && t.qty > 0 && t.price > 0)
    .map(({ qty, price }) => ({ qty, price }))
    .sort((a, b) => a.qty - b.qty);
}

/**
 * Empress Mills (Magento): the product's price and its volume prices, with
 * VAT. A product sold in options — colours, lengths — carries a price per
 * option: when every option costs the same, that is the price; when they
 * differ (a 56 cm zip is not a 20 cm one) the page cannot say which one she
 * buys, and nothing is read. A page without its price is a page that changed.
 * Never a guess.
 */
export function empressMillsPrices(html: string): ShopReading {
  const options = objectAfter(html, '"optionPrices":');
  if (options !== undefined) {
    if (!options || typeof options !== "object") return { ok: false, why: CHANGED };
    const table = options as Record<string, { finalPrice?: { amount?: unknown }; tierPrices?: unknown }>;
    const shapes = Object.values(table).map((option) => ({
      single: Number(option?.finalPrice?.amount),
      tiers: tiersOf(option?.tierPrices),
    }));
    if (!shapes.length || shapes.some((s) => !(s.single > 0) || !s.tiers)) return { ok: false, why: CHANGED };
    const first = JSON.stringify(shapes[0]);
    if (shapes.some((s) => JSON.stringify(s) !== first)) return { ok: false, why: MIXED_OPTIONS, mixed: true };
    // Options sold out drop off the page: the ones listed are part of what was read
    return { ok: true, prices: { single: shapes[0].single, tiers: shapes[0].tiers! }, options: Object.keys(table).sort().join(",") };
  }
  const single = Number(/itemprop="price" content="([\d.]+)"/.exec(html)?.[1]);
  const tiersText = /"tierPrices":(\[[^\]]*\])/.exec(html)?.[1];
  // Volume prices that are there but cannot be read mean the page changed
  if (!(single > 0) || (!tiersText && html.includes('"tierPrices":'))) return { ok: false, why: CHANGED };
  let tiers: { qty: number; price: number }[] | null = [];
  try {
    tiers = tiersText ? tiersOf(JSON.parse(tiersText)) : [];
  } catch {
    tiers = null;
  }
  return tiers ? { ok: true, prices: { single, tiers }, options: "" } : { ok: false, why: CHANGED };
}

/** "1 м £1.00 · от 10 м £0.85 · от 25 м £0.55" — the shop's steps, as the Studio shows them */
export function tiersText(prices: ShopPrices, unit: SupplyUnit): string {
  const short = SUPPLY_UNITS.find((u) => u.value === unit)?.short ?? "";
  const steps = prices.tiers.map((t) => `от ${t.qty} ${short} ${perUnit(t.price, unit).split("/")[0]}`);
  return [`1 ${short} ${perUnit(prices.single, unit).split("/")[0]}`, ...steps].join(" · ");
}

/** £ per unit when buying `pack` units: the best volume price that `pack` reaches */
export function priceFor(prices: ShopPrices, pack: number): number {
  return prices.tiers.filter((t) => t.qty <= pack).reduce((best, t) => Math.min(best, t.price), prices.single);
}

// ─── Whether a change is worth a message

/** A fall smaller than this is noise, not news */
export const WORTH_SAYING = 0.1;
/** A buy this much below what she pays now is worth telling her even if nothing moved */
export const MUCH_CHEAPER = 0.3;

export type SupplyNews =
  | { kind: "cheaper"; was: number; now: number }
  | { kind: "belowYours"; now: number; yours: number };

const positive = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

/**
 * What one reading means for her. The first reading is the baseline: a price
 * is news only when it falls by a tenth or more since the last, or when it
 * comes in well under what she pays now — the first time it does, or the
 * first time since she changed what she pays (`seenYours`, hers at the last
 * reading). A rise is written down, not announced.
 */
export function newsOf(
  now: number,
  seen: number | null | undefined,
  yours: number | null | undefined,
  seenYours?: number | null
): SupplyNews | null {
  // Sanity hands back null for a field never written: missing, not nought
  const was = positive(seen);
  const mine = positive(yours);
  const below = (price: number) => mine !== undefined && price <= mine * (1 - MUCH_CHEAPER);
  const hersChanged = positive(seenYours) !== mine;
  if (below(now) && (was === undefined || !below(was) || hersChanged)) return { kind: "belowYours", now, yours: mine! };
  if (was !== undefined && now <= was * (1 - WORTH_SAYING)) return { kind: "cheaper", was, now };
  return null;
}

// ─── What she reads in Telegram (HTML parse mode: only <b>, <i>, <a>)

/** Safe for Telegram's HTML, inside text or a link's quotes; a missing value is an empty one */
function telegramEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface SupplyFind {
  item: Pick<SupplyItem, "name" | "unit">;
  offer: Pick<SupplyOffer, "shop" | "url" | "pack">;
  news: SupplyNews;
}

export const unitWord = (unit: SupplyUnit, pack: number) =>
  unit === "metre" ? `${pack} м` : unit === "thousandMetres" ? `${pack * 1000} м` : `${pack} шт`;

export function supplyFindLine({ item, offer, news }: SupplyFind): string {
  const price = perUnit(news.now, item.unit);
  const why =
    news.kind === "cheaper"
      ? `было ${perUnit(news.was, item.unit)}`
      : `вы платите ${perUnit(news.yours, item.unit)}`;
  return `• <b>${telegramEscape(item.name)}</b> — ${telegramEscape(offer.shop)}: ${price} при покупке ${unitWord(item.unit, offer.pack)} (${why}) · <a href="${telegramEscape(offer.url)}">открыть</a>`;
}

export function supplyNewsMessage(finds: SupplyFind[]): string {
  return `🧵 <b>Мини-опт недели</b>\n${finds.map(supplyFindLine).join("\n")}\n\nЦены с VAT, без доставки. Весь список — в Studio → «Магазин» → «Где брать мини-опт».`;
}

/** What Telegram counts: the text with its tags taken out and its escapes read as one character */
function shownLength(html: string): number {
  return html.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot);/g, "x").length;
}

/** Telegram refuses a message over 4096 characters: whole lines only, with room to spare */
const TELEGRAM_ROOM = 3800;

/** A price the weekly run is meant to keep, unconfirmed this long, is not offered as today's */
const CONFIRMED_WITHIN_DAYS = 21;

/**
 * Once a month, and on the very first run: the list itself, the cheapest buy
 * for each thing, so the place to buy is in her chat, not only in the Studio.
 * Made of whole lines — a message cut inside a link is refused whole — and
 * when the list outgrows one message, the rest are named as waiting in the Studio.
 * Given `now`, a shop the run reads counts only with a price it confirmed lately.
 */
export function supplyDigest(items: SupplyItem[], now?: Date): string {
  const confirmed = (offer: SupplyOffer) => {
    if (!now || !watched(offer.url)) return true;
    const at = Date.parse(offer.seenAt ?? "");
    return at > 0 && now.getTime() - at <= CONFIRMED_WITHIN_DAYS * 24 * 60 * 60 * 1000;
  };
  const head = "🧵 <b>Где брать мини-опт</b> — дешевле всего за единицу, с VAT, без доставки:";
  const foot = [
    "",
    "«eBay» — готовый поиск партий: откройте в приложении eBay и нажмите «Save this search» — eBay сам напишет, когда появится новая.",
    "Весь список с другими магазинами — в Studio → «Магазин» → «Где брать мини-опт».",
  ];
  const lines = items
    .map((item) => {
      // Half-filled things wait in the Studio until they are whole
      if (!filled(item.name)) return null;
      const best = bestOffer({ offers: (item.offers ?? []).filter((offer) => listable(offer) && confirmed(offer)) });
      const price = best ? unitPrice(best) : null;
      if (!best || price === null) return null;
      const unit = SUPPLY_UNITS.some((u) => u.value === item.unit) ? item.unit : "piece";
      const ebay = filled(item.spec) ? ` · <a href="${telegramEscape(ebaySearchUrl(item.spec.trim()))}">eBay</a>` : "";
      return `• <b>${telegramEscape(item.name)}</b>: ${perUnit(price, unit)} — ${telegramEscape(best.shop)}, ${unitWord(unit, best.pack)} · <a href="${telegramEscape(best.url)}">открыть</a>${ebay}`;
    })
    .filter((line): line is string => line !== null);
  const kept: string[] = [];
  for (const line of lines) {
    if (shownLength([head, ...kept, line, "…и ещё 99 — в Studio", ...foot].join("\n")) > TELEGRAM_ROOM) break;
    kept.push(line);
  }
  const more = lines.length - kept.length;
  return [head, ...kept, ...(more ? [`…и ещё ${more} — в Studio.`] : []), ...foot].join("\n");
}

// ─── The list as it starts (16.10.2026). Prices with VAT, as published that
// day; Merrick & Day's are its price list's, which excludes VAT, ×1.2. The
// weekly run keeps Empress Mills' current; the rest are checked by hand.

const md = (path: string) => `https://www.merrick-day.com/acatalog/${path}`;
const MD_NOTE = "Merrick & Day: без минимума, trade-скидка после первой покупки. Доставка Royal Mail до 2 кг £6.65, курьер £10.80 (с VAT).";

export const SUPPLY_SEED: readonly SupplyItem[] = [
  {
    _id: "supply-tape-pencil-75",
    name: "Шторная лента «карандаш» 75 мм",
    group: "curtains",
    spec: "pencil pleat curtain tape 3 inch 50m roll",
    unit: "metre",
    offers: [
      { _key: "md", shop: "Merrick & Day", url: md("Heading_Tapes.html"), pack: 50, price: 18.6, note: `T3WP, от 50 м (до 50 м — £0.47/м). ${MD_NOTE}` },
    ],
  },
  {
    _id: "supply-tape-pencil-50",
    name: "Шторная лента «карандаш» 50 мм",
    group: "curtains",
    spec: "pencil pleat curtain tape 2 inch 50m",
    unit: "metre",
    offers: [
      { _key: "md", shop: "Merrick & Day", url: md("Heading_Tapes.html"), pack: 50, price: 10.8, note: `T2CP, от 50 м. ${MD_NOTE}` },
      { _key: "em", shop: "Empress Mills", url: "https://www.empressmills.co.uk/2inch-curtain-tape", pack: 10, price: 24, note: "Доставка £3.45. Цены за 1 м и от 10 / 50 м сторож обновляет сам." },
    ],
  },
  {
    _id: "supply-curtain-hooks",
    name: "Крючки пластиковые для штор",
    group: "curtains",
    spec: "plastic curtain hooks box 1000",
    unit: "piece",
    offers: [
      { _key: "md-box", shop: "Merrick & Day", url: md("Merrick___Day_Curtain_Hooks__317.html"), pack: 1000, price: 21.56, note: `Коробка 1000 шт. ${MD_NOTE}` },
      { _key: "md-bag", shop: "Merrick & Day", url: md("Merrick___Day_Curtain_Hooks__317.html"), pack: 50, price: 2.23, note: "Пакет 50 шт." },
    ],
  },
  {
    _id: "supply-lining-137",
    name: "Подкладка для штор 137 см",
    group: "curtains",
    spec: "curtain lining poly cotton 137cm",
    unit: "metre",
    offers: [
      { _key: "md-10", shop: "Merrick & Day", url: md("Lining___Interlining.html"), pack: 10, price: 22.8, note: `LNG110IV, до 49 м £2.28/м, от 50 м £1.69/м, от 150 м £1.54/м. Рулоны тяжёлые — курьер £10.80. ${MD_NOTE}` },
    ],
  },
  {
    _id: "supply-bump",
    name: "Прокладка bump для штор",
    group: "curtains",
    spec: "bump interlining curtain",
    unit: "metre",
    offers: [
      { _key: "md", shop: "Merrick & Day", url: md("Lining___Interlining.html"), pack: 10, price: 79.8, note: `BUMP410, £7.98/м; от 40 м £5.92/м. ${MD_NOTE}` },
    ],
  },
  {
    _id: "supply-elastic-25",
    name: "Резинка 25 мм",
    group: "elastic",
    spec: "25mm elastic 25m roll",
    unit: "metre",
    offers: [
      { _key: "em", shop: "Empress Mills", url: "https://www.empressmills.co.uk/25mm-classic-elastic", pack: 25, price: 13.75, note: "Classic, белая или чёрная. Доставка £3.45." },
      { _key: "jc", shop: "Jaycotts", url: "https://www.jaycotts.co.uk/products/25m-roll-of-white-elastic-25mm-wide", pack: 25, price: 12.99, note: "Рулон 25 м. Бесплатная доставка от £25, иначе £3.50." },
    ],
  },
  {
    _id: "supply-elastic-19",
    name: "Резинка 19 мм",
    group: "elastic",
    spec: "19mm elastic 25m roll",
    unit: "metre",
    offers: [
      { _key: "jc", shop: "Jaycotts", url: "https://www.jaycotts.co.uk/products/25m-rolls-of-elastic-19mm-wide", pack: 25, price: 11.99, note: "Рулон 25 м, белая или чёрная. Бесплатная доставка от £25." },
    ],
  },
  {
    _id: "supply-elastic-6-soft",
    name: "Мягкая резинка 6 мм (скранчи)",
    group: "elastic",
    spec: "6mm soft elastic 100m",
    unit: "metre",
    offers: [
      { _key: "em-10", shop: "Empress Mills", url: "https://www.empressmills.co.uk/6mm-flat-soft-elastic", pack: 10, price: 3.5, note: "Белая. Доставка £3.45; от 100 м дешевле — ступени в «Ценах магазина»." },
      { _key: "jc-125", shop: "Jaycotts", url: "https://www.jaycotts.co.uk/products/prym-super-soft-elastic-bulk-125m-roll", pack: 125, price: 20, note: "Prym Super Soft 6,5 мм, рулон 125 м. 🚨 Резинка стареет — брать, если уйдёт за полгода." },
    ],
  },
  {
    _id: "supply-thread-cones",
    name: "Нитки на конусах 5000 м (оверлок)",
    group: "thread",
    spec: "overlocking thread cone 5000m",
    unit: "thousandMetres",
    offers: [
      { _key: "cm", shop: "Croft Mill", url: "https://www.croftmill.co.uk/products/coats-cometa-overlocking-thread-cone-natural-5000m", pack: 5, price: 4, note: "Coats Cometa 5000 м, много цветов. Для оверлока." },
      { _key: "wg", shop: "William Gee", url: "https://www.williamgee.co.uk/shop/coats-drima-t-120-thread-5000m-cones-black-overstock/", pack: 5, price: 7.99, note: "Coats Drima-T 120 — тонкая, для оверлока и шитья. Только чёрная, остатки — может закончиться. Trade-аккаунт для sole trader: −3% от £150, −5% от £250." },
    ],
  },
  {
    _id: "supply-zips-cushion",
    name: "Молнии для подушек №3",
    group: "zips",
    spec: "cushion zips no 3 pack of 100",
    unit: "piece",
    offers: [
      { _key: "tt", shop: "Thread & Trimmings", url: "https://threadandtrimmings.co.uk/products/cushion-zips-sizes-12-to-22-bulk-100-50-25-and-10s", pack: 10, price: 1.44, note: "Цена за молнию одна в пачке 10, 25, 50 и 100 — брать сколько нужно. 30 см — 14.4p, 56 см — 21.6p; чёрный, серый, кремовый, бежевый. Бесплатная доставка от £30. Перед заказом сверить цену в корзине." },
    ],
  },
  {
    _id: "supply-zips-invisible",
    name: "Потайные молнии YKK",
    group: "zips",
    spec: "YKK invisible zip pack",
    unit: "piece",
    offers: [
      { _key: "wg-bundle", shop: "William Gee", url: "https://www.williamgee.co.uk/shop/ykk-invisible-zips-bundle/", pack: 10, price: 20.99, note: "10 популярных цветов: £20.99 за 20/23 см, £29.99 за 56 см." },
      { _key: "wg-overstock", shop: "William Gee", url: "https://www.williamgee.co.uk/shop/ykk-invisible-zips-chc36-closed-ended-overstock-colours/", pack: 10, price: 13.37, note: "Остатки YKK CHC36, 10 шт одного цвета и длины: от £13.37 (16 см) до £18.23 (38 см); 56 см для платья нет. Распродажа — может закончиться." },
    ],
  },
];
