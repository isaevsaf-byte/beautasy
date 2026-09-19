import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
// Sanity's own GROQ parser and evaluator, already installed here as one of
// `sanity`'s dependencies. It is what lets these tests run the real query
// against real-shaped documents rather than read it and hope.
import { evaluate, parse } from "groq-js";
import { looksLikeAToken } from "./studioMember";
import {
  buildDashboard,
  channelInEnglish,
  count,
  daysSince,
  howLongAgo,
  isDashboard,
  money,
  mostWanted,
  statsParams,
  STUDIO_LISTS,
  STUDIO_STATS_QUERY,
  type StatsRaw,
  type StatLine,
  type Traffic,
} from "./studioStats";

/**
 * The Dashboard has one job it must never do.
 *
 * Every customer's name, email, phone number and address in this shop is
 * encrypted inside a dataset that anyone on the internet can read, because
 * Sanity's free plan has no private datasets. That arrangement holds only for
 * as long as nothing decrypts them and nothing hands them out. A dashboard is
 * the obvious place for it to break: the natural way to write a GROQ query is
 * `*[_type == "order"]{...}`, and that one character of laziness puts three
 * sealed fields into an API response and into Vercel's request log, where
 * they are not encrypted at all.
 *
 * So the first test below is not about the wording. It fills a dataset with
 * documents whose every private field is the word SENTINEL, runs the query
 * the route actually runs, and fails if that word appears anywhere in the
 * answer. It fails on a spread, on a field added by hand, and on a dereference
 * that drags a customer along with it.
 */

const NOW = new Date("2026-09-19T10:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * DAY_MS).toISOString();
}

async function askTheRealQuery(documents: Record<string, unknown>[], now = NOW) {
  const answer = await evaluate(parse(STUDIO_STATS_QUERY), {
    dataset: documents,
    params: statsParams(now),
  });
  return (await answer.get()) as StatsRaw;
}

/* ─── The rule the whole feature sits under ─── */

/** The word that must never come back, in every field that holds a person. */
const SENTINEL = "SENTINEL-PRIVATE-DO-NOT-SHOW";

/**
 * Every field the reveal route lists as sealed, plus the masked hints and the
 * fingerprints. The fingerprints cannot be decrypted, but they are stable
 * per-person identifiers, so a dashboard is no place for them either.
 */
const PRIVATE_FIELDS: Record<string, string[]> = {
  order: [
    "customerEmailSealed",
    "customerNameSealed",
    "shippingAddressSealed",
    "emailFingerprint",
    "reviewTokenFingerprint",
    "displayName",
    "emailHint",
    // Not obviously private and very much is: the courier's page shows the
    // delivery address, and the Stripe id opens the whole customer record.
    "trackingUrl",
    "stripeSessionId",
    "userId",
  ],
  atelierBooking: [
    "nameSealed",
    "emailSealed",
    "phoneSealed",
    "notesSealed",
    "emailFingerprint",
    "displayName",
    "emailHint",
    "confirmedFor",
    "replyNote",
  ],
  giftCard: [
    "codeSealed",
    "recipientEmailSealed",
    "recipientNameSealed",
    "messageSealed",
    "purchaserEmailSealed",
    "codeFingerprint",
    "codeHint",
    "recipientHint",
    "stripeSessionId",
  ],
  subscriber: ["emailSealed", "welcomeCodeSealed", "emailFingerprint", "emailHint"],
  stockAlert: ["emailSealed", "emailFingerprint", "emailHint"],
  abandonedCart: ["emailSealed", "emailHint", "stripeSessionId"],
  referrer: ["emailSealed", "codeSealed", "emailFingerprint", "codeFingerprint", "displayName", "codeHint"],
  referral: ["friendEmailFingerprint", "friendName", "friendEmailHint", "claim"],
  review: ["userName", "comment", "userId"],
};

/** A document of `type` where every private field is the sentinel. */
function loaded(type: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    _id: `${type}-${Math.random().toString(36).slice(2)}`,
    _type: type,
    _createdAt: daysFromNow(-2),
    _updatedAt: daysFromNow(-2),
    createdAt: daysFromNow(-2),
  };
  for (const field of PRIVATE_FIELDS[type] ?? []) doc[field] = SENTINEL;
  return { ...doc, ...over };
}

test("the dashboard query answers with counts and never with a customer", async () => {
  const documents = [
    loaded("order", { total: 12500, status: "paid" }),
    loaded("order", { total: 8000, status: "shipped", createdAt: daysFromNow(-20) }),
    loaded("atelierBooking", { status: "new" }),
    loaded("atelierBooking", { status: "confirmed", slotStart: "2026-09-22T14:30" }),
    loaded("giftCard", { active: true, balance: 5000, deliverAt: daysFromNow(-1) }),
    loaded("subscriber", { unsubscribed: false }),
    loaded("stockAlert", { notified: false, size: "M", product: { _ref: "p1" } }),
    loaded("abandonedCart", { total: 4200 }),
    loaded("referrer", { active: true }),
    loaded("referral", { outcome: "rewarded" }),
    loaded("review", { approved: false, rating: 5 }),
    { _id: "p1", _type: "product", name: "Silk Slip", price: 9000, stock: 0, color: "ivory" },
  ];

  const answer = await askTheRealQuery(documents);
  const asItLeaves = JSON.stringify(answer);

  assert.equal(
    asItLeaves.includes(SENTINEL),
    false,
    `A private field reached the Dashboard's reply. Every projection in STUDIO_STATS_QUERY must name its fields; a spread such as *[_type == "order"]{...} pulls the sealed ones with it, and this response is written to Vercel's request log in the clear. The reply was: ${asItLeaves}`
  );

  // And the same guard stated the other way round, so that renaming a sealed
  // field in the schema cannot quietly retire the check above.
  for (const key of Object.keys(answer)) {
    assert.equal(
      /sealed|fingerprint|hint|email|phone|address|name$/i.test(key),
      false,
      `"${key}" is named like a field that holds a person. The Dashboard answers with counts, sums and dates only.`
    );
  }

  // The query did in fact look at those documents, so a passing test above is
  // evidence rather than an empty dataset saying nothing.
  assert.equal(answer.ordersAllTime, 2);
  assert.equal(answer.bookingsWaiting, 1);
  assert.equal(answer.subscribers, 1);
  assert.equal(answer.reviewsWaiting, 1);
});

