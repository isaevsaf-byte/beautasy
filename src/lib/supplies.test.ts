import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SUPPLY_GROUPS,
  SUPPLY_SEED,
  SUPPLY_UNITS,
  WATCHED_HOSTS,
  bestOffer,
  ebaySearchUrl,
  empressMillsPrices,
  newsOf,
  perUnit,
  priceFor,
  supplyDigest,
  supplyNewsMessage,
  tiersText,
  type SupplyOffer,
  unitPrice,
  watched,
  type ShopPrices,
  type SupplyItem,
} from "./supplies";
import { STATE_ID, SUPPLY_QUERY, digestDue, runSupplyWatch, type SupplyProblem, type SupplyRunDeps, type SupplyWatchState } from "./supplyRun";

/**
 * «Где брать мини-опт» (16.10.2026): the list she starts with, the one shop
 * read by program, and what is worth a message. The prices are the real
 * pages' (supplies.fixtures.json).
 */

const PAGES = JSON.parse(readFileSync(join(__dirname, "supplies.fixtures.json"), "utf8")) as Record<string, string>;

/** The prices a page gave, or a failed test saying why it gave none */
function pricesOf(html: string): ShopPrices {
  const reading = empressMillsPrices(html);
  assert.ok(reading.ok, reading.ok ? "" : reading.why);
  return reading.prices;
}

test("Empress Mills' own prices are read from its price box: one unit, then by volume, with VAT", () => {
  assert.deepEqual(pricesOf(PAGES.elastic6), { single: 0.65, tiers: [{ qty: 10, price: 0.35 }, { qty: 100, price: 0.25 }, { qty: 250, price: 0.22 }] });
  assert.deepEqual(pricesOf(PAGES.elastic10), { single: 2.6, tiers: [] });
  // A step without a quantity or a price is no step
  assert.deepEqual(pricesOf('<meta itemprop="price" content="1" />"tierPrices":[{"qty":10,"price":0},{"qty":0,"price":0.4},{"qty":25,"price":0.5}]').tiers, [{ qty: 25, price: 0.5 }]);
  // A page that no longer says its price is a page that changed: nothing, never a guess
  for (const html of [
    "<html>Sorry, we are down for maintenance</html>",
    '<meta itemprop="price" content="1" />"tierPrices":[{broken',
    '<meta itemprop="price" content="0" />',
    '"optionPrices":{"1":{"finalPrice":{"amount":1},"tierPrices":[]}',
    '"optionPrices":{}',
    '"optionPrices":{"1":{"tierPrices":[]}}',
  ]) {
    const reading = empressMillsPrices(html);
    assert.ok(!reading.ok && /сменилась вёрстка/.test(reading.why), html);
  }
});

test("a product sold in options is read only when every option costs the same", () => {
  // White or black elastic: one price, one set of volume steps — read through the option table
  assert.deepEqual(pricesOf(PAGES.elastic25), { single: 1, tiers: [{ qty: 10, price: 0.85 }, { qty: 25, price: 0.55 }] });
  // Which options were listed is part of the reading: one sold out, and the page is a different page
  const elastic = empressMillsPrices(PAGES.elastic25);
  assert.ok(elastic.ok && /^\d+(,\d+)+$/.test(elastic.options), elastic.ok ? elastic.options : "");
  const plain = empressMillsPrices(PAGES.elastic6);
  assert.ok(plain.ok && plain.options === "");
  // Zips by length: a 20 cm and a 56 cm cost differently — the page cannot say which she buys
  const zips = empressMillsPrices(PAGES.zipsClosedEnd);
  assert.deepEqual(zips, { ok: false, why: "у товара варианты с разной ценой — смотреть вручную", mixed: true });
  // Same price, different steps: still not one price
  const steps = (qty: number) => `{"finalPrice":{"amount":1},"tierPrices":[{"qty":${qty},"price":0.5}]}`;
  assert.equal(empressMillsPrices(`"optionPrices":{"1":${steps(10)},"2":${steps(25)}}`).ok, false);
  // A brace or quote inside a label does not confuse where the table ends
  const tricky = `"optionPrices":{"1":{"label":"a } \\" {","finalPrice":{"amount":2},"tierPrices":[]}} trailing }`;
  assert.deepEqual(pricesOf(tricky), { single: 2, tiers: [] });
});

test("the shop's steps as the Studio shows them", () => {
  assert.equal(tiersText(pricesOf(PAGES.elastic25), "metre"), "1 м £1.00 · от 10 м £0.85 · от 25 м £0.55");
  assert.equal(tiersText({ single: 0.05, tiers: [{ qty: 100, price: 0.022 }] }, "piece"), "1 шт 5.0p · от 100 шт 2.2p");
});

test("the price for a buy is the best volume price it reaches", () => {
  const elastic = pricesOf(PAGES.elastic25);
  assert.equal(priceFor(elastic, 5), 1, "under ten metres: the single price");
  assert.equal(priceFor(elastic, 10), 0.85);
  assert.equal(priceFor(elastic, 24), 0.85);
  assert.equal(priceFor(elastic, 25), 0.55, "a 25-metre roll");
  assert.equal(priceFor(pricesOf(PAGES.tape2in), 50), 1.95);
  assert.equal(unitPrice({ pack: 1000, price: 21.56 }), 0.02156);
  assert.equal(perUnit(0.55, "metre"), "£0.55/м");
  assert.equal(perUnit(0.02156, "piece"), "2.2p/шт");
  assert.equal(perUnit(0.8, "thousandMetres"), "£0.80/1000 м");
});

