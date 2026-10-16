import { plainText, type LeadCandidate } from "@/lib/leadScout";
import {
  factsFromContractsFinder,
  factsFromRelease,
  whereIs,
  type ContractsFinderItem,
  type OcdsRelease,
  type TenderFacts,
} from "@/lib/tenderJudge";

/**
 * Where the morning search looks, one function per place. Each returns
 * candidates and never judges them — @/lib/leadScout does that — and each
 * fails on its own: a source that is down or not configured answers with an
 * empty list and a reason, and the others carry on.
 *
 * Every source here is one the site may read by program, with its own API and
 * terms that allow it. Facebook is not among them (see FACEBOOK_SEARCHES).
 */

export interface SourceResult {
  source: LeadCandidate["source"];
  candidates: LeadCandidate[];
  /** Why nothing came back, when that is not simply "nothing new" */
  problem?: string;
}

type Fetch = typeof fetch;

const UA = "Beautasy lead search (hello@beautasy.co.uk)";
const TIMEOUT = 12_000;

async function getJson<T>(fetcher: Fetch, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetcher(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
  return (await res.json()) as T;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One copy of each URL, first seen wins. */
function unique(candidates: LeadCandidate[]): LeadCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
}

/** Where a tender is, in words she reads: the buyer's town and the region, or how far */
function placeOf(facts: TenderFacts): string | undefined {
  const where = whereIs(facts);
  return where.place ?? where.far;
}

// ─── Contracts Finder: a secondary feed since the Procurement Act 2023 — small
// public contracts are published on Find a Tender first — but it still carries
// some. Every notice still open and published since `since` is read, in one
// request: about thirty in three days, and the judge (@/lib/tenderJudge)
// decides each on its codes, money and place. Keyword searches missed what
// was coded but not worded, and its postcode search ignores the radius (16.10.2026).

const CONTRACTS_PAGE = 500;

interface ContractsFinderAnswer {
  hitCount?: number;
  noticeList?: { item: ContractsFinderItem }[];
}

export async function fromContractsFinder(fetcher: Fetch = fetch, since: Date): Promise<SourceResult> {
  try {
    const answer = await getJson<ContractsFinderAnswer>(fetcher, "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchCriteria: { statuses: ["Open"], publishedFrom: since.toISOString().slice(0, 10) },
        size: CONTRACTS_PAGE,
      }),
    });
    const list = answer.noticeList ?? [];
    const candidates = list.map(({ item }): LeadCandidate => {
      const facts = factsFromContractsFinder(item);
      return {
        source: "contractsFinder",
        url: `https://www.contractsfinder.service.gov.uk/Notice/${item.id}`,
        title: plainText(item.title, 200),
        text: plainText(item.description),
        who: item.organisationName,
        place: placeOf(facts),
        pay: item.valueHigh ? `до £${Number(item.valueHigh).toLocaleString("en-GB")}` : undefined,
        deadline: item.deadlineDate ?? undefined,
        postedAt: item.publishedDate ?? undefined,
        askingByNature: true,
        tender: facts,
      };
    });
    // More open notices than one page holds: say so rather than miss them quietly
    const cut = typeof answer.hitCount === "number" && answer.hitCount > list.length;
    return {
      source: "contractsFinder",
      candidates: unique(candidates),
      ...(cut ? { problem: `прочитано ${list.length} из ${answer.hitCount}` } : {}),
    };
  } catch (error) {
    return { source: "contractsFinder", candidates: [], problem: reason(error) };
  }
}

// ─── Adzuna: job boards across the UK in one API. Free key (developer.adzuna.com).
// Searched within 40 km of Southampton, plus "outwork"/"home based" UK-wide.

// Work that comes to her, not jobs to go to: the judge drops anything that
// does not say outwork, home-based, freelance, subcontract or piece work
const ADZUNA_NEAR = ["seamstress freelance", "curtain maker", "soft furnishings", "alterations freelance", "sewing self employed"];
const ADZUNA_ANYWHERE = ["curtain maker home based", "sewing outworker", "freelance seamstress", "soft furnishings outworker", "sewing piece work"];

