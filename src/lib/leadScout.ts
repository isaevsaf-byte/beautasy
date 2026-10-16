import { judgeTender, type TenderFacts } from "@/lib/tenderJudge";

/**
 * The morning search for people looking for a maker Kristina could be.
 *
 * On 11 October 2026 Safar sent a screenshot from the Facebook group "UK
 * Freelance Seamstresses": a soft-furnishings business in Romsey, twenty
 * minutes from the atelier, looking for someone to make interlined curtains
 * at home. Nobody saw it in time. Work like that — outwork, subcontracting,
 * a theatre that needs a costume hand, a council tender for school curtains —
 * is posted every week somewhere, and it pays without a single client walk-in.
 *
 * This module is the judgement, kept pure so a test can hand it adverts and
 * read what Kristina would get: what counts as her craft, what counts as
 * someone asking (rather than offering), what counts as near, and how one
 * find is written for Telegram, the Studio and the email. The fetching lives
 * in @/lib/leadSources, the run that ties it together in @/lib/leadRun.
 *
 * Facebook groups cannot be read by a program: Meta closed the Groups API in
 * April 2024, and a bot in her own account risks the account that also posts
 * to Instagram (see facebookGroup). So for Facebook the digest carries
 * one-tap searches that open in her own app instead — FACEBOOK_SEARCHES.
 */

export const LEAD_SOURCES = [
  { value: "contractsFinder", title: "Тендеры: Contracts Finder" },
  { value: "findATender", title: "Тендеры: Find a Tender" },
  { value: "adzuna", title: "Вакансии: Adzuna" },
  { value: "reed", title: "Вакансии: Reed" },
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number]["value"];

export const LEAD_STATUSES = [
  { value: "new", title: "🆕 Новое", mark: "🆕" },
  { value: "interested", title: "⭐ Интересно, разобраться", mark: "⭐" },
  { value: "contacted", title: "✉️ Написала / подала", mark: "✉️" },
  { value: "won", title: "🎉 Взяли в работу", mark: "🎉" },
  { value: "no", title: "✖️ Не для нас", mark: "✖️" },
] as const;

/** One advert, tender or post as a source hands it over, before judgement. */
export interface LeadCandidate {
  source: LeadSource;
  /** What makes it one find, when the address does not: a tender's procurement and stage */
  key?: string;
  url: string;
  title: string;
  text: string;
  /** Who is asking: the company, the council, the poster */
  who?: string;
  place?: string;
  pay?: string;
  /** ISO. Tenders: the closing date */
  deadline?: string;
  /** ISO */
  postedAt?: string;
  /**
   * Tenders and job boards are asking by their nature — a tender is a buyer
   * looking for a supplier. Forum posts and web pages have to say so.
   */
  askingByNature?: boolean;
  /** A tender's own fields — what is bought, how much, where — which decide it, not its words (see @/lib/tenderJudge) */
  tender?: TenderFacts;
}

export interface Judgement {
  score: number;
  /** Words in Russian for «Почему показали» */
  why: string[];
  keep: boolean;
}

// ─── Her craft. Weighted: the closer to what she sews every week, the more.
const CRAFT: { pattern: RegExp; weight: number; label: string }[] = [
  { pattern: /\binterlin(ed|ing)\b/i, weight: 4, label: "шторы на прокладке" },
  { pattern: /\bcurtain[- ]?(maker|making|makers)\b/i, weight: 4, label: "пошив штор" },
  { pattern: /\bsoft[- ]furnish/i, weight: 4, label: "мягкая мебель / текстиль для дома" },
  { pattern: /\bseamstress(es)?\b/i, weight: 4, label: "швея" },
  { pattern: /\b(dress ?maker|dressmaking)\b/i, weight: 3, label: "портниха" },
  { pattern: /\balteration(s|ist)?\b/i, weight: 3, label: "подгонка одежды" },
  { pattern: /\bcurtains?\b/i, weight: 2, label: "шторы" },
  { pattern: /\b(roman )?blinds?\b/i, weight: 1, label: "шторы/жалюзи" },
  // Not "sewer": on job boards that is drains (a "Sewer Network Operative", 11.10.2026)
  { pattern: /\b(sewing|stitcher)\b/i, weight: 2, label: "шитьё" },
  { pattern: /\b(sewing )?machinist\b/i, weight: 2, label: "швея-машинистка" },
  { pattern: /\btailor(ing|ess)?\b/i, weight: 2, label: "портной" },
  { pattern: /\bbridal\b|\bwedding dress/i, weight: 2, label: "свадебные платья" },
  { pattern: /\bcostume\b|\bwardrobe (assistant|maker|department|supervisor)/i, weight: 2, label: "костюмы" },
  { pattern: /\blingerie\b|\bcorset/i, weight: 2, label: "бельё/корсеты" },
  { pattern: /\bcushion covers?\b|\bvalance|\bpelmet|\btie-?backs?\b/i, weight: 2, label: "текстиль для дома" },
  { pattern: /\bupholster/i, weight: 1, label: "обивка" },
  { pattern: /\bhemm?(ing)?\b|\bzips?\b/i, weight: 1, label: "мелкий ремонт" },
];