test("the one text field the query does return is a product name, not a person", async () => {
  const answer = await askTheRealQuery([
    { _id: "p1", _type: "product", name: "Silk Slip", stock: 0, color: "ivory" },
    loaded("stockAlert", { notified: false, size: "M", product: { _ref: "p1" } }),
    loaded("stockAlert", { notified: false, size: "S", product: { _ref: "p1" } }),
    loaded("stockAlert", { notified: false, size: "L", product: { _ref: "p1" } }),
    loaded("stockAlert", { notified: false, size: "XL", product: { _ref: "p1" } }),
    // Already told, so no longer waiting — the document is kept, not deleted.
    loaded("stockAlert", { notified: true, size: "L", product: { _ref: "p1" } }),
  ]);

  assert.equal(
    answer.stockWanted.length,
    4,
    "The four still waiting to hear. The cap on this list is 300, and a cap that quietly becomes small is a waiting list that quietly becomes wrong."
  );
  assert.equal(
    answer.stockWantedTotal,
    4,
    "Counted in the database rather than by measuring the list, which stops at 300 rows."
  );
  assert.deepEqual(
    [...new Set(answer.stockWanted.map((row) => row.product))],
    ["Silk Slip"],
    "The product is dereferenced by name. Following the reference must not bring anything else back."
  );
  assert.equal(JSON.stringify(answer.stockWanted).includes(SENTINEL), false);
});

/* ─── That the numbers are the right numbers ─── */

test("orders are counted inside their windows and drafts are never counted", async () => {
  const answer = await askTheRealQuery([
    loaded("order", { total: 10000, createdAt: daysFromNow(-1) }),
    loaded("order", { total: 5000, createdAt: daysFromNow(-6) }),
    loaded("order", { total: 2500, createdAt: daysFromNow(-20) }),
    loaded("order", { total: 9900, createdAt: daysFromNow(-200) }),
    // Sanity keeps an unpublished copy of anything being edited under a
    // drafts. prefix. Counting it shows every touched order twice.
    loaded("order", { _id: "drafts.order-x", total: 4000, createdAt: daysFromNow(-1) }),
  ]);

  assert.equal(answer.orders7, 2);
  assert.equal(answer.revenue7, 15000, "£150 in pence, and the draft's £40 is not in it.");
  assert.equal(answer.orders30, 3);
  assert.equal(answer.revenue30, 17500);
  assert.equal(answer.ordersAllTime, 4, "The draft is excluded here too.");
  assert.equal(answer.lastOrderAt, daysFromNow(-1));
});

test("fittings this week are found although slotStart has no timezone in it", async () => {
  // slotStart is a local wall-clock minute, "2026-09-22T14:30", which
  // dateTime() cannot parse. If the query ever starts using dateTime() on it,
  // this count silently becomes zero and Kristina double-books herself.
  const answer = await askTheRealQuery([
    loaded("atelierBooking", { status: "confirmed", slotStart: "2026-09-22T14:30" }),
    loaded("atelierBooking", { status: "confirmed", slotStart: "2026-09-25T09:00" }),
    loaded("atelierBooking", { status: "confirmed", slotStart: "2026-10-30T09:00" }),
    loaded("atelierBooking", { status: "confirmed", slotStart: "2026-09-01T09:00" }),
    loaded("atelierBooking", { status: "declined", slotStart: "2026-09-23T09:00" }),
  ]);

  assert.equal(answer.fittingsThisWeek, 2, "Only the two inside the next seven days, and not the declined one.");
});

test("the oldest unanswered request is the one the page leads with", async () => {
  const answer = await askTheRealQuery([
    loaded("atelierBooking", { status: "new", createdAt: daysFromNow(-1) }),
    loaded("atelierBooking", { status: "new", createdAt: daysFromNow(-5) }),
    loaded("atelierBooking", { status: "confirmed", createdAt: daysFromNow(-9) }),
  ]);

  assert.equal(answer.bookingsWaiting, 2);
  assert.equal(answer.oldestBookingAt, daysFromNow(-5), "Answered requests are not people waiting.");
});

test("a product is faulted for what it is actually missing", async () => {
  const answer = await askTheRealQuery([
    { _id: "a", _type: "product", name: "Full kit", category: "Lingerie", description: "Lovely", images: [{ _key: "1" }], color: "ivory", stock: 3 },
    { _id: "b", _type: "product", name: "No words", category: "Lingerie", images: [{ _key: "1" }], color: "black", stock: 1 },
    { _id: "c", _type: "product", name: "No picture", category: "Lingerie", description: "Lovely", images: [], color: "black", stock: 1 },
    { _id: "d", _type: "product", name: "Never photographed", category: "Kids", description: "Lovely", color: "black", stock: 1 },
    { _id: "e", _type: "product", name: "No colour", category: "Lingerie", description: "Lovely", images: [{ _key: "1" }], stock: 0 },
    // Sold more than there were. `stock == 0` walked past this one, on the one
    // day it matters most that the shop says there is nothing to send.
    { _id: "f", _type: "product", name: "Oversold", category: "Accessories", description: "Lovely", images: [{ _key: "1" }], color: "cream", stock: -1 },
  ]);

  assert.equal(answer.products, 6);
  assert.equal(answer.productsNoDescription, 1);
  assert.equal(answer.productsNoPhoto, 2, "An empty images list and a missing one are the same problem.");
  assert.equal(answer.productsNotInAds, 1, "Google asks a clothing item for a colour.");
  assert.equal(answer.productsSoldOut, 2, "Nothing to send is nothing to send, at zero and below it.");
});

test("a napkin with no colour is not accused of being invisible", async () => {
  // The line this backs used to read "cannot be shown in Google or Instagram
  // shopping" for every product with no colour. The feed sends a Home thing to
  // "Home & Garden > Decor" (api/meta-feed), which is outside the tree where
  // Google asks for a colour — so the page would have told her a napkin was
  // invisible to every ad and needed fixing. It is the clothing categories,
  // and only those, that are held back.
  const answer = await askTheRealQuery([
    { _id: "a", _type: "product", name: "Linen napkin", category: "Home", description: "Lovely", images: [{ _key: "1" }] },
    { _id: "b", _type: "product", name: "Table runner", category: "Home", description: "Lovely", images: [{ _key: "1" }] },
    { _id: "c", _type: "product", name: "Silk slip", category: "Lingerie", description: "Lovely", images: [{ _key: "1" }] },
  ]);

  assert.equal(answer.productsNotInAds, 1, "Only the slip. Home decor is not apparel.");
});

