import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECKS, MARK, decide as decideActions, failsTheRun, lookAtEverything, rehearsalFor, titleFor } from "../../scripts/outside-watch.mjs";

/**
 * The outside watch (scripts/outside-watch.mjs) is the one thing that notices
 * when the site, or its own watchmen, stop. It is measured here without the
 * network: what it calls a problem, that it looks twice before believing
 * one, and that it sends one alert per outage rather than one per run.
 */

type Reply = { status: number; body: string };
type Check = { name: string; url: string; also?: string; judge: (reply: Reply, now: Date, also?: Reply | null) => string | null };
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

test("booking switched off is Kristina's choice; switched on with nothing offered is a fault", () => {
  const booking = byName("Online booking");
  const site = (bookable: boolean) => ({ status: 200, body: JSON.stringify({ bookable, days: bookable ? [{ date: "2026-09-28" }] : [] }) });
  const studio = (enabled: boolean) => ({ status: 200, body: JSON.stringify({ result: { enabled } }) });
  assert.ok(booking.also?.includes(encodeURIComponent('_id == "atelierSchedule"')), "the Studio's own switch is read");
  assert.equal(booking.judge(site(true), NOW, studio(true)), null);
  assert.equal(booking.judge(site(false), NOW, studio(false)), null, "switched off by Kristina");
  // On in the Studio, nothing on the site: the diary cannot be read, or every day is closed
  assert.match(booking.judge(site(false), NOW, studio(true))!, /switched on in the Studio, but the site offers no times/);
  assert.equal(booking.judge(site(false), NOW, null), null, "without the switch, no guess");
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
  assert.match(morning.judge(reply({ _createdAt: hoursAgo(30) }), NOW)!, /no record for 30 hours .* did not run, or ran and could not send/);
  assert.match(morning.judge({ status: 500, body: "" }, NOW)!, /dataset answered 500/);
});

