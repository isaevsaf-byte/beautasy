import { BUSINESS } from "./business";
import { SITE_URL } from "./site";
import { LOCAL_SERVICES, type LocalService } from "./localServices";
import { groupShortLink } from "./shortLinks";

/**
 * Posts for the Facebook groups Kristina has joined.
 *
 * Facebook closed its Groups API in April 2024: nothing can post to a group
 * for her any more, and a bot clicking the buttons in her account breaks
 * Facebook's rules and puts the account — and the Instagram tied to it — at
 * risk. So this does everything up to the click: which groups allow a post
 * today by their own rules, and a post written for each, in her voice, with a
 * link that says which group a visitor came from. She copies it, opens the
 * group and publishes it herself (Studio → «Посты в группы»).
 */

export const WEEKDAYS = [
  { value: "mon", title: "Пн" },
  { value: "tue", title: "Вт" },
  { value: "wed", title: "Ср" },
  { value: "thu", title: "Чт" },
  { value: "fri", title: "Пт" },
  { value: "sat", title: "Сб" },
  { value: "sun", title: "Вс" },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]["value"];

/** A group as the Studio keeps it: its rules, and when she last posted there */
export interface FacebookGroup {
  _id?: string;
  name: string;
  url?: string | null;
  /** False puts the group on pause; missing means yes */
  active?: boolean | null;
  /** The days the group's rules allow a post like this; none means any day */
  days?: string[] | null;
  /** At most one post in this many days; 7 unless the group says otherwise */
  everyDays?: number | null;
  /** Whether the group allows a link to the site; missing means yes */
  links?: boolean | null;
  /** Where the group is, as locals say it: "Shirley", "Hedge End" */
  area?: string | null;
  rules?: string | null;
  lastPostedAt?: string | null;
}

const DEFAULT_EVERY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Southampton calendar day of an instant, as "2026-09-28" */
export function londonDay(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function weekdayOf(day: string): Weekday {
  // Noon UTC is the same calendar day in London all year round
  const index = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(index + 6) % 7].value;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS);
}

function allowedDays(group: FacebookGroup): Weekday[] {
  const valid = new Set<string>(WEEKDAYS.map((d) => d.value));
  return (group.days ?? []).filter((d): d is Weekday => valid.has(d));
}

function spacing(group: FacebookGroup): number {
  const n = group.everyDays;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? n : DEFAULT_EVERY_DAYS;
}

export interface GroupStatus {
  state: "today" | "later" | "paused";
  /** The first Southampton day a post is allowed, from today on; null when paused */
  next: string | null;
  /** Why, in the Studio's Russian */
  why: string;
}

function dayList(days: Weekday[]): string {
  return WEEKDAYS.filter((d) => days.includes(d.value))
    .map((d) => d.title.toLowerCase())
    .join(", ");
}

/**
 * Whether a group allows a post today, and if not, from when. A day the
 * group's rules allow, and far enough from the last post — both, on
 * Southampton's calendar.
 */
export function groupStatus(group: FacebookGroup, now: Date): GroupStatus {
  if (group.active === false) return { state: "paused", next: null, why: "На паузе" };

  const today = londonDay(now);
  const days = allowedDays(group);
  const every = spacing(group);
  const last = group.lastPostedAt ? londonDay(new Date(group.lastPostedAt)) : null;
  const earliest = last ? addDays(last, every) : today;
  const from = earliest > today ? earliest : today;

  let next = from;
  for (let i = 0; i < 7 && days.length > 0 && !days.includes(weekdayOf(next)); i++) next = addDays(next, 1);

  if (next === today) {
    return {
      state: "today",
      next,
      why: days.length ? `Реклама здесь по дням: ${dayList(days)} — сегодня можно` : "Реклама разрешена в любой день",
    };
  }
  if (last === today) return { state: "later", next, why: "Сегодня уже опубликовано" };
  if (earliest > today) {
    const ago = daysBetween(last as string, today);
    return {
      state: "later",
      next,
      why: `Последний пост ${ago} ${ago === 1 ? "день" : ago < 5 ? "дня" : "дней"} назад, а группа — не чаще раза в ${every} ${
        every === 1 ? "день" : every < 5 ? "дня" : "дней"
      }`,
    };
  }
  return { state: "later", next, why: `Реклама здесь только по дням: ${dayList(days)}` };
}

/** Only an https link to a group on Facebook itself */
export function isFacebookGroupUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"].includes(host) &&
    /^\/groups\/[^/]+/.test(url.pathname)
  );
}

/** The name a group goes by in the link's utm_campaign: "southampton-mums" */
export function groupSlug(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "group"
  );
}