test("posts waiting on Kristina, posts refused and posts stuck are three different things", async () => {
  const answer = await askTheRealQuery([
    { _id: "1", _type: "socialPost", status: "draft" },
    { _id: "2", _type: "socialPost", status: "failed" },
    { _id: "3", _type: "socialPost", status: "approved", scheduledFor: daysFromNow(-1) },
    { _id: "4", _type: "socialPost", status: "approved", scheduledFor: daysFromNow(5) },
    // Out already, and still wearing Approved: a run that put the picture on
    // Instagram and died before it could write the status, or one Kristina
    // marked by hand. Calling it overdue sends her to post it twice.
    { _id: "3b", _type: "socialPost", status: "approved", scheduledFor: daysFromNow(-2), publishedAt: daysFromNow(-2) },
    { _id: "5", _type: "socialPost", status: "published", publishedAt: daysFromNow(-3) },
    { _id: "6", _type: "socialPost", status: "published", publishedAt: daysFromNow(-40) },
    // Claimed by a run that then died. The status is how the publisher stops
    // two runs sending the same picture, so it is normal for seconds and a
    // fault after hours.
    { _id: "7", _type: "socialPost", status: "publishing", _updatedAt: daysFromNow(-1) },
    { _id: "8", _type: "socialPost", status: "publishing", _updatedAt: new Date(NOW.getTime() - 60_000).toISOString() },
    // Half an hour in: a Reel Instagram is still transcoding looks exactly
    // like this, and calling it stuck would send her to undo a post that is
    // about to arrive by itself.
    { _id: "9", _type: "socialPost", status: "publishing", _updatedAt: new Date(NOW.getTime() - 30 * 60_000).toISOString() },
  ]);

  assert.equal(answer.postsWaitingApproval, 1, "A failed post is not waiting for a yes — pressing Approve on it does nothing.");
  assert.equal(answer.postsFailed, 1, "It went to Instagram, came back refused, and the reason is on the document.");
  assert.equal(
    answer.postsStuck,
    1,
    "Only the one from yesterday. A post claimed a minute ago, or half an hour ago, is on its way."
  );
  assert.equal(
    answer.postsOverdue,
    1,
    "A post dated for next week is a promise, not a failure; one that is already on Instagram is not late."
  );
  assert.equal(answer.postsPublished30, 2);
});

test("abandoned carts and gift cards answer the two awkward questions", async () => {
  const answer = await askTheRealQuery([
    loaded("abandonedCart", { total: 4200, createdAt: daysFromNow(-2) }),
    loaded("abandonedCart", { total: 6800, createdAt: daysFromNow(-3), recovered: true }),
    loaded("abandonedCart", { total: 9999, createdAt: daysFromNow(-30) }),
    loaded("giftCard", { active: true, balance: 5000, deliverAt: daysFromNow(-1) }),
    loaded("giftCard", { active: true, balance: 2500, deliverAt: daysFromNow(-2), sentAt: daysFromNow(-2) }),
    loaded("giftCard", { active: false, balance: 100000 }),
  ]);

  assert.equal(answer.cartsLeft7, 2);
  assert.equal(answer.cartsLeftValue7, 11000);
  assert.equal(answer.cartsRecovered7, 1);
  assert.equal(answer.giftCardBalance, 7500, "A spent or cancelled card is not money still owed.");
  assert.equal(answer.giftCardsLate, 1, "Due yesterday and never sent — the one that makes people angry.");
});

test("an empty shop answers with zeroes rather than nulls the page cannot print", async () => {
  const answer = await askTheRealQuery([]);
  assert.equal(answer.ordersAllTime, 0);
  assert.equal(answer.bookingsWaiting, 0);
  assert.equal(answer.oldestBookingAt, null);
  assert.equal(answer.lastOrderAt, null);
  assert.deepEqual(answer.stockWanted, []);
  assert.equal(answer.stockWantedTotal, 0);
  // A sum of nothing comes back as 0 from GROQ, and money() copes either way.
  assert.equal(money(answer.revenue7), "£0");
});

/* ─── Saying it in English ─── */

test("money keeps the pence", () => {
  assert.equal(money(0), "£0");
  assert.equal(money(2450), "£24.50");
  assert.equal(money(100), "£1");
  assert.equal(money(5), "£0.05");
  assert.equal(money(123456789), "£1,234,567.89");
  assert.equal(money(null), "£0", "A GROQ sum over nothing must not print as £null.");
  assert.equal(money(undefined), "£0");
});

test("counting says one thing or several things", () => {
  assert.equal(count(1, "order"), "1 order");
  assert.equal(count(3, "order"), "3 orders");
  assert.equal(count(0, "order"), "0 orders");
  assert.equal(count(1, "person", "people"), "1 person");
  assert.equal(count(4, "person", "people"), "4 people");
});

test("how long ago is written the way somebody would say it", () => {
  const ago = (ms: number) => howLongAgo(new Date(NOW.getTime() - ms).toISOString(), NOW);
  assert.equal(ago(30_000), "just now");
  assert.equal(ago(20 * 60_000), "20 minutes ago");
  assert.equal(ago(60 * 60_000), "an hour ago");
  assert.equal(ago(5 * 60 * 60_000), "5 hours ago");
  assert.equal(ago(DAY_MS), "yesterday", "“1 days ago” is how a page looks unfinished.");
  assert.equal(ago(4 * DAY_MS), "4 days ago");
  assert.equal(ago(60 * DAY_MS), "2 months ago");
  assert.equal(howLongAgo(null, NOW), null);
  assert.equal(howLongAgo("not a date", NOW), null, "A broken date must not print as NaN days ago.");
});

test("days since counts whole days, so this morning is not yet late", () => {
  assert.equal(daysSince(new Date(NOW.getTime() - 4 * 60 * 60_000).toISOString(), NOW), 0);
  assert.equal(daysSince(new Date(NOW.getTime() - 3 * DAY_MS).toISOString(), NOW), 3);
  assert.equal(daysSince(null, NOW), null);
});

test("Google's channel names are turned into something Kristina would say", () => {
  assert.equal(channelInEnglish("Organic Search"), "Found us on Google");
  assert.equal(channelInEnglish("Organic Social"), "Came from Instagram or Facebook");
  assert.equal(channelInEnglish("Direct"), "Typed the address in");
  // Rendered in a browser, "Cross-network" sat directly under "Found us on
  // Google" — Google's own word for traffic from a campaign that ran in
  // several places, on a page whose whole promise is that it contains no
  // analytics language. The shop runs Google Ads and a Meta feed, so it is a
  // row she will see.
  assert.equal(channelInEnglish("Cross-network"), "Came from one of your ads");
  assert.equal(channelInEnglish("Paid Other"), "Came from an ad");
  assert.equal(channelInEnglish("Display"), "Saw a banner ad");
  assert.equal(
    channelInEnglish("Some Group Google Adds In 2027"),
    "Some Group Google Adds In 2027",
    "A name we have no plain-English version of is still passed through — inventing one risks saying something untrue."
  );
});

test("the waiting list is grouped into what to make next", () => {
  const wanted = mostWanted([
    { product: "Silk Slip", size: "M" },
    { product: "Silk Slip", size: "S" },
    { product: "Lace Bralette", size: "M" },
    { product: "Silk Slip", size: "M" },
    { product: null },
    { product: "  " },
  ]);

  assert.deepEqual(wanted, [
    { name: "Silk Slip", people: 3 },
    { name: "Lace Bralette", people: 1 },
  ]);
});

/* ─── The page she reads ─── */

