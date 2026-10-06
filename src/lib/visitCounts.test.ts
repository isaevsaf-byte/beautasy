import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  countsVisit,
  lastSevenDays,
  referrerLabel,
  referrerSources,
  vercelRefusal,
  visitTotals,
} from "./visitCounts";

/**
 * Vercel's visitor counter on the Dashboard. What has to be right: the week
 * it reads (Southampton's, whole days, either side of the clocks changing),
 * the names it gives the places people came from, that Kristina's own days in
 * the Studio are not visitors, and that the token stays on the server.
 */

const ROOT = resolve(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/* ─── The week ─── */

test("the week is the last seven whole days in Southampton, today left out", () => {
  // Monday 28 September, 8pm in Southampton (summer time)
  const week = lastSevenDays(new Date("2026-09-28T19:00:00Z"));
  assert.equal(new Date(week.since).toISOString(), "2026-09-20T23:00:00.000Z", "midnight on Monday the 21st, BST");
  assert.equal(new Date(week.until).toISOString(), "2026-09-27T22:59:59.999Z", "the last moment of Sunday the 27th, BST");

  // Half past midnight is already the next day in Southampton, whatever UTC says
  const late = lastSevenDays(new Date("2026-09-28T23:30:00Z"));
  assert.equal(new Date(late.until).toISOString(), "2026-09-28T22:59:59.999Z");
});

test("the week that holds the clocks going back is seven days and one hour long", () => {
  // Tuesday 27 October: the clocks went back on Sunday the 25th
  const week = lastSevenDays(new Date("2026-10-27T12:00:00Z"));
  assert.equal(new Date(week.since).toISOString(), "2026-10-19T23:00:00.000Z", "midnight on the 20th, still BST");
  assert.equal(new Date(week.until).toISOString(), "2026-10-26T23:59:59.999Z", "the end of the 26th, GMT");
  assert.equal(week.until + 1 - week.since, 7 * 86_400_000 + 3_600_000);
});

/* ─── Who is counted ─── */

test("Kristina's days in the Studio are not visits to the shop", () => {
  for (const studio of [
    "https://www.beautasy.co.uk/studio",
    "https://www.beautasy.co.uk/studio/",
    "https://www.beautasy.co.uk/studio/structure/review;abc",
    "https://www.beautasy.co.uk/studio?tool=dashboard",
    "/studio/dashboard",
  ]) {
    assert.equal(countsVisit(studio), false, studio);
  }
  for (const shop of [
    "https://www.beautasy.co.uk/",
    "https://www.beautasy.co.uk/reviews",
    "https://www.beautasy.co.uk/alterations/zip-replacement-southampton?utm_source=facebook",
    "https://www.beautasy.co.uk/studios-near-me",
    "/shop",
  ]) {
    assert.equal(countsVisit(shop), true, shop);
  }
});

/* ─── Where they came from ─── */

test("a site that sends people from several addresses goes by one name", () => {
  const cases: [string | null | undefined, string][] = [
    ["www.google.com", "Google"],
    ["www.google.co.uk", "Google"],
    ["google.com", "Google"],
    ["www.google.com.au", "Google"],
    ["google.de", "Google"],
    ["com.google.android.googlequicksearchbox", "Google"],
    ["com.google.android.gm", "Gmail"],
    ["uk.search.yahoo.com", "Yahoo"],
    ["l.facebook.com", "Facebook"],
    ["m.facebook.com", "Facebook"],
    ["lm.facebook.com", "Facebook"],
    ["l.instagram.com", "Instagram"],
    ["nextdoor.co.uk", "Nextdoor"],
    ["www.etsy.com", "Etsy"],
    ["uk.pinterest.com", "Pinterest"],
    ["pin.it", "Pinterest"],
    ["t.co", "X (Twitter)"],
    ["WWW.BING.COM.", "Bing"],
    ["", "Напрямую или по закладке"],
    [null, "Напрямую или по закладке"],
    [undefined, "Напрямую или по закладке"],
    ["Others", "Другие сайты"],
    ["biztools.corp.google.com", "Сотрудники Google"],
    ["chatgpt.com", "ChatGPT"],
    ["gemini.google.com", "Gemini"],
    ["www.perplexity.ai", "Perplexity"],
    ["claude.ai", "Claude"],
    ["www.southamptonmums.co.uk", "southamptonmums.co.uk"],
  ];
  for (const [host, name] of cases) assert.equal(referrerLabel(host), name, String(host));

  // A name that merely contains one is not that site
  assert.equal(referrerLabel("evilgoogle.com"), "evilgoogle.com");
  assert.equal(referrerLabel("notfacebook.com"), "notfacebook.com");
  assert.equal(referrerLabel("google.com.example.net"), "google.com.example.net");
  assert.equal(referrerLabel("pinterest.com.example.net"), "pinterest.com.example.net");
  assert.equal(referrerLabel("com.google.android.gm.example.net"), "com.google.android.gm.example.net");
});

test("the sources are the top five, one line per site, and never the shop itself", () => {
  const body = {
    data: [
      { referrerHostname: "www.google.com", visitors: 12, pageviews: 30 },
      { referrerHostname: "l.facebook.com", visitors: 5, pageviews: 9 },
      { referrerHostname: "", visitors: 20, pageviews: 41 },
      { referrerHostname: "www.beautasy.co.uk", visitors: 30, pageviews: 80 },
      { referrerHostname: "m.facebook.com", visitors: 4, pageviews: 4 },
      { referrerHostname: "nextdoor.co.uk", visitors: 3, pageviews: 6 },
      { referrerHostname: "Others", visitors: 2, pageviews: 2 },
      { referrerHostname: "instagram.com", visitors: 0, pageviews: 0 },
      { referrerHostname: "bing.com", visitors: 1, pageviews: 1 },
      // Round trips of someone already on the site, not arrivals
      { referrerHostname: "accounts.google.com", visitors: 40, pageviews: 40 },
      { referrerHostname: "checkout.stripe.com", visitors: 40, pageviews: 40 },
    ],
  };
  assert.deepEqual(referrerSources(body), [
    { name: "Напрямую или по закладке", visitors: 20 },
    { name: "Google", visitors: 12 },
    { name: "Facebook", visitors: 9 },
    { name: "Nextdoor", visitors: 3 },
    { name: "Другие сайты", visitors: 2 },
  ]);
  assert.deepEqual(referrerSources(body, 10).at(-1), { name: "Bing", visitors: 1 }, "past the fifth, only the cut hides it");

  for (const nothing of [null, undefined, {}, { data: "rows" }, { data: [null, 7, "x"] }]) {
    assert.deepEqual(referrerSources(nothing), [], JSON.stringify(nothing));
  }
});

/* ─── Vercel's answers ─── */

test("the week's totals come from Vercel's count, and nothing is guessed when it is not one", () => {
  assert.deepEqual(visitTotals({ data: { pageviews: 402, visitors: 131 } }), { visitors: 131, views: 402 });
  for (const odd of [null, {}, { data: {} }, { data: { visitors: "131", pageviews: 402 } }]) {
    assert.throws(() => visitTotals(odd), /нет посетителей/, JSON.stringify(odd));
  }
});

test("a refusal from Vercel says what to fix and where", () => {
  assert.match(vercelRefusal(401, "Not authorized"), /VERCEL_ANALYTICS_TOKEN.*проект beautasy.*Not authorized/);
  assert.match(vercelRefusal(403), /VERCEL_ANALYTICS_TOKEN/);
  // Said both for a key without this project and for Analytics switched off:
  // the line names both, rather than blaming the switch (it was on all along)
  assert.match(vercelRefusal(404, "Web Analytics not found."), /VERCEL_ANALYTICS_TOKEN.*проект beautasy.*включён Analytics/);
  assert.equal(vercelRefusal(404, "Project not found"), "Vercel ответил 404 (Project not found).");
  assert.match(vercelRefusal(402), /50 000/);
  assert.equal(vercelRefusal(503), "Vercel ответил 503.");
});

/* ─── The wiring ─── */

test("the Dashboard asks Vercel first, and Google only while Vercel's counter is not set up", () => {
  const route = read("src/app/api/studio-stats/route.ts");
  assert.match(route, /vercelVisitsConfigured\(\)\s*\?\s*\{ by: "vercel", read: readVercelVisits \}\s*:\s*ga4Configured\(\)\s*\?\s*\{ by: "google", read: readGa4 \}/);
  assert.match(route, /by: counter\.by,\s*visitors: reading\.visitors/);
  assert.match(route, /state: "error",\s*by: counter\.by/);
});

test("the token stays on the server and Vercel gets a deadline", () => {
  const reader = read("src/lib/vercelVisits.ts");
  assert.match(reader, /^import "server-only";/, "The token file must refuse to be bundled for the browser.");
  assert.match(reader, /Authorization: `Bearer \$\{token\}`/);
  assert.match(reader, /process\.env\.VERCEL_ANALYTICS_TOKEN/);
  assert.match(reader, /AbortSignal\.timeout\(VERCEL_TIMEOUT_MS\)/, "Vercel has no deadline.");
  assert.match(reader, /cache: "no-store",\s*signal,/, "The deadline is made and never handed to the request.");
  assert.match(reader, /await Promise\.all\(\[/, "The total and the sources are read one after the other.");
  assert.doesNotMatch(reader, /console\./, "Nothing here should print — least of all the token.");
});

test("the counter on the site leaves the Studio out", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<SiteAnalytics \/>/);
  assert.doesNotMatch(layout, /<Analytics\b/, "A bare <Analytics /> counts Kristina's Studio as visitors again.");
  const counter = read("src/components/SiteAnalytics.tsx");
  assert.match(counter, /<Analytics beforeSend=\{dropStudio\} \/>/);
  assert.match(counter, /countsVisit\(event\.url\) \? event : null/);
});

test("the Dashboard says which counter it is showing, and names Vercel's sources as they are", () => {
  const panel = read("src/sanity/dashboardTool.tsx");
  assert.match(panel, /traffic\.by === "vercel" \? source\.name : channelInRussian\(source\.name\)/);
  assert.match(panel, /Счётчик Vercel обходится без cookie/);
  assert.match(panel, /Счётчик \{traffic\.by === "vercel" \? "Vercel" : "Google"\} сейчас не отвечает/);
});
