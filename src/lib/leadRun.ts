import { sanityWriteClient } from "@/lib/sanity";
import { sendEmail, type EmailMessage } from "@/lib/sendEmail";
import { escapeHtml } from "@/lib/escapeHtml";
import {
  FACEBOOK_SEARCHES,
  LEAD_SOURCES,
  facebookSearchUrl,
  judge,
  leadIdFor,
  plainText,
  telegramFacebookNudge,
  telegramMessage,
  type LeadCandidate,
  type StoredLead,
} from "@/lib/leadScout";
import { fromAdzuna, fromContractsFinder, fromFindATender, fromReed, type SourceResult } from "@/lib/leadSources";

/**
 * One morning's search: ask every source, judge what comes back, keep what
 * fits as a «Ищут мастера» document, and tell Kristina about the ones that
 * are new — in Telegram, one message each, and in one email.
 *
 * "New" is "no document with this id yet". The id is made from the advert's
 * address, so an advert found again tomorrow, or by a second run today, is
 * the same document and is not announced twice. The search looks three days
 * back so a source that was down yesterday is caught up today.
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";
const SITE = "https://www.beautasy.co.uk";
const LOOK_BACK_DAYS = 3;
/** More than this in one morning and the rest wait in the Studio, with a line saying how many */
const TELEGRAM_MAX = 8;

export function studioUrlFor(id: string): string {
  return `${SITE}/studio/intent/edit/id=${id};type=lead`;
}

export interface LeadRunDeps {
  now?: Date;
  sources?: ((since: Date, now: Date) => Promise<SourceResult>)[];
  /** Ids among these that already exist */
  existing?: (ids: string[]) => Promise<string[]>;
  save?: (docs: Record<string, unknown>[]) => Promise<unknown>;
  telegram?: (text: string) => Promise<void>;
  email?: (message: EmailMessage) => Promise<void>;
}

export interface LeadRunResult {
  looked: number;
  kept: number;
  fresh: number;
  telegram: number | "unconfigured" | "failed";
  email: "sent" | "nothing" | "failed" | "unconfigured";
  problems: Record<string, string>;
}

/** Judge every candidate and keep the ones that fit, best first, each once. */
export function keepers(results: SourceResult[], now: Date = new Date()): StoredLead[] {
  const byId = new Map<string, StoredLead>();
  for (const candidate of results.flatMap((result) => result.candidates)) {
    const verdict = judge(candidate, now);
    if (!verdict.keep) continue;
    const _id = leadIdFor(candidate.source, candidate.key ?? candidate.url);
    if (!byId.has(_id)) byId.set(_id, { ...candidate, ...verdict, _id });
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

/**
 * Monday's line about tenders, so a quiet week reads as a working search:
 * work a one-person atelier can win comes a few times a year, and the judge
 * lets nothing else through (see @/lib/tenderJudge).
 */
export function tenderTally(read: number, fit: number, down: { name: string; partly: boolean }[] = []): string {
  const head = `📑 <b>Тендеры</b>: сегодня прочитано ${read}, подошло ${fit}.`;
  // A source that did not answer is not a quiet week, and is never called one
  if (down.length) {
    const who = down.map(({ name, partly }) => `${name} ${partly ? "ответил не до конца" : "не ответил"}`).join(", ");
    return `${head} ⚠️ ${who} — это поломка, а не тишина. Поиск смотрит на три дня назад: заработает — наверстает.`;
  }
  return `${head} Работа для одной мастерской в тендерах бывает несколько раз в год — тишина здесь норма, а не поломка.`;
}

export function leadDocument(lead: StoredLead, now: Date): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    _id: lead._id,
    _type: "lead",
    status: "new",
    title: lead.title,
    url: lead.url,
    source: lead.source,
    text: plainText(lead.text),
    score: lead.score,
    why: lead.why,
    foundAt: now.toISOString(),
  };
  for (const field of ["who", "place", "pay", "deadline", "postedAt"] as const) {
    if (lead[field]) doc[field] = lead[field];
  }
  return doc;
}

function sourceTitle(source: LeadCandidate["source"]): string {
  return LEAD_SOURCES.find((s) => s.value === source)?.title ?? source;
}

export function leadEmailSubject(fresh: StoredLead[]): string {
  const n = fresh.length;
  const word = n % 10 === 1 && n % 100 !== 11 ? "новое предложение" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "новых предложения" : "новых предложений";
  return `🧵 Ищут мастера: ${n} ${word}`;
}

