import { plainText, type LeadCandidate } from "@/lib/leadScout";

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

// ─── Contracts Finder: every public contract in England over £12k, open search, no key.
// Most are frameworks for big suppliers; the judge keeps only those whose own
// words are her craft (a care home's curtains, a theatre's costumes).

// Not "alterations": in tenders it means building work, every time we looked
const CONTRACT_WORDS = ["curtains", "soft furnishings", "seamstress", "sewing", "dressmaking", "costume", "upholstery", "textiles"];

interface ContractsFinderAnswer {
  noticeList?: {
    item: {
      id: string;
      title: string;
      description?: string;
      organisationName?: string;
      regionText?: string;
      postcode?: string;
      publishedDate?: string;
      deadlineDate?: string;
      valueLow?: number;
      valueHigh?: number;
    };
  }[];
}

export async function fromContractsFinder(fetcher: Fetch = fetch, since: Date): Promise<SourceResult> {
  try {
    const answers = await Promise.all(
      CONTRACT_WORDS.map((keyword) =>
        getJson<ContractsFinderAnswer>(fetcher, "https://www.contractsfinder.service.gov.uk/api/rest/2/search_notices/json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            searchCriteria: { keyword, statuses: ["Open"], publishedFrom: since.toISOString().slice(0, 10) },
            size: 50,
          }),
        })
      )
    );
    const candidates = answers.flatMap((answer) =>
      (answer.noticeList ?? []).map(({ item }): LeadCandidate => {
        const money = item.valueHigh ? `до £${Number(item.valueHigh).toLocaleString("en-GB")}` : undefined;
        return {
          source: "contractsFinder",
          url: `https://www.contractsfinder.service.gov.uk/Notice/${item.id}`,
          title: plainText(item.title, 200),
          text: plainText(item.description),
          who: item.organisationName,
          place: [item.regionText, item.postcode].filter(Boolean).join(", ") || undefined,
          pay: money,
          deadline: item.deadlineDate ?? undefined,
          postedAt: item.publishedDate ?? undefined,
          askingByNature: true,
        };
      })
    );
    return { source: "contractsFinder", candidates: unique(candidates) };
  } catch (error) {
    return { source: "contractsFinder", candidates: [], problem: reason(error) };
  }
}

// ─── Adzuna: job boards across the UK in one API. Free key (developer.adzuna.com).
// Searched within 40 km of Southampton, plus "outwork"/"home based" UK-wide.

const ADZUNA_NEAR = ["seamstress", "curtain maker", "soft furnishings", "alterations", "sewing machinist", "dressmaker"];
const ADZUNA_ANYWHERE = ["curtain maker home based", "sewing outworker", "freelance seamstress", "soft furnishings outworker"];

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
  try {
    const answers = await Promise.all([
      ...ADZUNA_NEAR.map((what) => getJson<AdzunaAnswer>(fetcher, url(what, true))),
      ...ADZUNA_ANYWHERE.map((what) => getJson<AdzunaAnswer>(fetcher, url(what, false))),
    ]);
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
    return { source: "adzuna", candidates: unique(candidates) };
  } catch (error) {
    return { source: "adzuna", candidates: [], problem: reason(error) };
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
  const words = ["seamstress", "curtain maker", "soft furnishings", "alterations", "sewing machinist"];
  try {
    const answers = await Promise.all(
      words.map((keywords) =>
        getJson<ReedAnswer>(
          fetcher,
          `https://www.reed.co.uk/api/1.0/search?${new URLSearchParams({ keywords, locationName: "Southampton", distanceFromLocation: "25", resultsToTake: "50" })}`,
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

// ─── Find a Tender: the larger public contracts. No keyword search, so every
// release since `since` is paged through (100 a page, a few pages a day) and
// the judge reads the titles. Only notices still open for bids are kept.

interface FindATenderAnswer {
  releases?: {
    id: string;
    tag?: string[];
    date?: string;
    buyer?: { name?: string };
    tender?: {
      title?: string;
      description?: string;
      status?: string;
      value?: { amount?: number };
      tenderPeriod?: { endDate?: string };
      deliveryAddresses?: { region?: string }[];
    };
  }[];
  links?: { next?: string };
}

const FIND_A_TENDER_PAGES = 10;

export async function fromFindATender(fetcher: Fetch = fetch, since: Date): Promise<SourceResult> {
  let url: string | undefined =
    `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?${new URLSearchParams({ updatedFrom: since.toISOString().slice(0, 19), limit: "100" })}`;
  const candidates: LeadCandidate[] = [];
  try {
    for (let page = 0; url && page < FIND_A_TENDER_PAGES; page++) {
      const answer: FindATenderAnswer = await getJson<FindATenderAnswer>(fetcher, url);
      for (const release of answer.releases ?? []) {
        const tender = release.tender;
        if (!tender?.title || tender.status !== "active" || !release.tag?.includes("tender")) continue;
        candidates.push({
          source: "findATender",
          url: `https://www.find-tender.service.gov.uk/Notice/${release.id}`,
          title: plainText(tender.title, 200),
          text: plainText(tender.description),
          who: release.buyer?.name,
          place: tender.deliveryAddresses?.map((a) => a.region).filter(Boolean).join(", ") || undefined,
          pay: tender.value?.amount ? `до £${Math.round(tender.value.amount).toLocaleString("en-GB")}` : undefined,
          deadline: tender.tenderPeriod?.endDate,
          postedAt: release.date,
          askingByNature: true,
        });
      }
      url = answer.links?.next;
    }
    return { source: "findATender", candidates: unique(candidates) };
  } catch (error) {
    // What was read before the failure still counts
    return { source: "findATender", candidates: unique(candidates), problem: reason(error) };
  }
}
