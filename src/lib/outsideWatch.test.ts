import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECKS, MARK, decide as decideActions, lookAtEverything, rehearsalFor } from "../../scripts/outside-watch.mjs";

/**
 * The outside watch (scripts/outside-watch.mjs) is the one thing that notices
 * when the site, or its own watchmen, stop. It is measured here without the
 * network: what it calls a problem, that it looks twice before believing
 * one, and that it sends one alert per outage rather than one per run.
 */

type Check = { name: string; url: string; judge: (reply: { status: number; body: string }, now: Date) => string | null };
type Action = {
  create?: { title: string; body: string };
  comment?: number;
  body?: string;
  close?: number;
  retitle?: number;
  title?: string;
  rehearse?: { title: string; body: string; closing: string };
};
type DecideInput = {
  problems: { name: string; problem: string }[];
  open: { number: number; title: string } | null;
  rehearsal: boolean;
  at: string;
  notify: string;
};
const decide = (input: DecideInput) => (decideActions as unknown as (input: DecideInput) => Action[])(input);
/** Enough of a fetch for the watch: a status and a body */
const answering = (reply: () => Promise<{ status: number; text: () => Promise<string> }>) => reply as unknown as typeof fetch;
const checks = CHECKS as Check[];
const byName = (name: string) => checks.find((check) => check.name === name)!;
const NOW = new Date("2026-09-27T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

test("a page is well when it answers 200 with itself on it", () => {
  const home = byName("Home page");
  assert.equal(home.judge({ status: 200, body: "<title>BEAUTASY</title>" }, NOW), null);
  assert.equal(home.judge({ status: 500, body: "" }, NOW), "answered 500");
  assert.equal(home.judge({ status: 200, body: "Vercel error page" }, NOW), "answered, but not with the page");
});

test("booking switched off is Kristina's choice; on with no times is a fault", () => {
  const booking = byName("Online booking");
  assert.equal(booking.judge({ status: 200, body: JSON.stringify({ bookable: true, days: [{ date: "2026-09-28" }] }) }, NOW), null);
  assert.equal(booking.judge({ status: 200, body: JSON.stringify({ bookable: false }) }, NOW), null);
  assert.match(booking.judge({ status: 200, body: JSON.stringify({ bookable: true, days: [] }) }, NOW)!, /offers no times/);
  assert.match(booking.judge({ status: 200, body: "<html>" }, NOW)!, /not with the diary/);
  assert.equal(booking.judge({ status: 503, body: "" }, NOW), "answered 503");
});

test("the watchmen's own marks must be fresh", () => {
  const pulse = byName("Instagram publisher");
  const reply = (result: unknown) => ({ status: 200, body: JSON.stringify({ result }) });
  assert.equal(pulse.judge(reply({ at: hoursAgo(1) }), NOW), null);
  assert.match(pulse.judge(reply({ at: hoursAgo(4) }), NOW)!, /last ran 4 hours ago/);
  assert.match(pulse.judge(reply(null), NOW)!, /never/);

  const morning = byName("Morning check");
  assert.equal(morning.judge(reply({ _createdAt: hoursAgo(23) }), NOW), null, "yesterday's 09:00 run, seen before today's");
  assert.match(morning.judge(reply({ _createdAt: hoursAgo(30) }), NOW)!, /last ran 30 hours ago/);
  assert.match(morning.judge({ status: 500, body: "" }, NOW)!, /dataset answered 500/);
});

test("one slow reply is looked at again before anyone is told", async () => {
  let calls = 0;
  const flaky = [{ name: "Flaky", url: "x", judge: () => (++calls === 1 ? "answered 502" : null) }];
  const fetchImpl = answering(async () => ({ status: 200, text: async () => "" }));
  let slept = 0;
  const problems = await lookAtEverything({ checks: flaky, fetchImpl, now: () => NOW, sleep: async (ms: number) => void (slept = ms) });
  assert.deepEqual(problems, []);
  assert.equal(slept, 60_000);
});

test("a site that does not answer twice is a problem, and says why", async () => {
  const fetchImpl = answering(async () => {
    throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  });
  const problems = await lookAtEverything({ checks: [byName("Shop")], fetchImpl, now: () => NOW, sleep: async () => {} });
  assert.deepEqual(problems, [{ name: "Shop", problem: "did not answer (no reply in 20 seconds)" }]);
});

test("an outage opens one issue, mentioning the owner, and closes it when it is over", () => {
  const at = "2026-09-27 12:00";
  const problems = [{ name: "Home page", problem: "answered 500" }];

  const opened = decide({ problems, open: null, rehearsal: false, at, notify: "owner" });
  assert.equal(opened.length, 1);
  const created = opened[0].create!;
  assert.match(created.title, /^🚨 beautasy\.co\.uk: Home page$/);
  assert.ok(created.body.startsWith(MARK), "the mark is how the watch finds its own issue next time");
  assert.match(created.body, /@owner/);

  const open = { number: 7, title: created.title };
  assert.deepEqual(decide({ problems, open, rehearsal: false, at, notify: "owner" }), [], "no second email for the same outage");

  const worse = decide({ problems: [...problems, { name: "Shop", problem: "answered 500" }], open, rehearsal: false, at, notify: "owner" });
  assert.deepEqual(worse.map((a) => Object.keys(a)[0]), ["comment", "retitle"]);

  assert.deepEqual(decide({ problems: [], open, rehearsal: false, at, notify: "owner" }), [
    { comment: 7, body: `✅ Everything answers again (${at} UTC).` },
    { close: 7 },
  ]);
  assert.deepEqual(decide({ problems: [], open: null, rehearsal: false, at, notify: "owner" }), []);
});

test("a rehearsal is sent on its own and can never be mistaken for an outage", () => {
  const actions = decide({ problems: [], open: null, rehearsal: true, at: "t", notify: "owner" });
  assert.deepEqual(actions, [{ rehearse: rehearsalFor({ notify: "owner" }) }]);
  assert.ok(!actions[0].rehearse!.body.includes(MARK));
  assert.match(actions[0].rehearse!.body, /@owner/);
});

test("the watch runs on a schedule, needs no secret of anyone's, and rehearses when it changes", () => {
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/outside-watch.yml"), "utf8");
  assert.match(workflow, /cron: "7,22,37,52 \* \* \* \*"/);
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.doesNotMatch(workflow.replace("secrets.GITHUB_TOKEN", ""), /secrets\./, "only GitHub's own token: nothing to leak or expire");
  assert.match(workflow, /REHEARSE: \$\{\{ github\.event_name == 'push' \|\| inputs\.rehearse == true \}\}/);
  assert.match(workflow, /run: node scripts\/outside-watch\.mjs/);
});