test("news is a fall of a tenth, or a first price well under hers; a rise and the first reading are not", () => {
  assert.equal(newsOf(0.55, undefined, undefined), null, "the first reading is the baseline");
  assert.deepEqual(newsOf(0.49, 0.55, undefined), { kind: "cheaper", was: 0.55, now: 0.49 });
  assert.equal(newsOf(0.5, 0.55, undefined), null, "9% is noise");
  assert.equal(newsOf(0.65, 0.55, undefined), null, "a rise is written down, not announced");
  // Under what she pays now by a third: told once, not every week
  assert.deepEqual(newsOf(0.55, undefined, 1), { kind: "belowYours", now: 0.55, yours: 1 });
  assert.equal(newsOf(0.55, 0.55, 1, 1), null, "told already, at this price of hers");
  assert.equal(newsOf(0.75, undefined, 1), null, "a quarter cheaper is not enough to write");
  // Sanity hands back null for a field never written: missing, not a price of nought
  assert.equal(newsOf(0.55, null, null), null);
  assert.deepEqual(newsOf(0.55, null, 1), { kind: "belowYours", now: 0.55, yours: 1 });
  assert.equal(newsOf(0.55, 0, 0), null);
  assert.deepEqual(newsOf(0.55, 0, 1), { kind: "belowYours", now: 0.55, yours: 1 }, "a price of nought was never a reading");
  // She wrote what she pays after the first reading: the price under it is news once, then not again
  assert.deepEqual(newsOf(0.55, 0.55, 1, null), { kind: "belowYours", now: 0.55, yours: 1 });
  assert.equal(newsOf(0.55, 0.55, 1, 1), null);
  assert.deepEqual(newsOf(0.55, 0.55, 0.9, 1), { kind: "belowYours", now: 0.55, yours: 0.9 }, "she changed it: news again");
});