function raw(over: Partial<StatsRaw> = {}): StatsRaw {
  return {
    bookingsWaiting: 0,
    oldestBookingAt: null,
    fittingsThisWeek: 0,
    ordersAllTime: 0,
    orders7: 0,
    orders30: 0,
    revenue7: 0,
    revenue30: 0,
    lastOrderAt: null,
    ordersToMake: 0,
    cartsLeft7: 0,
    cartsLeftValue7: 0,
    cartsRecovered7: 0,
    stockWanted: [],
    stockWantedTotal: 0,
    products: 16,
    productsNoDescription: 0,
    productsNoPhoto: 0,
    productsSoldOut: 0,
    productsNotInAds: 0,
    postsWaitingApproval: 0,
    postsFailed: 0,
    postsStuck: 0,
    postsOverdue: 0,
    postsPublished30: 4,
    reviewsWaiting: 0,
    reviewsLive: 2,
    subscribers: 0,
    subscribers7: 0,
    giftCardBalance: 0,
    giftCardsLate: 0,
    friendLinks: 0,
    friendsRewarded30: 0,
    ...over,
  };
}

const NO_GA: Traffic = { state: "not-connected" };

function allLines(over: Partial<StatsRaw> = {}, traffic: Traffic = NO_GA) {
  return buildDashboard(raw(over), traffic, NOW).sections.flatMap((section) => section.lines);
}

test("a person waiting is the loudest thing on the page", () => {
  const page = buildDashboard(raw({ bookingsWaiting: 2, oldestBookingAt: daysFromNow(-3) }), NO_GA, NOW);

  assert.match(page.headline, /2 people/);
  assert.match(page.headline, /3 days/);

  const line = page.sections[0].lines.find((l) => l.key === "bookings-waiting");
  assert.ok(line);
  assert.equal(line.tone, "needs-you");
  assert.ok(line.action, "A line about somebody waiting is useless without the next click.");
});

test("nobody waiting is said out loud rather than left blank", () => {
  const line = allLines().find((l) => l.key === "bookings-waiting");
  assert.ok(line);
  assert.equal(line.tone, "good");
  assert.equal(line.action, undefined, "There is nothing to do, so there is no instruction.");
  assert.match(line.value, /Nobody/);
});

test("a quiet week is explained without the word conversion", () => {
  const page = buildDashboard(raw(), { state: "connected", visitors: 131, views: 402, sources: [] }, NOW);

  assert.match(page.headline, /131 people visited this week and nobody has bought yet/);

  const everything = JSON.stringify(page).toLowerCase();
  for (const jargon of ["conversion", "bounce", "ctr", "funnel", "engagement rate", "sessions", "roas", "aov"]) {
    assert.equal(everything.includes(jargon), false, `"${jargon}" is analytics language. Kristina does not read analytics.`);
  }
});

test("no carts at all is turned into the diagnosis it actually is", () => {
  const line = allLines({ orders7: 0, cartsLeft7: 0 }).find((l) => l.key === "carts-left");
  assert.ok(line, "At a shop with no orders, an empty basket list is the most useful fact on the page.");
  assert.match(line.meaning, /leaving earlier/);

  const busy = allLines({ orders7: 3, revenue7: 20000, cartsLeft7: 0 }).find((l) => l.key === "carts-left");
  assert.equal(busy, undefined, "At a shop that is selling, the line has nothing to say and does not appear.");
});

test("the two lines that change what they say without changing their number", () => {
  // A small shop is the shop's own biggest problem and the page says so — but
  // only while it is small. Saying it at sixteen products would be nagging,
  // and saying nothing at four would be leaving out the most useful sentence
  // on the page.
  const small = allLines({ products: 4 }).find((l) => l.key === "products");
  const grown = allLines({ products: 16 }).find((l) => l.key === "products");
  assert.match(small?.meaning ?? "", /more things to buy/i);
  assert.equal(
    /more things to buy/i.test(grown?.meaning ?? ""),
    false,
    "Sixteen products is not a small shop, and a page that keeps saying so is a page she stops reading."
  );

  const joined = allLines({ subscribers: 40, subscribers7: 3 }).find((l) => l.key === "subscribers");
  const quiet = allLines({ subscribers: 40, subscribers7: 0 }).find((l) => l.key === "subscribers");
  assert.match(joined?.meaning ?? "", /3 new ones this week/, "Growth this week is the reason to look at this line at all.");
  assert.match(quiet?.meaning ?? "", /Nobody new joined this week/);
  // It used to promise "people you can write to directly, for free". Nothing
  // in this project can write to them, and every address is sealed.
  for (const line of [joined, quiet]) {
    assert.equal(
      /write to (them |)directly/.test(line?.meaning ?? ""),
      false,
      "The page is promising a mailing tool the shop does not have."
    );
  }
});

test("a product with no photograph is urgent and a missing description is not", () => {
  const lines = allLines({ productsNoPhoto: 2, productsNoDescription: 3 });

  const photo = lines.find((l) => l.key === "no-photo");
  const words = lines.find((l) => l.key === "no-description");
  assert.equal(photo?.tone, "needs-you");
  assert.equal(words?.tone, "plain", "If everything is urgent she stops reading the page.");
});

test("the waiting list becomes an answer to what to make next", () => {
  const line = allLines({
    stockWanted: [
      { product: "Silk Slip" },
      { product: "Silk Slip" },
      { product: "Lace Bralette" },
    ],
    stockWantedTotal: 3,
  }).find((l) => l.key === "stock-wanted");

  assert.ok(line);
  assert.equal(line.value, "3 people");
  assert.match(line.meaning, /Silk Slip \(2\)/);
  assert.match(line.action ?? "", /make next/i);

  // Three, not one: the second and third are what she makes after the first,
  // and a line that names only the winner is a line she has to ask twice.
  const three = allLines({
    stockWanted: [
      { product: "Silk Slip" },
      { product: "Silk Slip" },
      { product: "Lace Bralette" },
      { product: "Kimono" },
    ],
    stockWantedTotal: 4,
  }).find((l) => l.key === "stock-wanted");

  assert.match(
    three?.meaning ?? "",
    /Most wanted: Silk Slip \(2\), Kimono \(1\), Lace Bralette \(1\)\./,
    "The top three, biggest first and then alphabetical, with nothing left over to mention."
  );
});

test("the waiting list says how many people asked, not how many rows came back", () => {
  // Two caps used to hide inside this one line. The rows stop at 300, and the
  // page printed the length of that list — so at 301 people waiting it would
  // have said "300 people" for ever. The tally is still cut to the top three,
  // and the ones past it are now counted rather than dropped in silence.
  const rows = [];
  for (let i = 0; i < 300; i += 1) rows.push({ product: `Thing ${i}` });
  rows.push({ product: "Silk Slip" }, { product: "Silk Slip" });

  const line = allLines({ stockWanted: rows, stockWantedTotal: 512 }).find(
    (l) => l.key === "stock-wanted"
  );

  assert.ok(line);
  assert.equal(line.value, "512 people", "The count comes from the database, not from the list.");
  assert.match(line.meaning, /Silk Slip \(2\)/);
  assert.match(
    line.meaning,
    /and \d+ other things/,
    "Everything past the top three is counted out loud rather than quietly dropped."
  );
});

