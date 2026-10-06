import { instantOf, localDateOf } from "./slots";
import type { TrafficSource } from "./studioStats";

/**
 * Visitors as Vercel's own counter sees them, shaped for the Dashboard.
 *
 * <Analytics /> in the layout counts every page anyone opens, with no cookie,
 * so it sees the people Google cannot: everyone who ignored the cookie banner
 * or said no to it. The reading happens in @/lib/vercelVisits, which holds the
 * token and is therefore server-only; the arithmetic and the words are here,
 * apart, so that they can be tested under plain node.
 *
 * Vercel knows a visitor for one day only — no cookie means nothing to
 * recognise them by tomorrow — so over a week, someone who came on three days
 * is three visitors. The Dashboard says so under the number.
 */

export interface VisitReading {
  visitors: number;
  views: number;
  sources: TrafficSource[];
}

const DAY_MS = 86_400_000;

function addDays(day: string, n: number): string {
  // Noon, so that no clock change can push the sum into the next day
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The last seven whole days on Southampton's calendar, as the instants
 * Vercel's API takes: midnight a week ago to the last millisecond of
 * yesterday. Today is left out for the reason Google's reading leaves it out
 * — half a day always looks like a collapse.
 */
export function lastSevenDays(now: Date): { since: number; until: number } {
  const today = localDateOf(now);
  return {
    since: instantOf(`${addDays(today, -7)}T00:00`).getTime(),
    until: instantOf(`${today}T00:00`).getTime() - 1,
  };
}

/**
 * Whether a page view counts as a visit to the shop. The Studio is on the same
 * site and under the same layout, and Kristina opens it every day: counted,
 * she would be the shop's most loyal visitor, and the number on her Dashboard
 * would be mostly her.
 */
export function countsVisit(url: string): boolean {
  let path: string;
  try {
    path = new URL(url, "https://www.beautasy.co.uk").pathname;
  } catch {
    return true;
  }
  return path !== "/studio" && !path.startsWith("/studio/");
}

/**
 * A site's own country addresses — google.com, google.co.uk, google.com.au —
 * and nothing that merely starts like one, such as google.com.example.net.
 */
const COUNTRY = String.raw`\.((com?\.)?[a-z]{2,3})$`;

/** Sites that send people under more than one address, by the name people know them by */
const REFERRERS: [RegExp, string][] = [
  // Google's own staff, from its internal tools (biztools.corp.google.com):
  // the people who review the business listing and the adverts, not searchers
  [/(^|\.)corp\.google\.com$/, "Сотрудники Google"],
  // Answers from AI assistants that linked to the site
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, "ChatGPT"],
  [/(^|\.)gemini\.google\.com$/, "Gemini"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)copilot\.microsoft\.com$/, "Copilot"],
  [new RegExp(String.raw`(^|\.)google` + COUNTRY), "Google"],
  // Android apps name themselves instead of a site
  [/^com\.google\.android\.googlequicksearchbox$/, "Google"],
  [/^com\.google\.android\.gm$/, "Gmail"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [new RegExp(String.raw`(^|\.)yahoo` + COUNTRY), "Yahoo"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)nextdoor\.(co\.uk|com)$/, "Nextdoor"],
  [/(^|\.)etsy\.com$/, "Etsy"],
  [new RegExp(String.raw`(^|\.)pinterest` + COUNTRY), "Pinterest"],
  [/(^|\.)pin\.it$/, "Pinterest"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "WhatsApp"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "X (Twitter)"],
];

/** Where Vercel puts everything past the top rows it was asked for */
const OTHERS = "Others";

/**
 * Who sent a visitor, in the Studio's words: "l.facebook.com" and
 * "m.facebook.com" are both Facebook, and no referrer at all is someone who
 * typed the address, tapped a bookmark or came from an app that hides where
 * links lead from.
 */
export function referrerLabel(hostname: string | null | undefined): string {
  const host = (hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) return "Напрямую или по закладке";
  if (host === OTHERS.toLowerCase()) return "Другие сайты";
  for (const [pattern, label] of REFERRERS) if (pattern.test(host)) return label;
  return host.replace(/^www\./, "");
}

/**
 * Not somebody arriving: one page of the shop leading to another, and the
 * round trips a visitor already here makes — signing in with Google, paying
 * on Stripe's page — which come back with that site as the referrer.
 */
function isOwnSite(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === "beautasy.co.uk" ||
    host.endsWith(".beautasy.co.uk") ||
    host === "beautasy.vercel.app" ||
    host === "accounts.google.com" ||
    host === "checkout.stripe.com"
  );
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Vercel's visits grouped by referrer → the top sources, each under one name.
 * Rows that turn out to be the same site are added together; the shop's own
 * pages are left out.
 */
export function referrerSources(body: unknown, limit = 5): TrafficSource[] {
  const rows = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return [];

  const byName = new Map<string, number>();
  for (const row of rows as { referrerHostname?: unknown; visitors?: unknown }[]) {
    const host = typeof row?.referrerHostname === "string" ? row.referrerHostname : "";
    if (host && isOwnSite(host)) continue;
    const visitors = numberOf(row?.visitors);
    if (visitors === 0) continue;
    const name = referrerLabel(host);
    byName.set(name, (byName.get(name) ?? 0) + visitors);
  }

  return [...byName]
    .map(([name, visitors]) => ({ name, visitors }))
    .sort((a, b) => b.visitors - a.visitors || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Vercel's count → visitors and page views, or a refusal to guess */
export function visitTotals(body: unknown): { visitors: number; views: number } {
  const data = (body as { data?: { visitors?: unknown; pageviews?: unknown } } | null)?.data;
  if (!data || typeof data.visitors !== "number" || typeof data.pageviews !== "number") {
    throw new Error("Vercel ответил не так, как обычно: в ответе нет посетителей.");
  }
  return { visitors: numberOf(data.visitors), views: numberOf(data.pageviews) };
}

/**
 * Vercel's refusal as the line the Dashboard asks Kristina to show Safar:
 * what is wrong and where it is fixed, rather than a status code.
 */
export function vercelRefusal(status: number, message?: string): string {
  const said = message?.trim() ? ` (${message.trim()})` : "";
  if (status === 401 || status === 403) {
    return `Vercel не принял ключ VERCEL_ANALYTICS_TOKEN: он истёк, отозван или выдан не на проект beautasy${said}.`;
  }
  // Vercel says this both when Analytics is off and when the key belongs to
  // somewhere else: on 28.09 a key without this project got it while the
  // counter had been counting for three weeks
  if (status === 404 && /web analytics/i.test(message ?? "")) {
    return "Vercel не видит счётчик проекта по этому ключу: проверьте, что VERCEL_ANALYTICS_TOKEN выдан на проект beautasy (Scope → команда → beautasy) и что в проекте включён Analytics.";
  }
  if (status === 402) {
    return `Бесплатные 50 000 событий Vercel за месяц кончились, счётчик стоит до начала следующего${said}.`;
  }
  return `Vercel ответил ${status}${said}.`;
}