const ADZUNA_GAP_MS = 1_500;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AdzunaAnswer {
  results?: {
    id: string;
    title: string;
    description?: string;
    redirect_url: string;
    created?: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
    salary_min?: number;
    salary_max?: number;
    contract_time?: string;
    contract_type?: string;
  }[];
}

export async function fromAdzuna(fetcher: Fetch = fetch, since: Date, now: Date): Promise<SourceResult> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return { source: "adzuna", candidates: [], problem: "нет ключа ADZUNA_APP_ID / ADZUNA_APP_KEY" };
  const days = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / 86_400_000));
  const url = (what: string, near: boolean) => {
    const params = new URLSearchParams({
      app_id: id,
      app_key: key,
      what,
      results_per_page: "30",
      max_days_old: String(days),
      sort_by: "date",
    });
    if (near) {
      params.set("where", "Southampton");
      params.set("distance", "40");
    }
    return `https://api.adzuna.com/v1/api/jobs/gb/search/1?${params}`;
  };
  // One at a time: ten at once got "429 Too Many Requests" on the first try (11.10.2026).
  // A refusal part-way keeps what was already read
  const answers: AdzunaAnswer[] = [];
  let problem: string | undefined;
  const asks = [...ADZUNA_NEAR.map((what) => url(what, true)), ...ADZUNA_ANYWHERE.map((what) => url(what, false))];
  for (const [i, ask] of asks.entries()) {
    if (i > 0) await pause(ADZUNA_GAP_MS);
    try {
      answers.push(await getJson<AdzunaAnswer>(fetcher, ask));
    } catch (error) {
      problem = reason(error);
      break;
    }
  }
  {
    const candidates = answers.flatMap((answer) =>
      (answer.results ?? []).map((job): LeadCandidate => {
        const pay =
          job.salary_min && job.salary_max && job.salary_min !== job.salary_max
            ? `£${Math.round(job.salary_min).toLocaleString("en-GB")}–£${Math.round(job.salary_max).toLocaleString("en-GB")}`
            : job.salary_min
              ? `£${Math.round(job.salary_min).toLocaleString("en-GB")}`
              : undefined;
        return {
          source: "adzuna",
          url: job.redirect_url,
          title: plainText(job.title, 200),
          // The contract words go into the text so the judge can read "part time" or "contract"
          text: plainText([job.description, job.contract_time, job.contract_type].filter(Boolean).join("\n")),
          who: job.company?.display_name,
          place: job.location?.display_name,
          pay,
          postedAt: job.created,
          askingByNature: true,
        };
      })
    );
    return { source: "adzuna", candidates: unique(candidates), ...(problem ? { problem } : {}) };
  }
}

// ─── Reed: the largest UK job board, its own free API key (reed.co.uk/developers).

interface ReedAnswer {
  results?: {
    jobId: number;
    jobTitle: string;
    jobDescription?: string;
    jobUrl: string;
    employerName?: string;
    locationName?: string;
    minimumSalary?: number;
    maximumSalary?: number;
    date?: string; // dd/mm/yyyy
  }[];
}

function reedDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}T09:00:00Z` : undefined;
}

export async function fromReed(fetcher: Fetch = fetch, since: Date): Promise<SourceResult> {
  const key = process.env.REED_API_KEY;
  if (!key) return { source: "reed", candidates: [], problem: "нет ключа REED_API_KEY" };
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
  // Nationwide: within 40 miles of Southampton Reed had none of these on 11.10.2026.
  // The judge keeps a far one only if the work can be done from home
  const words = ["seamstress", "curtain maker", "soft furnishings", "sewing machinist", "hand sewer", "dressmaker", "outworker"];
  try {
    const answers = await Promise.all(
      words.map((keywords) =>
        getJson<ReedAnswer>(
          fetcher,
          `https://www.reed.co.uk/api/1.0/search?${new URLSearchParams({ keywords, resultsToTake: "100" })}`,
          { headers: { Authorization: auth } }
        )
      )
    );
    const candidates = answers
      .flatMap((answer) => answer.results ?? [])
      .map((job): LeadCandidate => ({
        source: "reed",
        url: job.jobUrl,
        title: plainText(job.jobTitle, 200),
        text: plainText(job.jobDescription),
        who: job.employerName,
        place: job.locationName,
        pay:
          job.minimumSalary && job.maximumSalary && job.minimumSalary !== job.maximumSalary
            ? `£${job.minimumSalary.toLocaleString("en-GB")}–£${job.maximumSalary.toLocaleString("en-GB")}`
            : job.minimumSalary
              ? `£${job.minimumSalary.toLocaleString("en-GB")}`
              : undefined,
        postedAt: reedDate(job.date),
        askingByNature: true,
      }))
      // Reed has no "posted since"; the date is a day, so a day's grace
      .filter((c) => !c.postedAt || new Date(c.postedAt).getTime() >= since.getTime() - 86_400_000);
    return { source: "reed", candidates: unique(candidates) };
  } catch (error) {
    return { source: "reed", candidates: [], problem: reason(error) };
  }
}

// ─── Find a Tender: every public contract in the UK, small ones included since
// the Procurement Act 2023 ("Below threshold - open competition"). No keyword
// search, so every release since `since` is paged through (100 a page) and the
// judge reads each one's codes, lots, money and place. Calls for bids that are
// open, and notices of one to come (market engagement), are kept.
//
// Not the API's `stages` filter: asked for tenders it returned only the old
// regulations' notices and none under the 2023 Act (checked 16.10.2026).

interface FindATenderAnswer {
  releases?: OcdsRelease[];
  links?: { next?: string };
}

const FIND_A_TENDER_PAGES = 10;

/** Open for bids, or a market engagement ahead of them */
export function liveRelease(release: OcdsRelease): boolean {
  const tags = release.tag ?? [];
  if (!release.tender?.title) return false;
  if (tags.some((tag) => tag === "tender" || tag === "tenderUpdate")) return release.tender.status === "active";
  return tags.some((tag) => tag === "planning" || tag === "planningUpdate");
}

export async function fromFindATender(fetcher: Fetch = fetch, since: Date): Promise<SourceResult> {
  let url: string | undefined =
    `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?${new URLSearchParams({ updatedFrom: since.toISOString().slice(0, 19), limit: "100" })}`;
  // One procurement, one find: its newest release says where it stands — a
  // change notice replaces the call it changes, a cancellation withdraws it
  const newest = new Map<string, OcdsRelease>();
  let problem: string | undefined;
  try {
    for (let page = 0; url && page < FIND_A_TENDER_PAGES; page++) {
      const answer: FindATenderAnswer = await getJson<FindATenderAnswer>(fetcher, url);
      for (const release of answer.releases ?? []) {
        const id = release.ocid ?? release.id;
        const held = newest.get(id);
        if (!held || (release.date ?? "") > (held.date ?? "")) newest.set(id, release);
      }
      url = answer.links?.next;
    }
  } catch (error) {
    // What was read before the failure still counts
    problem = reason(error);
  }
  const candidates: LeadCandidate[] = [];
  for (const [id, release] of newest) {
    if (!liveRelease(release)) continue;
    const tender = release.tender!;
    const facts = factsFromRelease(release);
    candidates.push({
      source: "findATender",
      // The notice and the stage it is at: a market engagement and the call for bids that follows are two finds
      key: `${id}#${facts.kind}`,
      url: `https://www.find-tender.service.gov.uk/Notice/${release.id}`,
      title: plainText(tender.title, 200),
      text: plainText(tender.description),
      who: release.buyer?.name,
      place: placeOf(facts),
      pay: tender.value?.amount ? `до £${Math.round(tender.value.amount).toLocaleString("en-GB")}` : undefined,
      deadline: facts.deadline,
      postedAt: release.date,
      askingByNature: true,
      tender: facts,
    });
  }
  return { source: "findATender", candidates: unique(candidates), ...(problem ? { problem } : {}) };
}