/** Every number turned up at once, so that every line the page has appears. */
const EVERYTHING_AT_ONCE: Partial<StatsRaw> = {
  bookingsWaiting: 1,
  oldestBookingAt: daysFromNow(-2),
  orders7: 2,
  revenue7: 22000,
  orders30: 5,
  revenue30: 48000,
  ordersAllTime: 9,
  lastOrderAt: daysFromNow(-1),
  ordersToMake: 2,
  cartsLeft7: 3,
  cartsLeftValue7: 15000,
  cartsRecovered7: 1,
  stockWanted: [{ product: "Silk Slip" }],
  stockWantedTotal: 1,
  productsNoPhoto: 1,
  productsNoDescription: 1,
  productsNotInAds: 4,
  productsSoldOut: 2,
  postsWaitingApproval: 3,
  postsFailed: 1,
  postsStuck: 1,
  postsOverdue: 1,
  reviewsWaiting: 2,
  giftCardsLate: 1,
  giftCardBalance: 7500,
  subscribers: 40,
  subscribers7: 3,
  fittingsThisWeek: 2,
  friendLinks: 5,
  friendsRewarded30: 1,
};

/**
 * 🚨 The set of lines, pinned.
 *
 * The test below this one walks whatever lines happen to exist and asks each
 * to explain itself, which is worth having and proves nothing about the ones
 * that are missing. Mutation-tested: deleting the Google Shopping line whole,
 * taking the instruction off the abandoned-carts line, and turning the
 * what-to-make-next line from urgent to ordinary all left every test green —
 * three silent holes in a page whose entire value is what it says. So this
 * spells out, for one known input, exactly which lines appear, in what order,
 * how loud each one is and whether it carries something to do. A new line has
 * to be added here on purpose; a deleted one cannot leave quietly.
 */
const EVERY_LINE: [key: string, tone: string, hasAction: boolean][] = [
  ["bookings-waiting", "needs-you", true],
  ["posts-waiting", "needs-you", true],
  ["posts-failed", "needs-you", true],
  ["posts-stuck", "needs-you", true],
  ["posts-overdue", "needs-you", true],
  ["reviews-waiting", "needs-you", true],
  ["gift-cards-late", "needs-you", true],
  ["orders-7", "good", false],
  ["orders-30", "plain", false],
  ["last-order", "plain", false],
  ["orders-to-make", "plain", true],
  ["carts-left", "plain", true],
  ["gift-balance", "plain", false],
  ["products", "plain", false],
  ["no-photo", "needs-you", true],
  ["no-description", "plain", true],
  ["not-in-ads", "needs-you", true],
  ["sold-out", "plain", false],
  ["stock-wanted", "needs-you", true],
  ["posts-published", "good", false],
  ["subscribers", "plain", false],
  ["reviews-live", "good", false],
  ["fittings-week", "plain", false],
  ["friends", "plain", false],
];

/** And the same page when there is nothing wrong and nothing selling. */
const QUIET_PAGE: string[] = [
  "bookings-waiting",
  "orders-7",
  "orders-30",
  "last-order",
  "carts-left",
  "products",
  "posts-published",
  "subscribers",
  "reviews-live",
];

function shapeOf(lines: StatLine[]): [string, string, boolean][] {
  return lines.map((line) => [line.key, line.tone, !!line.action]);
}

test("the page has exactly the lines it is supposed to have", () => {
  const page = buildDashboard(raw(EVERYTHING_AT_ONCE), NO_GA, NOW);

  assert.deepEqual(
    page.sections.map((section) => section.key),
    ["waiting", "money", "shop", "reach"],
    "The four sections are the order she reads in: who is waiting, then money, then the shop, then being found."
  );
  assert.deepEqual(
    shapeOf(page.sections.flatMap((section) => section.lines)),
    EVERY_LINE,
    "A line has appeared, vanished, moved, changed how loud it is, or lost the thing to do about it."
  );

  assert.deepEqual(
    allLines().map((line) => line.key),
    QUIET_PAGE,
    "On a quiet morning the page must still say something, and must not invent an emergency."
  );
});

test("every line on the page says what its number means", () => {
  const busy = allLines({
    bookingsWaiting: 1,
    oldestBookingAt: daysFromNow(-2),
    orders7: 2,
    revenue7: 22000,
    orders30: 5,
    revenue30: 48000,
    ordersAllTime: 9,
    lastOrderAt: daysFromNow(-1),
    ordersToMake: 2,
    cartsLeft7: 3,
    cartsLeftValue7: 15000,
    cartsRecovered7: 1,
    stockWanted: [{ product: "Silk Slip" }],
    productsNoPhoto: 1,
    productsNoDescription: 1,
    productsNotInAds: 4,
    productsSoldOut: 2,
    postsWaitingApproval: 3,
    postsOverdue: 1,
    reviewsWaiting: 2,
    giftCardsLate: 1,
    giftCardBalance: 7500,
    subscribers: 40,
    subscribers7: 3,
    fittingsThisWeek: 2,
    friendLinks: 5,
    friendsRewarded30: 1,
  });

  for (const line of busy) {
    assert.ok(line.meaning.length > 20, `"${line.key}" shows a number with no explanation under it.`);
    assert.match(line.meaning, /[.!]$/, `"${line.key}" explains itself in something that is not a sentence.`);
    if (line.tone === "needs-you") {
      assert.ok(line.action, `"${line.key}" is marked urgent and does not say what to do about it.`);
    }
  }

  const keys = busy.map((line) => line.key);
  assert.equal(new Set(keys).size, keys.length, "Two lines share a key, so React will render one of them wrongly.");
});

/**
 * Every line is a number followed by a phrase, which is exactly how a page
 * ends up saying "2 products has no photograph". Kristina's first language is
 * English and she is the only person who reads this; a page that cannot
 * conjugate reads as a page nobody checked, and she stops trusting the
 * numbers on it too.
 */
