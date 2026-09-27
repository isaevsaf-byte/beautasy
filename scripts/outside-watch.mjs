/**
 * The outside watch: looks at beautasy.co.uk from GitHub every quarter of an
 * hour, and when something is wrong, opens an issue that mentions Safar —
 * which GitHub emails him. When everything answers again, it closes it.
 *
 * The site has watchmen of its own. The morning check emails Kristina, and a
 * Cloudflare worker wakes the publisher every fifteen minutes. None of them
 * can say that the site itself is down, or that they have stopped: a dead
 * watchman's silence reads exactly like "all well". This runs somewhere else
 * entirely, needs no key and nobody's account, and reads only what any
 * visitor can — the pages, the public diary, and the two marks the watchmen
 * leave in the (public) dataset each time they run.
 *
 * Plain Node, no packages: it has to run when nothing else does.
 */

import { fileURLToPath } from "node:url";

export const SITE = "https://www.beautasy.co.uk";
const SANITY_QUERY = "https://5uun6fw6.api.sanity.io/v2026-02-13/data/query/production";
/** Hidden in every issue this opens, so it finds its own and nobody else's */
export const MARK = "<!-- outside-watch -->";
/** The publisher runs every 15 minutes; the site's own check calls 3 hours stale (PULSE_STALE_AFTER_HOURS) */
const PULSE_STALE_HOURS = 3;
/** The morning check runs at 09:00 UTC; a day and three hours allows for a slow morning */
const MORNING_STALE_HOURS = 27;

const HOUR = 60 * 60 * 1000;

const page = (name, path, words) => ({
  name,
  url: `${SITE}${path}`,
  judge: ({ status, body }) =>
    status !== 200
      ? `answered ${status}`
      : words && !words.some((word) => body.toLowerCase().includes(word))
      ? "answered, but not with the page"
      : null,
});

const sanity = (name, query, judge) => ({
  name,
  url: `${SANITY_QUERY}?query=${encodeURIComponent(query)}`,
  judge: ({ status, body }, now) => {
    if (status !== 200) return `the dataset answered ${status}`;
    try {
      return judge(JSON.parse(body).result, now);
    } catch {
      return "the dataset's answer could not be read";
    }
  },
});

const ageHours = (iso, now) => (now.getTime() - Date.parse(iso)) / HOUR;

/** What is looked at, and what counts as wrong. Each judge returns null when all is well. */
export const CHECKS = [
  page("Home page", "/", ["beautasy"]),
  page("Atelier page", "/atelier", ["atelier"]),
  page("Shop", "/shop", ["beautasy"]),
  page("Studio", "/studio", null),
  {
    name: "Online booking",
    url: `${SITE}/api/atelier/slots`,
    judge: ({ status, body }) => {
      if (status !== 200) return `answered ${status}`;
      let diary;
      try {
        diary = JSON.parse(body);
      } catch {
        return "answered, but not with the diary";
      }
      if (typeof diary.bookable !== "boolean") return "answered, but not with the diary";
      // Switched off in Fitting Times is Kristina's choice, not a fault
      if (diary.bookable && !(Array.isArray(diary.days) && diary.days.length > 0)) return "is on, but offers no times at all";
      return null;
    },
  },
  sanity("Instagram publisher", '*[_id == "publisherHeartbeat"][0]{at}', (pulse, now) => {
    if (!pulse?.at) return "has never marked a run";
    const hours = ageHours(pulse.at, now);
    return hours > PULSE_STALE_HOURS ? `last ran ${Math.round(hours)} hours ago — the Cloudflare worker has stopped waking it` : null;
  }),
  sanity("Morning check", '*[_type == "siteHealthAlert"] | order(_createdAt desc)[0]{_createdAt}', (last, now) => {
    if (!last?._createdAt) return "has never run";
    const hours = ageHours(last._createdAt, now);
    return hours > MORNING_STALE_HOURS ? `last ran ${Math.round(hours)} hours ago — the daily job on Vercel has stopped` : null;
  }),
];

async function look(check, fetchImpl, now) {
  try {
    const response = await fetchImpl(check.url, {
      redirect: "follow",
      headers: { "user-agent": "beautasy-outside-watch" },
      signal: AbortSignal.timeout(20_000),
    });
    return check.judge({ status: response.status, body: await response.text() }, now);
  } catch (error) {
    return `did not answer (${error?.name === "TimeoutError" ? "no reply in 20 seconds" : error?.message ?? "no connection"})`;
  }
}