test("the starting list is whole: every thing has a shop, a price with VAT, a link, and words for eBay", () => {
  const ids = new Set<string>();
  for (const item of SUPPLY_SEED) {
    assert.ok(!ids.has(item._id), item._id);
    ids.add(item._id);
    assert.match(item._id, /^supply-[a-z0-9-]+$/);
    assert.ok(SUPPLY_GROUPS.some((g) => g.value === item.group), item.name);
    assert.ok(SUPPLY_UNITS.some((u) => u.value === item.unit), item.name);
    assert.ok(item.spec.length > 5 && /^[a-z0-9 ]+$/i.test(item.spec), `${item.name}: plain English words`);
    assert.ok(item.offers.length > 0, item.name);
    const keys = new Set(item.offers.map((o) => o._key));
    assert.equal(keys.size, item.offers.length, `${item.name}: one key per shop`);
    for (const offer of item.offers) {
      assert.match(offer.url, /^https:\/\//, `${item.name}: ${offer.shop}`);
      assert.ok(offer.pack > 0 && offer.price > 0, `${item.name}: ${offer.shop}`);
      // Mid-size, not a pallet: one buy is a few pounds to under three hundred
      assert.ok(offer.price < 300, `${item.name}: ${offer.shop} £${offer.price}`);
    }
  }
  // Merrick & Day publishes without VAT; the list carries it with: 50 m of 7.5 cm tape at 31p + VAT
  const tape = SUPPLY_SEED.find((i) => i._id === "supply-tape-pencil-75")!;
  assert.equal(tape.offers[0].price, Math.round(50 * 0.31 * 1.2 * 100) / 100);
  assert.equal(bestOffer(SUPPLY_SEED.find((i) => i._id === "supply-elastic-25")!)!.shop, "Jaycotts", "the cheaper roll leads");
});

test("only a shop that lets programs read it is read; the rest are links she opens", () => {
  assert.deepEqual([...WATCHED_HOSTS], ["www.empressmills.co.uk"]);
  assert.equal(watched("https://www.empressmills.co.uk/25mm-classic-elastic"), true);
  for (const url of [
    "https://threadandtrimmings.co.uk/products/cushion-zips", // terms forbid robots
    "https://kleinshaberdashery.co.uk/products/x", // terms forbid robots
    "https://www.morplan.com/x", // 403 to programs
    "https://www.ebay.co.uk/itm/1", // eBay's terms
    "https://www.amazon.co.uk/dp/1", // Amazon's terms
    "https://www.jaycotts.co.uk/products/x", // asks robots to sign their requests
    "not a url",
  ]) {
    assert.equal(watched(url), false, url);
  }
  assert.ok(SUPPLY_SEED.some((item) => item.offers.some((o) => watched(o.url))), "something is watched");
});

test("the eBay search is a UK, buy-now search, cheapest with postage first", () => {
  const url = new URL(ebaySearchUrl("25mm elastic 25m roll"));
  assert.equal(url.origin + url.pathname, "https://www.ebay.co.uk/sch/i.html");
  assert.deepEqual(Object.fromEntries(url.searchParams), { _nkw: "25mm elastic 25m roll", LH_BIN: "1", LH_PrefLoc: "1", _sop: "15" });
});

test("what she reads: the week's falls in a line each, and the list once a month — escaped, short enough for Telegram", () => {
  const item = { name: "Резинка <25> мм", unit: "metre" as const };
  const news = supplyNewsMessage([{ item, offer: { shop: "Empress & Co", url: "https://www.empressmills.co.uk/x?a=1&b=2", pack: 25 }, news: { kind: "cheaper", was: 0.62, now: 0.55 } }]);
  assert.match(news, /<b>Резинка &lt;25&gt; мм<\/b> — Empress &amp; Co: £0\.55\/м при покупке 25 м \(было £0\.62\/м\)/);
  assert.match(news, /href="https:\/\/www\.empressmills\.co\.uk\/x\?a=1&amp;b=2"/);
  const digest = supplyDigest([...SUPPLY_SEED]);
  for (const seed of SUPPLY_SEED) assert.ok(digest.includes(seed.name.replace(/</g, "&lt;")), seed.name);
  assert.doesNotMatch(digest, /и ещё/);
  assert.match(digest, /Save this search/);
  assert.match(digest, /Шторная лента «карандаш» 75 мм<\/b>: £0\.37\/м — Merrick &amp; Day, 50 м/);
});

test("a half-filled thing waits in the Studio: no price is not free, no link is not sent, no words is no eBay search", () => {
  const item = (offers: Partial<SupplyOffer>[], over: Partial<SupplyItem> = {}): SupplyItem => ({
    _id: "supply-x",
    name: "Резинка 19 мм",
    group: "elastic",
    spec: "19mm elastic",
    unit: "metre",
    offers: offers.map((o, k) => ({ _key: String(k), shop: "Jaycotts", url: "https://www.jaycotts.co.uk/x", pack: 25, price: 11.99, ...o }) as SupplyOffer),
    ...over,
  });
  // The Studio saves as she types: nulls arrive where fields are not filled yet
  const nul = null as unknown as string & number;
  assert.equal(unitPrice({ pack: 25, price: nul }), null, "no price is not free");
  assert.equal(unitPrice({ pack: 25, price: 0 }), null);
  assert.equal(unitPrice({ pack: nul, price: 3 }), null);
  const digest = supplyDigest([
    item([{ shop: "Market stall", url: nul, pack: 1000, price: 1 }, {}]),
    item([{ shop: nul, pack: 1000, price: 1 }, {}], { _id: "b", name: "Резинка 6 мм" }),
    item([{ price: nul, shop: "Kleins" }, {}], { _id: "c", name: "Резинка 10 мм" }),
    item([{}], { _id: "d", name: nul }),
    item([{}], { _id: "e", name: "Иголки", spec: nul }),
    item([{ url: 'https://www.jaycotts.co.uk/x?"><b>' }], { _id: "f", name: "Кавычка" }),
  ]);
  assert.match(digest, /Резинка 19 мм<\/b>: £0\.48\/м — Jaycotts/, "the stall without a link is not offered");
  assert.match(digest, /Резинка 6 мм<\/b>: £0\.48\/м — Jaycotts/);
  assert.match(digest, /Резинка 10 мм<\/b>: £0\.48\/м — Jaycotts/, "the offer without a price is not the cheapest");
  assert.doesNotMatch(digest, /null|undefined|0\.0p|<b><\/b>/);
  // A unit the Studio did not save is counted in pieces, never a crash
  assert.match(supplyDigest([item([{}], { unit: nul as unknown as "metre" })]), /£0\.48\/шт — Jaycotts, 25 шт/);
  // A find from a thing still without a name says nothing odd
  const find = supplyNewsMessage([{ item: { name: nul, unit: "metre" }, offer: { shop: nul, url: "https://www.empressmills.co.uk/x", pack: 25 }, news: { kind: "cheaper", was: 0.62, now: 0.55 } }]);
  assert.doesNotMatch(find, /null/);
  assert.match(digest, /Иголки<\/b>: [^\n]*открыть<\/a>$/m, "no eBay link without words to search");
  assert.match(digest, /x\?&quot;&gt;&lt;b&gt;"/, "a quote cannot close the link early");
  assert.equal((digest.match(/<b>/g) ?? []).length, (digest.match(/<\/b>/g) ?? []).length);
});

test("a list too long for one message is cut between lines, never inside a link", () => {
  const long: SupplyItem[] = Array.from({ length: 60 }, (_, k) => ({
    _id: `supply-${k}`,
    name: `Вещь номер ${k} с очень длинным названием & <подробностями>`,
    group: "other",
    spec: `a long english search phrase for thing number ${k}`,
    unit: "piece",
    offers: [{ _key: "a", shop: "Shop & Sons", url: `https://example.co.uk/products/${"x".repeat(40)}?id=${k}&a=1`, pack: 10, price: 3 }],
  }));
  const short: SupplyItem = { _id: "supply-z", name: "Иголки", group: "other", spec: "needles", unit: "piece", offers: [{ _key: "a", shop: "S", url: "https://s.co.uk", pack: 1, price: 1 }] };
  const digest = supplyDigest([...long, short]);
  assert.doesNotMatch(digest, /Иголки/, "the list is cut in its order: a short line at the end does not jump the queue");
  const shown = digest.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt);/g, "x");
  assert.ok(shown.length <= 4096, `${shown.length} characters reach Telegram`);
  assert.equal((digest.match(/<a /g) ?? []).length, (digest.match(/<\/a>/g) ?? []).length, "every link closed");
  assert.equal((digest.match(/<b>/g) ?? []).length, (digest.match(/<\/b>/g) ?? []).length);
  const kept = (digest.match(/^• /gm) ?? []).length;
  assert.ok(kept > 5 && kept < 60, `${kept}`);
  assert.match(digest, new RegExp(`…и ещё ${61 - kept} — в Studio\\.`));
  assert.match(digest, /Save this search/, "the end is kept");
});