test("the wording agrees with the number in front of it", () => {
  const busy: Partial<StatsRaw> = {
    bookingsWaiting: 3,
    oldestBookingAt: daysFromNow(-2),
    postsWaitingApproval: 2,
    reviewsWaiting: 2,
    reviewsLive: 4,
    giftCardsLate: 2,
    ordersToMake: 3,
    productsNoPhoto: 2,
    productsNoDescription: 4,
    productsSoldOut: 3,
    subscribers: 9,
    fittingsThisWeek: 2,
    friendLinks: 6,
    cartsLeft7: 4,
    cartsLeftValue7: 9000,
    cartsRecovered7: 2,
    stockWanted: [{ product: "Silk Slip" }, { product: "Silk Slip" }],
  };

  // Only the value-and-label pairs, which are the "<number> <phrase>" shape
  // this test is about. The headline is prose and is checked on its own below,
  // where "the oldest has waited two days" is correct and a blunt search for
  // " has " is not.
  const plural = buildDashboard(raw(busy), NO_GA, NOW);
  const pluralText = plural.sections
    .flatMap((s) => s.lines)
    .filter((l) => /^\d+\s/.test(l.value))
    .map((l) => `${l.value} ${l.label}`)
    .join(" | ");

  for (const wrong of [" has ", " is ", " was ", "of thems"]) {
    assert.equal(
      pluralText.includes(wrong),
      false,
      `A plural count is followed by a singular verb. The line reads: ${pluralText
        .split(" | ")
        .find((line) => line.includes(wrong))}`
    );
  }

  // And the singular still reads as a singular, so the fix is agreement
  // rather than everything having been forced into the plural.
  const one: Partial<StatsRaw> = {};
  for (const key of Object.keys(busy)) {
    if (key === "stockWanted") continue;
    if (key === "oldestBookingAt") continue;
    (one as Record<string, unknown>)[key] = 1;
  }
  one.oldestBookingAt = daysFromNow(-2);
  one.stockWanted = [{ product: "Silk Slip" }];
  one.cartsLeftValue7 = 9000;

  const singular = buildDashboard(raw(one), NO_GA, NOW);
  const singularText = singular.sections
    .flatMap((s) => s.lines)
    .filter((l) => /^\d+\s/.test(l.value))
    .map((l) => `${l.value} ${l.label}`)
    .join(" | ");

  assert.equal(singularText.includes(" are "), false, `A single thing is described in the plural: ${singularText}`);
  assert.equal(singularText.includes(" have "), false, `A single thing is described in the plural: ${singularText}`);
  assert.match(singularText, /1 person asked for a fitting and has not heard back/);
  assert.match(plural.headline, /3 people asked for a fitting and are waiting/);
});

/**
 * The sentence under the number was left out of the agreement work, so the
 * same fault carried on one line lower: "1 order is paid for and not yet being
 * made / These are still marked Paid", "1 product has no photograph / These
 * will not sell at all". Checked by name rather than by searching every
 * meaning for " is ", because a meaning is prose — "the one who has waited
 * longest wrote 3 days ago" is correct English and a blunt search calls it a
 * fault.
 */
test("the sentence under the number agrees with it as well", () => {
  const meaningOf = (over: Partial<StatsRaw>, key: string) =>
    allLines(over).find((line) => line.key === key)?.meaning ?? "";

  const alone = { ordersToMake: 1, productsNoPhoto: 1, postsFailed: 1, postsStuck: 1, productsNotInAds: 1, stockWanted: [{ product: "Silk Slip" }], stockWantedTotal: 1 };
  assert.match(meaningOf(alone, "orders-to-make"), /^This one is still marked Paid/);
  assert.match(meaningOf(alone, "no-photo"), /It will not sell at all\./);
  assert.match(meaningOf(alone, "posts-failed"), /Instagram would not take it,/);
  assert.match(meaningOf(alone, "posts-stuck"), /sending it and never finished, so it is neither/);
  assert.match(meaningOf(alone, "not-in-ads"), /Everything else about it is fine\./);
  assert.match(meaningOf(alone, "stock-wanted"), /This person has already decided to buy\./);
  assert.match(meaningOf({ cartsLeft7: 1, cartsLeftValue7: 9000 }, "carts-left"), /That one has not come back\./);

  const several = { ordersToMake: 3, productsNoPhoto: 2, postsFailed: 2, postsStuck: 2, productsNotInAds: 4, stockWanted: [{ product: "Silk Slip" }, { product: "Silk Slip" }], stockWantedTotal: 2 };
  assert.match(meaningOf(several, "orders-to-make"), /^These are still marked Paid/);
  assert.match(meaningOf(several, "no-photo"), /They will not sell at all\./);
  assert.match(meaningOf(several, "posts-failed"), /Instagram would not take them,/);
  assert.match(meaningOf(several, "posts-stuck"), /sending them and never finished, so they are neither/);
  assert.match(meaningOf(several, "not-in-ads"), /Everything else about them is fine\./);
  assert.match(meaningOf(several, "stock-wanted"), /These people have already decided to buy\./);
  assert.match(meaningOf({ cartsLeft7: 4, cartsLeftValue7: 9000 }, "carts-left"), /None of them came back yet\./);
});

/**
 * A failed post is not a post waiting for a yes. It has already been to
 * Instagram and come back refused, and the publisher will never pick it up
 * again on its own — it only takes posts marked Approved. So "press Approve"
 * was an instruction that did nothing, printed on the one line that was
 * telling her something had gone wrong.
 */
test("a refused post is not confused with one waiting for her yes", () => {
  const lines = allLines({ postsWaitingApproval: 2, postsFailed: 3, postsStuck: 1 });

  const waiting = lines.find((l) => l.key === "posts-waiting");
  const failed = lines.find((l) => l.key === "posts-failed");
  const stuck = lines.find((l) => l.key === "posts-stuck");

  assert.ok(waiting && failed && stuck, "All three situations have a line of their own.");
  assert.match(waiting.action ?? "", /press Approve/);
  assert.equal(
    /press Approve/.test(failed.action ?? ""),
    false,
    "Approving a post Instagram has already refused does nothing at all."
  );
  assert.match(failed.action ?? "", /What Went Wrong/, "It is the field on the document that says why.");
  assert.match(stuck.meaning, /never finished/);
  assert.equal(failed.tone, "needs-you");
  assert.equal(stuck.tone, "needs-you");
});

test("the visitors block carries through whichever of its three states applies", () => {
  assert.equal(buildDashboard(raw(), { state: "not-connected" }, NOW).traffic.state, "not-connected");
  assert.equal(buildDashboard(raw(), { state: "error", detail: "no" }, NOW).traffic.state, "error");

  const connected = buildDashboard(
    raw(),
    { state: "connected", visitors: 10, views: 30, sources: [{ name: "Direct", visitors: 10 }] },
    NOW
  );
  assert.equal(connected.traffic.state, "connected");
  assert.equal(
    connected.sections.length > 0,
    true,
    "Google being connected or not must never change whether the shop's own numbers are shown."
  );
});

/* ─── The line the Studio must not cross ─── */

const ROOT = resolve(__dirname, "..", "..");

/** Every name the Studio sidebar shows, read out of the file that makes it. */
function studioListTitles(): Set<string> {
  const source = readFileSync(join(ROOT, "src/sanity/structure.ts"), "utf8");
  const titles = new Set<string>();
  for (const match of source.matchAll(/\.title\(\s*["']([^"']+)["']\s*\)/g)) {
    titles.add(match[1]);
  }
  return titles;
}