/**
 * Look at everything, and look again after a minute at whatever seemed wrong:
 * one slow reply is not an outage, and an alarm that cries wolf is an alarm
 * nobody reads.
 */
export async function lookAtEverything({ fetchImpl = fetch, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), checks = CHECKS } = {}) {
  const first = await Promise.all(checks.map(async (check) => ({ check, problem: await look(check, fetchImpl, now()) })));
  const doubtful = first.filter((result) => result.problem);
  if (doubtful.length === 0) return [];
  await sleep(60_000);
  const second = await Promise.all(doubtful.map(async ({ check }) => ({ name: check.name, problem: await look(check, fetchImpl, now()) })));
  return second.filter((result) => result.problem);
}

/** The title an issue gets for these problems: one line, the same for the same problems. */
export function titleFor(problems) {
  return `🚨 beautasy.co.uk: ${problems.map((p) => p.name).join(", ")}`;
}

export function bodyFor(problems, { at, notify }) {
  const lines = problems.map((p) => `- **${p.name}** ${p.problem}`).join("\n");
  return `${MARK}
@${notify} — the outside watch found this at ${at} (UTC), and again a minute later:

${lines}

The site: ${SITE}
Vercel: https://vercel.com/isaevsaf-bytes-projects/beautasy/deployments

This issue closes by itself when everything answers again. Nothing here was changed: the watch only looks.`;
}

/** Sent once when the watch itself changes, so the first alert is not the first time anyone sees one */
export function rehearsalFor({ notify }) {
  return {
    title: "🔔 Outside watch rehearsal — an alert about the site arrives like this",
    body: `<!-- outside-watch-rehearsal -->
@${notify} — this is a rehearsal, nothing is wrong. When beautasy.co.uk stops answering, or one of its own watchmen stops running, an issue like this opens and GitHub emails you. It closes by itself when the site is well again.`,
    closing: "Rehearsal over.",
  };
}

/**
 * What to do with GitHub, given what was found and the issue already open.
 * Pure, so a test can hold every case without touching GitHub.
 */
export function decide({ problems, open, rehearsal, at, notify }) {
  const actions = [];
  if (problems.length === 0) {
    if (open) actions.push({ comment: open.number, body: `✅ Everything answers again (${at} UTC).` }, { close: open.number });
  } else {
    const title = titleFor(problems);
    if (!open) actions.push({ create: { title, body: bodyFor(problems, { at, notify }) } });
    // Something else is wrong now: say what, rather than open a second issue.
    // The same problems again say nothing — one email per outage, not one per quarter-hour.
    else if (open.title !== title) {
      actions.push({ comment: open.number, body: bodyFor(problems, { at, notify }) }, { retitle: open.number, title });
    }
  }
  if (rehearsal) actions.push({ rehearse: rehearsalFor({ notify }) });
  return actions;
}

async function github(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function main() {
  const rehearsal = process.env.REHEARSE === "true";
  const notify = process.env.NOTIFY || "isaevsaf-byte";
  const at = new Date().toISOString().slice(0, 16).replace("T", " ");

  const problems = await lookAtEverything();
  const issues = await github("/issues?state=open&per_page=100");
  const open = issues.find((issue) => !issue.pull_request && issue.body?.includes(MARK)) ?? null;

  for (const action of decide({ problems, open, rehearsal, at, notify })) {
    if (action.create) await github("/issues", { method: "POST", body: action.create });
    else if (action.comment) await github(`/issues/${action.comment}/comments`, { method: "POST", body: { body: action.body } });
    else if (action.retitle) await github(`/issues/${action.retitle}`, { method: "PATCH", body: { title: action.title } });
    else if (action.close) await github(`/issues/${action.close}`, { method: "PATCH", body: { state: "closed" } });
    else if (action.rehearse) {
      const { title, body, closing } = action.rehearse;
      const issue = await github("/issues", { method: "POST", body: { title, body } });
      await github(`/issues/${issue.number}/comments`, { method: "POST", body: { body: closing } });
      await github(`/issues/${issue.number}`, { method: "PATCH", body: { state: "closed" } });
    }
  }

  for (const p of problems) console.log(`✗ ${p.name}: ${p.problem}`);
  if (problems.length === 0) console.log(`✓ All ${CHECKS.length} checks pass${rehearsal ? " (rehearsal alert sent)" : ""}`);
  // A failed run is a second way GitHub tells the owner
  if (problems.length > 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