test("the supplies watch must run on Mondays, and a problem its own run meets again a Monday later reaches Safar", async () => {
  const supplies = byName("Supplies watch");
  const verdict = (result: unknown) =>
    supplies.judge({ status: 200, body: JSON.stringify({ result }) }, NOW) as unknown as { problem: string; tag: string } | string | null;
  // Plain text is a verdict too (the dataset's answer could not be read): never hidden
  const said = (result: unknown) => {
    const v = verdict(result);
    return typeof v === "string" ? v : (v?.problem ?? null);
  };
  const daysAgo = (days: number) => hoursAgo(days * 24);
  const problem = (since: number, lastMet: number, key = "https://www.empressmills.co.uk/x", urgent?: boolean) => ({
    _key: "p1",
    key,
    why: "503 Service Unavailable",
    since: daysAgo(since),
    lastMet: daysAgo(lastMet),
    ...(urgent ? { urgent } : {}),
  });
  assert.equal(said({ since: null, state: null }), null, "no list yet: nothing to watch");
  assert.equal(said({ since: null, state: { ranAt: daysAgo(30), problems: [problem(37, 30)] } }), null, "the list was emptied: nothing to watch");
  assert.equal(said({ since: daysAgo(3), state: null }), null, "seeded this week: the first Monday has not come");
  assert.match(said({ since: daysAgo(10), state: null })!, /never run/);
  const list = { since: daysAgo(30) };
  assert.equal(said({ ...list, state: { ranAt: daysAgo(7.5), problems: [] } }), null, "last Monday, an hour late");
  assert.match(said({ ...list, state: { ranAt: daysAgo(9), problems: [] } })!, /last ran 9 days ago/);
  // Met once, six and a half days ago: the Sunday before the run that would clear it — not a fault yet
  assert.equal(said({ ...list, state: { ranAt: daysAgo(6.5), problems: [problem(6.5, 6.5)] } }), null);
  // Met again by the next Monday's run, an hour late or early: a fault
  const told = said({ ...list, state: { ranAt: daysAgo(0), problems: [problem(7, 0)] } })!;
  assert.match(told, /did not pass by itself — https:\/\/www\.empressmills\.co\.uk\/x: 503 Service Unavailable \(since 2026-09-20\)/);
  assert.match(said({ ...list, state: { ranAt: daysAgo(0), problems: [problem(6.96, 0)] } }) ?? "", /did not pass/, "Vercel ran the second Monday an hour early");
  // Carried, not met again (the page was not looked at): it does not age into an alarm
  assert.equal(said({ ...list, state: { ranAt: daysAgo(0), problems: [problem(14, 14)] } }), null);
  // One that cannot pass by itself — a chat that blocked the bot — is told at once
  assert.match(said({ ...list, state: { ranAt: daysAgo(0), problems: [problem(0, 0, "telegram", true)] } })!, /telegram: 503/);
  const many = said({ ...list, state: { ranAt: daysAgo(0), problems: [1, 2, 3, 4, 5].map((k) => problem(7, 0, `key-${k}`)) } })!;
  assert.match(many, /and 2 more$/);
  assert.equal(many.match(/key-/g)?.length, 3, "three named, the rest counted");
  assert.equal(said({ ...list, state: { ranAt: daysAgo(0), problems: null } }), null);
  assert.equal(said({ ...list, state: { ranAt: daysAgo(0), problems: {} } }), null, "a mark it cannot read is no alarm");
  assert.equal(said({ ...list, state: { ranAt: daysAgo(0), problems: [{ key: "x", urgent: true }] } }), null);
  assert.equal(said({ ...list, state: { ranAt: daysAgo(0), problems: [{ key: "x", why: "w", urgent: true }] } }), null, "a problem without a date is not one to tell");

  // Each way of being wrong is named in the title: a new one retitles an open issue and says so
  const tagOf = (result: unknown) => (verdict(result) as { tag: string }).tag;
  assert.equal(tagOf({ since: daysAgo(10), state: null }), "stopped");
  assert.equal(tagOf({ ...list, state: { ranAt: daysAgo(0), problems: [problem(7, 0, "https://www.empressmills.co.uk/closed-end-zips#x")] } }), "pages");
  // Twenty pages failing are one kind of fault: the title stays short, whatever the list
  const twenty = Array.from({ length: 20 }, (_, k) => problem(7, 0, `https://www.empressmills.co.uk/a-rather-long-product-name-${k}`));
  assert.equal(tagOf({ ...list, state: { ranAt: daysAgo(0), problems: [...twenty, problem(7, 0, "save:supply-x"), problem(7, 0, "unread")] } }), "pages, save, unread");
  const zipsOpen = { ...list, state: { ranAt: daysAgo(0), problems: [problem(7, 0, "https://www.empressmills.co.uk/closed-end-zips")] } };
  const zipsAndChat = { ...list, state: { ranAt: daysAgo(0), problems: [problem(7, 0, "https://www.empressmills.co.uk/closed-end-zips"), problem(0, 0, "telegram", true)] } };
  const watchOf = (result: unknown) => ({ ...supplies, url: `https://dataset/${encodeURIComponent(JSON.stringify(result))}` });
  const answering = (result: unknown) => (async () => ({ status: 200, text: async () => JSON.stringify({ result }) })) as unknown as typeof fetch;
  const before = await lookAtEverything({ checks: [watchOf(zipsOpen)], fetchImpl: answering(zipsOpen), now: () => NOW, sleep: async () => {} });
  assert.deepEqual(before.map((p) => p.name), ["Supplies watch (pages)"]);
  const after = await lookAtEverything({ checks: [watchOf(zipsAndChat)], fetchImpl: answering(zipsAndChat), now: () => NOW, sleep: async () => {} });
  assert.deepEqual(after.map((p) => p.name), ["Supplies watch (pages, telegram)"]);
  const open = { number: 9, title: `🚨 beautasy.co.uk: ${before[0].name}` };
  assert.deepEqual(decide({ problems: before, open, rehearsal: false, at: "x", notify: "owner" }), [], "the same faults: quiet");
  assert.deepEqual(
    decide({ problems: after, open, rehearsal: false, at: "x", notify: "owner" }).map((a) => Object.keys(a)[0]),
    ["comment", "retitle"],
    "a new fault while the issue is open: Safar hears of it"
  );
  // The dataset not answering for the one minute between looks: the name, and so the title, stays as it was
  let calls = 0;
  const blip = (async () => {
    calls += 1;
    return calls === 1 ? { status: 200, text: async () => JSON.stringify({ result: zipsOpen }) } : { status: 503, text: async () => "" };
  }) as unknown as typeof fetch;
  const steady = await lookAtEverything({ checks: [watchOf(zipsOpen)], fetchImpl: blip, now: () => NOW, sleep: async () => {} });
  assert.deepEqual(steady, [{ name: "Supplies watch (pages)", problem: "the dataset answered 503" }]);
  assert.deepEqual(decide({ problems: steady, open, rehearsal: false, at: "x", notify: "owner" }), [], "no email for a blip");
  // A real change between the two looks is the second look's to name
  let looks = 0;
  const changing = (async () => {
    looks += 1;
    return { status: 200, text: async () => JSON.stringify({ result: looks === 1 ? zipsOpen : zipsAndChat }) };
  }) as unknown as typeof fetch;
  const changed = await lookAtEverything({ checks: [watchOf(zipsOpen)], fetchImpl: changing, now: () => NOW, sleep: async () => {} });
  assert.deepEqual(changed.map((p) => p.name), ["Supplies watch (pages, telegram)"]);
  assert.equal(said({ ...list, state: { ranAt: daysAgo(0), problems: [{ key: "x", since: daysAgo(1), urgent: true }] } }), null, "a problem without a reason is not one to tell");

  // The query itself, against a dataset as the watch would find it
  const { evaluate, parse } = await import("groq-js");
  const query = decodeURIComponent(new URL(supplies.url).searchParams.get("query")!);
  const dataset = [
    { _id: "supplyWatchState", _type: "supplyWatchState", ranAt: daysAgo(1), problems: [problem(8, 1)], digestAt: daysAgo(1) },
    { _id: "supply-a", _type: "supplyItem", _createdAt: daysAgo(20), offers: [] },
    { _id: "supply-b", _type: "supplyItem", _createdAt: daysAgo(10), offers: [] },
    { _id: "drafts.supply-c", _type: "supplyItem", _createdAt: daysAgo(40), offers: [] },
  ];
  const result = await (await evaluate(parse(query), { dataset })).get();
  assert.deepEqual(result, { state: { ranAt: daysAgo(1), problems: [problem(8, 1)] }, since: daysAgo(20) });
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

test("a run fails once, when an outage is found — not every quarter-hour until it ends", () => {
  const problems = [{ name: "Shop", problem: "answered 500" }];
  assert.equal(failsTheRun({ problems, open: null }), true);
  assert.equal(failsTheRun({ problems, open: { number: 7, title: "x" } }), false);
  assert.equal(failsTheRun({ problems: [], open: null }), false);
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

test("a title is never longer than GitHub takes, and the same problems always give the same one", () => {
  const many = Array.from({ length: 40 }, (_, k) => ({ name: `Some rather long check name number ${k}`, problem: "x" }));
  const title = (titleFor as unknown as (p: typeof many) => string)(many);
  assert.ok(title.length <= 256, `${title.length}`);
  assert.equal(title, (titleFor as unknown as (p: typeof many) => string)(many));
});