/** Everything Kristina can read on this page, in one bag of strings. */
function everythingSheReads(): { where: string; text: string }[] {
  const pages = [
    buildDashboard(raw(EVERYTHING_AT_ONCE), NO_GA, NOW),
    buildDashboard(raw(), { state: "connected", visitors: 131, views: 402, sources: [] }, NOW),
  ];
  const said: { where: string; text: string }[] = [];
  for (const page of pages) {
    said.push({ where: "headline", text: page.headline });
    for (const section of page.sections) {
      said.push({ where: `${section.key} (title)`, text: section.title });
      for (const line of section.lines) {
        said.push({ where: line.key, text: `${line.label} ${line.meaning} ${line.action ?? ""}` });
      }
    }
  }
  return said;
}

/**
 * 🚨 Why this test exists, in the words of the person who found it.
 *
 * The two loudest lines on this page told her to open "Fitting Requests" and
 * "Social Posts". Neither exists. The sidebar calls them "Atelier Bookings"
 * and "Posts to approve" — and immediately under the first sits "Fitting
 * Times", which is the hours she is free to see people, so the obvious guess
 * put her in the wrong document. Both lines were about somebody already
 * waiting: the page that was built to tell her what to do sent her hunting.
 *
 * Reading it back cannot catch that, because both names read perfectly well.
 * Only comparing them with the sidebar can. So: every list the page names is
 * looked up in structure.ts, and every straight-quoted phrase anywhere in the
 * page has to be one of those names — which is what stops the next person
 * writing a list name into a sentence by hand and missing the check. Fields
 * and buttons inside a document are quoted with “curly quotes” and are not
 * list names; see STUDIO_LISTS in studioStats.ts.
 */
test("every list the page names is a list the Studio really has", () => {
  const titles = studioListTitles();
  assert.ok(
    titles.size > 10,
    `Only ${titles.size} list names were found in structure.ts — the scanner has stopped working, and this test now proves nothing.`
  );

  const known = new Set<string>();
  for (const name of Object.values(STUDIO_LISTS)) {
    assert.ok(
      titles.has(name),
      `The page sends Kristina to "${name}" and the Studio sidebar has no such list. It has: ${[...titles].join(", ")}.`
    );
    known.add(name);
  }

  let quotedSomewhere = 0;
  for (const { where, text } of everythingSheReads()) {
    for (const match of text.matchAll(/"([^"]+)"/g)) {
      quotedSomewhere += 1;
      assert.ok(
        known.has(match[1]),
        `The "${where}" line tells her to open "${match[1]}", which is not one of the lists in STUDIO_LISTS. Name it through STUDIO_LISTS so this test can check it against structure.ts — or, if it is a field or a button rather than a list, quote it with “curly quotes”.`
      );
    }
  }
  assert.ok(
    quotedSomewhere >= 6,
    `Only ${quotedSomewhere} quoted list names were found on the whole page. The instructions that made this page worth building have gone.`
  );
});

/** Follow an import the way the bundler does: relative paths and the @/ alias. */
function resolveImport(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else if (specifier.startsWith("@/")) base = join(ROOT, "src", specifier.slice(2));
  else return null; // a package, not ours

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        if (readFileSync(candidate).length >= 0) return candidate;
      } catch {
        /* a directory — keep looking */
      }
    }
  }
  return null;
}

const IMPORTS = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;

function importsOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORTS)) {
    const specifier = match[1] ?? match[2];
    if (specifier) found.push(specifier);
  }
  return found;
}

/**
 * 🚨 The measured reason this test exists.
 *
 * sanity.config.ts begins with "use client", and the whole Studio is compiled
 * into the same Next build as the shop, so every file reachable from that
 * config becomes browser code. A Studio file that imports @/lib/pii builds
 * without a single warning, and `createDecipheriv` together with the read of
 * process.env.DATA_SECRET is then sitting in a public JavaScript chunk that
 * anybody can open. The key itself does not go with it — it is not a
 * NEXT_PUBLIC_ variable, so in the browser it is undefined — which is worse
 * than it sounds, because the failure is silent: unsealing simply returns
 * nothing, for ever, and nothing in the build says why.
 *
 * `import "server-only"` is the usual guard and does work in the build, but
 * this project's tests run under plain node, where that package throws on
 * import and takes thirty existing tests down with it. So the guard lives
 * here instead, in the tooling this repo actually has.
 */
test("nothing the Studio can reach can decrypt a customer", () => {
  const forbidden = [join(ROOT, "src/lib/pii.ts"), join(ROOT, "src/lib/secrets.ts")];
  const builtins = new Set([
    "crypto", "fs", "path", "os", "child_process", "net", "http", "https",
    "stream", "zlib", "dns", "tls", "worker_threads", "server-only",
  ]);

  const seen = new Set<string>();
  const queue = [join(ROOT, "sanity.config.ts")];
  const chains = new Map<string, string>();

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);

    const source = readFileSync(file, "utf8");
    for (const specifier of importsOf(source)) {
      const bare = specifier.replace(/^node:/, "");
      assert.equal(
        builtins.has(bare),
        false,
        `${relative(ROOT, file)} imports "${specifier}", a server module. It is reachable from sanity.config.ts, so it is compiled into the browser. Chain: ${chains.get(file) ?? "sanity.config.ts"}`
      );

      const target = resolveImport(specifier, file);
      if (!target) continue;

      assert.equal(
        forbidden.includes(target),
        false,
        `${relative(ROOT, file)} imports ${relative(ROOT, target)}, which holds the key to every customer's name and address. It is reachable from sanity.config.ts, which means it would be compiled into a public browser chunk — and it would build cleanly while doing it. Take the import out; ask the server for the number instead, as dashboardTool.tsx does. Chain: ${chains.get(file) ?? "sanity.config.ts"} → ${relative(ROOT, file)}`
      );

      if (!seen.has(target)) {
        chains.set(target, `${chains.get(file) ?? "sanity.config.ts"} → ${relative(ROOT, file)}`);
        queue.push(target);
      }
    }
  }

  // The walk must have gone somewhere, or it proves nothing at all.
  assert.ok(seen.has(join(ROOT, "src/sanity/dashboardTool.tsx")), "The walk never reached the Dashboard.");
  assert.ok(seen.has(join(ROOT, "src/lib/studioStats.ts")), "The walk never reached the numbers it renders.");
  assert.ok(seen.size > 10, `Only ${seen.size} files were walked — the import scanner has stopped working.`);
});

/**
 * The route cannot be imported here to be tested: it pulls in next/server and
 * @/lib/ga4, and ga4 carries `import "server-only"`, which throws outright
 * under plain node. So this reads it instead.
 *
 * A source check is a weak test and this one is worth having anyway. The reply
 * carries a week's takings and an order count — facts about a one-woman
 * business that belong to her — and `fromThisSite` alone does not protect
 * them, because an Origin header is one line of curl. Only asking Sanity who
 * the caller is does. Deleting that check would leave every test green.
 */
