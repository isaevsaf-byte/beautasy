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
  unitPrice,
  watched,
  type ShopPrices,
  type SupplyItem,
} from "./supplies";
import { STATE_ID, SUPPLY_QUERY, digestDue, runSupplyWatch, type SupplyRunDeps, type SupplyWatchState } from "./supplyRun";

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
  // Zips by length: a 20 cm and a 56 cm cost differently — the page cannot say which she buys
  const zips = empressMillsPrices(PAGES.zipsClosedEnd);
  assert.deepEqual(zips, { ok: false, why: "у товара варианты с разной ценой — смотреть вручную" });
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
  assert.equal(newsOf(0.55, 0.55, 1), null);
  assert.equal(newsOf(0.75, undefined, 1), null, "a quarter cheaper is not enough to write");
  // Sanity hands back null for a field never written: missing, not a price of nought
  assert.equal(newsOf(0.55, null, null), null);
  assert.deepEqual(newsOf(0.55, null, 1), { kind: "belowYours", now: 0.55, yours: 1 });
  assert.equal(newsOf(0.55, 0, 0), null);
  assert.deepEqual(newsOf(0.55, 0, 1), { kind: "belowYours", now: 0.55, yours: 1 }, "a price of nought was never a reading");
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
function world(over: Partial<SupplyRunDeps> & { seen?: number; seenPack?: number; mine?: number; was?: SupplyWatchState | null; price?: number } = {}) {
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
          url: "https://www.empressmills.co.uk/25mm-classic-elastic",
          pack: 25,
          price: over.price ?? 13.75,
          seenUnitPrice: over.seen ?? null,
          seenAt: over.seen ? "2026-10-12T07:15:00Z" : null,
          seenPack: over.seen ? (over.seenPack ?? 25) : null,
          seenTiers: null,
        },
        { _key: "jc", shop: "Jaycotts", url: "https://www.jaycotts.co.uk/products/x", pack: 25, price: 12.99 },
      ],
    },
    { _id: "supply-tape", name: "Лента", group: "curtains", spec: "tape", unit: "metre", offers: [{ _key: "em", shop: "Empress Mills", url: "https://www.empressmills.co.uk/2inch-curtain-tape", pack: 10, price: 24 }] },
  ];
  const pages: string[] = [];
  const saved: { id: string; updates: { key: string; set: Record<string, unknown> }[] }[] = [];
  const marks: SupplyWatchState[] = [];
  const telegrams: string[] = [];
  const pauses: number[] = [];
  const deps: SupplyRunDeps = {
    now: new Date("2026-10-19T07:15:00Z"), // the third Monday of the month
    items: async () => structuredClone(items),
    page: async (url) => {
      pages.push(url);
      return url.endsWith("2inch-curtain-tape") ? PAGES.tape2in : PAGES.elastic25;
    },
    save: async (id, updates) => void saved.push({ id, updates }),
    // This month's list already went out, unless the stand-in says otherwise
    state: async () => (over.was === undefined ? { ranAt: "2026-10-12T07:15:00Z", readAt: "2026-10-12T07:15:00Z", digestAt: "2026-10-05T07:15:00Z" } : over.was),
    mark: async (fields) => void marks.push(fields),
    telegram: async (text) => void telegrams.push(text),
    pause: async (ms) => void pauses.push(ms),
    ...over,
  };
  return { deps, pages, saved, marks, telegrams, pauses };
}

test("the first run reads only what it may, writes down today's prices, and sends the list once", async () => {
  const w = world({ was: null });
  const result = await runSupplyWatch(w.deps);
  assert.deepEqual(w.pages, ["https://www.empressmills.co.uk/25mm-classic-elastic", "https://www.empressmills.co.uk/2inch-curtain-tape"], "Jaycotts is a link, not a read");
  assert.deepEqual(w.pauses, [2000], "a pause between pages");
  assert.deepEqual(w.saved[0], {
    id: "supply-elastic-25",
    updates: [
      {
        key: "em",
        set: { seenUnitPrice: 0.55, seenAt: "2026-10-19T07:15:00.000Z", seenPack: 25, seenTiers: "1 м £1.00 · от 10 м £0.85 · от 25 м £0.55", price: 13.75 },
      },
    ],
  });
  assert.deepEqual([result.news, result.digest, result.telegram], [0, true, 1], "a baseline, not news — and the list, since it is the first run");
  assert.equal(w.telegrams.length, 1);
  assert.match(w.telegrams[0], /Где брать мини-опт/);
  assert.deepEqual(w.marks, [{ ranAt: "2026-10-19T07:15:00.000Z", readAt: "2026-10-19T07:15:00.000Z", digestAt: "2026-10-19T07:15:00.000Z" }]);
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
  assert.deepEqual(fell.marks, [{ ranAt: "2026-10-19T07:15:00.000Z", readAt: "2026-10-19T07:15:00.000Z" }], "the list is not marked sent");

  const same = world({ seen: 0.55 });
  await runSupplyWatch(same.deps);
  assert.deepEqual(same.telegrams, []);

  const newMonth = world({ seen: 0.55, now: new Date("2026-11-02T07:15:00Z") });
  await runSupplyWatch(newMonth.deps);
  assert.equal(newMonth.telegrams.length, 1);
  assert.match(newMonth.telegrams[0], /Где брать мини-опт/);
  assert.equal(newMonth.marks[0].digestAt, "2026-11-02T07:15:00.000Z");
});