/** The weekly run, against stand-ins: two items, one shop read by program */
const ELASTIC = "https://www.empressmills.co.uk/25mm-classic-elastic";
const TAPE = "https://www.empressmills.co.uk/2inch-curtain-tape";
const MONTH_SENT: SupplyWatchState = { ranAt: "2026-10-12T07:15:00Z", digestAt: "2026-10-05T07:15:00Z", problems: [] };

/** The page's own options, as the first reading would have written them */
function fromOf(html: string, url: string): string {
  const reading = empressMillsPrices(html);
  assert.ok(reading.ok);
  return reading.options ? `${url}#options=${reading.options}` : url;
}

function world(
  over: Partial<SupplyRunDeps> & {
    seen?: number;
    seenPack?: number;
    seenFrom?: string;
    seenYours?: number;
    mine?: number;
    was?: SupplyWatchState | null;
    price?: number;
    pack?: number;
  } = {}
) {
  const items: SupplyItem[] = [
    {
      _id: "supply-elastic-25",
      name: "Резинка 25 мм",
      group: "elastic",
      spec: "25mm elastic",
      unit: "metre",
      myPrice: over.mine ?? null,
      offers: [
        {
          _key: "em",
          shop: "Empress Mills",
          url: ELASTIC,
          pack: over.pack ?? 25,
          price: over.price ?? 13.75,
          seenUnitPrice: over.seen ?? null,
          seenAt: over.seen ? "2026-10-12T07:15:00Z" : null,
          seenPack: over.seen ? (over.seenPack ?? 25) : null,
          seenTiers: null,
          seenFrom: over.seen ? (over.seenFrom ?? fromOf(PAGES.elastic25, ELASTIC)) : null,
          seenYours: over.seenYours ?? null,
        },
        { _key: "jc", shop: "Jaycotts", url: "https://www.jaycotts.co.uk/products/x", pack: 25, price: 12.99 },
      ],
    },
    {
      _id: "supply-tape",
      name: "Лента",
      group: "curtains",
      spec: "tape",
      unit: "metre",
      offers: [{ _key: "em", shop: "Empress Mills", url: TAPE, pack: 10, price: 24, seenAt: "2026-10-12T07:15:00Z", seenUnitPrice: 2.4, seenPack: 10, seenFrom: TAPE }],
    },
  ];
  const pages: string[] = [];
  const saved: { id: string; updates: { key: string; set: Record<string, unknown> }[] }[] = [];
  const marks: { ranAt: string; problems: SupplyProblem[]; digestAt?: string }[] = [];
  const telegrams: string[] = [];
  const pauses: number[] = [];
  const deps: SupplyRunDeps = {
    now: new Date("2026-10-19T07:15:00Z"), // the third Monday of the month
    elapsed: () => 0,
    items: async () => structuredClone(items),
    page: async (url) => {
      pages.push(url);
      return url === TAPE ? PAGES.tape2in : PAGES.elastic25;
    },
    save: async (id, updates) => void saved.push({ id, updates }),
    // This month's list already went out, unless the stand-in says otherwise
    state: async () => (over.was === undefined ? MONTH_SENT : over.was),
    mark: async (fields) => void marks.push(fields),
    telegram: async (text) => void telegrams.push(text),
    pause: async (ms) => void pauses.push(ms),
    ...over,
  };
  const elastic = () => saved.find((s) => s.id === "supply-elastic-25")?.updates[0]?.set;
  return { deps, pages, saved, marks, telegrams, pauses, elastic };
}

test("the first run reads only what it may, writes down today's prices, and sends the list once", async () => {
  const w = world({ was: null });
  const result = await runSupplyWatch(w.deps);
  assert.deepEqual(w.pages, [ELASTIC, TAPE], "Jaycotts is a link, not a read; never read before goes first");
  assert.deepEqual(w.pauses, [2000], "a pause between pages");
  assert.deepEqual(w.elastic(), {
    seenUnitPrice: 0.55,
    seenAt: "2026-10-19T07:15:00.000Z",
    seenPack: 25,
    seenTiers: "1 м £1.00 · от 10 м £0.85 · от 25 м £0.55",
    seenFrom: fromOf(PAGES.elastic25, ELASTIC),
    seenYours: null,
    price: 13.75,
  });
  assert.deepEqual([result.news, result.digest, result.telegram], [0, true, 1], "a baseline, not news — and the list, since it is the first run");
  assert.equal(w.telegrams.length, 1);
  assert.match(w.telegrams[0], /Где брать мини-опт/);
  assert.deepEqual(w.marks, [{ ranAt: "2026-10-19T07:15:00.000Z", problems: [], digestAt: "2026-10-19T07:15:00.000Z" }]);
});

test("the list goes out once a calendar month: the first run of a month that has not had it", () => {
  const at = (iso: string) => new Date(iso);
  assert.equal(digestDue(null, at("2026-10-19T07:15:00Z")), true, "never sent");
  assert.equal(digestDue({ digestAt: "2026-10-05T07:15:00Z" }, at("2026-10-26T07:15:00Z")), false);
  assert.equal(digestDue({ digestAt: "2026-10-26T07:15:00Z" }, at("2026-11-02T07:15:00Z")), true, "a new month");
  assert.equal(digestDue({ digestAt: "2025-12-29T07:15:00Z" }, at("2026-01-05T07:15:00Z")), true, "a new year");
  // The first Monday was missed: the list still goes, the Monday after
  assert.equal(digestDue({ digestAt: "2026-09-07T07:15:00Z" }, at("2026-10-12T07:15:00Z")), true);
  assert.equal(digestDue({ digestAt: "garbage" }, at("2026-10-12T07:15:00Z")), true);
});