// ─── Someone asking for a maker, not offering one
const ASKING: { pattern: RegExp; label: string }[] = [
  { pattern: /\blooking for (a |an |some(one|body) )?/i, label: "ищут" },
  { pattern: /\b(seeking|wanted|required|needed)\b/i, label: "ищут" },
  { pattern: /\bneed (a |an |some(one|body))/i, label: "ищут" },
  { pattern: /\bsub-?contract(or|ors|ing)?\b/i, label: "субподряд" },
  { pattern: /\bout-?work(er|ers)?\b|\bpiece ?work\b|\bper (piece|item)\b/i, label: "надомная работа" },
  { pattern: /\b(work|working|based) from home\b|\bhome-?based\b|\bhome ?worker/i, label: "можно из дома" },
  { pattern: /\bfreelance\b|\bself-?employed\b/i, label: "фриланс" },
  { pattern: /\b(capacity|take on (extra |more )?work)\b/i, label: "ищут свободные руки" },
  { pattern: /\b(can anyone|does anyone|anyone know|recommend(ations?)?|recommend a)\b/i, label: "просят совета, кого позвать" },
  { pattern: /\b(tender|invitation to quote|request for quot(e|ation)|rfq)\b/i, label: "тендер" },
];

// ─── Offering, selling or teaching — the opposite of what she wants
const NOT_ASKING: RegExp[] = [
  /\bfor sale\b/i,
  /\b(selling|sold)\b/i,
  /\bsewing machine\b.*\b(sale|£)/i,
  /\b(course|classes|class|workshop|tutorial|lesson)s?\b/i,
  /\bi('m| am) (a |an )?(seamstress|dressmaker|tailor|curtain maker)\b/i,
  /\b(offering|available for|my services|dm me for|book now)\b/i,
  /\bpattern (review|hack)\b/i,
];

const BUILDING = /\b(building|refurbish(ment)?|construction|roof(ing)?|extension|conversion|toilets?|public conveniences?|plumbing|electrical|flooring|windows? and doors|glazing|asbestos)\b/i;

// Full-time factory or shop-floor jobs: a wage, not work she can take into the atelier
const EMPLOYEE_ONLY = /\b(full[- ]time|permanent|night shift|shift pattern|warehouse|retail assistant|apprentice(ship)?)\b/i;

// ─── Near: about an hour from Westwood Road, or "anywhere in the UK"
const NEAR = [
  "southampton", "eastleigh", "chandler's ford", "chandlers ford", "romsey", "winchester", "totton",
  "hedge end", "fareham", "portsmouth", "gosport", "havant", "waterlooville", "salisbury", "andover",
  "basingstoke", "lymington", "new forest", "ringwood", "bournemouth", "poole", "christchurch",
  "petersfield", "alton", "isle of wight", "hampshire", "dorset", "wiltshire", "west sussex", "chichester",
];
const ANYWHERE = /\b(uk[- ]wide|anywhere in the uk|nationwide|remote(ly)?|post(ed)? to you|send (the )?work out|by post|courier)\b/i;

export function nearHer(text: string): string | null {
  const lower = text.toLowerCase();
  // Whole words: "alton" is not Walton, "poole" is not Liverpoole
  const town = NEAR.find((name) => new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`).test(lower));
  if (town) return town.replace(/\b\w/g, (c) => c.toUpperCase());
  return ANYWHERE.test(text) ? "по всей стране" : null;
}

/**
 * How well one find fits, and why, in words she reads.
 *
 * Kept if it is her craft (at least one craft word worth 2, or two lesser
 * ones), somebody is asking, and nothing says it is an offer, a sale or a
 * class. Near or "anywhere" adds; a full-time wage job takes away, because
 * the atelier is the work and a shift pattern is not.
 */
export function judge(lead: LeadCandidate, now: Date = new Date()): Judgement {
  // A tender is judged on what the buyer filled in: codes, money, place, time
  if (lead.tender) {
    const verdict = judgeTender(lead.tender, now);
    return { score: verdict.score, why: verdict.keep ? [...verdict.why, "тендер"] : verdict.drop, keep: verdict.keep };
  }
  // A tender read without its facts would be judged by words, which sent a cleaning framework
  if (lead.source === "contractsFinder" || lead.source === "findATender") {
    return { score: 0, why: ["тендер без данных о закупке"], keep: false };
  }
  const all = `${lead.title}\n${lead.text}\n${lead.place ?? ""}`;
  const why: string[] = [];

  // "Alterations" and "blinds" in a building tender are walls and windows, not hems
  const building = BUILDING.test(all);
  let craft = 0;
  for (const { pattern, weight, label } of CRAFT) {
    if (building && (label === "подгонка одежды" || label === "шторы/жалюзи" || label === "мелкий ремонт")) continue;
    if (pattern.test(all)) {
      craft += weight;
      if (!why.includes(label)) why.push(label);
    }
  }

  const askedBy = ASKING.filter(({ pattern }) => pattern.test(all)).map(({ label }) => label);
  const asking = lead.askingByNature || askedBy.length > 0;
  for (const label of askedBy) if (!why.includes(label)) why.push(label);

  // Offers and sales are judged on the headline and the opening: a long advert
  // for outwork may well say "no courses needed" in its last paragraph
  const opening = `${lead.title}\n${lead.text.slice(0, 280)}`;
  const offering = NOT_ASKING.some((pattern) => pattern.test(opening));

  const near = nearHer(all);
  if (near) why.push(near === "по всей стране" ? "можно по всей стране" : `рядом: ${near}`);

  // A tender or a job advert is a request by its nature: worth what two words of asking are
  let score = craft + Math.min(askedBy.length + (lead.askingByNature ? 2 : 0), 3) + (near ? 3 : 0);
  if (EMPLOYEE_ONLY.test(all) && !/\b(freelance|self-?employed|out-?work|sub-?contract)/i.test(all)) {
    score -= 3;
    why.push("похоже на работу по найму");
  }

  // A job advert is only for her when the work comes to her: outwork, freelance,
  // subcontract, piece work. Kristina sews at home for her own atelier; a factory
  // shift is not that, however near (Safar, 11.10.2026: "нам не нужны постоянные
  // работы на фабрике"). Near only adds points once that holds.
  const jobBoard = lead.source === "adzuna" || lead.source === "reed";
  const comesToHer = askedBy.some((label) => label === "надомная работа" || label === "можно из дома" || label === "фриланс" || label === "субподряд");
  const reachable = !jobBoard || comesToHer;

  const keep = craft >= 2 && asking && !offering && reachable && score >= 5;
  return { score, why, keep };
}

/** A short stable id from a URL, so the same advert is one document however often it is found. */
export function leadIdFor(source: LeadSource, url: string): string {
  // FNV-1a, 32-bit, twice with different seeds: no crypto needed, just stable and short
  const hash = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < url.length; i++) {
      h ^= url.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  };
  return `lead-${source}-${hash(0x811c9dc5)}${hash(0x01000193)}`;
}

/** Tidy text for storage and messages: no markup, no runs of blank lines, a cap on length. */
export function plainText(value: string | undefined, max = 1500): string {
  if (!value) return "";
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ─── Facebook: searches she opens in her own app, logged in as herself.
// facebook.com/search/posts shows public posts and posts in her groups.
export const FACEBOOK_SEARCHES: { title: string; query: string }[] = [
  { title: "ищут швею", query: "looking for a seamstress" },
  { title: "ищут мастера по шторам", query: "looking for curtain maker" },
  { title: "надомная работа: шторы", query: "curtain making outworker" },
  { title: "ищут подгонку", query: "need alterations Southampton" },
];

export function facebookSearchUrl(query: string): string {
  return `https://www.facebook.com/search/posts?q=${encodeURIComponent(query)}`;
}

// ─── How one find reads in Telegram (HTML parse mode: only <b>, <i>, <a> used)

function telegramEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface StoredLead extends LeadCandidate, Judgement {
  _id: string;
}

function sourceTitle(source: LeadSource): string {
  return LEAD_SOURCES.find((s) => s.value === source)?.title ?? source;
}

function dayMonth(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/London" });
}

export function telegramMessage(lead: StoredLead, studioUrl: string): string {
  const lines = [
    `🧵 <b>${telegramEscape(lead.title)}</b>`,
    [lead.who, lead.place].filter(Boolean).map((s) => telegramEscape(s!)).join(" · "),
    lead.pay ? `💷 ${telegramEscape(lead.pay)}` : "",
    dayMonth(lead.deadline) ? `⏳ ${lead.tender?.kind === "planning" ? "откликнуться до" : "подать до"} ${dayMonth(lead.deadline)}` : "",
    "",
    telegramEscape(plainText(lead.text, 500)),
    "",
    `<i>${telegramEscape(lead.why.slice(0, 5).join(" · "))}</i>`,
    `${telegramEscape(sourceTitle(lead.source))} · ★${lead.score}`,
    `<a href="${telegramEscape(lead.url)}">Открыть объявление</a> · <a href="${telegramEscape(studioUrl)}">В Studio</a>`,
  ];
  return lines.filter((line, i, all) => line !== "" || (all[i - 1] ?? "") !== "").join("\n").slice(0, 4000);
}

export function telegramFacebookNudge(): string {
  const links = FACEBOOK_SEARCHES.map(
    ({ title, query }) => `• <a href="${facebookSearchUrl(query)}">${telegramEscape(title)}</a>`
  ).join("\n");
  return `📘 <b>Facebook — проверить руками</b>\nГруппы закрыты для программ, поэтому вот поиски — откроются в вашем Facebook:\n${links}`;
}