test("a fall that Telegram refused stays news for next week; the list is not marked sent", async () => {
  const w = world({
    seen: 0.62,
    was: null,
    telegram: async () => {
      throw new Error("Telegram 502");
    },
  });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.telegram, "failed");
  const elastic = w.saved.find((s) => s.id === "supply-elastic-25")!.updates[0].set;
  assert.equal(elastic.seenUnitPrice, undefined, "the old price stays the one to beat");
  assert.equal(elastic.seenPack, undefined);
  assert.equal(elastic.price, 13.75, "the Studio still shows today's price");
  const tape = w.saved.find((s) => s.id === "supply-tape")!.updates[0].set;
  assert.equal(tape.seenUnitPrice, 2.4, "no news there: written as usual");
  assert.equal(w.marks[0].digestAt, undefined);
});

test("a first reading far from the price in the list is a mix-up for Safar, not news for Kristina", async () => {
  // She wrote £1.37 for the 25-metre roll — the page says £13.75: units mixed up
  const w = world({ price: 1.37, mine: 1 });
  const result = await runSupplyWatch(w.deps);
  assert.match(result.problems["https://www.empressmills.co.uk/25mm-classic-elastic"], /Резинка 25 мм: на сайте 25 м стоят £13\.75, в списке £1\.37/);
  assert.equal(result.news, 0);
  assert.equal(w.saved.find((s) => s.id === "supply-elastic-25"), undefined, "nothing written");
  const off = world({ price: 9.5 });
  assert.match((await runSupplyWatch(off.deps)).problems["https://www.empressmills.co.uk/25mm-classic-elastic"] ?? "", /в списке £9\.50/, "45% off: a mix-up too");
  // Within a third of hers: the shop's price is taken
  const near = world({ price: 11 });
  await runSupplyWatch(near.deps);
  assert.equal(near.saved.find((s) => s.id === "supply-elastic-25")!.updates[0].set.price, 13.75);
  // After the first reading a big fall is a sale, not a mix-up: told
  const sale = world({ seen: 0.85, price: 21.25 });
  const told = await runSupplyWatch(sale.deps);
  assert.equal(told.news, 1);
  assert.deepEqual(told.problems, {});
});

test("a different size of buy is measured afresh, not against the old size's price", async () => {
  // Seen £0.85/м for a 10-metre buy; now the list says a 25-metre roll at £0.55 — a different buy, not a 35% fall
  const w = world({ seen: 0.85, seenPack: 10 });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.news, 0);
  assert.equal(w.saved[0].updates[0].set.seenPack, 25);
});

test("a shop that fails or changes its page is noted for Safar, and the rest carry on", async () => {
  const w = world({
    seen: 0.55,
    page: async (url) => {
      if (url.endsWith("25mm-classic-elastic")) throw new Error("503 Service Unavailable");
      return PAGES.zipsClosedEnd;
    },
  });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.problems["https://www.empressmills.co.uk/25mm-classic-elastic"], "503 Service Unavailable");
  assert.match(result.problems["https://www.empressmills.co.uk/2inch-curtain-tape"], /варианты с разной ценой/);
  assert.deepEqual(w.saved, [], "nothing written that was not read");
  assert.deepEqual(w.telegrams, []);
  assert.deepEqual(w.marks, [{ ranAt: "2026-10-19T07:15:00.000Z" }], "ran, but read nothing: the outside watch sees readAt age");
});

test("gentle with the shop: no more than twenty pages a week; an empty list sends nothing", async () => {
  const many: SupplyItem[] = Array.from({ length: 25 }, (_, k) => ({
    _id: `supply-${k}`,
    name: `Вещь ${k}`,
    group: "other",
    spec: "thing",
    unit: "metre",
    offers: [{ _key: "em", shop: "Empress Mills", url: `https://www.empressmills.co.uk/thing-${k}`, pack: 10, price: 8.5 }],
  }));
  const w = world({ items: async () => many });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.read, 20);
  assert.equal(w.pages.length, 20);

  const empty = world({ was: null, items: async () => [] });
  const none = await runSupplyWatch(empty.deps);
  assert.equal(none.digest, false);
  assert.deepEqual(empty.telegrams, []);
});

test("under what she pays by a third: told the first time it is seen", async () => {
  const w = world({ mine: 1 });
  const result = await runSupplyWatch(w.deps);
  assert.equal(result.news, 1);
  assert.match(w.telegrams[0], /вы платите £1\.00\/м/);
});

test("the run reads what the Studio keeps, published only", () => {
  for (const field of ["seenUnitPrice", "seenAt", "seenPack", "seenTiers", "myPrice"]) assert.ok(SUPPLY_QUERY.includes(field), field);
  assert.match(SUPPLY_QUERY, /!\(_id in path\("drafts\.\*\*"\)\)/);
  assert.equal(STATE_ID, "supplyWatchState");
});
