/**
 * The numbers behind the Dashboard in the Studio.
 *
 * Kristina runs the shop alone and has three places to look at how it is
 * doing: Vercel, Google Analytics and the Studio. She looks at one of them.
 * So the shop's own numbers come to her, on the page she already opens every
 * day, and nothing here needs a second password.
 *
 * 🚨 The hard rule this file exists under: the Sanity dataset is readable by
 * anyone with the project id — the free plan has no private datasets — so
 * customer names, emails, addresses and phone numbers are encrypted in the
 * documents (see @/lib/pii). This file counts them and never reads them.
 * Every projection below is written out field by field for that reason. A
 * single `*[_type == "order"]{...}` with a spread would pull `emailSealed` and
 * `shippingAddressSealed` into the API's reply and into Vercel's request logs,
 * which is exactly the leak the sealing was bought to prevent. The test named
 * "the dashboard query answers with counts and never with a customer" runs
 * this query for real, against documents whose every private field is a
 * sentinel word, and fails if that word comes back anywhere in the answer.
 *
 * Everything here is a pure function of its arguments, `now` included, so the
 * tests can ask what a Tuesday in September looked like.
 */

/** Sums are in pence, the way Stripe and every document in the dataset hold them. */
export const STUDIO_STATS_QUERY = `{
  // ── Someone is waiting on Kristina ──
  "bookingsWaiting": count(*[
    _type == "atelierBooking" && !(_id in path("drafts.**")) && status == "new"
  ]),
  "oldestBookingAt": *[
    _type == "atelierBooking" && !(_id in path("drafts.**")) && status == "new"
  ] | order(createdAt asc)[0].createdAt,
  // slotStart is a local wall-clock minute — "2026-09-22T14:30", no zone, no
  // seconds — because a fitting at half two is at half two in June and in
  // December. dateTime() cannot read it, so the week is bounded by string
  // comparison against plain dates, which sorts correctly for this format.
  "fittingsThisWeek": count(*[
    _type == "atelierBooking" && !(_id in path("drafts.**"))
    && status == "confirmed" && defined(slotStart)
    && slotStart >= $todayLocal && slotStart < $weekAheadLocal
  ]),

  // ── Money ──
  "ordersAllTime": count(*[_type == "order" && !(_id in path("drafts.**"))]),
  "orders7": count(*[
    _type == "order" && !(_id in path("drafts.**"))
    && defined(createdAt) && dateTime(createdAt) > dateTime($weekAgo)
  ]),
  "orders30": count(*[
    _type == "order" && !(_id in path("drafts.**"))
    && defined(createdAt) && dateTime(createdAt) > dateTime($monthAgo)
  ]),
  "revenue7": math::sum(*[
    _type == "order" && !(_id in path("drafts.**"))
    && defined(createdAt) && dateTime(createdAt) > dateTime($weekAgo)
  ].total),
  "revenue30": math::sum(*[
    _type == "order" && !(_id in path("drafts.**"))
    && defined(createdAt) && dateTime(createdAt) > dateTime($monthAgo)
  ].total),
  "lastOrderAt": *[
    _type == "order" && !(_id in path("drafts.**")) && defined(createdAt)
  ] | order(createdAt desc)[0].createdAt,
  // Paid and not yet moved on: the pile on her table, not a problem by itself.
  "ordersToMake": count(*[
    _type == "order" && !(_id in path("drafts.**")) && status == "paid"
  ]),

  // ── The till that did not ring ──
  // Someone reached the card form and stopped. At a shop with no orders this
  // is the most useful number on the page: none at all means they are leaving
  // before checkout, several means checkout itself is where it goes wrong.
  "cartsLeft7": count(*[
    _type == "abandonedCart" && !(_id in path("drafts.**"))
    && defined(createdAt) && dateTime(createdAt) > dateTime($weekAgo)
  ]),
  "cartsLeftValue7": math::sum(*[
    _type == "abandonedCart" && !(_id in path("drafts.**"))
    && defined(createdAt) && dateTime(createdAt) > dateTime($weekAgo)
  ].total),
  "cartsRecovered7": count(*[
    _type == "abandonedCart" && !(_id in path("drafts.**"))
    && defined(createdAt) && dateTime(createdAt) > dateTime($weekAgo)
    && recovered == true
  ]),

  // ── People who told us what they want ──
  // A stock alert is kept after its email goes out, marked notified, so the
  // ones still waiting are the ones where notified is not true. Only the
  // product name and size come back; the address that asked stays sealed.
  "stockWanted": *[
    _type == "stockAlert" && !(_id in path("drafts.**")) && notified != true
  ][0...300]{ "product": product->name, size },
  // The rows above stop at 300 so that one product going round Instagram
  // cannot make this reply enormous. The number of people is asked for
  // separately because the page used to print the length of that list, which
  // would have read "300 people" for ever from the 301st person onwards.
  "stockWantedTotal": count(*[
    _type == "stockAlert" && !(_id in path("drafts.**")) && notified != true
  ]),

  // ── The shop itself ──
  "products": count(*[_type == "product" && !(_id in path("drafts.**"))]),
  "productsNoDescription": count(*[
    _type == "product" && !(_id in path("drafts.**")) && !defined(description)
  ]),
  "productsNoPhoto": count(*[
    _type == "product" && !(_id in path("drafts.**"))
    && (!defined(images) || count(images) == 0)
  ]),
  // A test for exactly zero walks straight past an oversold product sitting at -1,
  // which is the one moment the shop most needs to say there is nothing to send.
  "productsSoldOut": count(*[
    _type == "product" && !(_id in path("drafts.**")) && defined(stock) && stock <= 0
  ]),
  // Products the catalogues will show less of, not products missing from the
  // feed. api/meta-feed sends every product with a slug and fills in gender and
  // age group from the category; colour it cannot invent, and it sends g:color
  // only when there is one. What is true is narrower than "not in ads": Google asks
  // for a colour inside its Apparel & Accessories tree, which is where the
  // three clothing categories are mapped, and it is not where Home things go —
  // they are "Home & Garden > Decor" (api/meta-feed, GOOGLE_CATEGORY). So a
  // napkin with no colour is not a fault, and the page must not say it is.
  "productsNotInAds": count(*[
    _type == "product" && !(_id in path("drafts.**"))
    && category in ["Lingerie", "Kids", "Accessories"] && !defined(color)
  ]),

  // ── Instagram ──
  // Three situations that all look like "it has not gone out yet" and need
  // three different moves from her. They were one number until a review found
  // the page telling her a failed post was "waiting for your yes" and to press
  // Approve — which does nothing: the post has already been out, come back
  // refused, and what it needs is for somebody to read the reason.
  "postsWaitingApproval": count(*[
    _type == "socialPost" && !(_id in path("drafts.**")) && status == "draft"
  ]),
  "postsFailed": count(*[
    _type == "socialPost" && !(_id in path("drafts.**")) && status == "failed"
  ]),
  // "publishing" is the few seconds a post is on its way to Instagram, so one
  // still wearing it hours later is a run that died halfway. Two hours is the
  // same line siteHealth draws (IN_FLIGHT_STALE_HOURS), and it is wide enough
  // that a Reel Instagram is still transcoding is not called stuck.
  "postsStuck": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "publishing" && dateTime(_updatedAt) < dateTime($stuckBefore)
  ]),
  "postsOverdue": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && status == "approved" && !defined(publishedAt)
    && defined(scheduledFor) && dateTime(scheduledFor) < dateTime($now)
  ]),
  "postsPublished30": count(*[
    _type == "socialPost" && !(_id in path("drafts.**"))
    && defined(publishedAt) && dateTime(publishedAt) > dateTime($monthAgo)
  ]),

  // ── Proof other people liked it ──
  "reviewsWaiting": count(*[
    _type == "review" && !(_id in path("drafts.**")) && approved != true
  ]),
  "reviewsLive": count(*[
    _type == "review" && !(_id in path("drafts.**")) && approved == true
  ]),

  // ── The list she can write to herself ──
  "subscribers": count(*[
    _type == "subscriber" && !(_id in path("drafts.**")) && unsubscribed != true
  ]),
  "subscribers7": count(*[
    _type == "subscriber" && !(_id in path("drafts.**")) && unsubscribed != true
    && defined(createdAt) && dateTime(createdAt) > dateTime($weekAgo)
  ]),

  // ── Promises outstanding ──
  // An unspent gift card is money already taken for goods not yet made.
  "giftCardBalance": math::sum(*[
    _type == "giftCard" && !(_id in path("drafts.**")) && active == true
  ].balance),
  "giftCardsLate": count(*[
    _type == "giftCard" && !(_id in path("drafts.**"))
    && defined(deliverAt) && dateTime(deliverAt) < dateTime($now) && !defined(sentAt)
  ]),

  // ── Friends telling friends ──
  "friendLinks": count(*[
    _type == "referrer" && !(_id in path("drafts.**")) && active == true
  ]),
  "friendsRewarded30": count(*[
    _type == "referral" && !(_id in path("drafts.**")) && outcome == "rewarded"
    && defined(createdAt) && dateTime(createdAt) > dateTime($monthAgo)
  ])
}`;