test("a later week: a fall of a tenth is told; nothing new and the list already sent, nothing is sent", async () => {
  const fell = world({ seen: 0.62 });
  const result = await runSupplyWatch(fell.deps);
  assert.equal(result.news, 1);
  assert.match(fell.telegrams[0], /Мини-опт недели[\s\S]*£0\.55\/м при покупке 25 м \(было £0\.62\/м\)/);
  assert.equal(fell.telegrams.length, 1, "this month's list already went: no list");
  assert.deepEqual(fell.marks, [{ ranAt: "2026-10-19T07:15:00.000Z", problems: [] }], "the list is not marked sent");
  assert.deepEqual(fell.pages, [ELASTIC, TAPE]);

  const same = world({ seen: 0.55 });
  await runSupplyWatch(same.deps);
  assert.deepEqual(same.telegrams, []);

  const newMonth = world({ seen: 0.55, now: new Date("2026-11-02T07:15:00Z") });
  await runSupplyWatch(newMonth.deps);
  assert.equal(newMonth.telegrams.length, 1);
  assert.match(newMonth.telegrams[0], /Где брать мини-опт/);
  assert.equal(newMonth.marks[0].digestAt, "2026-11-02T07:15:00.000Z");
});

test("a fall nobody was told of stays news for next week; the list is not marked sent; Safar hears why", async () => {
  const w = world({
    seen: 0.62,
    was: null,
    telegram: async () => {
      throw new Error("Telegram 502");
    },
  });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.telegram, "failed");
  const elastic = w.elastic()!;
  for (const field of ["seenUnitPrice", "seenPack", "seenFrom", "seenYours"]) assert.equal(field in elastic, false, field);
  assert.equal(elastic.price, 13.75, "the Studio still shows today's price");
  const tape = w.saved.find((s) => s.id === "supply-tape")!.updates[0].set;
  assert.equal(tape.seenUnitPrice, 2.4, "no news there: written as usual");
  assert.equal(w.marks[0].digestAt, undefined);
  assert.deepEqual(
    w.marks[0].problems.map((p) => [p.key, p.why, p.urgent]),
    [["telegram", "ни один чат не получил: Telegram 502", undefined]],
    "a 502 may pass by itself: told only if it is met again"
  );
  assert.equal("seenAt" in elastic, false, "it stays at the front of next week's queue");
});

test("the news reached her but the list did not: the news is not sent again, the list is", async () => {
  const sent: string[] = [];
  const w = world({
    seen: 0.62,
    was: null,
    telegram: async (text) => {
      if (text.startsWith("🧵 <b>Где брать мини-опт</b>")) throw new Error("Telegram 429");
      sent.push(text);
    },
  });
  const result = await runSupplyWatch(w.deps);
  assert.equal(sent.length, 1);
  assert.equal(result.telegram, "failed");
  assert.equal(w.elastic()!.seenUnitPrice, 0.55, "the fall was told: today's price is the new one to beat");
  assert.equal(w.marks[0].digestAt, undefined, "the list goes next Monday");
});

test("one chat refused while the other got it: not told until both have it; a blocked bot is Safar's at once", async () => {
  const w = world({ seen: 0.62, was: null, telegram: async () => ({ failed: ["Telegram 403: Forbidden: bot was blocked by the user"] }) });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.telegram, "failed");
  assert.equal("seenUnitPrice" in w.elastic()!, false, "the fall goes again next Monday — to her this time, if she unblocks the bot");
  assert.equal(w.marks[0].digestAt, undefined, "the list too");
  const refusal = w.marks[0].problems.find((p) => p.key === "telegram")!;
  assert.match(refusal.why, /не во все чаты: Telegram 403.*заблокирован ли бот/);
  assert.equal(refusal.urgent, true, "a blocked bot does not unblock itself: Safar hears at once");
  // A passing hiccup in one chat: sent again, and told only if it happens again
  const hiccup = world({ seen: 0.62, telegram: async () => ({ failed: ["Telegram: The operation was aborted due to timeout"] }) });
  await runSupplyWatch(hiccup.deps);
  assert.equal("seenUnitPrice" in hiccup.elastic()!, false);
  assert.equal(hiccup.marks[0].problems[0].urgent, undefined);
  // A quiet Monday after: nothing sent, so nothing known — the refusal stands as it was
  const quiet = world({ seen: 0.55, was: { ...MONTH_SENT, problems: [refusal] }, now: new Date("2026-10-26T07:15:00Z") });
  await runSupplyWatch(quiet.deps);
  assert.deepEqual(quiet.marks[0].problems, [refusal]);
  // A Monday when every chat got it: gone
  const fine = world({ seen: 0.62, was: { ...MONTH_SENT, problems: [refusal] }, now: new Date("2026-10-26T07:15:00Z") });
  await runSupplyWatch(fine.deps);
  assert.deepEqual(fine.marks[0].problems, []);
});

