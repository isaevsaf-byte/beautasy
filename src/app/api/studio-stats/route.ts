import { NextRequest, NextResponse } from "next/server";
import { createClient } from "next-sanity";
import { sanityConfig } from "@/lib/sanity";
import { isProjectMember, looksLikeAToken } from "@/lib/studioMember";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { ga4Configured, readGa4 } from "@/lib/ga4";
import {
  buildDashboard,
  statsParams,
  STUDIO_STATS_QUERY,
  type Dashboard,
  type StatsRaw,
  type Traffic,
} from "@/lib/studioStats";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio-stats — everything the Dashboard in the Studio shows.
 *
 * The Studio is a page in the browser and has no secret of its own, so it
 * cannot read the shop's takings itself. It asks here instead, and here the
 * caller has to prove it is Kristina.
 *
 * 🚨 Two checks, not one, and the second is the real one. `fromThisSite` is a
 * cheap filter that turns away a bare curl, but an Origin header is one line
 * to forge, so it guards nothing on its own. So the caller also sends the
 * session token their Studio is already using, and it is checked against
 * Sanity, exactly as /api/studio/reveal does. A machine with CRON_SECRET may
 * ask instead, which is how this can be tested from outside a browser.
 *
 * 🚨 Be honest about what that buys, because the honest version changes what
 * anyone would do next. A reviewer ran STUDIO_STATS_QUERY word for word
 * against the public Sanity API with no credentials at all and got these same
 * counts back: the free plan has no private datasets, so the aggregates are
 * public already and this door does not close them. The checks are still worth
 * having — they are what will hold on the day the dataset is closed, and they
 * keep this route from being a free way to hammer the database — but the only
 * thing standing between a customer and the internet is the field-by-field
 * projection in STUDIO_STATS_QUERY, not the two checks below.
 *
 * 🚨 Nothing sealed leaves here. STUDIO_STATS_QUERY counts and sums; the only
 * text in its answer is product names. Adding a field with a customer's name,
 * address or email in it would put that data into this reply and into Vercel's
 * request log, where it is no longer encrypted at all — which is the whole
 * reason the documents are sealed. studioStats.test.ts runs the real query
 * against real-shaped documents and fails if anything sealed comes back.
 */

/** A minute and a half. Long enough that reopening the tab is free, short
 * enough that nothing on the page is interestingly old. It is not short enough
 * for the one moment that matters — she answers a fitting request and presses
 * "Check again" expecting the red line to go — so that button asks with
 * `fresh: true` and skips the read below. Without that the button spent up to
 * ninety seconds handing back the identical page while looking like it had
 * worked, which is how a dashboard stops being believed. */
const CACHE_MS = 90_000;

let cached: { at: number; body: Dashboard } | null = null;

/**
 * Reading from the CDN would answer with numbers up to a few minutes old, and
 * a dashboard that does not notice a booking she has just answered is a
 * dashboard she stops believing. The short cache above is ours, and we know
 * when to drop it.
 */
/**
 * How long Sanity gets, and why it needs saying out loud.
 *
 * Google was given a deadline because a slow Google must not take the shop's
 * own numbers down with it. Sanity had none, and Sanity is the half of the
 * page that matters: @sanity/client defaults to five minutes, inside a
 * function Vercel kills at sixty seconds. Measured against a socket that
 * accepts and never answers, this read was still waiting after twenty. The
 * result was not a slow page but a gateway error with nothing on it.
 *
 * Ten seconds is far longer than this query has ever taken and still leaves
 * the request time to answer with words rather than be killed mid-read.
 */
const SANITY_TIMEOUT_MS = 10_000;

const liveClient = createClient({
  ...sanityConfig,
  useCdn: false,
  timeout: SANITY_TIMEOUT_MS,
});

async function trafficBlock(now: Date): Promise<Traffic> {
  if (!ga4Configured()) return { state: "not-connected" };
  try {
    const reading = await readGa4(now);
    return {
      state: "connected",
      visitors: reading.visitors,
      views: reading.views,
      sources: reading.sources,
    };
  } catch (error) {
    // Google being unreachable, or a key that was revoked, must not take the
    // shop's own numbers down with it — that half of the page is the half
    // that matters.
    return {
      state: "error",
      detail: error instanceof Error ? error.message : "Google did not answer.",
    };
  }
}

export async function POST(req: NextRequest) {
  const byMachine =
    !!process.env.CRON_SECRET &&
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

  if (!byMachine && !fromThisSite(req)) {
    return NextResponse.json({ error: "Only the Studio can ask for this." }, { status: 403 });
  }

  const limited = rateLimit(`studio-stats:${clientIp(req)}`, 120, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests — wait a moment and reload." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const asked = await req.json().catch(() => ({}));
  // Only "Check again" sends this. Reopening the tab does not, so the cache
  // still does its job.
  const fresh = asked?.fresh === true;

  if (!byMachine) {
    const token = typeof asked?.token === "string" ? asked.token : null;

    // The shape check is here as well as inside isProjectMember so that a
    // Studio whose stored token has been mangled gets the sentence that tells
    // her what to do about it, rather than "not a member of this project".
    if (!token || !looksLikeAToken(token)) {
      return NextResponse.json(
        { error: "Sign out of the Studio and back in, then try again." },
        { status: 400 }
      );
    }
    if (!(await isProjectMember(token))) {
      return NextResponse.json(
        { error: "That Studio session is not a member of this project." },
        { status: 403 }
      );
    }
  }

  const now = new Date();

  if (!fresh && cached && now.getTime() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.body, { headers: { "Cache-Control": "no-store" } });
  }

  // Together, not one after the other. The shop's own numbers are the half of
  // the page that matters and they come from Sanity; waiting for Google first
  // would add its slowness to theirs, and each answer is caught on its own so
  // that a refusal from one cannot take the other down with it.
  const [rawResult, traffic] = await Promise.all([
    liveClient
      .fetch<StatsRaw>(STUDIO_STATS_QUERY, statsParams(now))
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, value: null })),
    trafficBlock(now),
  ]);

  if (!rawResult.ok || !rawResult.value) {
    // Deliberately not echoing the database's own words: they name fields and
    // help nobody who is not Safar.
    return NextResponse.json(
      { error: "Could not read the shop's numbers just now. Try again in a minute." },
      { status: 503 }
    );
  }

  const body = buildDashboard(rawResult.value, traffic, now);
  cached = { at: now.getTime(), body };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
