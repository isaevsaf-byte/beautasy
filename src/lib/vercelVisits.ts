import "server-only";
import {
  lastSevenDays,
  referrerSources,
  vercelRefusal,
  visitTotals,
  type VisitReading,
} from "./visitCounts";

/**
 * Visitors over the last week, read back from Vercel's own counter.
 *
 * <Analytics /> counts every page anyone opens, with no cookie, so it sees
 * everybody — Google sees only those who accepted the cookie banner. This
 * reads the week back so the Dashboard can show it; the arithmetic and the
 * words are in @/lib/visitCounts, where they can be tested.
 *
 * 🚨 VERCEL_ANALYTICS_TOKEN opens the Vercel project it was made for, not
 * only its numbers. Make it project-scoped — Account → Tokens → Scope: the
 * team, then the beautasy project — and a leaked token reaches this project
 * alone, whose secrets this server holds anyway. A full-account or team token
 * here would hand whoever reads this server's environment every project on
 * the account, the clients' ones included.
 *
 * 🚨 `import "server-only"` keeps this file, and the token with it, out of the
 * Studio's browser bundle — see @/lib/ga4 for why that line must stay.
 */

const API = "https://api.vercel.com/v1/query/web-analytics/visits";

/**
 * How long Vercel gets for both reads together. Its answer is a block the
 * page is happy to render without; the shop's own numbers, read at the same
 * time, must not wait on it.
 */
const VERCEL_TIMEOUT_MS = 5_000;

export function vercelVisitsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.VERCEL_ANALYTICS_TOKEN?.trim();
}

async function askVercel(
  path: "count" | "aggregate",
  params: URLSearchParams,
  token: string,
  signal: AbortSignal
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${API}/${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error("Vercel не ответил за пять секунд.");
    }
    throw error;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(vercelRefusal(res.status, body.error?.message));
  }
  return res.json();
}

/** Visitors, page views and the top five places they came from, last seven days */
export async function readVercelVisits(now: Date = new Date()): Promise<VisitReading> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN?.trim();
  if (!token) throw new Error("VERCEL_ANALYTICS_TOKEN is not set.");

  // Vercel gives every deployment its project's id; the name works as well
  const projectId = process.env.VERCEL_PROJECT_ID?.trim() || "beautasy";
  // The project belongs to a team, and the API looks in the token owner's
  // personal account unless told which team: a project's name alone is not
  // enough there. The team's id is an address, not a secret.
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || "team_ryR3tzKHVW1ZdN8961v01OYC";
  const { since, until } = lastSevenDays(now);
  const week = { projectId, teamId, since: String(since), until: String(until) };

  // One deadline for both reads, which go together
  const deadline = AbortSignal.timeout(VERCEL_TIMEOUT_MS);
  const [count, byReferrer] = await Promise.all([
    askVercel("count", new URLSearchParams(week), token, deadline),
    askVercel("aggregate", new URLSearchParams({ ...week, by: "referrerHostname", limit: "10" }), token, deadline),
  ]);

  return { ...visitTotals(count), sources: referrerSources(byReferrer) };
}