test("a link copied from a tab of the page («…#reviews») is the same page", async () => {
  const items: SupplyItem[] = [
    {
      _id: "supply-6",
      name: "Мягкая резинка 6 мм",
      group: "elastic",
      spec: "6mm soft elastic",
      unit: "metre",
      myPrice: 0.6,
      offers: [{ _key: "em", shop: "Empress Mills", url: "https://www.empressmills.co.uk/6mm-flat-soft-elastic#reviews", pack: 10, price: 3.5 }],
    },
  ];
  const asked: string[] = [];
  const first = world({ items: async () => structuredClone(items), page: async (url) => (asked.push(url), PAGES.elastic6) });
  assert.equal((await runSupplyWatch(first.deps)).news, 1, "35p against her 60p: told once");
  assert.deepEqual(asked, ["https://www.empressmills.co.uk/6mm-flat-soft-elastic"]);
  const written = first.saved[0].updates[0].set;
  assert.equal(written.seenFrom, "https://www.empressmills.co.uk/6mm-flat-soft-elastic");
  // The next Monday: the same page, the same price — not told again
  const again = world({ items: async () => [{ ...structuredClone(items)[0], offers: [{ ...items[0].offers[0], ...written } as SupplyOffer] }], page: async () => PAGES.elastic6 });
  assert.equal((await runSupplyWatch(again.deps)).news, 0);
});

test("a first reading far from the price in the list is a mix-up for Safar, not news for Kristina", async () => {
  // She wrote £1.37 for the 25-metre roll — the page says £13.75: units mixed up
  const w = world({ price: 1.37, mine: 1 });
  const result = await runSupplyWatch(w.deps);
  assert.match(result.problems[ELASTIC], /Резинка 25 мм: на сайте 25 м стоят £13\.75, в списке £1\.37/);
  assert.equal(result.news, 0);
  assert.equal(w.elastic(), undefined, "nothing written");
  const off = world({ price: 9.5 });
  assert.match((await runSupplyWatch(off.deps)).problems[ELASTIC] ?? "", /в списке £9\.50/, "45% off: a mix-up too");
  // Within a third of hers: the shop's price is taken
  const near = world({ price: 11 });
  await runSupplyWatch(near.deps);
  assert.equal(near.elastic()!.price, 13.75);
  // After the first reading a big fall is a sale, not a mix-up: told
  const sale = world({ seen: 0.85, price: 21.25 });
  const told = await runSupplyWatch(sale.deps);
  assert.equal(told.news, 1);
  assert.deepEqual(told.problems, {});
});

test("she changes the size of her buy: the new size is read at once, measured afresh, never locked out", async () => {
  // Read for 10 m (£8.50, written by the run); she now buys the 25 m roll and leaves the price
  const w = world({ seen: 0.85, seenPack: 10, pack: 25, price: 8.5 });
  const result = await runSupplyWatch(w.deps);
  assert.deepEqual(result.problems, {}, "the same page and options: no mix-up check, the run wrote the old price itself");
  assert.equal(result.news, 0, "a different buy, not a 35% fall");
  assert.deepEqual([w.elastic()!.seenPack, w.elastic()!.price], [25, 13.75]);
});

/** An Empress Mills page sold in options: each option's price and volume steps */
function optionsPage(options: Record<string, number>, steps: { qty: number; price: number }[] = []): string {
  const table = Object.entries(options).map(([id, price]) => `"${id}":{"finalPrice":{"amount":${price}},"tierPrices":${JSON.stringify(steps)}}`);
  return `<meta itemprop="price" content="${Object.values(options)[0]}" /><script>{"optionPrices":{${table.join(",")}}}</script>`;
}

test("options come and go with stock: while they overlap it is the same product, and a fall is a fall", async () => {
  // Read with white and black; black sold out, and the 25 m roll fell to 45p
  const w = world({ seen: 0.55, page: async (url) => (url === ELASTIC ? optionsPage({ "36912": 1 }, [{ qty: 10, price: 0.85 }, { qty: 25, price: 0.45 }]) : PAGES.tape2in) });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.news, 1);
  assert.match(w.telegrams[0], /£0\.45\/м при покупке 25 м \(было £0\.55\/м\)/);
  assert.equal(w.elastic()!.seenFrom, `${ELASTIC}#options=36912`);
});

test("a product that gained or lost its options is a different product: read afresh", async () => {
  // Read as a product in options; the page is now a plain product, 25 m at 55p
  const w = world({ seen: 0.62, seenFrom: `${ELASTIC}#options=36912,36913`, page: async (url) => (url === ELASTIC ? `<meta itemprop="price" content="1" />"tierPrices":[{"qty":25,"price":0.55}]` : PAGES.tape2in) });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.news, 0, "not «было £0.62»: a different product");
  assert.equal(w.elastic()!.seenFrom, ELASTIC);
});

test("a product whose options came and went with nothing in common is read afresh: a sold-out option never passes for a fall", async () => {
  // Last read with only the 56 cm zip listed at £2.50; now only the 20 cm ones, at £1.50
  const ZIP = "https://www.empressmills.co.uk/closed-end-zips";
  const zipItem: SupplyItem = {
    _id: "supply-zip",
    name: "Молния 56 см",
    group: "zips",
    spec: "zip 56cm",
    unit: "piece",
    offers: [{ _key: "em", shop: "Empress Mills", url: ZIP, pack: 10, price: 25, seenUnitPrice: 2.5, seenPack: 10, seenAt: "2026-10-12T07:15:00Z", seenFrom: `${ZIP}#options=37835` }],
  };
  const w = world({ items: async () => [structuredClone(zipItem)], page: async () => optionsPage({ "37834": 1.5, "37836": 1.5 }) });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.news, 0, "not «было £2.50»");
  assert.match(result.problems[ZIP], /на сайте 10 шт стоят £15\.00, в списке £25\.00/);
  assert.deepEqual(w.saved, [], "the 56 cm price is not overwritten with the 20 cm one");
  // The same option back: compared as usual
  const back = world({ items: async () => [structuredClone(zipItem)], page: async () => optionsPage({ "37835": 2.2 }) });
  assert.equal((await runSupplyWatch(back.deps)).news, 1);
});