/**
 * The words for each kind of job: two openings, so a group sees a different
 * one the next time this job comes round, and what she does, in a sentence.
 * Every statement is true of the service as its page describes it; the prices
 * come from the page itself, so a post never quotes an old one.
 */
const WORDS: Record<string, { hooks: [string, string]; what: string }> = {
  "wedding-dress-southampton": {
    hooks: [
      "Your wedding dress should feel like it was made just for you ✨",
      "Almost no wedding dress fits straight off the rail — and that's completely normal 🤍",
    ],
    what: "I take in bodices, hem with the original lace and add bustles, with fittings until it's exactly right.",
  },
  "school-uniform-southampton": {
    hooks: [
      "School trousers already too long, or too loose at the waist? 🪡",
      "Uniform comes in sizes, and children come in shapes ✨",
    ],
    what: "I shorten trousers and skirts, take in waists and take up blazer sleeves, usually within the week.",
  },
  "prom-and-evening-dress-southampton": {
    hooks: [
      "Is the dress for the big night fitting quite the way it should? ✨",
      "An evening dress has one job: to sit just right in every photo 🤍",
    ],
    what: "I shorten evening dresses, take in the back and sides, adjust straps and add bust support.",
  },
  "jeans-and-trousers-southampton": {
    hooks: [
      "Jeans that fit perfectly everywhere except the length? 🪡",
      "Turned-up jeans look great with trainers, and not quite right with everything else ✨",
    ],
    what: "I shorten jeans, even keeping the original hem so nobody can tell, and adjust waists and legs.",
  },
  "zip-replacement-southampton": {
    hooks: [
      "A broken zip is the reason most good coats stop being worn 🪡",
      "Please don't give up on a favourite coat, dress or bag because of the zip ✨",
    ],
    what: "I replace zips in jeans, dresses, lined coats and bags, and mend the little things that keep good clothes in the wardrobe.",
  },
  "curtains-and-home-southampton": {
    hooks: [
      "Curtains stopping just short of the floor? 🪡",
      "Ready-made curtains come in three lengths, and windows don't ✨",
    ],
    what: "I hem curtains to the right drop, change headings, narrow panels and make cushion covers to measure.",
  },
};

function hash(text: string): number {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

/** The atelier's number as people dial it here: 07729 741116 */
function localPhone(): string {
  return BUSINESS.telephone.replace(/^\+44\s?/, "0");
}

export interface GroupPost {
  text: string;
  /** The link in the text, or null when the group allows none */
  link: string | null;
  /** The link as the text prints it: "www.beautasy.co.uk/g/prom/k3x" */
  shown: string | null;
  /** The service the post is about this time */
  service: string;
}

/**
 * The post for one group this week. Which job it is about turns with the
 * weeks, and starts from a different job in each group, so two groups
 * posted to on the same day don't carry the same words — which is what
 * Facebook's spam filter looks for.
 */
export function groupPost(
  group: FacebookGroup,
  now: Date,
  services: readonly LocalService[] = LOCAL_SERVICES
): GroupPost {
  const slug = groupSlug(group.name);
  const week = Math.floor(Date.parse(`${londonDay(now)}T12:00:00Z`) / DAY_MS / 7);
  const turn = hash(slug) + week;
  const usable = services.filter((service) => WORDS[service.slug] && service.prices.length > 0);
  const service = usable[turn % usable.length];
  const words = WORDS[service.slug];
  const hook = words.hooks[Math.floor(turn / usable.length) % 2];

  const area = group.area?.trim() || "Southampton";
  const prices = service.prices
    .slice(0, 2)
    .map((line) => `${line.name} ${line.price}`)
    .join(" · ");

  // The short link (www.beautasy.co.uk/g/prom/k3x) — see @/lib/shortLinks.
  // The long one stays for a page without a short word, so no post is ever
  // left without its link.
  const short = group.links === false ? null : groupShortLink(service.slug, group._id ?? slug);
  const link =
    group.links === false
      ? null
      : (short?.href ??
        `${SITE_URL}/alterations/${service.slug}?utm_source=facebook&utm_medium=group&utm_campaign=${slug}`);
  const ask = link
    ? `Not sure if it can be done? Send me a photo, or book a free ten-minute look 🤍\n${short?.shown ?? link}`
    : `Not sure if it can be done? Message me here or on WhatsApp ${localPhone()} with a photo, and I'll tell you straight away 🤍`;

  const text = [hook, `I'm Kristina, a seamstress here in ${area}. ${words.what}`, prices, ask].join("\n\n");
  return { text, link, shown: short?.shown ?? link, service: service.slug };
}