export function leadEmailHtml(fresh: StoredLead[], problems: Record<string, string>): string {
  const items = fresh
    .map(
      (lead) => `<li style="margin:0 0 18px;line-height:1.55;">
        <a href="${escapeHtml(lead.url)}" style="color:#2d2d2d;font-weight:bold;">${escapeHtml(lead.title)}</a><br/>
        <span style="color:#6d6680;font-size:13px;">${escapeHtml([lead.who, lead.place, lead.pay].filter(Boolean).join(" · "))}</span><br/>
        <span style="color:#3d3d3d;">${escapeHtml(plainText(lead.text, 320))}</span><br/>
        <span style="color:#7a6d9a;font-size:13px;font-style:italic;">${escapeHtml(lead.why.slice(0, 5).join(" · "))} · ${escapeHtml(sourceTitle(lead.source))} · ★${lead.score}</span><br/>
        <a href="${escapeHtml(studioUrlFor(lead._id))}" style="color:#5e4b9a;font-size:13px;">Открыть в Studio</a>
      </li>`
    )
    .join("");
  const facebook = FACEBOOK_SEARCHES.map(
    ({ title, query }) => `<a href="${escapeHtml(facebookSearchUrl(query))}" style="color:#5e4b9a;">${escapeHtml(title)}</a>`
  ).join(" · ");
  const quiet = Object.entries(problems)
    .map(([source, why]) => `${escapeHtml(sourceTitle(source as LeadCandidate["source"]))}: ${escapeHtml(why)}`)
    .join("; ");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#faf9f7;font-family:Georgia,serif;color:#2d2d2d;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">Beautasy Atelier</p>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:400;">Ищут мастера 🧵</h1>
    <p style="margin:0 0 20px;color:#555;line-height:1.6;">Кто за последние дни искал швею, мастера по шторам или субподрядчика. В Studio у каждого можно отметить «Интересно», «Написала» или «Не для нас».</p>
    <ul style="margin:0;padding:0 0 0 18px;">${items}</ul>
    <p style="margin:22px 0 0;color:#555;line-height:1.6;">📘 Facebook программам закрыт — проверить руками: ${facebook}</p>
    ${quiet ? `<p style="margin:18px 0 0;font-size:12px;color:#8a8494;line-height:1.6;">Не ответили сегодня: ${quiet}</p>` : ""}
  </div>
</body></html>`;
}

/** Telegram's sendMessage, to every chat in TELEGRAM_LEADS_CHAT_IDS. Throws when Telegram says no. */
export async function telegramSend(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.TELEGRAM_LEADS_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || chats.length === 0) throw new Error("Telegram is not configured");
  for (const chat_id of chats) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_LEADS_CHAT_IDS);
}

export async function runLeadSearch(deps: LeadRunDeps = {}): Promise<LeadRunResult> {
  const now = deps.now ?? new Date();
  const since = new Date(now.getTime() - LOOK_BACK_DAYS * 86_400_000);
  const sources = deps.sources ?? [
    (s) => fromContractsFinder(fetch, s),
    (s, n) => fromAdzuna(fetch, s, n),
    (s) => fromReed(fetch, s),
    (s) => fromFindATender(fetch, s),
  ];
  const existing = deps.existing ?? ((ids) => sanityWriteClient.fetch<string[]>(`*[_id in $ids]._id`, { ids }));
  const save =
    deps.save ??
    ((docs) => {
      const tx = sanityWriteClient.transaction();
      for (const doc of docs) tx.createIfNotExists(doc as { _id: string; _type: string });
      return tx.commit();
    });
  const telegram = deps.telegram ?? (telegramConfigured() ? telegramSend : null);
  const email = deps.email ?? (process.env.RESEND_API_KEY ? (message: EmailMessage) => sendEmail(message) : null);

  const results = await Promise.all(sources.map((source) => source(since, now)));
  const problems: Record<string, string> = {};
  for (const result of results) if (result.problem) problems[result.source] = result.problem;

  const kept = keepers(results, now);
  const looked = results.reduce((sum, result) => sum + result.candidates.length, 0);
  const tendersRead = results.reduce((sum, result) => sum + result.candidates.filter((c) => c.tender).length, 0);
  const already = new Set(kept.length ? await existing(kept.map((lead) => lead._id)) : []);
  const fresh = kept.filter((lead) => !already.has(lead._id));
  // Saved before anyone is told: a message pointing at a Studio page that does not exist is worse than a late one
  if (fresh.length) await save(fresh.map((lead) => leadDocument(lead, now)));

  let told: LeadRunResult["telegram"] = telegram ? 0 : "unconfigured";
  // Monday: the Facebook searches and the week's word on tenders, found or not —
  // once a week rather than every morning, and never only when there is news
  const monday = now.getUTCDay() === 1;
  if (telegram && (fresh.length || monday)) {
    try {
      const top = fresh.slice(0, TELEGRAM_MAX);
      for (const lead of top) await telegram(telegramMessage(lead, studioUrlFor(lead._id)));
      if (fresh.length > top.length) {
        await telegram(`…и ещё ${fresh.length - top.length} — в Studio → «Друзья и партнёры» → «Ищут мастера».`);
      }
      if (monday) {
        const tenderFit = kept.filter((lead) => lead.tender).length;
        const down = results
          .filter((r) => (r.source === "findATender" || r.source === "contractsFinder") && r.problem)
          .map((r) => ({ name: r.source === "findATender" ? "Find a Tender" : "Contracts Finder", partly: r.candidates.length > 0 }));
        await telegram(`${telegramFacebookNudge()}\n\n${tenderTally(tendersRead, tenderFit, down)}`);
      }
      told = top.length;
    } catch (error) {
      console.error("Lead search: Telegram refused:", error instanceof Error ? error.message : error);
      told = "failed";
    }
  }
  if (fresh.length === 0) {
    return { looked, kept: kept.length, fresh: 0, telegram: told, email: "nothing", problems };
  }

  let emailed: LeadRunResult["email"] = "unconfigured";
  if (email) {
    try {
      await email({ from: FROM_EMAIL, to: KRISTINA_EMAIL, subject: leadEmailSubject(fresh), html: leadEmailHtml(fresh, problems) });
      emailed = "sent";
    } catch (error) {
      console.error("Lead search: email refused:", error instanceof Error ? error.message : error);
      emailed = "failed";
    }
  }

  return { looked, kept: kept.length, fresh: fresh.length, telegram: told, email: emailed, problems };
}