/** One row of "people are waiting for this item", with nobody's address in it. */
export interface StockWant {
  product: string | null;
  size?: string | null;
}

/** Exactly what STUDIO_STATS_QUERY answers with. Numbers, dates, product names. */
export interface StatsRaw {
  bookingsWaiting: number;
  oldestBookingAt: string | null;
  fittingsThisWeek: number;
  ordersAllTime: number;
  orders7: number;
  orders30: number;
  revenue7: number | null;
  revenue30: number | null;
  lastOrderAt: string | null;
  ordersToMake: number;
  cartsLeft7: number;
  cartsLeftValue7: number | null;
  cartsRecovered7: number;
  stockWanted: StockWant[];
  stockWantedTotal: number;
  products: number;
  productsNoDescription: number;
  productsNoPhoto: number;
  productsSoldOut: number;
  productsNotInAds: number;
  postsWaitingApproval: number;
  postsFailed: number;
  postsStuck: number;
  postsOverdue: number;
  postsPublished30: number;
  reviewsWaiting: number;
  reviewsLive: number;
  subscribers: number;
  subscribers7: number;
  giftCardBalance: number | null;
  giftCardsLate: number;
  friendLinks: number;
  friendsRewarded30: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The parameters STUDIO_STATS_QUERY needs, derived from one instant. */
export function statsParams(now: Date): Record<string, string> {
  return {
    now: now.toISOString(),
    weekAgo: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
    monthAgo: new Date(now.getTime() - 30 * DAY_MS).toISOString(),
    // Plain dates, to be compared against slotStart as text. Southampton is
    // never more than an hour off UTC, and a fitting booked for 00:30 on the
    // boundary day counting in the wrong week is not worth a timezone library
    // in a query that answers "is this week busy".
    todayLocal: now.toISOString().slice(0, 10),
    weekAheadLocal: new Date(now.getTime() + 7 * DAY_MS).toISOString().slice(0, 10),
    // Anything still marked "publishing" from before this instant stopped
    // halfway. Two hours, the same as siteHealth's IN_FLIGHT_STALE_HOURS.
    stuckBefore: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
  };
}

/* ─── Saying it in English ─── */

/**
 * Pence as Kristina writes prices.
 *
 * Whole pounds lose the pence, which reads as a rounding error on a £24.50
 * order and as a wrong total when three of them are added up.
 */
export function money(pence: number | null | undefined): string {
  const n = typeof pence === "number" && Number.isFinite(pence) ? pence : 0;
  const negative = n < 0;
  const abs = Math.abs(Math.round(n));
  const pounds = Math.floor(abs / 100);
  const rest = abs % 100;
  const body =
    rest === 0
      ? `£${pounds.toLocaleString("en-GB")}`
      : `£${pounds.toLocaleString("en-GB")}.${String(rest).padStart(2, "0")}`;
  return negative ? `−${body}` : body;
}

/** "3 orders", "1 order" — the plural without a library. */
export function count(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : many ?? `${one}s`}`;
}

/**
 * The verb that agrees with a count: agrees(2, "has", "have") → "have".
 *
 * Needed because every line on this page is a number followed by a phrase, and
 * building that phrase from a fixed string gives "2 products has no
 * photograph". Kristina's English is her first language, and a page that
 * cannot conjugate reads as a page nobody checked.
 */
export function agrees(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

/**
 * How long ago, for someone who wants to know whether to worry.
 *
 * Hours below a day because "someone has been waiting since this morning" and
 * "someone has been waiting since Tuesday" are different situations, and
 * "0 days" reads like nothing happened.
 */
export function howLongAgo(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;

  const ms = now.getTime() - then;
  if (ms < 0) return "just now";

  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;

  const months = Math.round(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

/**
 * The same span, counted in whole days, for deciding how loud a line is.
 * A request that arrived four hours ago is not late; one from Saturday is.
 */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.floor((now.getTime() - then) / DAY_MS);
}

/* ─── What she reads ─── */

/**
 * The lists in the Studio sidebar this page sends her to, spelled exactly as
 * src/sanity/structure.ts titles them.
 *
 * 🚨 Why they are written down here instead of typed into each sentence: the
 * first version of this page said 'Open "Fitting Requests"' and 'Open "Social
 * Posts"'. Neither list exists. The sidebar has "Atelier Bookings", and right
 * next to it a differently-purposed "Fitting Times" — the hours she is free —
 * so the obvious guess put her in the wrong document altogether. Those were
 * the page's two loudest lines, the ones somebody is waiting on.
 *
 * The rule the whole file keeps, so that the test can check it: a "straight
 * double-quoted" phrase in anything Kristina reads is the name of a list in the
 * sidebar and nothing else. A field or a button inside a document is quoted
 * with “curly quotes” — “Primary Colour”, “What Went Wrong”, “Post to Instagram now”.
 * The test "every list the page names is a list the Studio really has" pulls
 * the straight-quoted phrases out of every line and looks each one up in
 * structure.ts, so renaming a list in the sidebar breaks the build rather than
 * her afternoon.
 */
export const STUDIO_LISTS = {
  bookings: "Atelier Bookings",
  postsToApprove: "Posts to approve",
  postsGoingOut: "Posts going out",
  products: "Products",
  orders: "Orders",
  reviews: "Reviews",
  giftCards: "Gift Cards",
  siteSettings: "Site Settings",
} as const;

/**
 * How much a line wants attention.
 *
 * "needs-you" is reserved for lines where someone is waiting on Kristina or
 * money is walking away. If everything is urgent she stops reading the page,
 * which is how the last dashboard anyone built for her got ignored.
 */
export type Tone = "needs-you" | "good" | "plain";

export interface StatLine {
  /** Stable across renders and across empty states, so React can key on it. */
  key: string;
  /** The number itself, already written out — "3 people", "£142.50". */
  value: string;
  /** What that number is, in one short phrase. */
  label: string;
  /** Why it matters, in a full sentence, no jargon. */
  meaning: string;
  /** Present only when there is something to do about it. */
  action?: string;
  tone: Tone;
}

export interface StatSection {
  key: string;
  title: string;
  lines: StatLine[];
}

/* ─── Visitors, when Google is connected ─── */

export interface TrafficSource {
  /** "Organic Search", "Direct", "Instagram" — Google's own wording, tidied. */
  name: string;
  visitors: number;
}

export type Traffic =
  | { state: "connected"; visitors: number; views: number; sources: TrafficSource[] }
  | { state: "not-connected" }
  | { state: "error"; detail: string };

export interface Dashboard {
  /** When the numbers were read, so a cached page can say so. */
  measuredAt: string;
  /** The one or two things worth doing first, lifted out of the sections. */
  headline: string;
  sections: StatSection[];
  traffic: Traffic;
}

/**
 * Is this reply actually a Dashboard, or merely a 200?
 *
 * 🚨 Measured in a browser: an empty 200 body made the panel throw "Cannot
 * read properties of null (reading 'headline')", and a 200 of `{}` threw on
 * sections.map. A captive wifi portal, a proxy and a half-deployed route all
 * answer 200 with something else. Sanity catches the throw in its error
 * boundary and shows a stack trace — and the Dashboard is registered first in
 * sanity.config.ts, so that stack trace is what opening the Studio looks like.
 * It lives here rather than in the component so that it can be tested against
 * real replies instead of by reading the component's source.
 */
export function isDashboard(body: unknown): body is Dashboard {
  if (!body || typeof body !== "object") return false;
  const maybe = body as Partial<Dashboard>;
  return (
    typeof maybe.headline === "string" &&
    typeof maybe.measuredAt === "string" &&
    Array.isArray(maybe.sections) &&
    maybe.sections.every(
      (section) => !!section && typeof section.title === "string" && Array.isArray(section.lines)
    ) &&
    !!maybe.traffic &&
    typeof maybe.traffic === "object"
  );
}

/**
 * Google's channel names are written for analysts. These are not.
 *
 * All nineteen of GA4's default channel groups are here, not the nine that
 * were obvious: the shop runs a Meta feed and Google Ads, and in a browser the
 * missing ones put "Cross-network" and "Paid Other" on the page directly under
 * "Found us on Google". Anything Google invents after this is still passed
 * through, because a made-up name is worse than a slightly technical true one.
 */
const CHANNEL_NAMES: Record<string, string> = {
  "Organic Search": "Found us on Google",
  "Paid Search": "Clicked a Google ad",
  "Organic Social": "Came from Instagram or Facebook",
  "Paid Social": "Clicked a social ad",
  Direct: "Typed the address in",
  Referral: "Followed a link from another site",
  Email: "Came from one of your emails",
  "Organic Shopping": "Found us in Google Shopping",
  "Paid Shopping": "Clicked a shopping ad",
  "Cross-network": "Came from one of your ads",
  "Paid Other": "Came from an ad",
  "Paid Video": "Came from a video ad",
  "Organic Video": "Came from a video",
  Display: "Saw a banner ad",
  Affiliates: "Came from a partner site",
  Audio: "Came from an audio ad",
  SMS: "Came from a text message",
  "Mobile Push Notifications": "Came from a phone notification",
  Unassigned: "Google could not tell",
};

export function channelInEnglish(name: string): string {
  return CHANNEL_NAMES[name] ?? name;
}

/**
 * Turns the raw counts into the page.
 *
 * Kept apart from the route and from the component so that the wording — the
 * part Kristina actually reads — can be tested without a network, a browser
 * or a database.
 */
export function buildDashboard(raw: StatsRaw, traffic: Traffic, now: Date): Dashboard {
  const sections: StatSection[] = [];

  /* Waiting on you */
  const waiting: StatLine[] = [];
  const oldestDays = daysSince(raw.oldestBookingAt, now);

  if (raw.bookingsWaiting > 0) {
    const since = howLongAgo(raw.oldestBookingAt, now);
    waiting.push({
      key: "bookings-waiting",
      value: count(raw.bookingsWaiting, "person", "people"),
      label: `asked for a fitting and ${agrees(raw.bookingsWaiting, "has", "have")} not heard back`,
      meaning:
        since === null
          ? "They wrote to you and are waiting for a reply."
          : `The one who has waited longest wrote ${since}.`,
      action: `Open "${STUDIO_LISTS.bookings}" and reply. This is the only place on this page where money is walking away right now.`,
      tone: "needs-you",
    });
  } else {
    waiting.push({
      key: "bookings-waiting",
      value: "Nobody",
      label: "is waiting for a reply about a fitting",
      meaning: "Every fitting request has been answered.",
      tone: "good",
    });
  }

  if (raw.postsWaitingApproval > 0) {
    waiting.push({
      key: "posts-waiting",
      value: count(raw.postsWaitingApproval, "post"),
      label: `${agrees(raw.postsWaitingApproval, "is", "are")} written and waiting for your yes`,
      meaning: `Nothing goes to Instagram until you approve it, so ${agrees(
        raw.postsWaitingApproval,
        "this one is",
        "these are"
      )} sitting still.`,
      action: `Open "${STUDIO_LISTS.postsToApprove}", ${agrees(
        raw.postsWaitingApproval,
        "read it and press Approve. Ten seconds.",
        "read them, press Approve. Ten seconds each."
      )}`,
      tone: "needs-you",
    });
  }

  // A failed post is not a post waiting for a yes, and telling her to approve
  // it sends her to press a button that does nothing. It has been to Instagram
  // and come back refused, the reason is written on the document, and nothing
  // will happen to it until somebody reads that reason — the publisher only
  // ever picks up posts marked Approved (see socialQueue).
  if (raw.postsFailed > 0) {
    waiting.push({
      key: "posts-failed",
      value: count(raw.postsFailed, "post"),
      label: "tried to go out and came back with an error",
      meaning: `Instagram would not take ${agrees(raw.postsFailed, "it", "them")}, and the post says why. Nothing more will be tried until you look.`,
      action: `Open "${STUDIO_LISTS.postsToApprove}" and read “What Went Wrong” on the ones marked Failed. Fix what it names, then set the post back to Approved.`,
      tone: "needs-you",
    });
  }

  // Neither counted as waiting for her nor as overdue, so before this line a
  // post whose run died halfway was on the one page she is told to trust and
  // on no list it mentioned.
  if (raw.postsStuck > 0) {
    waiting.push({
      key: "posts-stuck",
      value: count(raw.postsStuck, "post"),
      label: "got stuck halfway to Instagram",
      meaning: `The shop started sending ${agrees(raw.postsStuck, "it", "them")} and never finished, so ${agrees(raw.postsStuck, "it is", "they are")} neither out nor waiting for you.`,
      action: `Open "${STUDIO_LISTS.postsGoingOut}" and look at Instagram: if the picture arrived, set the post to Published; if it did not, set it back to Approved and it will go out with the next batch.`,
      tone: "needs-you",
    });
  }

  if (raw.postsOverdue > 0) {
    waiting.push({
      key: "posts-overdue",
      value: count(raw.postsOverdue, "approved post"),
      label: "should have gone out already",
      meaning: agrees(
        raw.postsOverdue,
        "You said yes to this one and its date has passed, but Instagram has not received it.",
        "You said yes to these and their date has passed, but Instagram has not received them."
      ),
      action: `Check "${STUDIO_LISTS.siteSettings}" for quiet hours and the daily limit — or press “Post to Instagram now” ${agrees(
        raw.postsOverdue,
        "on it",
        "on one"
      )} to see the reason.`,
      tone: "needs-you",
    });
  }

  if (raw.reviewsWaiting > 0) {
    waiting.push({
      key: "reviews-waiting",
      value: count(raw.reviewsWaiting, "review"),
      label: `${agrees(raw.reviewsWaiting, "is", "are")} written but not shown in the shop`,
      meaning:
        "A review nobody approved is invisible to shoppers. It is praise you already have and are not using.",
      action: `Open "${STUDIO_LISTS.reviews}" and tick Approved on the ones you are happy with.`,
      tone: "needs-you",
    });
  }

  if (raw.giftCardsLate > 0) {
    waiting.push({
      key: "gift-cards-late",
      value: count(raw.giftCardsLate, "gift card"),
      label: `${agrees(raw.giftCardsLate, "was", "were")} due to be delivered and ${agrees(raw.giftCardsLate, "has", "have")} not been sent`,
      meaning:
        "Somebody paid for a present that was supposed to arrive by now. This one makes people angry.",
      action: `Open "${STUDIO_LISTS.giftCards}", find the ones with a past delivery date and no sent date.`,
      tone: "needs-you",
    });
  }

  sections.push({ key: "waiting", title: "Waiting on you", lines: waiting });

  /* Money */
  const moneyLines: StatLine[] = [];

  moneyLines.push({
    key: "orders-7",
    value: count(raw.orders7, "order"),
    label: "in the last 7 days",
    meaning:
      raw.orders7 === 0
        ? "Nobody has bought anything this week. The rest of this page is about why."
        : `${money(raw.revenue7)} taken. That is money in, before what the fabric and the postage cost you.`,
    tone: raw.orders7 === 0 ? "plain" : "good",
  });

  moneyLines.push({
    key: "orders-30",
    value: count(raw.orders30, "order"),
    label: "in the last 30 days",
    meaning:
      raw.orders30 === 0
        ? `${money(0)} this month. All time the shop has taken ${count(raw.ordersAllTime, "order")}.`
        : `${money(raw.revenue30)} this month, ${count(raw.ordersAllTime, "order")} since the shop opened.`,
    tone: "plain",
  });

  const lastOrder = howLongAgo(raw.lastOrderAt, now);
  moneyLines.push({
    key: "last-order",
    value: lastOrder ? lastOrder[0].toUpperCase() + lastOrder.slice(1) : "Nobody",
    label: lastOrder ? "was the last order" : "has bought anything yet",
    meaning: lastOrder
      ? "When somebody last paid."
      : "That is normal for a shop this new — it is not a fault, and it is not a broken checkout until the basket line below says so.",
    tone: "plain",
  });

  if (raw.ordersToMake > 0) {
    moneyLines.push({
      key: "orders-to-make",
      value: count(raw.ordersToMake, "order"),
      label: `${agrees(raw.ordersToMake, "is", "are")} paid for and not yet being made`,
      meaning: `${agrees(raw.ordersToMake, "This one is", "These are")} still marked Paid rather than In Production.`,
      action: `Open "${STUDIO_LISTS.orders}" and move them on when you start sewing, so the customer gets the email.`,
      tone: "plain",
    });
  }

  if (raw.cartsLeft7 > 0) {
    moneyLines.push({
      key: "carts-left",
      value: count(raw.cartsLeft7, "shopper"),
      label: "got to the card form and did not pay",
      meaning: `${money(raw.cartsLeftValue7)} worth, in the last 7 days. ${
        raw.cartsRecovered7 > 0
          ? `${raw.cartsRecovered7} of them came back and paid after the reminder.`
          : agrees(raw.cartsLeft7, "That one has not come back.", "None of them came back yet.")
      }`,
      action: "They were seconds from buying. If this number is high and orders are low, the problem is the checkout itself — tell Safar.",
      tone: "plain",
    });
  } else if (raw.orders7 === 0) {
    moneyLines.push({
      key: "carts-left",
      value: "Nobody",
      label: "even reached the card form this week",
      meaning:
        "So the checkout is not what is stopping people. They are leaving earlier than that — on the product pages, or before.",
      tone: "plain",
    });
  }

  if (raw.giftCardBalance && raw.giftCardBalance > 0) {
    moneyLines.push({
      key: "gift-balance",
      value: money(raw.giftCardBalance),
      label: "is sitting on unspent gift cards",
      meaning:
        "Money you have already been paid for things you have not made yet. Keep it in mind before you count a good month.",
      tone: "plain",
    });
  }

  sections.push({ key: "money", title: "Money", lines: moneyLines });

  /* The shop */
  const shop: StatLine[] = [];

  shop.push({
    key: "products",
    value: count(raw.products, "product"),
    label: "in the shop",
    meaning:
      raw.products < 10
        ? "A small shop gives people less reason to look around. More things to buy is the single most direct way to sell more."
        : "Everything published in the catalogue.",
    tone: "plain",
  });

  if (raw.productsNoPhoto > 0) {
    shop.push({
      key: "no-photo",
      value: count(raw.productsNoPhoto, "product"),
      label: `${agrees(raw.productsNoPhoto, "has", "have")} no photograph`,
      meaning: `Nobody buys underwear they cannot see. ${agrees(raw.productsNoPhoto, "It will", "They will")} not sell at all.`,
      action: `Open "${STUDIO_LISTS.products}", find the ones with an empty “Product Images” field, add a picture.`,
      tone: "needs-you",
    });
  }

  if (raw.productsNoDescription > 0) {
    shop.push({
      key: "no-description",
      value: count(raw.productsNoDescription, "product"),
      label: `${agrees(raw.productsNoDescription, "has", "have")} no description`,
      meaning:
        "Google has nothing to read on those pages, so they do not come up in a search, and shoppers have nothing to reassure them.",
      action: "Two or three sentences each: the fabric, the fit, who it suits.",
      tone: "plain",
    });
  }

  if (raw.productsNotInAds > 0) {
    shop.push({
      key: "not-in-ads",
      value: count(raw.productsNotInAds, "product"),
      label: `${agrees(raw.productsNotInAds, "has", "have")} no colour on ${agrees(raw.productsNotInAds, "it", "them")}`,
      meaning: `Google Shopping will not list a clothing item with no colour on it, and Instagram shows it less often. Everything else about ${agrees(raw.productsNotInAds, "it", "them")} is fine.`,
      action: `Open "${STUDIO_LISTS.products}" and fill in “Primary Colour” on each one. It is one word.`,
      tone: "needs-you",
    });
  }

  if (raw.productsSoldOut > 0) {
    shop.push({
      key: "sold-out",
      value: count(raw.productsSoldOut, "product"),
      label: `${agrees(raw.productsSoldOut, "is", "are")} sold out`,
      meaning: "Still on the site, with nothing to send.",
      tone: "plain",
    });
  }

  // The tally is worked out from the rows the query brought back, which stop at
  // 300; the number of people is counted in the database, so the line still
  // tells the truth on the day the 301st person asks.
  const tally = wantedTally(raw.stockWanted);
  const wanted = tally.slice(0, 3);
  const alsoWanted = tally.length - wanted.length;
  if (wanted.length > 0) {
    shop.push({
      key: "stock-wanted",
      value: count(raw.stockWantedTotal, "person", "people"),
      label: "asked to be told when something comes back",
      meaning: `Most wanted: ${wanted
        .map((w) => `${w.name} (${w.people})`)
        .join(", ")}${
        alsoWanted > 0 ? `, and ${count(alsoWanted, "other thing")}` : ""
      }. ${agrees(raw.stockWantedTotal, "This person has", "These people have")} already decided to buy.`,
      action: "This is the answer to “what do I make next”. Make the top one; the shop emails them by itself the moment stock goes above zero.",
      tone: "needs-you",
    });
  }

  sections.push({ key: "shop", title: "The shop", lines: shop });

  /* Reach */
  const reach: StatLine[] = [];

  reach.push({
    key: "posts-published",
    value: count(raw.postsPublished30, "post"),
    label: "went to Instagram in the last 30 days",
    meaning:
      raw.postsPublished30 === 0
        ? "Nothing has gone out this month, so nobody new is being reminded the shop exists."
        : agrees(
            raw.postsPublished30,
            "The shop posted it by itself once you had approved it.",
            "The shop posts these by itself once you have approved them."
          ),
    tone: raw.postsPublished30 === 0 ? "needs-you" : "good",
  });

  reach.push({
    key: "subscribers",
    value: count(raw.subscribers, "person", "people"),
    label: `${agrees(raw.subscribers, "is", "are")} on your mailing list`,
    // It used to say "people you can write to directly, for free", which is a
    // promise the shop cannot keep: nothing here sends to this list, and every
    // address is sealed, readable one document at a time through “Show contact
    // details”. A number she can do nothing with is worse than no number.
    meaning:
      raw.subscribers7 > 0
        ? `${count(raw.subscribers7, "new one")} this week. Writing to all of them at once is not built yet — ask Safar when you have something to say.`
        : "Nobody new joined this week. Writing to all of them at once is not built yet — ask Safar when you have something to say.",
    tone: "plain",
  });

  reach.push({
    key: "reviews-live",
    value: count(raw.reviewsLive, "review"),
    label: `${agrees(raw.reviewsLive, "is", "are")} showing in the shop`,
    meaning:
      raw.reviewsLive === 0
        ? "A shop with no reviews asks a stranger to go first. The site asks every fitting customer for one automatically."
        : "Shoppers who have never heard of you read these before they buy.",
    tone: raw.reviewsLive === 0 ? "plain" : "good",
  });

  if (raw.fittingsThisWeek > 0) {
    reach.push({
      key: "fittings-week",
      value: count(raw.fittingsThisWeek, "fitting"),
      label: `${agrees(raw.fittingsThisWeek, "is", "are")} booked in the next 7 days`,
      meaning: "Check this before you promise anybody else a time.",
      tone: "plain",
    });
  }

  if (raw.friendLinks > 0) {
    reach.push({
      key: "friends",
      value: count(raw.friendLinks, "customer"),
      label: `${agrees(raw.friendLinks, "has", "have")} a Friends link to share`,
      meaning:
        raw.friendsRewarded30 > 0
          ? `${count(raw.friendsRewarded30, "friend")} bought through one in the last 30 days.`
          : "Nobody has bought through one in the last 30 days, so the programme is not moving yet.",
      tone: "plain",
    });
  }

  sections.push({ key: "reach", title: "Getting noticed", lines: reach });

  return {
    measuredAt: now.toISOString(),
    headline: headlineFor(raw, traffic, oldestDays),
    sections,
    traffic,
  };
}

/**
 * Which items the waiting-list is waiting for, biggest first, all of them.
 *
 * Grouped here rather than in the query because GROQ has no group-by, and
 * doing it in the route would mean the wording could not be tested. Whole,
 * rather than already cut to three, so that the page can say how many things
 * it is not showing instead of quietly dropping them.
 */
export function wantedTally(rows: StockWant[]): { name: string; people: number }[] {
  const tally = new Map<string, number>();
  for (const row of rows) {
    const name = row.product?.trim();
    if (!name) continue;
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, people]) => ({ name, people }))
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
}

/** The top of that tally — what she should make next. */
export function mostWanted(
  rows: StockWant[],
  top = 3
): { name: string; people: number }[] {
  return wantedTally(rows).slice(0, top);
}

/**
 * The one sentence at the top.
 *
 * Ordered by what costs the most to ignore: a person waiting, then a shop
 * that cannot sell what it has, then quiet. Never a percentage.
 */
function headlineFor(raw: StatsRaw, traffic: Traffic, oldestDays: number | null): string {
  if (raw.bookingsWaiting > 0) {
    const waited =
      oldestDays !== null && oldestDays >= 1
        ? ` ${agrees(raw.bookingsWaiting, "They have waited", "The oldest has waited")} ${count(oldestDays, "day")}.`
        : "";
    return `${count(raw.bookingsWaiting, "person", "people")} asked for a fitting and ${agrees(raw.bookingsWaiting, "is", "are")} waiting to hear from you.${waited}`;
  }
  if (raw.productsNoPhoto > 0) {
    return `${count(raw.productsNoPhoto, "product")} ${agrees(raw.productsNoPhoto, "has", "have")} no photograph, so ${agrees(raw.productsNoPhoto, "it cannot", "they cannot")} sell.`;
  }
  if (raw.orders7 > 0) {
    return `${count(raw.orders7, "order")} this week, ${money(raw.revenue7)} taken.`;
  }
  if (traffic.state === "connected" && traffic.visitors > 0) {
    return `${count(traffic.visitors, "person", "people")} visited this week and nobody has bought yet.`;
  }
  if (raw.postsWaitingApproval > 0) {
    return `Quiet week. ${count(raw.postsWaitingApproval, "post")} ${agrees(raw.postsWaitingApproval, "is", "are")} waiting for your yes.`;
  }
  return "Quiet week — no orders and nobody waiting on you.";
}
