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

import { groupStatus, type FacebookGroup } from "./groupPosts";

/** Sums are in pence, the way Stripe and every document in the dataset hold them. */
export const STUDIO_STATS_QUERY = `{
  // ── Facebook groups: their rules, to tell which allow a post today ──
  "facebookGroups": *[
    _type == "facebookGroup" && !(_id in path("drafts.**")) && active != false
  ]{ name, active, days, everyDays, lastPostedAt },

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
  /** The groups she posts in, with their rules — optional, as older answers had none */
  facebookGroups?: FacebookGroup[];
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

/* ─── Saying it in Russian ─── */

/**
 * Pence as Kristina writes prices.
 *
 * Whole pounds lose the pence, which reads as a rounding error on a £24.50
 * order and as a wrong total when three of them are added up. The page is in
 * Russian and the prices stay written the British way, £1,234.50: they are the
 * shop's prices, spelled as the site and every receipt spell them.
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

const RUSSIAN_PLURAL = new Intl.PluralRules("ru-RU");

/**
 * The one of Russian's three noun forms that follows this number:
 * plural(1, "заказ", "заказа", "заказов") → "заказ"; 3 → "заказа"; 5 → "заказов".
 *
 * English gets by with one rule — add an s — and the first version of this
 * page was written that way. Russian needs three, and they do not follow the
 * size of the number: 21 takes the form 1 takes, and 12 the form 5 takes. Intl
 * knows the rule, so it is asked rather than worked out again here.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const form = RUSSIAN_PLURAL.select(n);
  return form === "one" ? one : form === "few" ? few : many;
}

/** "1 заказ", "3 заказа", "5 заказов", "21 заказ" — the number and its word. */
export function count(n: number, one: string, few: string, many: string): string {
  return `${n} ${plural(n, one, few, many)}`;
}

/**
 * The verb that agrees with a count: agrees(2, "ждёт", "ждут") → "ждут".
 *
 * Needed because every line on this page is a number followed by a phrase, and
 * building that phrase from a fixed string gives "2 товара распродан". A
 * Russian verb agrees with the form of the numeral, not with how many things
 * there are — 21 человек ждёт, like 1; 11 человек ждут, like 5 — so this asks
 * the plural rule rather than n === 1. A page that cannot conjugate reads as a
 * page nobody checked, and then its numbers are not believed either.
 */
export function agrees(n: number, singular: string, pluralForm: string): string {
  return RUSSIAN_PLURAL.select(n) === "one" ? singular : pluralForm;
}

/**
 * "It" or "them", "this one" or "these", chosen by how many things there
 * really are — a different question from agreement above. Twenty-one posts
 * take a singular verb in Russian and are still "их", never "его".
 */
export function oneOrMany(n: number, one: string, several: string): string {
  return n === 1 ? one : several;
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
  if (ms < 0) return "только что";

  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) {
    return minutes <= 1 ? "только что" : `${count(minutes, "минуту", "минуты", "минут")} назад`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "час назад" : `${count(hours, "час", "часа", "часов")} назад`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 31) return `${count(days, "день", "дня", "дней")} назад`;

  const months = Math.round(days / 30);
  return months === 1 ? "месяц назад" : `${count(months, "месяц", "месяца", "месяцев")} назад`;
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
 * sidebar and nothing else. Anything inside a document — a field, a button, a
 * status — is quoted with “curly quotes”: “Основной цвет”, “Что пошло не так”,
 * “Выложить в Instagram”, “Оплачен”. The page uses no «ёлочки» at all, so that
 * the two kinds of quote stay the only two. The test "every list the page names
 * is a list the Studio really has" pulls the straight-quoted phrases out of
 * every line and looks each one up in structure.ts, so renaming a list in the
 * sidebar breaks the build rather than her afternoon.
 *
 * The names are Russian, and Russian changes the end of a name after most
 * prepositions — "в Настройках сайта" is no longer the sidebar's "Настройки
 * сайта", and the test would rightly reject it. So every sentence here puts a
 * list name where it keeps its own form: straight after "Откройте".
 */
export const STUDIO_LISTS = {
  bookings: "Записи в ателье",
  postsToApprove: "Посты на одобрение",
  postsGoingOut: "Посты в очереди",
  products: "Товары",
  orders: "Заказы",
  reviews: "Отзывы",
  giftCards: "Подарочные карты",
  siteSettings: "Настройки сайта",
  groupPosts: "Посты в группы",
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
  /** The number itself, already written out — "3 человека", "£142.50". */
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
 * the plain-words version of "Organic Search". Anything Google invents after
 * this is still passed through, in Google's English, because a made-up name is
 * worse than a slightly technical true one.
 */
const CHANNEL_NAMES: Record<string, string> = {
  "Organic Search": "Нашли вас в Google",
  "Paid Search": "Нажали на рекламу в Google",
  "Organic Social": "Пришли из Instagram или Facebook",
  "Paid Social": "Нажали на рекламу в соцсетях",
  Direct: "Набрали адрес сами",
  Referral: "Перешли по ссылке с другого сайта",
  Email: "Пришли из вашего письма",
  "Organic Shopping": "Нашли вас в Google Shopping",
  "Paid Shopping": "Нажали на рекламу товара",
  "Cross-network": "Пришли по вашей рекламе",
  "Paid Other": "Пришли по рекламе",
  "Paid Video": "Пришли по видеорекламе",
  "Organic Video": "Пришли из видео",
  Display: "Увидели рекламный баннер",
  Affiliates: "Пришли с сайта партнёра",
  Audio: "Пришли по аудиорекламе",
  SMS: "Пришли из SMS",
  "Mobile Push Notifications": "Пришли из уведомления на телефоне",
  Unassigned: "Google не смог определить",
};

export function channelInRussian(name: string): string {
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
    const n = raw.bookingsWaiting;
    const since = howLongAgo(raw.oldestBookingAt, now);
    waiting.push({
      key: "bookings-waiting",
      value: count(n, "человек", "человека", "человек"),
      label: agrees(
        n,
        "оставил заявку на примерку и ещё не получил ответа",
        "оставили заявки на примерку и ещё не получили ответа"
      ),
      meaning:
        since === null
          ? "Вам написали и ждут ответа."
          : oneOrMany(n, `Заявку прислали ${since}.`, `Самую давнюю заявку прислали ${since}.`),
      action: `Откройте "${STUDIO_LISTS.bookings}" и ответьте. Это единственное место на странице, где деньги уходят прямо сейчас.`,
      tone: "needs-you",
    });
  } else {
    waiting.push({
      key: "bookings-waiting",
      value: "Никто",
      label: "не ждёт ответа о примерке",
      meaning: "Вы ответили на все заявки на примерку.",
      tone: "good",
    });
  }

  if (raw.postsWaitingApproval > 0) {
    const n = raw.postsWaitingApproval;
    waiting.push({
      key: "posts-waiting",
      value: count(n, "пост", "поста", "постов"),
      label: agrees(n, "написан и ждёт вашего одобрения", "написаны и ждут вашего одобрения"),
      meaning: `Без вашего одобрения в Instagram ничего не уходит, поэтому ${oneOrMany(
        n,
        "этот пост стоит",
        "эти посты стоят"
      )} на месте.`,
      action: `Откройте "${STUDIO_LISTS.postsToApprove}", ${oneOrMany(
        n,
        "прочитайте пост и нажмите “Одобрить”. Десять секунд.",
        "прочитайте посты и нажмите “Одобрить” на каждом. По десять секунд на пост."
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
    const n = raw.postsFailed;
    waiting.push({
      key: "posts-failed",
      value: count(n, "пост", "поста", "постов"),
      label: agrees(n, "вернулся из Instagram с ошибкой", "вернулись из Instagram с ошибкой"),
      meaning: `Instagram не принял ${oneOrMany(n, "его", "их")}, а причина записана в самом посте. Пока вы не посмотрите, новых попыток не будет.`,
      action: `Откройте "${STUDIO_LISTS.postsToApprove}" и прочитайте “Что пошло не так” у постов со статусом “Не удалось”. Исправьте то, что там названо, и снова поставьте статус “Одобрен”.`,
      tone: "needs-you",
    });
  }

  // Neither counted as waiting for her nor as overdue, so before this line a
  // post whose run died halfway was on the one page she is told to trust and
  // on no list it mentioned.
  if (raw.postsStuck > 0) {
    const n = raw.postsStuck;
    waiting.push({
      key: "posts-stuck",
      value: count(n, "пост", "поста", "постов"),
      label: agrees(n, "застрял на полпути в Instagram", "застряли на полпути в Instagram"),
      meaning: `Сайт начал ${oneOrMany(n, "его", "их")} отправлять и не закончил, так что ${oneOrMany(
        n,
        "пост не вышел, но и вашего решения не ждёт",
        "посты не вышли, но и вашего решения не ждут"
      )}.`,
      action: `Откройте "${STUDIO_LISTS.postsGoingOut}" и загляните в Instagram: если картинка там появилась, поставьте посту статус “Опубликован”; если нет — снова “Одобрен”, и он уйдёт со следующей отправкой.`,
      tone: "needs-you",
    });
  }

  if (raw.postsOverdue > 0) {
    const n = raw.postsOverdue;
    waiting.push({
      key: "posts-overdue",
      value: count(n, "одобренный пост", "одобренных поста", "одобренных постов"),
      label: agrees(n, "уже должен был выйти", "уже должны были выйти"),
      meaning: oneOrMany(
        n,
        "Вы одобрили этот пост, и его дата уже прошла, но в Instagram он так и не попал.",
        "Вы одобрили эти посты, и их дата уже прошла, но в Instagram они так и не попали."
      ),
      action: `Откройте "${STUDIO_LISTS.siteSettings}" и проверьте “Тихие часы” и “Постов в день” — или нажмите “Выложить в Instagram” ${oneOrMany(
        n,
        "в самом посте",
        "в одном из них"
      )}, чтобы увидеть причину.`,
      tone: "needs-you",
    });
  }

  if (raw.reviewsWaiting > 0) {
    const n = raw.reviewsWaiting;
    waiting.push({
      key: "reviews-waiting",
      value: count(n, "отзыв", "отзыва", "отзывов"),
      label: agrees(n, "написан, но не показан на сайте", "написаны, но не показаны на сайте"),
      meaning:
        "Пока отзыв не одобрен, его никто не видит. Это похвала, которая у вас уже есть, но пока не работает.",
      action: `Откройте "${STUDIO_LISTS.reviews}", отметьте “Одобрен” у тех, которыми вы довольны, и нажмите “Опубликовать”.`,
      tone: "needs-you",
    });
  }

  if (raw.giftCardsLate > 0) {
    const n = raw.giftCardsLate;
    waiting.push({
      key: "gift-cards-late",
      value: count(n, "подарочная карта", "подарочные карты", "подарочных карт"),
      label: agrees(
        n,
        "уже должна была прийти, но не отправлена",
        "уже должны были прийти, но не отправлены"
      ),
      meaning:
        "Кто-то оплатил подарок, который уже должен был прийти. Такое людей по-настоящему злит.",
      action: `Откройте "${STUDIO_LISTS.giftCards}" и найдите карты, у которых “Дата отправки” уже прошла, а “Когда отправлена” пусто.`,
      tone: "needs-you",
    });
  }

  sections.push({ key: "waiting", title: "Ждут вас", lines: waiting });

  /* Money */
  const moneyLines: StatLine[] = [];

  moneyLines.push({
    key: "orders-7",
    value: count(raw.orders7, "заказ", "заказа", "заказов"),
    label: "за последние 7 дней",
    meaning:
      raw.orders7 === 0
        ? "На этой неделе никто ничего не купил. Всё остальное на этой странице — о том, почему."
        : `Выручка — ${money(raw.revenue7)}. Это всё, что пришло, до вычета того, во что обошлись ткань и доставка.`,
    tone: raw.orders7 === 0 ? "plain" : "good",
  });

  moneyLines.push({
    key: "orders-30",
    value: count(raw.orders30, "заказ", "заказа", "заказов"),
    label: "за последние 30 дней",
    meaning:
      raw.orders30 === 0
        ? `${money(0)} за месяц. За всё время у магазина ${count(raw.ordersAllTime, "заказ", "заказа", "заказов")}.`
        : `${money(raw.revenue30)} за месяц, ${count(raw.ordersAllTime, "заказ", "заказа", "заказов")} с открытия магазина.`,
    tone: "plain",
  });

  const lastOrder = howLongAgo(raw.lastOrderAt, now);
  moneyLines.push({
    key: "last-order",
    value: lastOrder ? lastOrder[0].toUpperCase() + lastOrder.slice(1) : "Никто",
    label: lastOrder ? "был последний заказ" : "пока ничего не купил",
    meaning: lastOrder
      ? "Когда кто-то в последний раз оплатил покупку."
      : "Для такого нового магазина это нормально — это не поломка, и оплата не сломана, пока об этом не скажет строка о корзинах ниже.",
    tone: "plain",
  });

  if (raw.ordersToMake > 0) {
    const n = raw.ordersToMake;
    moneyLines.push({
      key: "orders-to-make",
      value: count(n, "заказ", "заказа", "заказов"),
      label: agrees(n, "оплачен, но ещё не в работе", "оплачены, но ещё не в работе"),
      meaning: `${oneOrMany(n, "У этого заказа", "У этих заказов")} всё ещё статус “Оплачен”, а не “В работе”.`,
      action: `Откройте "${STUDIO_LISTS.orders}" и, когда начнёте шить, поставьте ${oneOrMany(
        n,
        "заказу",
        "заказам"
      )} статус “В работе” — клиент получит письмо.`,
      tone: "plain",
    });
  }

  if (raw.cartsLeft7 > 0) {
    const n = raw.cartsLeft7;
    const back = raw.cartsRecovered7;
    moneyLines.push({
      key: "carts-left",
      value: count(n, "покупатель", "покупателя", "покупателей"),
      label: agrees(n, "дошёл до оплаты картой и не заплатил", "дошли до оплаты картой и не заплатили"),
      meaning: `Это покупки на ${money(raw.cartsLeftValue7)} за последние 7 дней. ${
        back > 0
          ? `${back} из них ${agrees(back, "вернулся и заплатил", "вернулись и заплатили")} после напоминания.`
          : oneOrMany(n, "Этот покупатель пока не вернулся.", "Пока никто из них не вернулся.")
      }`,
      action: "До покупки оставались секунды. Если это число большое, а заказов мало, дело в самой оплате — скажите Сафару.",
      tone: "plain",
    });
  } else if (raw.orders7 === 0) {
    moneyLines.push({
      key: "carts-left",
      value: "Никто",
      label: "на этой неделе даже не дошёл до оплаты картой",
      meaning:
        "Значит, людей останавливает не оплата. Они уходят раньше — на страницах товаров или ещё до них.",
      tone: "plain",
    });
  }

  if (raw.giftCardBalance && raw.giftCardBalance > 0) {
    moneyLines.push({
      key: "gift-balance",
      value: money(raw.giftCardBalance),
      label: "лежит на неизрасходованных подарочных картах",
      meaning:
        "Это деньги, которые вам уже заплатили за то, что вы ещё не сделали. Помните о них, прежде чем радоваться удачному месяцу.",
      tone: "plain",
    });
  }

  sections.push({ key: "money", title: "Деньги", lines: moneyLines });

  /* The shop */
  const shop: StatLine[] = [];

  shop.push({
    key: "products",
    value: count(raw.products, "товар", "товара", "товаров"),
    label: "в магазине",
    meaning:
      raw.products < 10
        ? "В маленьком магазине людям меньше причин задержаться. Больше товаров — самый прямой способ продавать больше."
        : "Всё, что опубликовано в каталоге.",
    tone: "plain",
  });

  if (raw.productsNoPhoto > 0) {
    const n = raw.productsNoPhoto;
    shop.push({
      key: "no-photo",
      value: count(n, "товар", "товара", "товаров"),
      label: oneOrMany(n, "без фотографии", "без фотографий"),
      meaning: `Никто не купит бельё, которого не видно. ${oneOrMany(
        n,
        "Этот товар не продастся",
        "Эти товары не продадутся"
      )} вовсе.`,
      action: `Откройте "${STUDIO_LISTS.products}", найдите те, где поле “Фотографии товара” пустое, и добавьте снимок.`,
      tone: "needs-you",
    });
  }

  if (raw.productsNoDescription > 0) {
    shop.push({
      key: "no-description",
      value: count(raw.productsNoDescription, "товар", "товара", "товаров"),
      label: "без описания",
      meaning:
        "Google нечего прочитать на таких страницах, поэтому они не попадают в поиск, а покупателю не на что опереться.",
      action: "Два-три предложения на каждый: ткань, посадка, кому подойдёт.",
      tone: "plain",
    });
  }

  if (raw.productsNotInAds > 0) {
    const n = raw.productsNotInAds;
    shop.push({
      key: "not-in-ads",
      value: count(n, "товар", "товара", "товаров"),
      label: "без указанного цвета",
      meaning: `Google Shopping не показывает одежду без цвета, а Instagram показывает её реже. Всё остальное в ${oneOrMany(
        n,
        "этом товаре",
        "этих товарах"
      )} в порядке.`,
      // In English, and the page says so: the colour goes into the Google
      // Shopping feed for British shoppers as it is typed, and the field's own
      // description in the product asks for English too.
      action: `Откройте "${STUDIO_LISTS.products}" и заполните “Основной цвет” у каждого. Это одно слово по-английски, например Black или Cream.`,
      tone: "needs-you",
    });
  }

  if (raw.productsSoldOut > 0) {
    const n = raw.productsSoldOut;
    shop.push({
      key: "sold-out",
      value: count(n, "товар", "товара", "товаров"),
      label: agrees(n, "распродан", "распроданы"),
      meaning: `${oneOrMany(n, "Он всё ещё", "Они всё ещё")} на сайте, а отправлять нечего.`,
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
    const people = raw.stockWantedTotal;
    shop.push({
      key: "stock-wanted",
      value: count(people, "человек", "человека", "человек"),
      label: agrees(
        people,
        "попросил сообщить, когда товар снова появится",
        "попросили сообщить, когда товар снова появится"
      ),
      meaning: `Чаще всего ждут: ${wanted.map((w) => `${w.name} (${w.people})`).join(", ")}${
        alsoWanted > 0 ? ` и ещё ${count(alsoWanted, "товар", "товара", "товаров")}` : ""
      }. ${oneOrMany(people, "Этот человек уже решил купить.", "Эти люди уже решили купить.")}`,
      action: "Это ответ на вопрос “что шить дальше”. Сшейте то, что в списке первым, — сайт сам напишет каждому, как только остаток станет больше нуля.",
      tone: "needs-you",
    });
  }

  sections.push({ key: "shop", title: "Магазин", lines: shop });

  /* Reach */
  const reach: StatLine[] = [];

  const published = raw.postsPublished30;
  reach.push({
    key: "posts-published",
    value: count(published, "пост", "поста", "постов"),
    label: `${agrees(published, "вышел", "вышли")} в Instagram за последние 30 дней`,
    meaning:
      published === 0
        ? "В этом месяце ничего не вышло, поэтому новым людям никто не напоминает, что магазин существует."
        : oneOrMany(
            published,
            "Сайт опубликовал его сам, как только вы его одобрили.",
            "Сайт публикует их сам, как только вы их одобрите."
          ),
    tone: published === 0 ? "needs-you" : "good",
  });

  // The groups whose rules allow a post today: an open door, not a debt, so plain
  const groupsToday = (raw.facebookGroups ?? []).filter((group) => groupStatus(group, now).state === "today").length;
  if (groupsToday > 0) {
    reach.push({
      key: "group-posts",
      value: count(groupsToday, "группа", "группы", "групп"),
      label: `Facebook ${agrees(groupsToday, "ждёт", "ждут")} сегодняшнего поста`,
      meaning: "Их правила сегодня разрешают рекламу, и текст для каждой уже написан — минута на группу.",
      action: `Откройте "${STUDIO_LISTS.groupPosts}", скопируйте текст и опубликуйте его в группе.`,
      tone: "plain",
    });
  }

  reach.push({
    key: "subscribers",
    value: count(raw.subscribers, "человек", "человека", "человек"),
    label: `${agrees(raw.subscribers, "подписан", "подписаны")} на вашу рассылку`,
    // It used to say "people you can write to directly, for free", which is a
    // promise the shop cannot keep: nothing here sends to this list, and every
    // address is sealed, readable one document at a time through “Показать
    // контакты”. A number she can do nothing with is worse than no number.
    meaning:
      raw.subscribers7 > 0
        ? `${count(raw.subscribers7, "новый", "новых", "новых")} за эту неделю. Написать всем сразу пока нельзя — это ещё не сделано. Когда будет что сказать, попросите Сафара.`
        : "За эту неделю новых подписчиков нет. Написать всем сразу пока нельзя — это ещё не сделано. Когда будет что сказать, попросите Сафара.",
    tone: "plain",
  });

  reach.push({
    key: "reviews-live",
    value: count(raw.reviewsLive, "отзыв", "отзыва", "отзывов"),
    label: `${agrees(raw.reviewsLive, "виден", "видны")} в магазине`,
    meaning:
      raw.reviewsLive === 0
        ? "Магазин без отзывов просит незнакомца рискнуть первым. Сайт сам просит отзыв у каждого клиента после примерки."
        : `Покупатели, которые никогда о вас не слышали, читают ${oneOrMany(
            raw.reviewsLive,
            "его",
            "их"
          )} перед покупкой.`,
    tone: raw.reviewsLive === 0 ? "plain" : "good",
  });

  if (raw.fittingsThisWeek > 0) {
    reach.push({
      key: "fittings-week",
      value: count(raw.fittingsThisWeek, "примерка", "примерки", "примерок"),
      label: `${agrees(raw.fittingsThisWeek, "назначена", "назначены")} на ближайшие 7 дней`,
      meaning: "Загляните сюда, прежде чем обещать кому-то ещё время.",
      tone: "plain",
    });
  }

  if (raw.friendLinks > 0) {
    const bought = raw.friendsRewarded30;
    reach.push({
      key: "friends",
      value: count(raw.friendLinks, "клиент", "клиента", "клиентов"),
      label: `${agrees(raw.friendLinks, "получил", "получили")} ссылку для друзей`,
      meaning:
        bought > 0
          ? `${count(bought, "друг", "друга", "друзей")} ${agrees(bought, "купил", "купили")} по такой ссылке за последние 30 дней.`
          : "За последние 30 дней по этим ссылкам никто не купил, так что программа пока не набрала ход.",
      tone: "plain",
    });
  }

  sections.push({ key: "reach", title: "Как о вас узнают", lines: reach });

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
    const n = raw.bookingsWaiting;
    const waited =
      oldestDays !== null && oldestDays >= 1
        ? ` ${oneOrMany(n, "Заявке", "Самой давней заявке")} уже ${count(oldestDays, "день", "дня", "дней")}.`
        : "";
    return `${count(n, "человек", "человека", "человек")} ${agrees(
      n,
      "оставил заявку на примерку и ждёт",
      "оставили заявки на примерку и ждут"
    )} вашего ответа.${waited}`;
  }
  if (raw.productsNoPhoto > 0) {
    const n = raw.productsNoPhoto;
    return `${count(n, "товар", "товара", "товаров")} без ${oneOrMany(n, "фотографии", "фотографий")} — ${oneOrMany(
      n,
      "его",
      "их"
    )} никто не купит.`;
  }
  if (raw.orders7 > 0) {
    return `На этой неделе ${count(raw.orders7, "заказ", "заказа", "заказов")} на ${money(raw.revenue7)}.`;
  }
  if (traffic.state === "connected" && traffic.visitors > 0) {
    const v = traffic.visitors;
    return `На этой неделе на сайт ${agrees(v, "зашёл", "зашли")} ${count(v, "человек", "человека", "человек")}, но пока никто ничего не купил.`;
  }
  if (raw.postsWaitingApproval > 0) {
    const n = raw.postsWaitingApproval;
    return `Тихая неделя. ${count(n, "пост", "поста", "постов")} ${agrees(n, "ждёт", "ждут")} вашего одобрения.`;
  }
  return "Тихая неделя: заказов нет, и никто вас не ждёт.";
}