test("options once seen at different prices: never read again, whatever is left in stock — Safar is told", async () => {
  const ZIP = "https://www.empressmills.co.uk/closed-end-zips";
  const zipItem: SupplyItem = {
    _id: "supply-zip",
    name: "Молния 56 см",
    group: "zips",
    spec: "zip 56cm",
    unit: "piece",
    myPrice: 3.3,
    offers: [{ _key: "em", shop: "Empress Mills", url: ZIP, pack: 10, price: 25 }],
  };
  // Monday 1: lengths at different prices — remembered on the offer
  const mixed = world({ items: async () => [structuredClone(zipItem)], page: async () => PAGES.zipsClosedEnd });
  const first = await runSupplyWatch(mixed.deps);
  assert.match(first.problems[ZIP], /варианты с разной ценой/);
  assert.deepEqual(mixed.saved, [{ id: "supply-zip", updates: [{ key: "em", set: { seenFrom: `${ZIP}#mixed` } }] }]);
  // Monday 2: her 56 cm sold out, the 20 cm ones left at £2.30 — within a third of hers, but not hers
  const later = world({
    items: async () => [{ ...structuredClone(zipItem), offers: [{ ...zipItem.offers[0], seenFrom: `${ZIP}#mixed` }] }],
    page: async () => optionsPage({ "37834": 2.3, "37836": 2.3 }),
  });
  const second = await runSupplyWatch(later.deps);
  assert.deepEqual([second.news, second.read, later.saved.length], [0, 0, 0], "not read at all");
  assert.match(second.problems[ZIP], /больше не читает — замените ссылку/);
  // Another page in its place: read afresh
  const moved = world({
    items: async () => [{ ...structuredClone(zipItem), offers: [{ ...zipItem.offers[0], url: `${ZIP}-56cm`, seenFrom: `${ZIP}#mixed` }] }],
    page: async () => optionsPage({ "1": 2.5 }),
  });
  assert.equal((await runSupplyWatch(moved.deps)).read, 1);
});

test("the first list never offers a price the run refused to confirm", async () => {
  // Her £1.37 for the 25 m roll is a mix-up: blocked — so the list leads with Jaycotts, not «5.5p/м»
  const w = world({ was: null, price: 1.37 });
  await runSupplyWatch(w.deps);
  assert.match(w.telegrams[0], /Резинка 25 мм<\/b>: £0\.52\/м — Jaycotts/);
});

test("the monthly list offers a watched shop's price only once the run confirmed it lately", () => {
  const at = new Date("2026-11-02T07:15:00Z");
  const item = (seenAt: string | null): SupplyItem => ({
    _id: "supply-e",
    name: "Резинка 25 мм",
    group: "elastic",
    spec: "25mm elastic",
    unit: "metre",
    offers: [
      { _key: "em", shop: "Empress Mills", url: ELASTIC, pack: 25, price: 8.25, seenAt },
      { _key: "jc", shop: "Jaycotts", url: "https://www.jaycotts.co.uk/x", pack: 25, price: 12.99 },
    ],
  });
  assert.match(supplyDigest([item("2026-10-26T07:15:00Z")], at), /£0\.33\/м — Empress Mills/);
  // Blocked or unread for weeks: its old price is not today's — the next shop leads
  assert.match(supplyDigest([item("2026-10-05T07:15:00Z")], at), /£0\.52\/м — Jaycotts/);
  assert.match(supplyDigest([item(null)], at), /£0\.52\/м — Jaycotts/);
  assert.match(supplyDigest([item(null)]), /Empress Mills/, "without a date, as the Studio shows it");
});

test("a problem keeps the day it was first met, and goes when it is gone", async () => {
  const failing = (url: string) => (url === TAPE ? Promise.reject(new Error("503 Service Unavailable")) : Promise.resolve(PAGES.elastic25));
  const first = world({ seen: 0.55, page: failing });
  await runSupplyWatch(first.deps);
  const problem = first.marks[0].problems.find((p) => p.key === TAPE)!;
  assert.deepEqual([problem.why, problem.since, problem.lastMet], ["503 Service Unavailable", "2026-10-19T07:15:00.000Z", "2026-10-19T07:15:00.000Z"]);
  assert.match(problem._key, /^p[0-9a-z]+$/, "a short key, not the address");
  // A week later, still failing: the first day stands — the outside watch tells Safar
  const again = world({ seen: 0.55, page: failing, was: { ...MONTH_SENT, problems: [problem] }, now: new Date("2026-10-26T07:15:00Z") });
  await runSupplyWatch(again.deps);
  const met = again.marks[0].problems.find((p) => p.key === TAPE)!;
  assert.deepEqual([met.since, met.lastMet], ["2026-10-19T07:15:00.000Z", "2026-10-26T07:15:00.000Z"], "met on two Mondays");
  // Read again: gone
  const fixed = world({ seen: 0.55, was: { ...MONTH_SENT, problems: [problem] }, now: new Date("2026-11-02T07:15:00Z") });
  await runSupplyWatch(fixed.deps);
  assert.deepEqual(fixed.marks[0].problems, []);
});

test("a price that could not be written is Safar's to hear of", async () => {
  const w = world({
    seen: 0.55,
    save: async (id) => {
      if (id === "supply-tape") throw new Error("Sanity 503");
    },
  });
  const result = await runSupplyWatch(w.deps);
  assert.match(result.problems["save:supply-tape"], /не записалось в Studio: Sanity 503/);
  assert.deepEqual(w.marks[0].problems.map((p) => p.key), ["save:supply-tape"]);
});