test("the numbers route still asks Sanity who is calling", () => {
  const source = readFileSync(join(ROOT, "src/app/api/studio-stats/route.ts"), "utf8");

  assert.match(
    source,
    /isProjectMember\(/,
    "The route no longer checks that the caller is a member of this Sanity project. Weekly takings would then be readable by anyone who can forge an Origin header."
  );
  assert.match(source, /fromThisSite\(/, "The cheap filter in front of the real check is gone.");
  assert.match(source, /rateLimit\(/, "Nothing stops this route being hammered.");
});

/**
 * "Check again" is the button she presses immediately after answering a
 * fitting request, to watch the red line go. For up to ninety seconds it
 * handed back the identical cached page while flipping to "Reading…", so it
 * looked like it had worked and nothing had changed. The component asks with
 * `fresh: true`, the route skips its cache read when it sees it, and neither
 * half is any use without the other — so both are checked here, and by reading
 * the source, because the route imports server-only through ga4 and cannot be
 * loaded under plain node.
 */
test("Check again really goes and looks again", () => {
  const route = readFileSync(join(ROOT, "src/app/api/studio-stats/route.ts"), "utf8");
  const panel = readFileSync(join(ROOT, "src/sanity/dashboardTool.tsx"), "utf8");

  assert.match(
    route,
    /!fresh\s*&&\s*cached/,
    "The route consults its cache before asking whether the caller wanted fresh numbers, so the button is a no-op again."
  );
  assert.match(
    route,
    /fresh\s*=\s*asked\?\.fresh === true/,
    "Nothing reads the flag the component sends."
  );
  assert.match(
    panel,
    /JSON\.stringify\(\{ token, fresh \}\)/,
    "The panel has stopped asking for fresh numbers, so the route will always serve the cached ones."
  );
  assert.match(
    panel,
    /readDashboard\(\s*token\s*,\s*attempt > 0\s*\)/,
    "Pressing the button must be what asks for fresh numbers — the first read of the session is allowed to be cached."
  );
  // The token is a value, and the effect depends on the value rather than on
  // the client object. `useClient` memoises on the reference of the options it
  // is given, so an object built inline missed every render, handed back a new
  // client, and re-ran this effect for as long as the tab was open — the panel
  // asked the site for the takings without pause.
  assert.match(
    panel,
    /useClient\(CLIENT_OPTIONS\)/,
    "useClient must be handed the hoisted options. Built inline they are a new object every render, the cache never hits, and the panel reads the takings in a loop."
  );
  assert.ok(
    !/useClient\(\s*\{/.test(panel),
    "An object literal passed straight to useClient is the loop, however it is spelled."
  );
  assert.match(
    panel,
    /\}, \[token, attempt\]\)/,
    "The effect must depend on the token string, not on the client object — an unstable client is an unbounded read loop."
  );
});

/**
 * Google is allowed to be missing and is not allowed to be slow.
 *
 * Both reads carry the same deadline, because a socket that never answers is
 * not an error anything catches: it eats the whole serverless function until
 * Vercel gives up, and takes down the shop's own numbers — which had already
 * arrived — for the sake of a block the page is happy to render without. Read
 * from the source, because ga4.ts carries `import "server-only"` and throws
 * outright under plain node.
 */
test("Google gets a deadline, and the shop's numbers are read at the same time", () => {
  const ga4 = readFileSync(join(ROOT, "src/lib/ga4.ts"), "utf8");
  const route = readFileSync(join(ROOT, "src/app/api/studio-stats/route.ts"), "utf8");

  assert.match(ga4, /AbortSignal\.timeout\(GOOGLE_TIMEOUT_MS\)/, "Google has no deadline again.");
  assert.match(
    ga4,
    /return await fetch\(url, \{ \.\.\.init, cache: "no-store", signal \}\)/,
    "The deadline is created and never handed to the request."
  );
  assert.equal(
    /await fetch\(\s*(TOKEN_URL|`\$\{DATA_API\})/.test(ga4),
    false,
    "A call to Google has gone back to plain fetch, so it has no deadline on it."
  );
  assert.match(
    route,
    /await Promise\.all\(\[/,
    "Sanity and Google are read one after the other again, so Google's slowness is added to the shop's own."
  );
});

/**
 * 🚨 The failure this guards against is not a leak, it is the page Kristina
 * lands on. A 200 whose body is not a Dashboard — an empty reply, a captive
 * wifi portal, a half-deployed route — was read straight into the render,
 * where an empty body threw "Cannot read properties of null (reading
 * 'headline')" and `{}` threw on sections.map. This tool is registered first
 * in sanity.config.ts, so that stack trace is what opening the Studio looks
 * like.
 */
test("a reply that is not a dashboard is spotted before it is rendered", () => {
  const real = buildDashboard(raw(), NO_GA, NOW);
  assert.equal(isDashboard(real), true, "The thing the route actually sends must pass.");
  assert.equal(isDashboard(JSON.parse(JSON.stringify(real))), true, "And it must still pass after a round trip through JSON.");

  // Every one of these arrived as a 200 in somebody's browser at some point:
  // an empty body, a proxy's idea of an answer, a route that half deployed.
  for (const notADashboard of [
    null,
    undefined,
    {},
    "",
    "<html>Sign in to the wifi</html>",
    [],
    { headline: "x" },
    { headline: "x", measuredAt: "now", sections: "none", traffic: {} },
    { headline: "x", measuredAt: "now", sections: [{ title: "Money" }], traffic: {} },
    { headline: "x", measuredAt: "now", sections: [null], traffic: {} },
    { headline: "x", measuredAt: "now", sections: [] },
  ]) {
    assert.equal(
      isDashboard(notADashboard),
      false,
      `${JSON.stringify(notADashboard)} was accepted as a dashboard. Rendering it throws inside Sanity's error boundary, and this tool is the first one in sanity.config.ts — so a stack trace is what opening the Studio looks like.`
    );
  }

  const panel = readFileSync(join(ROOT, "src/sanity/dashboardTool.tsx"), "utf8");
  assert.match(
    panel,
    /if \(!isDashboard\(body\)\)/,
    "The check exists and the panel does not call it, which is the same as not having one."
  );
  assert.match(
    panel,
    /shape this page did not understand/,
    "The unexpected-shape failure has lost the sentence that says what to do about it."
  );
});

test("a string that cannot be a Sanity token is refused before Sanity is asked", () => {
  // Not about letting the wrong person in — isProjectMember still decides that.
  // It is about the site being made to ask api.sanity.io about somebody else's
  // stolen tokens, 120 times an hour, with Vercel's address on the request.
  for (const rubbish of ["", "hello", "sk", "  ", "not a token", "<script>", "a".repeat(501), "abc".repeat(3)]) {
    assert.equal(looksLikeAToken(rubbish), false, `"${rubbish.slice(0, 20)}" reached the network.`);
  }

  // And a real one still gets through: Sanity's session tokens are long runs
  // of letters, digits and the odd separator.
  assert.equal(looksLikeAToken("sk" + "A1b2C3d4".repeat(20)), true);
  assert.equal(looksLikeAToken(`${"x".repeat(40)}.${"y".repeat(40)}-_`), true);
});
