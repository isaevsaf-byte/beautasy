import "server-only";
import { createSign } from "crypto";

/**
 * Where visitors came from, read straight from Google Analytics.
 *
 * The shop already sends GA4 its events (see @/lib/analytics), but reading
 * them back means opening analytics.google.com, and the Dashboard exists
 * precisely so that Kristina does not have to go anywhere. So the server asks
 * Google and puts the answer on the same page as everything else.
 *
 * 🚨 `import "server-only"` on the first line is not decoration. The Studio is
 * compiled into the same Next build as the shop and everything reachable from
 * sanity.config.ts becomes browser code, silently — a file importing `crypto`
 * and `process.env` from the Studio still builds, and ships the key-handling
 * machinery to the public. This line turns that into a loud build failure
 * naming the whole import chain. It is in package.json for the same reason:
 * the package was resolving only because npm had hoisted it out of next's own
 * tree, so a stricter install would have turned this guarantee into "Module
 * not found: server-only" — and the obvious fix, for anyone who met that
 * message without this paragraph, is to delete the line.
 *
 * Why no @google-analytics/data: the official client drags in gRPC and its own
 * auth stack for two HTTP requests, and every megabyte of it would have to be
 * kept out of the Studio bundle by hand. A service account signs its own JWT
 * with a private key, trades it for an access token, and calls the REST API —
 * which is all the library does, in about sixty lines and no dependencies.
 *
 * Connected or not is a setting, not a failure: with no credentials the shop's
 * own numbers still work and this block says so in plain words.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/**
 * How long Google gets, in total, before the Dashboard stops waiting.
 *
 * A refusal was always caught and turns into one grey card; a socket that
 * never answers was not, and with no deadline it eats the whole serverless
 * function until Vercel gives up — which takes down the shop's own numbers,
 * already sitting in memory, for the sake of a block that is allowed to be
 * missing. One budget for both calls rather than one each, so that a bad
 * morning at Google cannot cost ten seconds by being slow twice.
 */
const GOOGLE_TIMEOUT_MS = 5_000;

/**
 * One request to Google, refused politely when the deadline passes.
 *
 * An abort arrives as a DOMException saying "This operation was aborted",
 * which is true and no use at all on a page that offers to show the line to
 * Safar, so it is turned into the sentence a person would say.
 */
async function askGoogle(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error("Google did not answer within five seconds.");
    }
    throw error;
  }
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * The service account key, however it survived being pasted into Vercel.
 *
 * The JSON holds a PEM private key full of real newlines, and every way of
 * getting that through an environment variable mangles it differently: the
 * dashboard turns them into the two characters \n, a shell may strip them
 * altogether. Base64 is offered because it survives all of that, and both
 * forms are accepted because whichever one is used first is the one that will
 * be used forever.
 */
export function readServiceAccount(rawValue: string | undefined): ServiceAccount | null {
  if (!rawValue) return null;

  let text = rawValue.trim();
  if (!text) return null;

  // Not JSON? Then it is the same JSON, base64'd.
  if (!text.startsWith("{")) {
    try {
      text = Buffer.from(text, "base64").toString("utf8").trim();
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(text) as Partial<ServiceAccount>;
    const email = typeof parsed.client_email === "string" ? parsed.client_email : "";
    let key = typeof parsed.private_key === "string" ? parsed.private_key : "";
    if (!email || !key) return null;
    // A key that came through the dashboard has literal backslash-n in it.
    if (!key.includes("\n")) key = key.replace(/\\n/g, "\n");
    return { client_email: email, private_key: key };
  } catch {
    return null;
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * A JWT the service account signs for itself, which Google trades for an
 * access token. There is no person to click "allow", which is the whole
 * reason this is a service account and not the usual sign-in.
 */
function signedAssertion(account: ServiceAccount, now: Date): string {
  const issued = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issued,
      exp: issued + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(account.private_key));
  return `${header}.${claims}.${signature}`;
}

/**
 * Access tokens last an hour, and the Dashboard gets opened and reopened, so
 * one is kept until a minute before it expires rather than bought each time.
 * Module scope means per warm instance, which is the right amount of clever:
 * a cold start just buys another one.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(
  account: ServiceAccount,
  now: Date,
  signal: AbortSignal
): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > now.getTime() + 60_000) {
    return cachedToken.value;
  }

  const res = await askGoogle(
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signedAssertion(account, now),
      }),
    },
    signal
  );

  if (!res.ok) {
    // Google's body names the fault — a clock an hour out, a key that was
    // revoked — and it is worth keeping, but it is also the only part of this
    // exchange that could echo the key back, so only the short form is kept.
    const body = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Google refused the sign-in (${res.status}). ${body}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google returned no access token.");

  cachedToken = {
    value: data.access_token,
    expiresAt: now.getTime() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/** One row of Google's answer, before it is turned into English. */
interface ReportRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}

interface ReportResponse {
  rows?: ReportRow[];
  error?: { message?: string };
}

function firstNumber(row: ReportRow, index: number): number {
  const raw = row.metricValues?.[index]?.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export interface Ga4Reading {
  visitors: number;
  views: number;
  sources: { name: string; visitors: number }[];
}

export function ga4Configured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.GA4_PROPERTY_ID && env.GA4_SERVICE_ACCOUNT);
}

/**
 * Visitors and their top five sources over the last seven days.
 *
 * Two reports in one request. "yesterday" rather than "today" as the end of
 * the range because today is still being counted and a half-finished day
 * always looks like a collapse.
 *
 * 🚨 This will never agree with Vercel's own counter, and that is not a bug:
 * Google only counts visitors who accepted the cookie banner, so it is always
 * the lower number. Saying so is the component's job — see dashboardTool.
 */
export async function readGa4(now: Date = new Date()): Promise<Ga4Reading> {
  const property = process.env.GA4_PROPERTY_ID?.trim();
  const account = readServiceAccount(process.env.GA4_SERVICE_ACCOUNT);

  if (!property) throw new Error("GA4_PROPERTY_ID is not set.");
  if (!account) throw new Error("GA4_SERVICE_ACCOUNT is missing or is not the key file's JSON.");

  // One deadline for the whole reading, shared by the sign-in and the reports.
  const deadline = AbortSignal.timeout(GOOGLE_TIMEOUT_MS);
  const token = await accessToken(account, now, deadline);

  const res = await askGoogle(
    `${DATA_API}/properties/${encodeURIComponent(property)}:batchRunReports`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
            metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
          },
          {
            dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
            dimensions: [{ name: "sessionDefaultChannelGroup" }],
            metrics: [{ name: "activeUsers" }],
            orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
            limit: 5,
          },
        ],
      }),
    },
    deadline
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ReportResponse;
    const detail = body.error?.message ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }

  const payload = (await res.json()) as { reports?: ReportResponse[] };
  const totals = payload.reports?.[0];
  const byChannel = payload.reports?.[1];

  const totalRow = totals?.rows?.[0];

  return {
    visitors: totalRow ? firstNumber(totalRow, 0) : 0,
    views: totalRow ? firstNumber(totalRow, 1) : 0,
    sources: (byChannel?.rows ?? [])
      .map((row) => ({
        name: row.dimensionValues?.[0]?.value ?? "Unassigned",
        visitors: firstNumber(row, 0),
      }))
      .filter((source) => source.visitors > 0),
  };
}