test("a shop that fails or changes its page is noted for Safar, and the rest carry on", async () => {
  const w = world({
    seen: 0.55,
    page: async (url) => {
      if (url === ELASTIC) throw new Error("503 Service Unavailable");
      return PAGES.zipsClosedEnd;
    },
  });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.problems[ELASTIC], "503 Service Unavailable");
  assert.match(result.problems[TAPE], /варианты с разной ценой/);
  assert.deepEqual(w.saved, [{ id: "supply-tape", updates: [{ key: "em", set: { seenFrom: `${TAPE}#mixed` } }] }], "no price written that was not read; only that its options differ");
  assert.deepEqual(w.telegrams, []);
  assert.deepEqual(w.marks[0].problems.map((p) => p.key).sort(), [TAPE, ELASTIC].sort());
});

test("gentle with the shop: twenty pages a week at most, each once, the longest-unread first, within the time it has", async () => {
  const many: SupplyItem[] = Array.from({ length: 25 }, (_, k) => ({
    _id: `supply-${k}`,
    name: `Вещь ${k}`,
    group: "other",
    spec: "thing",
    unit: "metre",
    offers: [
      // Read last week, except the last five, never read
      { _key: "em", shop: "Empress Mills", url: `https://www.empressmills.co.uk/thing-${k}`, pack: 10, price: 8.5, seenAt: k < 20 ? `2026-10-12T07:${String(k).padStart(2, "0")}:00Z` : null },
      // The same page for a bigger buy: not read twice
      { _key: "em-25", shop: "Empress Mills", url: `https://www.empressmills.co.uk/thing-${k}`, pack: 25, price: 13.75, seenAt: k < 20 ? `2026-10-12T07:${String(k).padStart(2, "0")}:00Z` : null },
    ],
  }));
  const w = world({ items: async () => structuredClone(many) });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.read, 20);
  assert.equal(new Set(w.pages).size, 20, "each page once");
  assert.deepEqual(w.pages.slice(0, 5), [20, 21, 22, 23, 24].map((k) => `https://www.empressmills.co.uk/thing-${k}`), "never read first");
  assert.deepEqual(result.problems, {}, "read a week ago, left for next time: not a fault");
  assert.equal(w.saved.find((s) => s.id === "supply-20")!.updates.length, 2, "both buys from one reading");

  // Out of time: what was read is still written and marked
  let clock = 0;
  const slow = world({ items: async () => structuredClone(many), elapsed: () => (clock += 10_000) });
  const cut = await runSupplyWatch(slow.deps);
  assert.ok(cut.read >= 2 && cut.read <= 4, `${cut.read}`);
  assert.equal(slow.marks.length, 1);

  // Left unread for two weeks and more: a fault
  const stale = many.map((item) => ({ ...item, offers: item.offers.map((o) => ({ ...o, seenAt: o.seenAt ? "2026-10-01T07:15:00Z" : null })) }));
  const behind = world({ items: async () => stale });
  const late = await runSupplyWatch(behind.deps);
  assert.match(late.problems.unread, /^5 стр\. Empress Mills не проверялись дольше 13 дней/, "one fault under one name, so it can last from week to week");

  // Left for next time with last week's problem: the problem stands until the page is read again
  const old: SupplyProblem = { _key: "p1", key: "https://www.empressmills.co.uk/thing-17", why: "503", since: "2026-10-12T07:15:00.000Z", lastMet: "2026-10-12T07:15:00.000Z" };
  const carried = world({ items: async () => structuredClone(many), was: { ...MONTH_SENT, problems: [old, null as unknown as SupplyProblem] } });
  await runSupplyWatch(carried.deps);
  assert.ok(!carried.pages.includes(old.key), "thing-17, read most recently last week, is left for next time");
  assert.deepEqual(carried.marks[0].problems, [old]);

  // An offer without a size of buy is not read: nothing to measure
  const sizeless = world({ items: async () => [{ ...many[0], offers: [{ ...many[0].offers[0], pack: null as unknown as number }] }] });
  const nothing = await runSupplyWatch(sizeless.deps);
  assert.deepEqual([nothing.read, nothing.problems], [0, {}]);

  const empty = world({ was: null, items: async () => [] });
  const none = await runSupplyWatch(empty.deps);
  assert.equal(none.digest, false);
  assert.deepEqual(empty.telegrams, []);
});

test("under what she pays by a third: told the first time it is seen, and again only if she changes her price", async () => {
  const w = world({ mine: 1 });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.news, 1);
  assert.match(w.telegrams[0], /вы платите £1\.00\/м/);
  assert.equal(w.elastic()!.seenYours, 1);
  // She filled in what she pays after the first Monday
  const later = world({ seen: 0.55, mine: 1 });
  assert.equal((await runSupplyWatch(later.deps)).news, 1);
  const quiet = world({ seen: 0.55, mine: 1, seenYours: 1 });
  assert.equal((await runSupplyWatch(quiet.deps)).news, 0);
});

test("the run reads what the Studio keeps, published only", () => {
  for (const field of ["seenUnitPrice", "seenAt", "seenPack", "seenTiers", "seenFrom", "seenYours", "myPrice"]) assert.ok(SUPPLY_QUERY.includes(field), field);
  assert.match(SUPPLY_QUERY, /!\(_id in path\("drafts\.\*\*"\)\)/);
  assert.equal(STATE_ID, "supplyWatchState");
});
