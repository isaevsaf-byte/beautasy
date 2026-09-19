import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alertDecision,
  alertFingerprint,
  alertSubject,
  askTwice,
  claimOutcome,
  claimThisMorning,
  evaluateHealth,
  gatherHealthFacts,
  healthAlertDocumentId,
  HEALTH_QUERY,
  runHealthWatchdog,
  troublesIn,
  answerClockStartsAt,
  workingDaysWaiting,
  questionsAsked,
  within,
  INSTAGRAM_DISCONNECTED,
  INSTAGRAM_UNREACHABLE,
  PUBLISHER_NOT_SENDING,
  PUBLISHER_SILENT,
  NO_MEMORY,
  KRISTINA_NOTICE_SINCE,
  type HealthCheck,
  type HealthFacts,
  type HealthMemory,
  type MorningRecord,
  type PublisherPulse,
  type QueueFacts,
} from "./siteHealth";
import {
  mayPublish,
  startOfSouthamptonDay,
  MIN_GAP_HOURS,
  POSTING_DEFAULTS,
  type PostingHold,
  type PostingSettings,
} from "./postingRules";
import { instantOf, localDateOf } from "./slots";
import { sanityWriteClient } from "./sanity";
// Sanity's own GROQ parser and evaluator, already installed here as one of
// `sanity`'s dependencies. It is what lets the tests at the foot of this file
// run HEALTH_QUERY rather than read it.
import { evaluate, parse } from "groq-js";

/**
 * The watchman that has to be trusted.
 *
 * Two opposite failures matter here and both are silent. If it misses a real
 * breakage, we are back to finding out weeks later by accident — which is the
 * whole reason it exists. If it cries wolf, the email is filtered away within
 * a fortnight and the effect is identical.
 *
 * The second is the one that nearly happened, three times. The first version
 * sent an email on the last day of every batch of posts, every morning a batch
 * was approved for a future date, and every morning for the fourteen days a
 * token spent expiring. The second narrowed the rule and still sent one every
 * Monday. The third looked silent — and was, for the one morning it was run
 * against; sweeping every quarter of an hour Kristina might have pressed
 * Approve found a fifteen-minute window where the Monday email came straight
 * back. So the longest test here is the plainest one: a month of an ordinary
 * shop, run once for every quarter hour of the day, where nothing may be sent
 * at all.
 */

const NOW = new Date("2026-09-18T09:00:00.000Z");

function inDays(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The publisher's own word that it ran, as a healthy one leaves it.
 *
 * Five minutes ago, because the schedule wakes it every fifteen, and it last
 * sent something yesterday, which matches the feed in `queue` below. The rules
 * let that same run through — a healthy publisher spends most of its runs with
 * nothing to send rather than held — and the record itself was made a month
 * ago, when the Worker was first deployed.
 */
function pulse(over: Partial<PublisherPulse> = {}): PublisherPulse {
  return {
    at: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(),
    lastSentAt: inDays(-1),
    lastFreeAt: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(),
    createdAt: inDays(-30),
    outcome: "published",
    detail: null,
    ...over,
  };
}

function queue(over: Partial<QueueFacts> = {}): QueueFacts {
  return {
    approvedWaiting: 4,
    dueWaiting: 4,
    lateWaiting: 4,
    draftsWaiting: 6,
    lastPublishedAt: inDays(-1),
    stuckPublishing: 0,
    waitingOnInstagram: 0,
    reelsAbandoned: 0,
    failedRecently: 0,
    lastFailureError: null,
    lastFailureAt: null,
    settingsDocumentExists: true,
    bookingsUnanswered: [],
    publisherPulse: pulse(),
    ...over,
  };
}

/**
 * A fitting request that arrived at this Southampton local minute.
 *
 * Local rather than UTC, because every line this feeds is about the atelier's
 * own working day — "half past seven on a Friday evening" is the input, and
 * writing it as 18:30Z would hide the one thing the test is about.
 */
function arrived(localMinute: string): string {
  return instantOf(localMinute).toISOString();
}

function facts(over: Partial<HealthFacts> = {}): HealthFacts {
  return {
    now: NOW.toISOString(),
    instagram: {
      configured: true,
      reachable: true,
      username: "beautasy",
      expiryKnown: true,
      expiresAt: inDays(50),
    },
    queue: queue(),
    missingSettings: [],
    memory: NO_MEMORY,
    ...over,
  };
}

function check(checks: HealthCheck[], name: string): HealthCheck {
  const found = checks.find((c) => c.name === name);
  assert.ok(found, `No check named "${name}" — the names have moved`);
  return found;
}

function problemsIn(checks: HealthCheck[]): string[] {
  return checks.filter((c) => c.status !== "ok").map((c) => `${c.status} ${c.name}`);
}

test("a healthy morning has nothing red in it", () => {
  for (const result of evaluateHealth(facts())) {
    assert.equal(result.status, "ok", `${result.name}: ${result.detail}`);
  }
});

/* ─── The Instagram connection ─── */

test("the Instagram connection asks to be renewed a fortnight out", () => {
  const fortnight = evaluateHealth(
    facts({
      instagram: { configured: true, reachable: true, expiryKnown: true, expiresAt: inDays(14) },
    })
  );
  assert.equal(check(fortnight, "Instagram renewal").status, "warn");
  assert.match(
    check(fortnight, "Instagram renewal").detail,
    /14 days/,
    "The number of days left is the one fact worth saying."
  );

  const plenty = evaluateHealth(
    facts({
      instagram: { configured: true, reachable: true, expiryKnown: true, expiresAt: inDays(15) },
    })
  );
  assert.equal(
    check(plenty, "Instagram renewal").status,
    "ok",
    "A fortnight and a day is not yet worth an email."
  );
});

test("a token with hours left is alive, not dead", () => {
  const lastDay = evaluateHealth(
    facts({
      instagram: { configured: true, reachable: true, expiryKnown: true, expiresAt: inDays(0.5) },
    })
  );
  const renewal = check(lastDay, "Instagram renewal");
  assert.equal(
    renewal.status,
    "warn",
    "Twelve hours left is a token still posting — counting whole days down announced it dead."
  );
  assert.match(renewal.detail, /one day/, "Round up, so the last day reads as a day.");

  const gone = evaluateHealth(
    facts({
      instagram: { configured: true, reachable: true, expiryKnown: true, expiresAt: inDays(-0.1) },
    })
  );
  assert.equal(check(gone, "Instagram renewal").status, "fail", "Past the instant is expired.");
});

test("an unreadable expiry says so instead of promising anything", () => {
  const unknown = evaluateHealth(
    facts({ instagram: { configured: true, reachable: true, expiryKnown: false } })
  );
  const renewal = check(unknown, "Instagram renewal");
  assert.equal(renewal.status, "ok", "It answered today; there is nothing to do this morning.");
  assert.match(renewal.detail, /will not say when it expires/);
});

/**
 * The rule that costs a day and buys every quiet night.
 *
 * Meta rate-limits for minutes at a time and the two tries this file makes are
 * a second apart, so one morning of silence from Instagram means nothing on
 * its own. It used to mean a yellow email whose own last sentence said there
 * might be nothing to do.
 */
test("Instagram going quiet once says nothing at all; twice is the token", () => {
  const unreachable = {
    configured: true,
    reachable: false,
    expiryKnown: false,
    error: "Invalid OAuth access token",
  };

  const firstMorning = evaluateHealth(facts({ instagram: unreachable }));
  assert.equal(
    check(firstMorning, "Instagram").status,
    "ok",
    "One flat answer at nine in the morning must not be worth an email of its own."
  );
  assert.deepEqual(problemsIn(firstMorning), [], "Nothing at all goes out on a first wobble.");
  assert.deepEqual(
    troublesIn(facts({ instagram: unreachable })),
    [INSTAGRAM_UNREACHABLE],
    "It is written down, though — tomorrow is the morning that can tell."
  );

  const secondMorning = evaluateHealth(
    facts({
      instagram: unreachable,
      memory: memoryOf({ lookedAt: inDays(-1), troubles: [INSTAGRAM_UNREACHABLE] }),
    })
  );
  assert.equal(check(secondMorning, "Instagram").status, "fail");
  assert.match(check(secondMorning, "Instagram").detail, /Invalid OAuth access token/);

  const staleMemory = evaluateHealth(
    facts({
      instagram: unreachable,
      memory: memoryOf({ lookedAt: inDays(-9), troubles: [INSTAGRAM_UNREACHABLE] }),
    })
  );
  assert.equal(
    check(staleMemory, "Instagram").status,
    "ok",
    "A trouble seen nine days ago is not yesterday's trouble."
  );
});

test("an Instagram nobody has connected yet waits; one that vanished gets louder", () => {
  const notConnected = { configured: false, reachable: false, expiryKnown: false };

  const neverStarted = evaluateHealth(
    facts({
      instagram: notConnected,
      queue: queue({ approvedWaiting: 9, dueWaiting: 9, lastPublishedAt: null }),
    })
  );
  assert.equal(
    check(neverStarted, "Instagram").status,
    "ok",
    "Nine posts waiting is a backlog, not a breakage — setting up Instagram is hers to finish."
  );
  assert.deepEqual(
    troublesIn(facts({ instagram: notConnected, queue: queue({ lastPublishedAt: null }) })),
    [],
    "A setup nobody finished is not a connection that went missing."
  );

  const gone = queue({ approvedWaiting: 0, dueWaiting: 0, lateWaiting: 0, draftsWaiting: 0 });
  const tokenRemoved = evaluateHealth(facts({ instagram: notConnected, queue: gone }));
  assert.equal(
    check(tokenRemoved, "Instagram").status,
    "warn",
    "A shop that has been posting and now has no token has lost something, whatever is queued."
  );
  assert.match(check(tokenRemoved, "Instagram").detail, /not connected any more/);
  assert.deepEqual(troublesIn(facts({ instagram: notConnected, queue: gone })), [
    INSTAGRAM_DISCONNECTED,
  ]);

  const stillGone = evaluateHealth(
    facts({
      instagram: notConnected,
      queue: gone,
      memory: memoryOf({
        lookedAt: inDays(-1),
        troubles: [INSTAGRAM_DISCONNECTED],
        previousProblems: ["Instagram"],
      }),
    })
  );
  assert.equal(
    check(stillGone, "Instagram").status,
    "fail",
    "A token taken out of Vercel and left out kills the feed as thoroughly as a dead one, and used to be a yellow line for ever."
  );
  assert.match(check(stillGone, "Instagram").detail, /two mornings running/);
});

test("what tomorrow needs to remember is written down today", () => {
  assert.deepEqual(
    troublesIn(facts({ instagram: { configured: true, reachable: false, expiryKnown: false } })),
    [INSTAGRAM_UNREACHABLE]
  );
  assert.deepEqual(
    troublesIn(facts({ queue: queue({ lateWaiting: 0 }) })),
    [],
    "A green morning with nothing overdue clears the memory."
  );
  assert.deepEqual(
    troublesIn(facts()),
    [],
    "A publisher that ran five minutes ago leaves nothing for tomorrow to confirm."
  );
  assert.deepEqual(
    troublesIn(facts({ queue: queue({ publisherPulse: pulse({ at: inDays(-1) }) }) })),
    [PUBLISHER_SILENT],
    "A publisher that has not said a word since yesterday is what tomorrow has to confirm."
  );
  assert.deepEqual(
    troublesIn(facts({ queue: queue({ publisherPulse: pulse({ lastSentAt: inDays(-4) }) }) })),
    [PUBLISHER_NOT_SENDING],
    "A publisher that runs and sends nothing leaves its own mark — one that stopped running and one that cannot send are two different mornings, and writing the same mark for both would make a morning that flipped from one to the other read as the same thing twice."
  );
});

/**
 * A morning nobody could look at judges nothing, and that is all it can do.
 *
 * There used to be a branch here that carried yesterday's publisher mark
 * across a blind morning, and a test standing over it that handed in a blind
 * morning with a memory. The site cannot produce that morning: the memory and
 * the queue come out of the same query, so `gatherHealthFacts` hands back
 * NO_MEMORY the moment the queue answer fails, and the branch was unreachable
 * from the first day. This holds the shape that makes it unreachable, which is
 * the thing a future change could break without noticing.
 *
 * What it would have bought is one morning's colour — the morning after a
 * blind one is amber rather than red, because "for two mornings running"
 * cannot be said of a morning nobody saw. The evidence itself is not lost: it
 * is in the publisher's own record, which survives whatever the watchman can
 * read. That is the difference from the version this replaced, where the
 * evidence was rebuilt from scratch each morning and a database that went
 * quiet every fifth morning kept a dead publisher silent for ever.
 */
test("a morning the database would not answer comes with no memory to carry", () => {
  const blind = facts({
    queue: null,
    queueError: "it did not answer in time",
    memory: NO_MEMORY,
  });
  assert.deepEqual(
    troublesIn(blind),
    [],
    "Nothing was judged, so there is nothing to write down for tomorrow."
  );

  const HEALTH = readFileSync(join(process.cwd(), "src", "lib", "siteHealth.ts"), "utf8");
  const gather = HEALTH.slice(
    HEALTH.indexOf("export async function gatherHealthFacts"),
    HEALTH.indexOf("/* ─── Judging it ─── */")
  );
  assert.match(
    gather,
    /memory: answer\.ok \? answer\.memory : NO_MEMORY/,
    "A blind morning has no memory because the memory came out of the query that failed — if that ever changes, the branch this test replaced has to come back."
  );
});

/* ─── The queue, which is a to-do list and not a fault ─── */

test("an empty queue with drafts waiting is Kristina's list, not an alarm", () => {
  const drained = evaluateHealth(
    facts({
      queue: queue({ approvedWaiting: 0, dueWaiting: 0, lateWaiting: 0, draftsWaiting: 6 }),
    })
  );
  assert.equal(
    check(drained, "Posts waiting to go out").status,
    "ok",
    "With one post a day the queue empties at the end of every batch."
  );
  assert.match(check(drained, "Posts waiting to go out").detail, /6 drafts waiting/);

  const thin = evaluateHealth(
    facts({ queue: queue({ approvedWaiting: 1, dueWaiting: 1, lateWaiting: 1 }) })
  );
  assert.equal(
    check(thin, "Posts waiting to go out").status,
    "ok",
    "One post left is one post left, not a fault."
  );
});

test("an empty feed with nothing left to send is counted, never alarmed about", () => {
  const dark = evaluateHealth(
    facts({
      queue: queue({
        approvedWaiting: 0,
        dueWaiting: 0,
        lateWaiting: 0,
        draftsWaiting: 0,
        lastPublishedAt: inDays(-11),
      }),
    })
  );
  assert.deepEqual(
    problemsIn(dark),
    [],
    "An empty queue is her own list in the Studio. Eleven days of it is still her list."
  );
  assert.equal(check(dark, "Posts waiting to go out").status, "ok");
  assert.match(
    check(dark, "Posts waiting to go out").detail,
    /Nothing approved, no drafts waiting/
  );
});

test("the state of the queue is reported with its numbers, for whoever looks", () => {
  const counted = evaluateHealth(
    facts({ queue: queue({ approvedWaiting: 4, dueWaiting: 2, lateWaiting: 2, draftsWaiting: 7 }) })
  );
  assert.equal(
    check(counted, "Posts waiting to go out").detail,
    "4 approved, 2 of them dated for later, 7 drafts waiting.",
    "The numbers go back in the cron's answer, so the queue can be read without guessing."
  );
});

test("posts approved for later are not posts the site is failing to send", () => {
  const scheduledAhead = evaluateHealth(
    facts({
      queue: queue({
        approvedWaiting: 4,
        dueWaiting: 0,
        lateWaiting: 0,
        lastPublishedAt: inDays(-7),
      }),
    })
  );
  assert.equal(
    check(scheduledAhead, "Posting").status,
    "ok",
    "A batch dated for December is the intended workflow, not a stuck pipeline."
  );
  assert.equal(check(scheduledAhead, "Posts waiting to go out").status, "ok");
  assert.match(check(scheduledAhead, "Posts waiting to go out").detail, /dated for later/);
});

/**
 * The bug that survived two rounds of this file.
 *
 * "Due for more than a day" used to be measured from the date on the post, and
 * an automatic draft carries the date the site wrote it — days before Kristina
 * sees it. So a batch she approved five minutes ago arrived already a day
 * late, and on a Monday, with the weekend behind it, that was an email.
 */
test("a batch approved this morning is not late, however long ago the site wrote it", () => {
  const justApproved = evaluateHealth(
    facts({
      queue: queue({
        approvedWaiting: 5,
        dueWaiting: 5,
        lateWaiting: 0,
        draftsWaiting: 0,
        lastPublishedAt: inDays(-3),
      }),
    })
  );
  const posting = check(justApproved, "Posting");
  assert.equal(
    posting.status,
    "ok",
    "Three days of weekend and a batch approved at breakfast is Monday, not a breakage."
  );
  assert.match(posting.detail, /waiting less than a day/);
  assert.deepEqual(problemsIn(justApproved), []);
});

/**
 * The publisher is asked, not guessed at.
 *
 * Every version before this worked out whether the publisher was alive by
 * watching the feed — days of silence first, then whether the feed moved
 * between two mornings. Both readings were defeated by the same thing: the
 * feed moves for reasons that have nothing to do with the schedule. Measured
 * on the version before this one, with the publisher dead for forty-five days
 * and Kristina posting by hand every morning: forty-two approved posts
 * stranded, forty-five green mornings, no email of any kind. What settles it
 * is the publisher's own word that it ran — see PULSE_STALE_AFTER_HOURS.
 */
test("a publisher that has stopped being woken is a fault, whatever the feed says", () => {
  const overdue = queue({
    dueWaiting: 7,
    lateWaiting: 7,
    // Something reached the feed an hour ago, so this is not a silent feed at
    // all — it is Kristina posting by hand over a dead schedule.
    lastPublishedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
  });

  const running = evaluateHealth(facts({ queue: overdue }));
  assert.equal(
    check(running, "Posting").status,
    "ok",
    "The publisher said it ran five minutes ago, so however deep the queue is, it is alive."
  );

  const stopped = evaluateHealth(
    facts({ queue: { ...overdue, publisherPulse: pulse({ at: inDays(-1) }) } })
  );
  const posting = check(stopped, "Posting");
  assert.equal(posting.status, "warn");
  assert.match(posting.detail, /has not run for 3 hours/);
  assert.match(
    posting.detail,
    /by hand does not clear the queue/,
    "She has to be told why the post she sent herself did not fix this."
  );
});

/**
 * Three hours, and the boundary in both directions.
 *
 * The schedule wakes the publisher every fifteen minutes, so three hours is
 * twelve knocks missed in a row. Below the line is weather — a deploy, a few
 * minutes of Cloudflare having a bad time — and this file's whole discipline
 * is that weather is never worth an email.
 */
test("a publisher quiet for two hours is weather; three is a fault", () => {
  const overdue = queue({ dueWaiting: 3, lateWaiting: 3 });
  const after = (hours: number) =>
    evaluateHealth(
      facts({
        queue: {
          ...overdue,
          publisherPulse: pulse({ at: new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString() }),
        },
      })
    );

  assert.equal(
    check(after(2.9), "Posting").status,
    "ok",
    "Eleven missed knocks is a bad half-hour at Cloudflare, not a schedule that has stopped."
  );
  assert.equal(check(after(3.1), "Posting").status, "warn");
});

/**
 * A shop that has never posted, which is the loud half of the same line.
 *
 * A publisher that never worked from the shop's first day is the likeliest
 * morning of all for it not to work, and it used to be reachable only through
 * "nothing has ever gone out". That reading is gone; what says it now is that
 * the publisher has run and has never yet sent anything.
 */
test("a publisher that never worked from the first day is a fault too", () => {
  const neverWorked = evaluateHealth(
    facts({
      queue: queue({
        dueWaiting: 3,
        lateWaiting: 3,
        lastPublishedAt: null,
        publisherPulse: pulse({ lastSentAt: null, outcome: "nothing-due" }),
      }),
    })
  );
  const posting = check(neverWorked, "Posting");
  assert.equal(posting.status, "warn");
  assert.match(
    posting.detail,
    /nothing has gone out from it for 2 days/,
    "It is running and producing nothing, which is a different thing to say."
  );
});

/**
 * Nothing is waking it at all.
 *
 * A publisher that has never once written down that it ran is a Worker nobody
 * deployed, or a schedule somebody removed. The gate that keeps a brand new
 * shop quiet is not the empty feed but the empty queue: with nothing approved
 * and a day overdue there is nothing for a publisher to have failed to do.
 */
test("a publisher that has never once said it ran is not a shop that is merely new", () => {
  const newShop = evaluateHealth(
    facts({
      queue: queue({
        approvedWaiting: 2,
        dueWaiting: 2,
        lateWaiting: 0,
        lastPublishedAt: null,
        publisherPulse: null,
      }),
    })
  );
  assert.deepEqual(
    problemsIn(newShop),
    [],
    "Approved this morning and nothing overdue: a shop being set up, not a breakage."
  );

  const nobodyKnocking = evaluateHealth(
    facts({
      queue: queue({
        dueWaiting: 3,
        lateWaiting: 3,
        lastPublishedAt: null,
        publisherPulse: null,
      }),
    })
  );
  assert.equal(check(nobodyKnocking, "Posting").status, "warn");
  assert.match(check(nobodyKnocking, "Posting").detail, /has not run/);
});

/**
 * The publisher runs, and nothing comes out of it.
 *
 * The other half of the question, and it needs its own sentence because the
 * thing to do about it is different: the schedule is fine, so the fault is
 * between the queue and Instagram. Two days rather than one, because an honest
 * shop can genuinely leave a post a day overdue — quiet hours, the daily
 * number, the gap between posts — and cannot reach two. See PUBLISHER_IDLE_DAYS.
 */
test("a publisher that runs and sends nothing is a different fault, said differently", () => {
  const overdue = queue({ dueWaiting: 5, lateWaiting: 5 });
  const oneDay = evaluateHealth(
    facts({ queue: { ...overdue, publisherPulse: pulse({ lastSentAt: inDays(-1.5), outcome: "held" }) } })
  );
  assert.equal(
    check(oneDay, "Posting").status,
    "ok",
    "A day and a half without sending is quiet hours and the daily number, not a fault."
  );

  const twoDays = evaluateHealth(
    facts({ queue: { ...overdue, publisherPulse: pulse({ lastSentAt: inDays(-2.5), outcome: "held" }) } })
  );
  const posting = check(twoDays, "Posting");
  assert.equal(posting.status, "warn");
  assert.match(posting.detail, /running, but nothing has gone out from it for 2 days/);
  assert.match(
    posting.detail,
    /holding posts back for the quiet hours/,
    "What the last run said is the first place to look — in words, not in the site's own label."
  );
  assert.ok(
    !posting.detail.includes("held"),
    "'held' and 'nothing-due' are this file's vocabulary, not hers."
  );
});

/**
 * A run the rules held back is not evidence that the publisher is broken.
 *
 * This is the false alarm that cost the most to find, because the shop it
 * happens at is a shop with nothing wrong with it. Kristina's own post counts
 * against the daily number — the publisher counts everything that reached the
 * feed today, not only what it sent itself — so at the Studio's own defaults,
 * one post a day and quiet until eight, a post she sends by hand at seven in
 * the morning leaves every run for the rest of that day rightly held. Nothing
 * automatic goes out, `lastSentAt` sits still, and the watchman used to read
 * that as a publisher that had stopped sending: twelve emails over forty-five
 * days, half of them red, telling her to go and look at a pipeline that was
 * doing exactly what she had told it to.
 *
 * So the question asked is not "what did the last run say" but "when were the
 * rules last out of the way". The last run's word is whichever of the
 * ninety-six runs in a day the watchman happened to catch: with quiet hours
 * set to end at eleven, the run before the nine o'clock cron always says
 * "quiet hours", however the other ninety-five went. A date cannot be sampled
 * wrong.
 */
test("a publisher the rules have held ever since its last post is not a fault", () => {
  const overdue = queue({ dueWaiting: 5, lateWaiting: 5 });
  // Four days without sending, and every run in those four days held back —
  // the daily number spent by hand each morning before the window opened.
  const heldThroughout = evaluateHealth(
    facts({
      queue: {
        ...overdue,
        publisherPulse: pulse({
          lastSentAt: inDays(-4),
          lastFreeAt: inDays(-4),
          outcome: "held",
          detail: "daily-limit",
        }),
      },
    })
  );
  assert.equal(
    check(heldThroughout, "Posting").status,
    "ok",
    "It has not been let near Instagram since, so there is nothing it has failed to do."
  );
  assert.deepEqual(problemsIn(heldThroughout), []);

  // The same four days, and one run somewhere in them that the rules did let
  // through. That run had its chance and nothing came of it.
  const letThroughOnce = evaluateHealth(
    facts({
      queue: {
        ...overdue,
        publisherPulse: pulse({
          lastSentAt: inDays(-4),
          lastFreeAt: inDays(-1),
          outcome: "held",
          detail: "daily-limit",
        }),
      },
    })
  );
  assert.equal(check(letThroughOnce, "Posting").status, "warn");
  assert.match(check(letThroughOnce, "Posting").detail, /nothing has gone out from it for 2 days/);

  // And every kind of hold means the same thing here, which is the point of
  // asking for the date instead of the word. A list of hold kinds would have
  // to be kept in step with postingRules.ts; this does not.
  for (const detail of ["quiet-hours", "daily-limit", "too-soon", "in-flight"]) {
    const held = evaluateHealth(
      facts({
        queue: {
          ...overdue,
          publisherPulse: pulse({
            lastSentAt: inDays(-4),
            lastFreeAt: inDays(-4),
            outcome: "held",
            detail,
          }),
        },
      })
    );
    assert.equal(
      check(held, "Posting").status,
      "ok",
      `A run held by ${detail} never reached Instagram, so it says nothing about whether it could.`
    );
  }
});

/**
 * A record made this morning is not a fortnight of silence.
 *
 * The document is written by the first run, not by the first send, so
 * `lastSentAt` is missing for the first quarter of an hour of every shop's
 * life — and for as long afterwards as the rules hold it. Reading that absence
 * as an infinite silence meant the morning of the deploy came with a red email
 * at a shop whose feed had moved two hours earlier. How long it has been
 * observable is the document's own birthday, which Sanity keeps.
 */
test("a publisher that has never sent is measured from the day it first spoke", () => {
  const overdue = queue({ dueWaiting: 3, lateWaiting: 3 });
  const justDeployed = evaluateHealth(
    facts({
      queue: {
        ...overdue,
        publisherPulse: pulse({
          lastSentAt: null,
          createdAt: new Date(NOW.getTime() - 20 * 60 * 1000).toISOString(),
          outcome: "nothing-due",
        }),
      },
    })
  );
  assert.equal(
    check(justDeployed, "Posting").status,
    "ok",
    "Twenty minutes of being watched is not two days of not sending."
  );

  const watchedAllWeek = evaluateHealth(
    facts({
      queue: {
        ...overdue,
        publisherPulse: pulse({
          lastSentAt: null,
          createdAt: inDays(-7),
          outcome: "nothing-due",
        }),
      },
    })
  );
  assert.equal(check(watchedAllWeek, "Posting").status, "warn");
  assert.match(check(watchedAllWeek, "Posting").detail, /nothing has gone out from it for 2 days/);

  // A record from before any of these dates existed says nothing about the
  // rules, and a shop is not accused on the strength of a field that was not
  // being written when its publisher last sent something.
  const beforeTheField = evaluateHealth(
    facts({
      queue: {
        ...overdue,
        publisherPulse: pulse({ lastSentAt: inDays(-4), lastFreeAt: null, outcome: "nothing-due" }),
      },
    })
  );
  assert.equal(check(beforeTheField, "Posting").status, "ok");
});

/**
 * How deep the queue is still decides nothing, in either direction.
 *
 * An earlier attempt watched the size of the overdue pile instead, and it
 * looked right until it was run against eight hundred honest months: a shop
 * approving twelve posts three days a week and sending one a day piles up an
 * overdue queue that grows for ever with a publisher in perfect health. Two
 * hundred and sixty-six of those months sent an email.
 */
test("a shop that approves faster than it posts is not a stalled publisher", () => {
  const growing = evaluateHealth(
    facts({
      queue: queue({
        approvedWaiting: 40,
        dueWaiting: 40,
        lateWaiting: 40,
        lastPublishedAt: inDays(-1),
      }),
    })
  );
  assert.deepEqual(
    problemsIn(growing),
    [],
    "Forty overdue posts and a publisher that ran five minutes ago is a busy week."
  );
});

/**
 * The same damage as a vanished token, and it used to be four times quieter.
 *
 * Measured over the same thirty days: a dead publisher sent four yellow emails
 * a week apart, a rejected token fifteen red ones. Both mean the same thing —
 * nothing more will go out, and nothing anywhere says so.
 */
test("a stall that is still there the next morning is a fault, not a warning", () => {
  const overdue = queue({
    dueWaiting: 3,
    lateWaiting: 3,
    lastPublishedAt: inDays(-9),
    publisherPulse: pulse({ at: inDays(-1) }),
  });
  const first = evaluateHealth(facts({ queue: overdue }));
  assert.equal(
    check(first, "Posting").status,
    "warn",
    "One morning can be a deploy, or an hour of Cloudflare trouble."
  );

  const second = evaluateHealth(
    facts({
      queue: overdue,
      memory: memoryOf({ lookedAt: inDays(-1), troubles: [PUBLISHER_SILENT] }),
    })
  );
  assert.equal(check(second, "Posting").status, "fail");
  assert.match(check(second, "Posting").detail, /two mornings running/);

  const otherFault = evaluateHealth(
    facts({
      queue: overdue,
      memory: memoryOf({ lookedAt: inDays(-1), troubles: [PUBLISHER_NOT_SENDING] }),
    })
  );
  assert.equal(
    check(otherFault, "Posting").status,
    "warn",
    "Yesterday it was running and sending nothing; today it is not running. Not the same morning twice."
  );
});

test("a quiet feed with posts overdue does not say nothing is due", () => {
  const silenced = evaluateHealth(
    facts({
      queue: queue({
        dueWaiting: 3,
        lateWaiting: 3,
        lastPublishedAt: inDays(-9),
        failedRecently: 1,
        lastFailureError: "The caption is too long",
        lastFailureAt: inDays(-0.2),
      }),
    })
  );
  const posting = check(silenced, "Posting");
  assert.equal(posting.status, "ok", "The failed post above is the cause; one cause, one line.");
  assert.ok(
    !posting.detail.includes("nothing is due to go out"),
    "Three posts nine days overdue: 'nothing is due' read as reassurance about the fault itself."
  );
  assert.match(posting.detail, /for the reason given on one of the lines above/);
});

test("a named cause silences the posting check — the guard, on its own", () => {
  // A publisher that is running and has sent nothing for nine days. The one
  // fault a named cause is allowed to silence: a dead schedule is explained by
  // nothing on the lines above, so that one is never silenced.
  const withoutACause = queue({
    approvedWaiting: 3,
    dueWaiting: 3,
    lateWaiting: 3,
    draftsWaiting: 0,
    lastPublishedAt: inDays(-9),
    publisherPulse: pulse({ lastSentAt: inDays(-9), outcome: "nothing-due" }),
  });
  assert.equal(
    check(evaluateHealth(facts({ queue: withoutACause })), "Posting").status,
    "warn",
    "Nothing explains this silence, so the posting check is the one that must speak."
  );

  const explained = evaluateHealth(
    facts({
      queue: {
        ...withoutACause,
        failedRecently: 1,
        lastFailureError: "The caption is too long",
        lastFailureAt: inDays(-0.2),
      },
    })
  );
  assert.equal(
    check(explained, "Posting").status,
    "ok",
    "Exactly one fact changed: a post failed this morning. That is the cause, on its own line."
  );
  assert.equal(check(explained, "Failed posts").status, "warn");
});

/**
 * A failure only explains the silence that came after it.
 *
 * The publisher never goes back to a failed post — it picks up approved ones
 * and steps straight over the broken one — so last Tuesday's failure says
 * nothing about why nothing went out at the weekend. Read the wide way, one
 * failed post bought a whole week of quiet: measured, a publisher that died
 * the day after a single failure stranded three approved posts and a dark feed
 * behind seven mornings of "One post could not go out in the last 7 days".
 */
test("a failure from last week stops standing in for a publisher that died since", () => {
  const stranded = queue({
    approvedWaiting: 3,
    dueWaiting: 3,
    lateWaiting: 3,
    draftsWaiting: 0,
    lastPublishedAt: inDays(-6),
    publisherPulse: pulse({ lastSentAt: inDays(-6), outcome: "nothing-due" }),
    failedRecently: 1,
    lastFailureError: "The caption is too long",
    lastFailureAt: inDays(-6),
  });
  const posting = check(evaluateHealth(facts({ queue: stranded })), "Posting");
  assert.equal(
    posting.status,
    "warn",
    "Six days of silence behind a six-day-old failure is a dead publisher, not that failure."
  );

  const thisMorning = check(
    evaluateHealth(facts({ queue: { ...stranded, lastFailureAt: inDays(-0.5) } })),
    "Posting"
  );
  assert.equal(
    thisMorning.status,
    "ok",
    "A post that failed in the night is this morning's reason, and is named on its own line."
  );
});

test("silence is not blamed on the pipeline when Instagram is the cause", () => {
  const quiet = queue({ dueWaiting: 3, lateWaiting: 3, lastPublishedAt: inDays(-9) });

  const notConnected = evaluateHealth(
    facts({ instagram: { configured: false, reachable: false, expiryKnown: false }, queue: quiet })
  );
  assert.equal(check(notConnected, "Instagram").status, "warn");
  assert.equal(
    check(notConnected, "Posting").status,
    "ok",
    "One cause, one line — three red lines about the same missing token teach the reader to skim."
  );

  // The commonest breakage of all: the token is set, so `configured` is true,
  // and dead, so `reachable` is false. Gating on configured alone sent her
  // after a second cause that did not exist.
  const tokenDead = evaluateHealth(
    facts({
      instagram: {
        configured: true,
        reachable: false,
        expiryKnown: false,
        error: "Invalid OAuth access token",
      },
      queue: quiet,
      memory: memoryOf({ lookedAt: inDays(-1), troubles: [INSTAGRAM_UNREACHABLE] }),
    })
  );
  assert.equal(check(tokenDead, "Instagram").status, "fail");
  assert.equal(
    check(tokenDead, "Posting").status,
    "ok",
    "A dead token is configured and unreachable — it must silence the posting check too."
  );
});

/* ─── Posts that went wrong ─── */

test("a post that failed is named, with what Instagram said", () => {
  const failed = evaluateHealth(
    facts({
      queue: queue({
        approvedWaiting: 0,
        dueWaiting: 0,
        lateWaiting: 0,
        draftsWaiting: 4,
        failedRecently: 1,
        lastFailureError: "The caption is too long",
        lastFailureAt: inDays(-0.3),
        lastPublishedAt: inDays(-2),
      }),
    })
  );
  const result = check(failed, "Failed posts");
  assert.equal(result.status, "warn");
  assert.match(result.detail, /The caption is too long/, "The reason is the whole point.");
  assert.equal(
    check(failed, "Posts waiting to go out").status,
    "ok",
    "The failure already explains the empty queue; do not also send her to approve drafts."
  );
});

test("a post stuck halfway out is a failure, and the advice cannot post it twice", () => {
  const stuck = evaluateHealth(facts({ queue: queue({ stuckPublishing: 1 }) }));
  const result = check(stuck, "Stuck posts");
  assert.equal(result.status, "fail");
  assert.match(
    result.detail,
    /Posts going out/,
    "Name the list in the Studio where it is waiting."
  );
  assert.match(
    result.detail,
    /check Instagram first/i,
    "Setting a live post back to Approved publishes it a second time, and that cannot be undone."
  );
});

/**
 * Counted, never emailed about — like the depth of the queue, and for the same
 * reason. Its own advice was "there is nothing to do here", and an email that
 * says nothing needs doing is how the next one gets skimmed. One slow Reel was
 * two emails in ten days.
 */
test("a Reel Instagram is still chewing on is counted, not alarmed about", () => {
  const slowReel = evaluateHealth(facts({ queue: queue({ waitingOnInstagram: 2 }) }));
  assert.equal(
    check(slowReel, "Stuck posts").status,
    "ok",
    "resumeReels retries these every fifteen minutes — they belong to a queue."
  );
  const waiting = check(slowReel, "Videos with Instagram");
  assert.equal(waiting.status, "ok");
  assert.equal(waiting.tally, 2, "The number still comes back in the cron's answer.");
  assert.deepEqual(problemsIn(slowReel), [], "Nothing to do means nothing to send.");
  assert.match(
    waiting.detail,
    /after 3 days this will say so/,
    "And it says when it will stop being patient, so a day of silence is not open-ended."
  );
});

/**
 * The one stuck post nothing here could report.
 *
 * A Reel with a container id is not a stuck post — resumeReels retries it for
 * ever — and it does not silence the feed, because the other posts keep going
 * out around it. Sixty days of one, measured: the post never went out, no
 * email ever went out either, and the only line about it kept saying there was
 * nothing to do. Instagram holds a video it has been given for about a day, so
 * after three there is nothing left to retry against and the video needs
 * replacing.
 */
test("a video Instagram was given days ago and never finished is said out loud", () => {
  const abandoned = evaluateHealth(
    facts({ queue: queue({ waitingOnInstagram: 3, reelsAbandoned: 1 }) })
  );
  const waiting = check(abandoned, "Videos with Instagram");
  assert.equal(waiting.status, "warn");
  assert.equal(waiting.tally, 1, "One of the three is past saving; the other two may still arrive.");
  assert.match(
    waiting.detail,
    /more than 3 days/,
    "Three days, not one: Instagram holds a video for about a day, so a day still means 'wait'."
  );
  assert.match(waiting.detail, /will never arrive/);
  assert.match(
    waiting.detail,
    /check Instagram first/,
    "Setting it back to Approved blind would build a second container and could post the video twice."
  );
});

/* ─── Settings and the database ─── */

test("a missing setting is named, with what it costs", () => {
  const missing = evaluateHealth(facts({ missingSettings: ["RESEND_API_KEY"] }));
  const result = check(missing, "Site settings");
  assert.equal(result.status, "fail");
  assert.match(result.detail, /RESEND_API_KEY/);
  assert.match(result.detail, /no email goes out/);
});

test("a NEXT_PUBLIC setting says a redeploy is the fix, not just the dashboard", () => {
  const missing = evaluateHealth(facts({ missingSettings: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] }));
  assert.match(
    check(missing, "Site settings").detail,
    /deploy again|redeploy/i,
    "Next freezes these into the build, so setting it in Vercel alone changes nothing."
  );
});

test("the settings document going missing is caught — it once cost three weeks", () => {
  const gone = evaluateHealth(facts({ queue: queue({ settingsDocumentExists: false }) }));
  assert.equal(check(gone, "Studio settings").status, "fail");
});

test("a database that will not answer is reported rather than assumed healthy", () => {
  const down = evaluateHealth(facts({ queue: null, queueError: "connection reset" }));
  assert.equal(check(down, "Shop database").status, "fail");
  assert.equal(
    down.find((c) => c.name === "Posting"),
    undefined,
    "Nothing can be said about posting when the posts could not be read."
  );
});

test("a flaky answer is asked for a second time before it is believed", async () => {
  let asked = 0;
  const slept: number[] = [];
  const answer = await askTwice(
    async () => {
      asked += 1;
      return { ok: asked > 1 };
    },
    (result) => !result.ok,
    async (ms) => {
      slept.push(ms);
    }
  );
  assert.equal(asked, 2, "One network blip must not decide the morning.");
  assert.equal(answer.ok, true);
  assert.equal(slept.length, 1, "A pause between the two, or it is the same blip twice.");

  let happy = 0;
  await askTwice(
    async () => {
      happy += 1;
      return { ok: true };
    },
    (result) => !result.ok
  );
  assert.equal(happy, 1, "A good answer is not asked again.");
});

test("the subject line says what happened, not that something happened", () => {
  const subject = alertSubject([
    {
      name: "Instagram renewal",
      status: "warn",
      detail: "The Instagram connection expires in 9 days, on 27 September. Renew it before then.",
    },
    { name: "Stuck posts", status: "fail", detail: "One post has been stuck for hours. Fix it." },
  ]);
  assert.match(subject, /One post has been stuck for hours/, "The worst thing leads.");
  assert.match(subject, /and 1 more/, "Say there is more without listing it all in the inbox.");
  assert.ok(!subject.includes("&#39;"), "A subject is plain text; escaping it shows the entities.");
});

/* ─── Deciding whether it is news ─── */

const RENEWAL: HealthCheck = {
  name: "Instagram renewal",
  status: "warn",
  detail: "The Instagram connection expires in 14 days, on 2 October.",
};

/**
 * The questions a morning asks when the database answers and Instagram does.
 *
 * Yesterday's list of problems only means "that was fine yesterday" for the
 * questions yesterday actually got to ask, so the default here is a morning
 * that asked them all. A morning that could not is the interesting case, and
 * the tests that want one name it.
 */
/**
 * Every question a morning with a working database and a live token can ask.
 *
 * Note what is in here that never produces a line on a good morning: "Shop
 * database" only speaks when it has bad news, and "Videos with Instagram" only
 * when a video is waiting. Taking this list from the checks instead meant
 * those two were never recorded as asked, so tomorrow read their absence as a
 * trouble that had ended and could never call the next one news — measured, a
 * second video hanging two days after the first was mended bought three silent
 * mornings. See questionsAsked.
 */
const ASKED_EVERYTHING = [
  "Instagram",
  "Shop database",
  "Site settings",
  "Instagram renewal",
  "Booking requests",
  "Failed posts",
  "Posts waiting to go out",
  "Posting",
  "Stuck posts",
  "Videos with Instagram",
  "Studio settings",
];

function memoryOf(over: Partial<HealthMemory> = {}): HealthMemory {
  return { ...NO_MEMORY, previousLooked: ASKED_EVERYTHING, ...over };
}

test("the same warning is not sent every morning for a fortnight", () => {
  const yesterday = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Instagram renewal"],
    lastEmail: { at: inDays(-1), problems: ["Instagram renewal"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(
    alertDecision([RENEWAL], yesterday, NOW).send,
    false,
    "Fourteen identical mornings is how the real alarm ends up in the archive."
  );

  const lastWeek = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Instagram renewal"],
    lastEmail: { at: inDays(-7), problems: ["Instagram renewal"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(alertDecision([RENEWAL], lastWeek, NOW).send, true, "A weekly nudge still lands.");
});

test("a fault is repeated sooner than a warning, and a new problem always is", () => {
  const stuck: HealthCheck = { name: "Stuck posts", status: "fail", detail: "One post is stuck." };
  const yesterday = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Stuck posts"],
    lastEmail: { at: inDays(-1), problems: ["Stuck posts"], worst: "fail", looked: ASKED_EVERYTHING },
  });
  assert.equal(alertDecision([stuck], yesterday, NOW).send, false);

  const twoDaysAgo = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Stuck posts"],
    lastEmail: { at: inDays(-2), problems: ["Stuck posts"], worst: "fail", looked: ASKED_EVERYTHING },
  });
  assert.equal(alertDecision([stuck], twoDaysAgo, NOW).send, true);

  assert.equal(
    alertDecision([stuck, RENEWAL], yesterday, NOW).send,
    true,
    "A problem she has not been told about is news whatever was sent yesterday."
  );
});

test("more of the same trouble is news; the same amount of it is not", () => {
  const failed = (count: number): HealthCheck => ({
    name: "Failed posts",
    status: "warn",
    tally: count,
    detail: `${count} posts could not go out.`,
  });
  const toldYesterday = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Failed posts ×1"],
    lastEmail: { at: inDays(-1), problems: ["Failed posts ×1"], worst: "warn", looked: ASKED_EVERYTHING },
  });

  assert.equal(
    alertDecision([failed(1)], toldYesterday, NOW).send,
    false,
    "The same one failed post is the same news."
  );
  assert.equal(
    alertDecision([failed(3)], toldYesterday, NOW).send,
    true,
    "Two more posts have failed since. A publisher breaking daily was being silenced for a week."
  );
});

/**
 * The difference between "she never fixed it" and "she fixed it and it broke
 * again", which the last email alone cannot tell.
 *
 * Measured with only the email remembered: five posts failed on the Monday and
 * she was told; by the Wednesday she had mended every one; on the Friday three
 * different posts went down — and nothing was sent until the next Monday,
 * because "Failed posts" was a name she had already heard and three is fewer
 * than five. Every morning is written down, so yesterday's list is there to
 * be read.
 */
/**
 * One more failed post is news, and one is the whole reason the count is kept.
 *
 * The comparison is `>`, and moving it to `> … + 1` left every test green —
 * which would have meant a publisher breaking exactly one more post a day was
 * the same news every morning and silenced for a week, the thing the tally was
 * added to stop.
 */
test("one more of the same trouble than she was told about is news", () => {
  const failed = (count: number): HealthCheck => ({
    name: "Failed posts",
    status: "warn",
    tally: count,
    detail: `${count} posts could not go out.`,
  });
  const toldTwo = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Failed posts ×2"],
    lastEmail: { at: inDays(-1), problems: ["Failed posts ×2"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(alertDecision([failed(3)], toldTwo, NOW).send, true, "Two yesterday, three today.");
  assert.equal(
    alertDecision([failed(2)], toldTwo, NOW).send,
    false,
    "The same two are the same two."
  );
});

test("a trouble that was mended and came back is news again", () => {
  const failed = (count: number): HealthCheck => ({
    name: "Failed posts",
    status: "warn",
    tally: count,
    detail: `${count} posts could not go out.`,
  });

  const mendedThenBroken = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: [],
    lastEmail: { at: inDays(-4), problems: ["Failed posts ×5"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(
    alertDecision([failed(3)], mendedThenBroken, NOW).send,
    true,
    "Yesterday morning nothing was wrong. Three posts down today is news, not an echo."
  );

  const neverMended = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Failed posts ×5"],
    lastEmail: { at: inDays(-4), problems: ["Failed posts ×5"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(
    alertDecision([failed(3)], neverMended, NOW).send,
    false,
    "The same trouble, smaller than she was told about, is still the same trouble."
  );

  const noLookForDays = memoryOf({
    lookedAt: inDays(-9),
    previousProblems: [],
    lastEmail: { at: inDays(-4), problems: ["Failed posts ×5"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(
    alertDecision([failed(3)], noLookForDays, NOW).send,
    false,
    "With no recent look there is no clean morning to point at, so the email is all there is."
  );
});

/**
 * A morning nobody could look at is not a morning when everything was fine.
 *
 * The rule above forgets a trouble whose name was missing from yesterday's
 * list, because a missing name means the trouble had ended. It does not mean
 * that when yesterday could not ask the question at all: Meta busy for five
 * minutes at nine leaves no "Instagram renewal" line, and a database that says
 * nothing leaves none of the four lines about posts. Measured over a fortnight
 * with one unchanging "expires in N days" warning and nothing else wrong: two
 * emails when every morning was clean, five when Meta was busy every third
 * morning, seven when every second. Three and a half times the noise, about a
 * thing that had not changed, set off by the very weather this file is built
 * to stay quiet about.
 */
test("a morning the watchman could not look at does not count as a clean one", () => {
  const blind = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: [],
    // Meta was busy at nine, so yesterday never asked about the renewal.
    previousLooked: ["Instagram", "Failed posts", "Posts waiting to go out", "Posting"],
    lastEmail: { at: inDays(-1), problems: ["Instagram renewal"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(
    alertDecision([RENEWAL], blind, NOW).send,
    false,
    "The warning has not changed. Yesterday simply could not see it."
  );

  const sawItAndItWasGone = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: [],
    lastEmail: { at: inDays(-1), problems: ["Instagram renewal"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(
    alertDecision([RENEWAL], sawItAndItWasGone, NOW).send,
    true,
    "Yesterday asked and the answer was fine, so the same name today is a new trouble."
  );
});

/**
 * How stale a look may be and still stand for yesterday morning.
 *
 * Both sides matter and neither had a test: shortening the allowance to a
 * single day left everything green, while a cron that skipped one morning —
 * Vercel dropping a run, which is the ordinary reason — would have made every
 * two-morning rule unable to confirm anything at all.
 */
test("a look from the day before yesterday still stands; one older does not", () => {
  const unreachable = { configured: true, reachable: false, expiryKnown: false, error: "no" };
  const twoDaysAgo = evaluateHealth(
    facts({
      instagram: unreachable,
      memory: memoryOf({ lookedAt: inDays(-2), troubles: [INSTAGRAM_UNREACHABLE] }),
    })
  );
  assert.equal(
    check(twoDaysAgo, "Instagram").status,
    "fail",
    "One skipped cron must not lose the memory that confirms a dead token."
  );

  const threeDaysAgo = evaluateHealth(
    facts({
      instagram: unreachable,
      memory: memoryOf({ lookedAt: inDays(-3), troubles: [INSTAGRAM_UNREACHABLE] }),
    })
  );
  assert.equal(
    check(threeDaysAgo, "Instagram").status,
    "ok",
    "Three days back is not yesterday, and a trouble that old has to be seen again first."
  );
});

test("a morning with less wrong with it than yesterday is not news", () => {
  const renewalAndFailure = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Failed posts ×2", "Instagram renewal"],
    lastEmail: {
      at: inDays(-1),
      problems: ["Failed posts ×2", "Instagram renewal"],
      worst: "warn",
      looked: ASKED_EVERYTHING,
    },
  });
  assert.equal(
    alertDecision([RENEWAL], renewalAndFailure, NOW).send,
    false,
    "The failed posts were dealt with. A problem going away must not send an email."
  );

  const wasRed = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Instagram"],
    lastEmail: { at: inDays(-1), problems: ["Instagram"], worst: "fail", looked: ASKED_EVERYTHING },
  });
  const recovering: HealthCheck = {
    name: "Instagram",
    status: "warn",
    detail: "Instagram did not answer this morning.",
  };
  assert.equal(
    alertDecision([recovering], wasRed, NOW).send,
    false,
    "Red turning amber is a morning that improved; only the other direction is news."
  );
});

test("a warning turning into a fault is news, even about the same thing", () => {
  const warned = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Instagram"],
    lastEmail: { at: inDays(-1), problems: ["Instagram"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  const now: HealthCheck = {
    name: "Instagram",
    status: "fail",
    detail: "Instagram will not let us post.",
  };
  assert.equal(alertDecision([now], warned, NOW).send, true);
});

test("the count travels from the real check into the memory, not just the sentence", () => {
  // Built from evaluateHealth rather than by hand: the hand-written version of
  // this test passed with the count left off the check entirely, so the two
  // ends of the wire were never joined.
  const brokenOn = (count: number): HealthCheck[] =>
    evaluateHealth(
      facts({
        queue: queue({
          failedRecently: count,
          lastFailureError: "The caption is too long",
          lastFailureAt: inDays(-0.2),
        }),
      })
    ).filter((c) => c.status !== "ok");

  const toldAboutOne = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: alertFingerprint(brokenOn(1)).problems,
    lastEmail: { at: inDays(-1), problems: alertFingerprint(brokenOn(1)).problems, worst: "warn", looked: ASKED_EVERYTHING },
  });
  assert.equal(
    alertDecision(brokenOn(1), toldAboutOne, NOW).send,
    false,
    "The same one failed post is the same news."
  );
  assert.equal(
    alertDecision(brokenOn(3), toldAboutOne, NOW).send,
    true,
    "Two more have failed since yesterday, and the name on its own cannot say so."
  );
});

/* ─── The watchdog itself, with the outside world stood in for ─── */

function watchdog(over: Partial<HealthFacts> = {}) {
  const sent: { subject: string; html: string }[] = [];
  const written = new Map<string, MorningRecord>();
  return {
    sent,
    written,
    deps: {
      now: NOW,
      facts: async () => facts(over),
      claimMorning: async (id: string, record: MorningRecord) => {
        if (written.has(id)) return "taken";
        written.set(id, record);
        return "ours";
      },
      forgetMorning: async (id: string) => {
        written.delete(id);
      },
      send: async (message: { subject: string; html: string }) => {
        sent.push(message);
        return message;
      },
    },
  };
}

/**
 * What a morning writes down, so tomorrow can read it back.
 *
 * Two fields here are memory rather than record. `looked` is every question
 * this morning managed to ask — without it a morning where the database said
 * nothing is indistinguishable from a morning where everything was fine, and
 * an unchanged warning goes out again the next day. `troubles` carries where
 * the feed had got to, which is the only thing that can say tomorrow whether
 * anything went out on its own overnight.
 */
test("the morning record carries what tomorrow has to compare against", async () => {
  const w = watchdog({
    queue: queue({ lateWaiting: 2, lastPublishedAt: inDays(-1), publisherPulse: pulse({ at: inDays(-1) }) }),
  });
  await runHealthWatchdog(w.deps);
  const record = w.written.get(healthAlertDocumentId(NOW));
  assert.ok(record);
  assert.deepEqual(
    record.looked,
    ASKED_EVERYTHING,
    "Every question this morning could ask, so a morning that could not ask is not read as a clean one."
  );
  assert.deepEqual(record.troubles, [PUBLISHER_SILENT]);
});

test("a green morning sends nothing at all, but is still written down", async () => {
  const w = watchdog();
  const result = await runHealthWatchdog(w.deps);
  assert.equal(result.alerted, false);
  assert.equal(w.sent.length, 0, "Silence is the signal that everything passed.");
  assert.equal(
    w.written.get(healthAlertDocumentId(NOW))?.emailed,
    false,
    "Tomorrow has to be able to tell a recovery from a second breakage."
  );
  assert.deepEqual(
    w.written.get(healthAlertDocumentId(NOW))?.problems,
    [],
    "An empty list is the record tomorrow reads to know the trouble had ended."
  );
});

test("a second run on the same morning says nothing twice", async () => {
  const w = watchdog({ queue: queue({ stuckPublishing: 1 }) });

  const first = await runHealthWatchdog(w.deps);
  assert.equal(first.alerted, true);

  const second = await runHealthWatchdog(w.deps);
  assert.equal(second.alerted, false);
  assert.equal(second.skipped, "Already looked at this morning");
  assert.equal(w.sent.length, 1);
});

test("a failed send hands the morning back, so tomorrow is not lost as well", async () => {
  const written = new Map<string, MorningRecord>();
  const result = await runHealthWatchdog({
    now: NOW,
    facts: async () => facts({ queue: queue({ stuckPublishing: 1 }) }),
    claimMorning: async (id, record) => {
      if (written.has(id)) return "taken";
      written.set(id, record);
      return "ours";
    },
    forgetMorning: async (id) => {
      written.delete(id);
    },
    send: async () => {
      throw new Error("Resend is down");
    },
  });
  assert.equal(result.alerted, false);
  assert.equal(written.size, 0, "An unsent morning must be free to try again.");
});

/**
 * The one way this file could go silent for ever and still report itself well.
 *
 * The Resend SDK does not throw when the API refuses. Every non-2xx comes back
 * as a resolved answer carrying an error — a revoked key, an unverified
 * beautasy.co.uk, a rate limit, any 5xx — and the send used to be awaited and
 * counted as delivered whatever came back. Measured on six mornings with an
 * expired Instagram token and Resend answering 403: three sends attempted,
 * nothing delivered, `alerted: true` every time, and three mornings written
 * down as mornings she had been told about. From the fourth the deduplication
 * read those records as news already delivered and the watchman stopped trying
 * at all. Silent for ever, green the whole way: exactly the shape of breakage
 * the file exists to catch, inside the thing that catches it.
 */
test("Resend answering with a refusal is not a delivered email", async () => {
  const written = new Map<string, MorningRecord>();
  const complaints = console.error;
  console.error = () => {};
  try {
    const result = await runHealthWatchdog({
      now: NOW,
      facts: async () => facts({ queue: queue({ stuckPublishing: 1 }) }),
      claimMorning: async (id, record) => {
        if (written.has(id)) return "taken";
        written.set(id, record);
        return "ours";
      },
      forgetMorning: async (id) => {
        written.delete(id);
      },
      // Exactly what resend@6 resolves with when the domain is not verified:
      // no throw, no rejection, just an answer that says no.
      send: async () => ({
        data: null,
        error: {
          statusCode: 403,
          name: "validation_error",
          message: "The beautasy.co.uk domain is not verified",
        },
      }),
    });
    assert.equal(result.alerted, false, "Nobody was told, so nothing may claim they were.");
    assert.match(String(result.skipped), /not verified/, "And the reason reaches the cron's answer.");
    assert.equal(
      written.size,
      0,
      "The morning goes back, so tomorrow tries again instead of reading this as news delivered."
    );
  } finally {
    console.error = complaints;
  }
});

test("an email Resend does take is not mistaken for a refusal", async () => {
  const written = new Map<string, MorningRecord>();
  const result = await runHealthWatchdog({
    now: NOW,
    facts: async () => facts({ queue: queue({ stuckPublishing: 1 }) }),
    claimMorning: async (id, record) => {
      if (written.has(id)) return "taken";
      written.set(id, record);
      return "ours";
    },
    forgetMorning: async (id) => {
      written.delete(id);
    },
    // What a good send resolves with: an id, and error explicitly null.
    send: async () => ({ data: { id: "3f0b…" }, error: null }),
  });
  assert.equal(result.alerted, true);
  assert.equal(written.get(healthAlertDocumentId(NOW))?.emailed, true);
});

/**
 * The morning is claimed as "emailed" before the email is sent, because the
 * claim is what stops two runs both writing. The cost of that order is this:
 * a send that never answers would leave the claim standing over a morning
 * nobody was told about, and tomorrow would read it as news already delivered.
 * Vercel kills the request at sixty seconds shared between eight jobs, so
 * nothing would even be logged — two days of silence for a fault, seven for a
 * warning, in exactly the situation this file exists for.
 */
/**
 * This used to wait out the real five seconds, which was the only thing
 * standing over the number — badly. It meant the suite paid five seconds on
 * every green run, and it meant the one way to "fail" a mutation of
 * EMAIL_TIMEOUT_MS was to hang for as long as the mutant said: five thousand
 * seconds killed the whole suite rather than one test. The deadline is read
 * and crossed on an injected clock now, and the number itself is asserted in
 * the test below.
 */
test("an email Resend never answers for hands the morning back", async () => {
  const written = new Map<string, MorningRecord>();
  const result = await runHealthWatchdog({
    now: NOW,
    facts: async () => facts({ queue: queue({ stuckPublishing: 1 }) }),
    claimMorning: async (id, record) => {
      if (written.has(id)) return "taken";
      written.set(id, record);
      return "ours";
    },
    forgetMorning: async (id) => {
      written.delete(id);
    },
    countdown: (_ms, tooSlow) => {
      queueMicrotask(tooSlow);
      return () => {};
    },
    // Never answers, and never rejects either — a socket Resend has accepted
    // and gone quiet on, which is not the same as an error and used to be
    // waited for until Vercel killed the whole request.
    send: () => new Promise(() => {}),
  });
  assert.equal(result.alerted, false);
  assert.equal(result.skipped, "The email was not sent in time");
  assert.equal(written.size, 0, "The morning is free again, so a re-run can tell her.");
});

test("this morning's email is claimed under a date, so two runs collide instead of both sending", () => {
  assert.equal(
    healthAlertDocumentId(new Date("2026-09-18T09:00:00.000Z")),
    healthAlertDocumentId(new Date("2026-09-18T21:30:00.000Z")),
    "Any hour of the same day is the same claim."
  );
  assert.notEqual(
    healthAlertDocumentId(new Date("2026-09-18T09:00:00.000Z")),
    healthAlertDocumentId(new Date("2026-09-19T09:00:00.000Z"))
  );
});

/* ─── Somebody is waiting ─── */

/**
 * The check that would have caught the fortnight.
 *
 * On 5 September a fitting request arrived, saved perfectly, and the email
 * telling Kristina was refused and counted as sent. Every line above this one
 * was green that morning and every morning after it, because from the outside
 * a request nobody has answered looks exactly like a request answered five
 * minutes ago. The customer waited fourteen days. Nothing in this file could
 * have said so, so this is the one measurement here that is about a person.
 *
 * Every date below is given as the minute the request arrived, because the
 * judgement is made from that minute and from the atelier's working week. NOW
 * is nine o'clock UTC on Friday 18 September, which is ten in Southampton.
 */
test("a customer who has waited three days for an answer is worth an email", () => {
  const morning = evaluateHealth(
    // Tuesday morning, three working days back with no weekend in between
    facts({ queue: queue({ bookingsUnanswered: [arrived("2026-09-15T10:00")] }) })
  );
  const waiting = check(morning, "Booking requests");
  assert.equal(waiting.status, "warn");
  assert.match(waiting.detail, /One fitting request has had no answer/);
  assert.match(waiting.detail, /waiting 3 days/);
  assert.match(waiting.detail, /Atelier Bookings/, "It has to say where to go and what to do there.");
});

test("a shop where the fitting requests get answered hears nothing about them", async () => {
  const sameDay = evaluateHealth(facts({ queue: queue() }));
  assert.equal(check(sameDay, "Booking requests").status, "ok");
  assert.match(check(sameDay, "Booking requests").detail, /Every fitting request has been answered/);

  // And a request that came in a few hours ago is not late
  const w = watchdog({ queue: queue({ bookingsUnanswered: [arrived("2026-09-18T07:00")] }) });
  const result = await runHealthWatchdog(w.deps);
  assert.equal(result.alerted, false);
  assert.equal(w.sent.length, 0, "Two days of not being in your inbox is a normal week, not a fault.");
});

test("two days is the line, and the morning of the third is when it is said", () => {
  const justUnder = evaluateHealth(
    // Wednesday lunchtime: forty-six hours, and every one of them a working hour
    facts({ queue: queue({ bookingsUnanswered: [arrived("2026-09-16T12:24")] }) })
  );
  assert.deepEqual(problemsIn(justUnder), [], "Nobody is past the line yet, so there is nothing to say.");

  const justOver = evaluateHealth(
    facts({ queue: queue({ bookingsUnanswered: [arrived("2026-09-16T09:00")] }) })
  );
  assert.equal(check(justOver, "Booking requests").status, "warn");
});

/**
 * 🚨 The weekend, which is what broke this line before anybody deployed it.
 *
 * The threshold was calendar days. A request arrives at half past seven on a
 * Friday evening, Kristina answers it at one on Monday — an ordinary weekend
 * at a one-person atelier — and the nine o'clock run on Monday beat her to it
 * by four hours and wrote to say somebody had been waiting two days. It then
 * went away, so the Monday after it was news again: five emails in a month at
 * a shop where nothing at all was wrong.
 *
 * Everything in this test is that Friday request, looked at from four
 * different mornings.
 */
test("a request that arrives on Friday evening has not been ignored by Monday", () => {
  const fridayEvening = arrived("2026-09-18T19:30");
  const silent = ["2026-09-19T09:00", "2026-09-20T09:00", "2026-09-21T09:00"];
  for (const morning of silent) {
    const looked = evaluateHealth(
      facts({
        now: new Date(`${morning}:00Z`).toISOString(),
        queue: queue({ bookingsUnanswered: [fridayEvening] }),
      })
    );
    assert.equal(
      check(looked, "Booking requests").status,
      "ok",
      `Nobody had a chance to answer it by ${morning} — the atelier was shut.`
    );
  }

  // And the clock does start: two working days after Monday's opening.
  const wednesday = evaluateHealth(
    facts({
      now: "2026-09-23T09:00:00Z",
      queue: queue({ bookingsUnanswered: [fridayEvening] }),
    })
  );
  assert.equal(
    check(wednesday, "Booking requests").status,
    "warn",
    "Two working days after the atelier opened is the line, weekend or no weekend."
  );
});

test("the clock on a weekend request starts when the atelier next opens", () => {
  // Nine on Monday morning, Southampton, for every one of these
  const monday = instantOf("2026-09-21T09:00").toISOString();
  for (const late of ["2026-09-18T18:30", "2026-09-19T11:00", "2026-09-20T23:00", "2026-09-21T07:30"]) {
    assert.equal(
      answerClockStartsAt(new Date(arrived(late))).toISOString(),
      monday,
      `A request at ${late} cannot be answered before the atelier opens.`
    );
  }
  // A request inside working hours starts its own clock, unchanged
  const tuesdayAfternoon = arrived("2026-09-15T14:20");
  assert.equal(answerClockStartsAt(new Date(tuesdayAfternoon)).toISOString(), tuesdayAfternoon);
});

/**
 * A request that arrives after the atelier has shut, and the day it costs.
 *
 * Wednesday at eleven at night. Nobody could look at it that evening, so the
 * clock starts on Thursday morning — and two working days from Thursday
 * morning is Monday morning, because Saturday and Sunday are not days anybody
 * was going to answer on. Measured from the arrival instead, it is late on the
 * Saturday: an email on a weekend morning about a request she had two working
 * days to answer, which is the shape of alarm this whole line has to avoid.
 *
 * What that costs, said plainly: a request arriving on a Wednesday night is
 * chased two days later than one arriving on a Wednesday morning. The
 * alternative is writing to her at nine on a Saturday.
 */
test("a request that arrives after closing waits for the next morning to start counting", () => {
  const wednesdayNight = arrived("2026-09-16T23:00");
  const saturday = evaluateHealth(
    facts({ now: "2026-09-19T09:00:00Z", queue: queue({ bookingsUnanswered: [wednesdayNight] }) })
  );
  assert.equal(
    check(saturday, "Booking requests").status,
    "ok",
    "Thursday and Friday are not two working days yet, and Saturday is not one at all."
  );

  const monday = evaluateHealth(
    facts({ now: "2026-09-21T09:00:00Z", queue: queue({ bookingsUnanswered: [wednesdayNight] }) })
  );
  assert.equal(
    check(monday, "Booking requests").status,
    "warn",
    "Two working days on from Thursday morning is Monday morning, and then it is said."
  );
});

test("a weekday wait is counted exactly as it was before, hour for hour", () => {
  // The behaviour that was already right and must not move: forty-seven hours
  // between two weekday mornings is not two days.
  assert.ok(workingDaysWaiting(arrived("2026-09-15T10:00"), new Date("2026-09-17T08:00:00Z")) < 2);
  assert.ok(workingDaysWaiting(arrived("2026-09-15T10:00"), new Date("2026-09-17T09:00:00Z")) >= 2);
});

/**
 * Why five days is red rather than another amber morning.
 *
 * A warning repeats after a week (REPEAT_AFTER_DAYS), which is right for a
 * date in the diary and wrong for a person: told on the Wednesday and then not
 * again until the following Wednesday, the watchman would go quiet for exactly
 * the week in which the customer gives up and books somewhere else.
 */
test("a wait that turns into five days is said again rather than left for the week", () => {
  const fifthDay = evaluateHealth(
    // Last Friday morning: five working days back, with a weekend that does not count
    facts({ queue: queue({ bookingsUnanswered: [arrived("2026-09-11T10:00")] }) })
  );
  const waiting = check(fifthDay, "Booking requests");
  assert.equal(waiting.status, "fail");

  // Told about it as a warning two days ago, and nothing else has changed
  const told = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Booking requests ×1"],
    lastEmail: {
      at: inDays(-2),
      problems: ["Booking requests ×1"],
      worst: "warn",
      looked: ASKED_EVERYTHING,
    },
  });
  assert.equal(
    alertDecision([waiting], told, NOW).send,
    true,
    "Amber going red is news; a second amber morning inside the week is not."
  );
});

/**
 * 🚨 The ceiling, which is the other way this line ruins itself.
 *
 * Kristina's email about a request carries the customer's own address as the
 * reply-to, so the natural way to answer one is to reply straight from the
 * inbox — and that changes nothing in the Studio. The row stays "new" for
 * ever. Past the serious line a fault repeats every second day, and one such
 * row produced twelve emails in thirty days with no end to them.
 *
 * So past a fortnight it is still counted and still named, and it no longer
 * raises the status on its own. See BOOKING_CHASE_STOPS_AFTER_DAYS for what
 * that gives up.
 */
test("a request nobody ever marked stops being an email after a fortnight", () => {
  // Sixteen days back on a calendar, and only twelve of them working days.
  // The ceiling is deliberately the calendar one: a person does not stop
  // existing at the weekend, and counting the ceiling in working days would
  // push it out to three weeks of emails every second day.
  const forgotten = arrived("2026-09-02T10:00");
  const old = evaluateHealth(facts({ queue: queue({ bookingsUnanswered: [forgotten] }) }));
  const line = check(old, "Booking requests");
  assert.equal(line.status, "ok", "A fortnight on, the customer is long gone and this is a tidy-up.");
  assert.equal(line.tally, 0, "It counts for nothing, so it cannot make a morning look worse.");
  assert.match(line.detail, /One request from more than a fortnight ago was never marked in the Studio/);
  assert.deepEqual(problemsIn(old), [], "And nothing about it can send an email.");

  // But a new one going unanswered beside it starts the whole escalation again
  const andANewOne = evaluateHealth(
    facts({ queue: queue({ bookingsUnanswered: [forgotten, arrived("2026-09-15T10:00")] }) })
  );
  const both = check(andANewOne, "Booking requests");
  assert.equal(both.status, "warn");
  assert.equal(both.tally, 1, "One person is waiting; the other is history.");
  assert.match(both.detail, /One fitting request has had no answer/);
  assert.match(both.detail, /One request from more than a fortnight ago was never marked/);
});

test("a second person joining the queue is news, and the same one waiting is not", () => {
  const one = check(
    evaluateHealth(facts({ queue: queue({ bookingsUnanswered: [arrived("2026-09-15T10:00")] }) })),
    "Booking requests"
  );
  const two = check(
    evaluateHealth(
      facts({
        queue: queue({
          bookingsUnanswered: [arrived("2026-09-15T10:00"), arrived("2026-09-16T09:00")],
        }),
      })
    ),
    "Booking requests"
  );
  const told = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: ["Booking requests ×1"],
    lastEmail: {
      at: inDays(-1),
      problems: ["Booking requests ×1"],
      worst: "warn",
      looked: ASKED_EVERYTHING,
    },
  });
  assert.equal(alertDecision([one], told, NOW).send, false, "The same one person, said again, is noise.");
  assert.equal(alertDecision([two], told, NOW).send, true, "A second person waiting is a different morning.");
});

/**
 * 🚨 The details stay in the Studio.
 *
 * This dataset is public, which is why every name, address and telephone
 * number on a booking is sealed (see @/lib/pii). An email that quoted one to
 * say who was waiting would be the single place in the shop where they travel
 * in the clear, and it would do it by design rather than by accident.
 */
test("the email about somebody waiting carries numbers and a path, never a person", () => {
  const morning = evaluateHealth(
    facts({
      queue: queue({
        bookingsUnanswered: [
          arrived("2026-09-11T10:00"),
          arrived("2026-09-14T10:00"),
          arrived("2026-09-15T10:00"),
        ],
      }),
    })
  );
  const waiting = check(morning, "Booking requests");
  const subject = alertSubject([waiting]);

  for (const text of [waiting.detail, subject]) {
    assert.doesNotMatch(text, /@/, "No address, not even a masked one.");
    assert.doesNotMatch(text, /\+?\d[\d ]{6,}/, "No telephone number.");
  }
  assert.match(waiting.detail, /3 fitting requests have had no answer/);
  assert.match(waiting.detail, /waiting 7 days/);
  assert.match(waiting.detail, /never carries a customer's details/);
});

/* ─── The one that matters: an ordinary month ─── */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY_MS = 24 * HOUR;
const TICK = 15 * MINUTE;

/** A Monday, so the weeks in the model line up with the batches. */
const FIRST_MORNING = "2026-09-07";

/**
 * A post, as the documents in Sanity actually look.
 *
 * Nothing here is a health fact. The facts are worked out from these below, by
 * the same rules the GROQ query uses, so that a snapshot cannot quietly be
 * given a shape the real query would never produce. That is how the last
 * version passed: it was handed a "due since" of twenty minutes ago for a post
 * the site had drafted days earlier, which the query cannot return.
 */
interface Post {
  /** socialPost.createdAt — stamped when the site writes the draft */
  draftedAt: number;
  /** When Kristina moved it to Approved, which is when Sanity last touched it */
  approvedAt?: number;
  /** The date she put on it, if she put one on it */
  scheduledFor?: number;
  publishedAt?: number;
  /**
   * Who put it on the feed. The schedule's own posts are the only ones the
   * publisher's record knows about: "Post this now" goes through a different
   * function that leaves no mark, which is the whole reason the record can be
   * trusted. In the feed they are indistinguishable, and that is the point.
   */
  publishedBy?: "schedule" | "hand";
}

/**
 * What a post is at a given instant.
 *
 * A post published at this very instant counts as still waiting. The publisher
 * and the watchman are two of eight jobs started together in the same request,
 * and the route promises neither runs first, so the harsher reading is the
 * honest one.
 */
function statusAt(post: Post, at: number): "draft" | "approved" | "published" {
  if (post.publishedAt !== undefined && post.publishedAt < at) return "published";
  if (post.approvedAt !== undefined && post.approvedAt <= at) return "approved";
  return "draft";
}

/**
 * The queue as HEALTH_QUERY would count it, at one instant.
 *
 * `publisher` is how the schedule is doing, and the honest month leaves it
 * alone: it ran seven minutes ago, because the Worker knocks every fifteen,
 * and the last thing it sent is the last thing on the feed — in this model
 * nothing reaches the feed by any other route. A broken month hands in its own.
 */
function queueAt(
  posts: Post[],
  at: number,
  publisher?: (at: number, lastSent: string | null, lastFree?: number | null) => PublisherPulse | null,
  freeRuns: number[] = [],
  requests: Request[] = []
): QueueFacts {
  const approved = posts.filter((post) => statusAt(post, at) === "approved");
  const due = approved.filter((post) => post.scheduledFor === undefined || post.scheduledFor <= at);
  const gone = posts
    .filter((post) => statusAt(post, at) === "published")
    .map((post) => post.publishedAt as number);
  const sentByTheSchedule = posts
    .filter((post) => statusAt(post, at) === "published" && post.publishedBy !== "hand")
    .map((post) => post.publishedAt as number);
  const lateLine = at - DAY_MS;

  return {
    approvedWaiting: approved.length,
    dueWaiting: due.length,
    // Exactly the query's rule: due by its own date, and last written to
    // before the line a day back — and for an approved post, the last thing
    // written to it was the approval.
    lateWaiting: due.filter(
      (post) =>
        (post.scheduledFor === undefined || post.scheduledFor < lateLine) &&
        (post.approvedAt as number) < lateLine
    ).length,
    draftsWaiting: posts.filter((post) => statusAt(post, at) === "draft").length,
    lastPublishedAt: gone.length > 0 ? new Date(Math.max(...gone)).toISOString() : null,
    stuckPublishing: 0,
    waitingOnInstagram: 0,
    reelsAbandoned: 0,
    failedRecently: 0,
    lastFailureError: null,
    lastFailureAt: null,
    // The requests that have arrived by now and that nobody has answered yet,
    // worked out from the diary rather than written in.
    //
    // This used to be a flat zero, and a flat zero is a shop with no customers
    // in it: the whole sweep below ran against a month where this line could
    // not have spoken whatever it did, so it proved nothing about the one check
    // that was new. It now models an atelier that gets requests and answers
    // them in a day or two — including the Friday evening ones, which is the
    // case that turned a quiet month into an email every Monday.
    //
    // Handed over whole, without the query's own calendar line. That line can
    // only ever narrow this list, so the model gives the watchman MORE to be
    // noisy about than production would, which is the direction a silence test
    // wants to be wrong in.
    bookingsUnanswered: requests
      .filter((request) => request.at <= at && request.answeredAt > at)
      .map((request) => new Date(request.at).toISOString()),
    settingsDocumentExists: true,
    publisherPulse: (publisher ?? aliveSince)(
      at,
      // What the PUBLISHER sent, which is not what is on the feed: a post
      // Kristina sends herself reaches the feed and leaves no mark at all.
      // Handing the feed in here is the mistake the whole record exists to
      // stop, and a model that made it would be unable to show it.
      sentByTheSchedule.length > 0
        ? new Date(Math.max(...sentByTheSchedule)).toISOString()
        : null,
      lastFreeBefore(freeRuns, at)
    ),
  };
}

/** The last run the rules let through, at or before this instant. */
function lastFreeBefore(freeRuns: number[], at: number): number | null {
  let answer: number | null = null;
  for (const run of freeRuns) {
    if (run > at) break;
    answer = run;
  }
  return answer;
}

/** The pulse a publisher in good health leaves behind, seven minutes back. */
const HONEST_PULSE_AGE_MS = 7 * 60 * 1000;

function aliveSince(at: number, lastSent: string | null, lastFree?: number | null): PublisherPulse {
  return {
    at: new Date(at - HONEST_PULSE_AGE_MS).toISOString(),
    lastSentAt: lastSent,
    // When the rules last let a run through, worked out by running the rules
    // themselves over the month rather than assumed — see `publishThrough`. A
    // month where Kristina's own posts spend the daily number every morning is
    // a month where they held every single run, and writing a fresh date here
    // would model a publisher that had chances it never had.
    lastFreeAt: lastFree === undefined || lastFree === null ? null : new Date(lastFree).toISOString(),
    createdAt: new Date(at - 60 * DAY_MS).toISOString(),
    outcome: lastSent === null ? "nothing-due" : "published",
    detail: null,
  };
}

/**
 * How far forward the publisher's own answer lets the clock jump.
 *
 * Every hold names a moment before which it cannot change: quiet hours turn
 * only on the hour, the daily count resets at Southampton midnight, and the
 * gap between two posts is a fixed number of hours. Asking mayPublish at every
 * one of the ninety-six quarter hours in a day costs a millisecond of date
 * formatting each time, and the sweep below runs the month a couple of hundred
 * times over — so the loop asks about a dozen times a day instead, and lands
 * on exactly the same instants.
 */
function skipPast(at: number, hold: PostingHold, lastPublishedAt: number | null): number {
  const soonest =
    hold === "quiet-hours"
      ? Math.floor(at / HOUR) * HOUR + HOUR
      : hold === "daily-limit"
        ? startOfSouthamptonDay(new Date(at + DAY_MS)).getTime()
        : hold === "too-soon" && lastPublishedAt !== null
          ? lastPublishedAt + MIN_GAP_HOURS * HOUR
          : at + TICK;
  return Math.max(Math.ceil(soonest / TICK) * TICK, at + TICK);
}

/**
 * The real publisher, run forwards over the month.
 *
 * Nothing about when posts go out is written down here: the instants fall out
 * of mayPublish and the Studio's own defaults, one post a run, one a day,
 * nothing between ten at night and eight in the morning. A hand-written
 * schedule is how the last version of this test came to model a shop that does
 * not exist.
 */
function publishThrough(
  posts: Post[],
  from: number,
  until: number,
  settings: PostingSettings,
  alive: (at: number) => boolean,
  byHand: number[] = []
): number[] {
  /** Every run the rules let through, in order — what `lastFreeAt` records. */
  const freeRuns: number[] = [];
  const dueAt = (at: number) =>
    posts
      .filter(
        (post) =>
          statusAt(post, at) === "approved" &&
          (post.scheduledFor === undefined || post.scheduledFor <= at)
      )
      // The publisher's own order: a date is a promise about a day, so dated
      // posts go first, then the oldest by whatever date it has.
      .sort(
        (a, b) =>
          Number(b.scheduledFor !== undefined) - Number(a.scheduledFor !== undefined) ||
          (a.scheduledFor ?? a.draftedAt) - (b.scheduledFor ?? b.draftedAt)
      );

  let nextByHand = 0;
  let at = Math.ceil(from / TICK) * TICK;
  while (at < until) {
    // Kristina's own posts land at their own moments, whatever the schedule is
    // doing, and they are ordinary approved posts going out early. They reach
    // the feed, they count against the daily number the same as any other post
    // — the publisher counts what is on the feed, not what it sent — and they
    // leave no mark, because "Post this now" does not go near the publisher.
    while (nextByHand < byHand.length && byHand[nextByHand] <= at) {
      const moment = byHand[nextByHand];
      nextByHand += 1;
      const pick = dueAt(moment)[0];
      if (pick) {
        pick.publishedAt = moment;
        pick.publishedBy = "hand";
      }
    }

    if (!alive(at)) {
      at += TICK;
      continue;
    }

    const gone = posts
      .filter((post) => post.publishedAt !== undefined && post.publishedAt <= at)
      .map((post) => post.publishedAt as number);
    const lastPublishedAt = gone.length > 0 ? Math.max(...gone) : null;
    const today = southamptonDay(at);
    const verdict = mayPublish({
      now: new Date(at),
      settings,
      publishedToday: gone.filter((out) => southamptonDay(out) === today).length,
      lastPublishedAt: lastPublishedAt === null ? null : new Date(lastPublishedAt).toISOString(),
      inFlight: 0,
    });

    if (verdict.ok) {
      // Free is asked of every run, not only of runs with something to send:
      // an empty queue is a run the rules let through that found nothing, and
      // it is exactly as much evidence that the pipeline works as a run that
      // sent something. The publisher asks the rules before it looks at the
      // queue, and so does this.
      freeRuns.push(at);
      const due = dueAt(at);
      if (due.length > 0) {
        due[0].publishedAt = at;
        due[0].publishedBy = "schedule";
      }
      at += TICK;
    } else {
      at = skipPast(at, verdict.hold, lastPublishedAt);
    }
  }
  return freeRuns;
}

interface MonthOptions {
  /** The Southampton time of day Kristina approves the week's batch at */
  approveAt?: string;
  mornings?: number;
  /** The morning Instagram goes, and the feed goes silent with it */
  instagramGoesOnDay?: number;
  /**
   * Which way it goes: the token stops being accepted, or it is taken out of
   * the site's settings altogether. The feed is equally dead either way.
   */
  how?: "unreachable" | "removed";
  /** What she has set in the Studio under Instagram Posting */
  settings?: PostingSettings;
  /**
   * Kristina pressing "Post this now" herself: the Southampton time of day,
   * and how many days apart. A shop where she does this is a shop with nothing
   * wrong with it, and it used to be the loudest false alarm there was.
   */
  byHand?: { at: string; everyDays: number };
}

/**
 * Which Southampton day an instant falls in, remembered.
 *
 * The sweep below runs the month a couple of hundred times over, and every
 * decision the publisher makes asks what day it is for every post that has
 * already gone out. The answer for a given instant never changes.
 */
const dayNames = new Map<number, string>();
function southamptonDay(at: number): string {
  const known = dayNames.get(at);
  if (known !== undefined) return known;
  const name = localDateOf(new Date(at));
  dayNames.set(at, name);
  return name;
}

/** "09:45", from minutes since midnight. */
function clock(minutes: number): string {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  return `${hour}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The Southampton calendar date this many days after the first morning. */
function dateOf(day: number): string {
  return southamptonDay(instantOf(`${FIRST_MORNING}T12:00`).getTime() + day * DAY_MS);
}

/** The cron fires at nine, UTC, whatever the clocks in Southampton say. */
function cronOn(day: number): number {
  return Date.parse(`${dateOf(day)}T09:00:00Z`);
}

/**
 * A month at a shop where nothing is wrong, from the documents up.
 *
 * The site writes drafts on Wednesdays and Fridays, as it does when new
 * products arrive. Kristina approves five of them every Monday, at whatever
 * time of day this is asked for, and leaves the rest — so the drafts pile up
 * to a dozen by the end, which is the input that made the first version of
 * this file send an email a week. The publisher then runs over the whole
 * thing on its own rules. Nobody schedules anything for later except one batch
 * in the middle, which is there to prove a date in the diary is not a fault.
 *
 * That leaves every Monday morning looking like this at nine o'clock: nothing
 * published since Friday, nothing approved yet, and a dozen drafts. That one
 * morning is why this test exists.
 */
/**
 * A fitting request, and the moment Kristina dealt with it in the Studio.
 *
 * Both instants, because this is the half of the month the check about people
 * reads, and it is judged on the atelier's working week rather than on the
 * calendar. A request answered on Monday morning was never ignored, however
 * many dates the weekend covered.
 */
interface Request {
  at: number;
  answeredAt: number;
}

/**
 * The requests an ordinary month brings, and when they get answered.
 *
 * Every one of these is a shop where nothing is wrong: Kristina answers within
 * a day or two, sometimes in the same afternoon, sometimes the morning after,
 * and over the weekend on the Monday. The month must be silent about all of
 * them, and it is the Friday and Saturday ones that decide whether it is —
 * measured against the version before this, where a request at half past seven
 * on a Friday evening answered at one o'clock on the Monday produced one email
 * every Monday for a month.
 *
 * The Tuesday one is the other end of the same line: forty-six hours, entirely
 * inside the working week, and still silent. That is the behaviour the
 * calendar version had right, and it has to stay right.
 */
function requestsThrough(mornings: number): Request[] {
  const made: Request[] = [];
  const add = (day: number, at: string, answerDay: number, answerAt: string) => {
    made.push({
      at: instantOf(`${dateOf(day)}T${at}`).getTime(),
      answeredAt: instantOf(`${dateOf(answerDay)}T${answerAt}`).getTime(),
    });
  };
  for (let day = -7; day < mornings; day += 1) {
    const weekday = new Date(`${dateOf(day)}T12:00:00Z`).getUTCDay();
    // Monday, answered the same afternoon
    if (weekday === 1) add(day, "11:00", day, "16:00");
    // Tuesday, answered on Thursday morning — forty-six hours
    if (weekday === 2) add(day, "10:00", day + 2, "08:00");
    // Wednesday night, after the atelier shut, answered the next afternoon
    if (weekday === 3) add(day, "21:40", day + 1, "15:00");
    // 🚨 Friday evening, answered at one o'clock on the Monday
    if (weekday === 5) add(day, "19:30", day + 3, "13:00");
    // Saturday morning, answered on the Monday
    if (weekday === 6) add(day, "10:15", day + 2, "11:00");
  }
  return made;
}

function ordinaryMonth(options: MonthOptions = {}): HealthFacts[] {
  const approveAt = options.approveAt ?? "13:05";
  const mornings = options.mornings ?? 30;
  const goesOn = options.instagramGoesOnDay ?? Number.POSITIVE_INFINITY;
  const posts: Post[] = [];

  // A week of history first, so the month does not start on an empty shop.
  for (let day = -7; day < mornings; day += 1) {
    const date = dateOf(day);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    // The site drafts as products arrive, at the hour the daily job runs.
    if (weekday === 3) for (let i = 0; i < 3; i += 1) posts.push({ draftedAt: cronOn(day) });
    if (weekday === 5) for (let i = 0; i < 4; i += 1) posts.push({ draftedAt: cronOn(day) });
    if (weekday !== 1) continue;

    // Monday. She approves the five oldest drafts and leaves the others.
    const approvedAt = instantOf(`${date}T${approveAt}`).getTime();
    const waiting = posts
      .filter((post) => post.approvedAt === undefined && post.draftedAt < approvedAt)
      .sort((a, b) => a.draftedAt - b.draftedAt);
    for (const post of waiting.slice(0, 5)) {
      post.approvedAt = approvedAt;
      // One week in, the batch goes in dated a fortnight ahead: approved, and
      // deliberately not due. The depth of the queue decides nothing, and this
      // proves it decides nothing in either direction.
      if (day >= 14 && day < 21) post.scheduledFor = approvedAt + 14 * DAY_MS;
    }
  }

  const death = cronOn(goesOn === Number.POSITIVE_INFINITY ? mornings + 1 : goesOn);
  const settings = options.settings ?? POSTING_DEFAULTS;
  const byHand: number[] = [];
  if (options.byHand) {
    for (let day = -7; day < mornings; day += options.byHand.everyDays) {
      byHand.push(instantOf(`${dateOf(day)}T${options.byHand.at}`).getTime());
    }
  }
  const freeRuns = publishThrough(
    posts,
    cronOn(-7),
    cronOn(mornings),
    settings,
    (at) => at < death,
    byHand
  );
  const requests = requestsThrough(mornings);

  const month: HealthFacts[] = [];
  for (let day = 0; day < mornings; day += 1) {
    const at = cronOn(day);
    const dead = at >= death;
    month.push({
      now: new Date(at).toISOString(),
      instagram: !dead
        ? {
            configured: true,
            reachable: true,
            username: "beautasy",
            expiryKnown: true,
            expiresAt: new Date(at + 45 * DAY_MS).toISOString(),
          }
        : options.how === "removed"
          ? { configured: false, reachable: false, expiryKnown: false }
          : {
              configured: true,
              reachable: false,
              expiryKnown: false,
              error: "Error validating access token: Session has expired",
            },
      queue: queueAt(posts, at, undefined, freeRuns, requests),
      missingSettings: [],
      memory: NO_MEMORY,
    });
  }
  return month;
}

/**
 * Every morning, each one remembering the last, as the real thing does.
 *
 * The memory is chained rather than blanked, and chained the way the query
 * reads it: the previous look is the most recent record of any morning, and
 * the last email is the most recent record that actually sent one.
 */
async function runMonth(month: HealthFacts[]): Promise<{ day: string; subject: string }[]> {
  const sent: { day: string; subject: string }[] = [];
  const written = new Map<string, MorningRecord>();
  let remembered: HealthMemory = NO_MEMORY;

  for (const snapshot of month) {
    const morning = new Date(snapshot.now);
    const today: HealthFacts = { ...snapshot, memory: remembered };
    await runHealthWatchdog({
      now: morning,
      facts: async () => today,
      claimMorning: async (id, record) => {
        if (written.has(id)) return "taken";
        written.set(id, record);
        remembered = {
          lookedAt: record.checkedAt,
          troubles: record.troubles,
          previousProblems: record.problems,
          previousLooked: record.looked,
          lastEmail: record.emailed
            ? {
                at: record.checkedAt,
                problems: record.problems,
                worst: record.worst ?? "warn",
                looked: record.looked,
              }
            : remembered.lastEmail,
        };
        return "ours";
      },
      forgetMorning: async (id) => {
        written.delete(id);
      },
      send: async (message) => {
        sent.push({ day: morning.toISOString().slice(0, 10), subject: message.subject });
        return message;
      },
    });
  }

  assert.equal(written.size, month.length, "Every morning is written down, email or no email.");
  return sent;
}

test("an ordinary month at a working shop sends no email at all", async () => {
  const month = ordinaryMonth();

  // The silence below is only worth anything if the model really does produce
  // the morning that broke all three previous attempts. Prove it first.
  const monday = month[7];
  const mondayQueue = monday.queue;
  if (!mondayQueue?.lastPublishedAt) throw new Error("The model has stopped modelling a Monday.");
  assert.equal(new Date(monday.now).getUTCDay(), 1, "Day seven is a Monday.");
  assert.equal(mondayQueue.approvedWaiting, 0, "The week's batch is not approved until lunchtime.");
  assert.ok(mondayQueue.draftsWaiting >= 4, "Drafts she has not got to are piling up behind it.");
  // 🚨 And somebody IS waiting on this Monday morning — the request that came
  // in at half past seven on the Friday evening, which Kristina answers at one
  // o'clock this afternoon. That is the input the silence below is worth
  // something for: with the threshold counted in calendar days it is two days
  // old at nine o'clock and the month sends an email every Monday. A model
  // that handed over an empty list here, as this one used to, would prove
  // nothing at all about the check that reads it.
  const fridayEvening = instantOf(`${dateOf(4)}T19:30`).toISOString();
  assert.deepEqual(
    mondayQueue.bookingsUnanswered,
    [fridayEvening, instantOf(`${dateOf(5)}T10:15`).toISOString()],
    "Friday evening's request and Saturday morning's are both still unanswered at nine on Monday, and neither may be an email."
  );
  assert.ok(
    Math.floor((Date.parse(monday.now) - Date.parse(fridayEvening)) / DAY_MS) >= 2,
    "Two whole calendar days old, which is exactly what the old threshold counted."
  );
  assert.equal(
    Math.floor((Date.parse(monday.now) - Date.parse(mondayQueue.lastPublishedAt)) / DAY_MS),
    3,
    "Friday morning to Monday morning is three whole days — the input that sent five emails."
  );

  const sent = await runMonth(month);
  assert.deepEqual(
    sent,
    [],
    `A month of a working shop is a month of silence, not ${sent.length} emails: ${sent
      .map((email) => `${email.day} ${email.subject}`)
      .join(" | ")}`
  );
});

/**
 * The morning a new shop first has something to post.
 *
 * Measured against the version before this one: the site drafted these four
 * posts days ago, she approved them at five to nine, and the nine o'clock run
 * wrote to say "Nothing has ever been posted, although 4 posts are approved
 * and have been due to go out for more than a day". Nothing was wrong. The
 * posts had been publishable for five minutes.
 */
test("the first batch a shop ever approves is not a stalled pipeline", () => {
  const drafted = Date.parse("2026-09-14T09:00:00Z");
  const approvedAt = NOW.getTime() - 5 * MINUTE;
  const firstBatch: Post[] = [0, 1, 2, 3].map(() => ({ draftedAt: drafted, approvedAt }));

  const morning = evaluateHealth(
    facts({ queue: queueAt(firstBatch, NOW.getTime(), undefined, [NOW.getTime() - TICK]) })
  );
  assert.deepEqual(problemsIn(morning), [], "A shop with its first batch approved is not broken.");
  assert.equal(check(morning, "Posting").status, "ok");
  assert.equal(check(morning, "Posts waiting to go out").detail, "4 approved.");
});

/**
 * And the morning she comes back from a fortnight away and approves a batch.
 *
 * The same measurement, the other way round: eighteen days of silence is real,
 * but she has just this minute handed the site something to publish, and the
 * first post goes out within the quarter hour. The version before this one
 * wrote "Nothing has gone out for 18 days, although 5 posts are due. Something
 * is stopping them" — into a morning where nothing was stopping anything.
 */
test("a batch approved on the morning she gets back is not eighteen days late", () => {
  const away: Post[] = [
    { draftedAt: NOW.getTime() - 30 * DAY_MS, approvedAt: NOW.getTime() - 20 * DAY_MS,
      publishedAt: NOW.getTime() - 18 * DAY_MS },
    ...[0, 1, 2, 3, 4].map(() => ({
      draftedAt: NOW.getTime() - 21 * DAY_MS,
      approvedAt: NOW.getTime() - 90 * MINUTE,
    })),
  ];

  const morning = evaluateHealth(
    facts({ queue: queueAt(away, NOW.getTime(), undefined, [NOW.getTime() - TICK]) })
  );
  assert.deepEqual(problemsIn(morning), []);
  const posting = check(morning, "Posting");
  assert.match(posting.detail, /18 days ago/, "The silence is still reported, honestly.");
  assert.match(posting.detail, /waiting less than a day/, "It is simply not anybody's fault.");
});

/**
 * A month where Kristina posts by hand, and nothing whatever is wrong.
 *
 * This is the shop the watchman was shouting at. Her own post counts against
 * the daily number — the publisher counts everything that reached the feed
 * today, not only what it sent — so at the Studio's own defaults, one post a
 * day and quiet hours until eight, a post she sends at seven in the morning
 * leaves the schedule rightly held for the rest of that day. The feed moves,
 * the queue drains, the publisher knocks every fifteen minutes and is turned
 * away every time by the rules she set. Measured on the watchman before this:
 * twelve emails over forty-five days, alternating amber and red, telling her
 * the thing that sends posts had stopped sending.
 *
 * The times are the three that matter: before the window opens, while it is
 * open, and after it closes. The cadences are hers: every day, every other
 * day, twice a week.
 */
test("a shop where she posts by hand herself is not a publisher that has stopped", async () => {
  const noisy: string[] = [];
  for (const at of ["07:00", "12:00", "21:00"]) {
    for (const everyDays of [1, 2, 3]) {
      const sent = await runMonth(ordinaryMonth({ byHand: { at, everyDays }, mornings: 45 }));
      if (sent.length > 0) {
        noisy.push(`by hand at ${at} every ${everyDays} day(s) → ${sent.length}: ${sent[0].subject}`);
      }
    }
  }
  assert.deepEqual(
    noisy,
    [],
    `Her own posts are the shop working, not a fault in it:\n${noisy.join("\n")}`
  );
});

/**
 * And the same, with quiet hours that cover the hour the watchman looks.
 *
 * Quiet hours are hers to set and she can set them to end at eleven, which is
 * after the nine o'clock cron. Then the last run before every morning's look
 * says "quiet hours" whatever the ninety-five runs before it did — which is
 * why what is asked for is the date the rules last let a run through, and not
 * the word the last run happened to leave. Reading the word instead was
 * measured at up to eighteen false emails in forty-five days.
 */
test("quiet hours covering the morning look do not make a healthy shop shout", async () => {
  const lateMorning: PostingSettings = {
    postsPerDay: 1,
    quietHoursEnabled: true,
    quietFrom: 22,
    quietUntil: 11,
  };
  const noisy: string[] = [];
  for (const at of ["07:00", "12:00", "21:00"]) {
    const sent = await runMonth(
      ordinaryMonth({ settings: lateMorning, byHand: { at, everyDays: 1 }, mornings: 45 })
    );
    if (sent.length > 0) noisy.push(`by hand at ${at} → ${sent.length}: ${sent[0].subject}`);
  }
  assert.deepEqual(noisy, [], `Quiet until eleven is a setting, not a breakage:\n${noisy.join("\n")}`);
});

/**
 * The same month again under the settings she can change herself.
 *
 * Quiet hours and the daily count are two fields in the Studio, and the
 * watchman does not read them: it assumes only that a day is longer than any
 * silence they can ask for. Quiet hours that end after the cron are the case
 * worth pinning — with the old measurement they put the Monday email back,
 * three a month, because the batch she approved at lunch was already a day
 * late by the publisher's first opening the next morning.
 */
test("the settings she can change do not turn the month into an email", async () => {
  const noisy: string[] = [];
  for (const quietUntil of [0, 6, 8, 11, 14]) {
    for (const postsPerDay of [1, 2]) {
      const settings = { ...POSTING_DEFAULTS, quietUntil, postsPerDay };
      for (const approveAt of ["09:55", "13:05", "21:30"]) {
        const sent = await runMonth(ordinaryMonth({ approveAt, settings, mornings: 21 }));
        if (sent.length > 0) {
          noisy.push(`quiet until ${quietUntil}, ${postsPerDay}/day, approved ${approveAt} → ${sent[0].subject}`);
        }
      }
    }
  }
  assert.deepEqual(noisy, [], `Her own settings must not make it shout:\n${noisy.join("\n")}`);
});

/**
 * The same month, ninety-six times: once for every quarter of an hour she
 * might have pressed Approve.
 *
 * A single run of the month is not enough, and this is the test that proves
 * it. The version before this one measured zero emails — for one approval
 * time. Sweeping the day found that approving between ten to ten and five past
 * showed the Monday email again, once a week, in the same words as the round
 * before: the quarter of an hour between the publisher's last run and the
 * cron. Lateness was being counted from the day the site wrote the draft, so
 * the day of grace was spent before she ever saw the post, and the only thing
 * holding the month at zero was the hour she happened to work at.
 */
test("no quarter of an hour she might approve at turns the month into an email", async () => {
  const noisy: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    const at = clock(minutes);
    const sent = await runMonth(ordinaryMonth({ approveAt: at }));
    if (sent.length > 0) noisy.push(`${at} → ${sent.length}: ${sent[0].subject}`);
  }
  assert.deepEqual(
    noisy,
    [],
    `Every hour of the day has to be silent, not just the one the test was written at:\n${noisy.join("\n")}`
  );
});

/**
 * And minute by minute across the hour the cron fires in, because the window
 * that was found is fifteen minutes wide and a quarter-hour sweep can step
 * straight over one narrower than itself.
 */
test("the minutes either side of the cron are quiet too", async () => {
  const noisy: string[] = [];
  for (let minutes = 9 * 60; minutes <= 11 * 60; minutes += 1) {
    const at = clock(minutes);
    const sent = await runMonth(ordinaryMonth({ approveAt: at, mornings: 16 }));
    if (sent.length > 0) noisy.push(`${at} → ${sent.length}: ${sent[0].subject}`);
  }
  assert.deepEqual(
    noisy,
    [],
    `The hour around the cron is where the last false alarm hid:\n${noisy.join("\n")}`
  );
});

/**
 * The same month with the connection dying in the middle of it.
 *
 * A silent watchman is the other way to fail, so the count is pinned from both
 * ends. Every email is on a rhythm that is written down: silence on the
 * morning it happens, because Meta is sometimes busy for five minutes and one
 * flat answer means nothing; a fault the morning after, when the same trouble
 * has now been seen twice; and then one every REPEAT_AFTER_DAYS.fail = 2 days
 * for as long as nobody renews the token. Not one a morning, which is how a
 * real alarm ends up filtered — and not none, which is how this started.
 *
 * The queue behind the dead token climbs past twenty approved posts, and it
 * adds nothing to this list. That is the whole point of the file.
 */
test("a month where the connection dies sends on the fault's rhythm, not daily", async () => {
  const sent = await runMonth(ordinaryMonth({ instagramGoesOnDay: 12 }));

  assert.deepEqual(
    sent.map((email) => email.day),
    [
      "2026-09-20",
      "2026-09-22",
      "2026-09-24",
      "2026-09-26",
      "2026-09-28",
      "2026-09-30",
      "2026-10-02",
      "2026-10-04",
      "2026-10-06",
    ],
    "Silence the morning it broke, red the morning after, then every second day."
  );
  for (const email of sent) {
    assert.match(email.subject, /Instagram will not let us post/);
    assert.ok(
      !email.subject.includes("and 1 more"),
      "A dead token strands a growing queue, and the queue must never join the subject line."
    );
  }
});

/**
 * The other way a connection dies: the token is taken out of Vercel and never
 * put back. Nothing can ever go out again, exactly as with a dead token, and
 * for a while this was a yellow line that never got any louder — one email a
 * week about a pipeline that was finished, against one every second day for
 * the same damage next door.
 */
test("a token taken out of the settings ends up as loud as a dead one", async () => {
  const sent = await runMonth(ordinaryMonth({ instagramGoesOnDay: 12, how: "removed" }));

  assert.ok(
    sent.length >= 8,
    `A pipeline that is never coming back is worth more than ${sent.length} emails a month.`
  );
  assert.match(sent[0].subject, /not connected any more/);
  assert.match(
    sent[1].subject,
    /has not been for two mornings running/,
    "The second morning is the one that turns it red."
  );
  assert.deepEqual(
    sent.slice(0, 3).map((email) => email.day),
    ["2026-09-19", "2026-09-20", "2026-09-22"],
    "The same rhythm as a dead token: seen, confirmed, then every second day."
  );
});

/* ─── The wiring, which no snapshot can reach ─── */

/**
 * The fake claim above can only be trusted while the real one works the same
 * way. `createIfNotExists` would quietly succeed for a morning already written
 * and send a second email, which is the one thing these tests cannot see.
 */
const SOURCE = readFileSync(join(process.cwd(), "src", "lib", "siteHealth.ts"), "utf8");

test("the real claim is a create, which is what makes it once a day", () => {
  const claim = SOURCE.slice(SOURCE.indexOf("export async function claimThisMorning"));
  assert.match(claim, /sanityWriteClient\.create\(/, "A create is refused for an id that exists.");
  assert.ok(
    !claim.includes("createIfNotExists"),
    "createIfNotExists succeeds twice, which is two emails on one morning."
  );
  assert.match(claim, /_id: id/, "The id is the date — that is what makes it once a day.");
});

/**
 * The one measurement no test above can reach, because it is made in GROQ.
 *
 * Everything else in this file judges facts that are handed to it. Where those
 * facts come from is a query, and the query is where two rounds of false
 * alarms actually lived: lateness read from `createdAt`, which Sanity stamps
 * when the site writes the draft, days before Kristina approves it. The
 * moment that matters is the moment she approved — which is the moment the
 * document was last written to.
 */
test("lateness is read from when a post could go out, not from when it was written", () => {
  const query = SOURCE.slice(
    SOURCE.indexOf("const HEALTH_QUERY"),
    SOURCE.indexOf("interface HealthQueryResult")
  );
  const late = query.slice(query.indexOf('"lateWaiting"'), query.indexOf('"draftsWaiting"'));
  assert.match(
    late,
    /_updatedAt/,
    "Approving a post patches the document, so _updatedAt is when it could first have gone out."
  );
  assert.ok(
    !late.includes("createdAt"),
    "createdAt is stamped when the site drafts the post, days before anyone approves it."
  );
  assert.match(
    SOURCE,
    /lateBefore: new Date\(now\.getTime\(\) - DUE_LATE_MS\)/,
    "And the line it is measured against is a full day back, not some other number."
  );
});

/** A refusal shaped like Sanity's, which carries the status in both places. */
function refusal(statusCode: number): Error {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode, response: { statusCode } });
}

async function withAWriteToken<T>(work: () => Promise<T>): Promise<T> {
  const had = process.env.SANITY_API_WRITE_TOKEN;
  const complaints = console.error;
  process.env.SANITY_API_WRITE_TOKEN = "a token, so the claim is really attempted";
  console.error = () => {};
  try {
    return await work();
  } finally {
    console.error = complaints;
    if (had === undefined) delete process.env.SANITY_API_WRITE_TOKEN;
    else process.env.SANITY_API_WRITE_TOKEN = had;
  }
}

/**
 * The one judgement that can make this file permanently silent.
 *
 * Checked by what the watchman does, not by finding "409" in the source: the
 * previous test for this passed a search for the number, so turning `=== 409`
 * into `!== 409` would have kept it green while every refused write — an
 * expired write token above all — was read as "already told her today".
 */
test("a refused write still lets the watchman shout; only a conflict stops it", async () => {
  const morning: MorningRecord = {
    checkedAt: NOW.toISOString(),
    problems: ["Stuck posts"],
    emailed: true,
    troubles: [],
    looked: ASKED_EVERYTHING,
  };

  await withAWriteToken(async () => {
    assert.equal(
      await claimThisMorning("id", morning, async () => {
        throw refusal(409);
      }),
      "taken",
      "A conflict means another run has this morning. Two runs, one email."
    );

    for (const said of [refusal(401), refusal(403), new Error("network timeout")]) {
      assert.equal(
        await claimThisMorning("id", morning, async () => {
          throw said;
        }),
        "not-written-down",
        `${said.message}: the morning was not written down, so it must still be able to send — and say so.`
      );
    }

    assert.equal(claimOutcome(refusal(409)), "taken");
    assert.equal(claimOutcome(refusal(401)), "not-written-down");
  });
});

test("a dead write token makes the watchman shout, not go quiet", async () => {
  await withAWriteToken(async () => {
    const shouted: unknown[] = [];
    const rejected = await runHealthWatchdog({
      now: NOW,
      facts: async () => facts({ queue: queue({ stuckPublishing: 1 }) }),
      claimMorning: (id, record) =>
        claimThisMorning(id, record, async () => {
          throw refusal(401);
        }),
      send: async (message) => shouted.push(message),
    });
    assert.equal(rejected.alerted, true, "This is the very breakage the email exists to report.");
    assert.equal(shouted.length, 1);

    const quiet: unknown[] = [];
    const conflict = await runHealthWatchdog({
      now: NOW,
      facts: async () => facts({ queue: queue({ stuckPublishing: 1 }) }),
      claimMorning: (id, record) =>
        claimThisMorning(id, record, async () => {
          throw refusal(409);
        }),
      send: async (message) => quiet.push(message),
    });
    assert.equal(conflict.alerted, false);
    assert.equal(conflict.skipped, "Already looked at this morning");
    assert.equal(quiet.length, 0);
  });
});

/**
 * A refused write is a fault, not a line in a log nobody reads.
 *
 * `claimThisMorning` caught the refusal, printed it with console.error and
 * reported the claim as having succeeded, so the watchman carried on as if the
 * morning had been recorded. Measured: a SANITY_API_WRITE_TOKEN whose write
 * permission had been taken away — every read fine, every write a 401 — gave
 * thirty days of green mornings and not one email, while the consequence is
 * the one REQUIRED_SETTINGS writes out beside that key in full: bookings,
 * orders and posts all stall. The watchman could see it and threw it away.
 */
test("a database that will not take a write is this morning's news, not a log line", async () => {
  const sent: { subject: string }[] = [];
  const green = await runHealthWatchdog({
    now: NOW,
    facts: async () => facts(),
    claimMorning: async () => "not-written-down",
    send: async (message) => {
      sent.push(message);
      return { data: { id: "sent" }, error: null };
    },
  });

  assert.equal(
    check(green.checks, "Writing things down").status,
    "fail",
    "Nothing else was wrong this morning; this alone has to turn it red."
  );
  assert.equal(green.alerted, true);
  assert.equal(sent.length, 1);
  assert.match(
    check(green.checks, "Writing things down").detail,
    /SANITY_API_WRITE_TOKEN/,
    "She cannot act on 'a write failed'; she can act on the name of the key."
  );
  assert.match(
    check(green.checks, "Writing things down").detail,
    /every morning until it is fixed/,
    "With nothing saved there is no memory of having said it, and saying so is the honest part."
  );

  const ours = await runHealthWatchdog({
    now: NOW,
    facts: async () => facts(),
    claimMorning: async () => "ours",
    send: async (message) => sent.push(message),
  });
  assert.equal(
    ours.checks.find((c) => c.name === "Writing things down"),
    undefined,
    "A write that worked says nothing at all — that is what the whole file is arranged around."
  );
  assert.equal(ours.alerted, false);
});

/**
 * A morning nobody could look at must not wipe out what she was told.
 *
 * The record of a morning is what tomorrow compares against, and a morning
 * that cannot ask a question leaves that question out of its list. Measured
 * with the publisher dead and the database silent every third morning: the
 * list flipped between {Shop database} and {Posting}, each one new to the
 * other every single morning, and from the eighth day it was an email a day —
 * twenty-five in thirty days, about two problems that never changed once. So
 * what she was told about and this morning could not ask about is carried
 * forward into the record rather than dropped from it.
 */
test("an email sent on a blind morning is not a clean bill of health for everything else", async () => {
  const written = new Map<string, MorningRecord>();

  // Yesterday: the database said nothing, so the only line the morning had was
  // "Shop database" — and that is the email she got. None of the six questions
  // about posts could be asked at all.
  await runHealthWatchdog({
    now: NOW,
    facts: async () =>
      facts({
        queue: null,
        queueError: "it did not answer in time",
        memory: memoryOf({
          lookedAt: inDays(-1),
          lastEmail: {
            at: inDays(-1),
            problems: ["Posting"],
            worst: "fail",
            looked: ASKED_EVERYTHING,
          },
        }),
      }),
    claimMorning: async (id, record) => {
      written.set(id, record);
      return "ours";
    },
    send: async (message) => message,
  });

  const blind = written.get(healthAlertDocumentId(NOW));
  assert.ok(blind);
  assert.deepEqual(blind.problems, ["Shop database"]);
  assert.ok(
    !blind.looked.includes("Posting"),
    "The record has to admit which questions this morning never got to ask."
  );

  // Today the database answers again and the publisher is still stalled,
  // exactly as it was. That is not news: the only reason "Posting" is missing
  // from the last email is that the morning which sent it could not look.
  const stillStalled: HealthCheck[] = [
    { name: "Posting", status: "fail", detail: "The publisher has not run." },
  ];
  const afterABlindMorning = memoryOf({
    lookedAt: blind.checkedAt,
    previousProblems: blind.problems,
    previousLooked: blind.looked,
    lastEmail: {
      at: blind.checkedAt,
      problems: blind.problems,
      worst: "fail",
      looked: blind.looked,
    },
  });
  assert.equal(
    alertDecision(stillStalled, afterABlindMorning, new Date(NOW.getTime() + DAY_MS)).send,
    false,
    "Measured without this: the list flipped between {Shop database} and {Posting} and sent an email every morning."
  );

  // Two days on, the plain repeat rule for a fault says it again — the news is
  // delayed to its own rhythm, never dropped.
  assert.equal(
    alertDecision(stillStalled, afterABlindMorning, new Date(NOW.getTime() + 2 * DAY_MS)).send,
    true
  );

  // And the guard is narrow: a question that morning DID ask about, coming
  // back with something new, is news the moment it appears.
  const alsoStuck: HealthCheck[] = [
    ...stillStalled,
    { name: "Stuck posts", status: "fail", detail: "Two posts are stuck.", tally: 2 },
  ];
  assert.equal(
    alertDecision(
      alsoStuck,
      memoryOf({
        lookedAt: blind.checkedAt,
        previousProblems: blind.problems,
        previousLooked: blind.looked,
        lastEmail: {
          at: blind.checkedAt,
          problems: ["Shop database"],
          worst: "fail",
          looked: [...blind.looked, "Stuck posts"],
        },
      }),
      new Date(NOW.getTime() + DAY_MS)
    ).send,
    true,
    "That morning could see the stuck posts and found none, so two of them now is news."
  );
});

/**
 * A record written before any of this existed must not buy silence.
 *
 * The rule above turns on a list of questions, and a morning recorded before
 * that list was written down comes back with an empty one. Reading empty as
 * "it could not ask about anything" would make every problem fall through to
 * the repeat rule on the first morning after a deploy.
 */
test("a morning record from before the field existed suppresses nothing", () => {
  const old = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: [],
    previousLooked: [],
    lastEmail: { at: inDays(-1), problems: ["Instagram renewal"], worst: "warn", looked: [] },
  });
  // A problem with no count on it, told about yesterday under a different
  // name, so the only rule that can answer is the one about blind spots: an
  // empty list must mean "nothing is known", never "it could see nothing".
  assert.equal(
    alertDecision(
      [{ name: "Posting", status: "warn", detail: "The publisher has not run." }],
      old,
      NOW
    ).send,
    true,
    "Nothing is known about what that morning asked, so nothing is held back."
  );
});

/**
 * A check that vanishes along with its own zero used to be uncrossable.
 *
 * `looked` was taken from the lines a morning produced, and "Videos with
 * Instagram" is only pushed when a video is actually waiting. So on a clean
 * morning its name was missing, a missing name reads as a trouble that ended,
 * and the rule that makes a mended-and-returned trouble news again could never
 * fire for it. Measured: video A reported on the Monday and mended on the
 * Wednesday, a different video B hung on the Friday — Friday, Saturday and
 * Sunday said nothing, and the email only arrived on the seventh day by the
 * plain repeat rule, without a word to say it was a different video.
 */
test("a check that says nothing on a good morning is still crossed off", () => {
  const withAVideo = facts({ queue: queue({ waitingOnInstagram: 1, reelsAbandoned: 1 }) });
  assert.ok(
    questionsAsked(withAVideo).includes("Videos with Instagram"),
    "It is asked whenever there is a queue to ask it of."
  );
  assert.ok(
    questionsAsked(facts()).includes("Videos with Instagram"),
    "And asked just the same on the morning the answer is none."
  );

  // Video A was told about on the Monday. Tuesday was clean — no line at all,
  // because there was nothing waiting. Video B hangs on the Wednesday.
  const mended = memoryOf({
    lookedAt: inDays(-1),
    previousProblems: [],
    previousLooked: questionsAsked(facts()),
    lastEmail: { at: inDays(-2), problems: ["Videos with Instagram ×1"], worst: "warn", looked: ASKED_EVERYTHING },
  });
  const videoB = check(evaluateHealth(withAVideo), "Videos with Instagram");
  assert.equal(
    alertDecision([videoB], mended, NOW).send,
    true,
    "The one she mended was crossed off yesterday, so this is a different video and it is news."
  );
});

/**
 * The names the watchman writes down have to be the names it can say.
 *
 * `questionsAsked` is written out by hand, because what it records is which
 * questions were answerable and that is a different list from the answers. The
 * cost of writing it out is that it can drift, so this holds the two together.
 */
test("every line the watchman can produce is a question it admits to asking", () => {
  const worlds: HealthFacts[] = [
    facts(),
    facts({ queue: null, queueError: "no answer" }),
    facts({ instagram: { configured: false, reachable: false, expiryKnown: false } }),
    facts({ instagram: { configured: true, reachable: false, expiryKnown: false, error: "no" } }),
    facts({ instagram: { configured: true, reachable: true, expiryKnown: false } }),
    facts({ missingSettings: ["RESEND_API_KEY"] }),
    facts({
      queue: queue({
        waitingOnInstagram: 2,
        reelsAbandoned: 1,
        stuckPublishing: 1,
        failedRecently: 1,
        lastFailureError: "too long",
        lastFailureAt: inDays(-0.1),
        settingsDocumentExists: false,
        publisherPulse: pulse({ at: inDays(-1) }),
      }),
    }),
  ];
  for (const world of worlds) {
    const asked = questionsAsked(world);
    for (const line of evaluateHealth(world)) {
      assert.ok(
        asked.includes(line.name),
        `"${line.name}" is said out loud but never recorded as asked, so it can never be crossed off.`
      );
    }
  }
});

/**
 * Five seconds, and nothing was holding the number.
 *
 * Every mutation of EMAIL_TIMEOUT_MS passed a full run: five seconds to
 * thirty, to five thousand, and to one millisecond. The last is the dangerous
 * one — the real Resend answers in about two hundred milliseconds, so a
 * one-millisecond deadline hands every morning back and sends the same email
 * again tomorrow, for ever, in exactly the situation this file exists for. The
 * only mutation that "failed" did so by hanging the suite for as long as the
 * constant said, which is not a test either. So the clock is a seam now: the
 * deadline can be read, and crossed, without waiting for it.
 */
test("the email is given five seconds, and a send that takes longer hands the morning back", async () => {
  const deadlines: number[] = [];
  const written = new Map<string, MorningRecord>();

  const held = await runHealthWatchdog({
    now: NOW,
    facts: async () => facts({ queue: queue({ stuckPublishing: 1 }) }),
    claimMorning: async (id, record) => {
      written.set(id, record);
      return "ours";
    },
    forgetMorning: async (id) => {
      written.delete(id);
    },
    // Reads the deadline, then crosses it at once instead of waiting for it —
    // which is how a five-thousand-second mutation is caught in milliseconds
    // rather than by hanging the suite for as long as the constant says.
    countdown: (ms, tooSlow) => {
      deadlines.push(ms);
      queueMicrotask(tooSlow);
      return () => {};
    },
    // Never answers and never rejects: a socket Resend accepted and forgot.
    send: () => new Promise(() => {}),
  });

  assert.deepEqual(
    deadlines,
    [5000],
    "Five seconds. Resend normally answers in under one, and the whole cron request has sixty shared between eight jobs."
  );
  assert.equal(held.alerted, false);
  assert.equal(held.skipped, "The email was not sent in time");
  assert.equal(written.size, 0, "The morning goes back, so tomorrow can try again.");

  // The other side of the same line, on the real clock: a send that takes two
  // hundred milliseconds — what Resend actually costs — is a delivered email.
  const slowButFine = await runHealthWatchdog({
    now: NOW,
    facts: async () => facts({ queue: queue({ stuckPublishing: 1 }) }),
    claimMorning: async () => "ours",
    send: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { data: { id: "sent" }, error: null };
    },
  });
  assert.equal(
    slowButFine.alerted,
    true,
    "Two hundred milliseconds is Resend working, and a deadline under it silences every morning."
  );
});

test("a question the outside world never answers is given up on", async () => {
  assert.equal(
    await within(5, () => new Promise<string>(() => {}), "no answer"),
    "no answer",
    "Every outside question is wrapped in this, or one of them eats the cron's whole minute."
  );
  assert.equal(await within(1000, async () => "answered", "no answer"), "answered");
});

/**
 * The timeouts, as the cron actually experiences them.
 *
 * `within` was tested on its own and the checks were tested on facts somebody
 * handed them, and between the two nothing watched the wires: taking either
 * wrapper off gatherHealthFacts left all of these tests green while a single
 * unanswered request could sit there until Vercel killed the whole minute and
 * the order emails with it. Both slow paths are set going at once here, since
 * they run side by side in production and the cost is meant to be the longer
 * of the two, not the sum.
 *
 * Nothing is mocked out of the module: the real client and the real fetch are
 * swapped for ones that never answer, so what is measured is the wiring.
 */
test("a database and a Meta that never answer are given up on", { timeout: 30000 }, async () => {
  const client = sanityWriteClient as unknown as {
    fetch: (...args: unknown[]) => Promise<unknown>;
  };
  const realQuery = client.fetch;
  const realFetch = globalThis.fetch;
  const hadToken = process.env.IG_ACCESS_TOKEN;
  const never = () => new Promise<never>(() => {});

  let asked = 0;
  client.fetch = async () => {
    asked += 1;
    // The first answer never comes. The second is instant, so what the clock
    // below measures is the giving up, and the facts prove the second was used.
    if (asked === 1) return never();
    return {
      approvedWaiting: 0,
      dueWaiting: 0,
      lateWaiting: 0,
      draftsWaiting: 2,
      lastPublishedAt: null,
      stuckPublishing: 0,
      waitingOnInstagram: 0,
      failedRecently: 0,
      lastFailureError: null,
      lastFailureAt: null,
      settingsDocumentExists: true,
      previousLook: null,
      lastEmail: null,
    };
  };

  // Instagram answers about the account, then goes quiet when asked when the
  // token dies — the shape of a real rate limit, and the one call that used to
  // have no limit of its own.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("debug_token")) return never();
    return new Response(JSON.stringify({ user_id: "17841400000000000", username: "beautasy" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  process.env.IG_ACCESS_TOKEN = "a token, so the expiry is really asked for";

  try {
    const started = Date.now();
    const gathered = await gatherHealthFacts(NOW);
    const took = Date.now() - started;

    assert.equal(gathered.instagram.reachable, true, "The account answered, so the probe is fine.");
    assert.equal(
      gathered.instagram.expiryKnown,
      false,
      "Meta never said when the token dies, and 'no answer' is the answer we take."
    );
    assert.ok(gathered.queue !== null, "The database's second answer arrived and was used.");
    assert.equal(gathered.queue?.draftsWaiting, 2, "And it is that answer in the facts.");
    assert.ok(
      took < 25000,
      `Both questions gave up inside the budget written over the timeouts, not after ${Math.round(took / 1000)}s.`
    );
  } finally {
    client.fetch = realQuery;
    globalThis.fetch = realFetch;
    if (hadToken === undefined) delete process.env.IG_ACCESS_TOKEN;
    else process.env.IG_ACCESS_TOKEN = hadToken;
  }
});

/**
 * The wires between the query and the facts, for the publisher's record.
 *
 * Every test above judges facts somebody handed it, and the query is run on
 * its own further down — between the two sits the translation, and it is worth
 * a test of its own because two of its four dates come from fields that are
 * easy to confuse. `_createdAt` is Sanity's and `at` is ours, and they sit one
 * line apart: reading `at` into `createdAt` would leave a publisher that has
 * never sent anything measured from its own last knock, which is always
 * minutes ago, so it could never reach two days and the loudest case of all —
 * a publisher that has not worked since the day it was deployed — would go
 * quiet for ever. Nothing above would notice.
 */
test("the publisher's dates survive the trip from the query into the facts", async () => {
  const client = sanityWriteClient as unknown as {
    fetch: (...args: unknown[]) => Promise<unknown>;
  };
  const realQuery = client.fetch;
  const hadToken = process.env.IG_ACCESS_TOKEN;
  delete process.env.IG_ACCESS_TOKEN;

  client.fetch = async () => ({
    approvedWaiting: 1,
    dueWaiting: 1,
    lateWaiting: 1,
    draftsWaiting: 0,
    lastPublishedAt: null,
    stuckPublishing: 0,
    waitingOnInstagram: 0,
    reelsAbandoned: 0,
    failedRecently: 0,
    lastFailureError: null,
    lastFailureAt: null,
    settingsDocumentExists: true,
    publisherPulse: {
      at: inDays(-0.01),
      lastSentAt: inDays(-5),
      lastFreeAt: inDays(-0.02),
      outcome: "nothing-due",
      detail: null,
      _createdAt: inDays(-40),
    },
    previousLook: null,
    lastEmail: null,
  });

  try {
    const gathered = await gatherHealthFacts(NOW);
    assert.deepEqual(gathered.queue?.publisherPulse, {
      at: inDays(-0.01),
      lastSentAt: inDays(-5),
      lastFreeAt: inDays(-0.02),
      createdAt: inDays(-40),
      outcome: "nothing-due",
      detail: null,
    });

    // And the one that cannot be checked by shape alone: the birthday must be
    // the document's, not the last knock's.
    assert.notEqual(
      gathered.queue?.publisherPulse?.createdAt,
      gathered.queue?.publisherPulse?.at,
      "Measured from its own last knock, a publisher that has never sent anything is never two days idle."
    );
  } finally {
    client.fetch = realQuery;
    if (hadToken === undefined) delete process.env.IG_ACCESS_TOKEN;
    else process.env.IG_ACCESS_TOKEN = hadToken;
  }
});

/**
 * What can be held about the cron route, and what cannot.
 *
 * There is no behavioural test of that handler and this is not one: standing
 * in for seven job modules needs module mocking, which this project's test
 * command does not turn on. So what is asserted is the shape of its source,
 * and the shape is worth asserting — the watchman living outside `allSettled`
 * would let a watchman that trips over its own feet stop an order email.
 *
 * The limit is that a mutation which leaves the call where it is and changes
 * what happens around it passes. One of those is worth spending a line on
 * because it is cheap to catch and expensive to have: a second `await` on the
 * watchman anywhere in the file runs it twice in one request, which claims the
 * morning, sends, and then reads its own claim as "already looked at this
 * morning" — a silence that looks exactly like a healthy shop. Counting the
 * calls catches it. The rest is named in the route's own comment.
 */
test("the watchman runs inside allSettled, where it cannot take the other jobs down", () => {
  const CRON = readFileSync(
    join(process.cwd(), "src", "app", "api", "cron", "daily", "route.ts"),
    "utf8"
  );
  const called = CRON.match(/runHealthWatchdog\(/g) ?? [];
  assert.equal(
    called.length,
    1,
    "Once a request. Twice means the second run reads the first run's claim as another run's."
  );
  const jobs = CRON.slice(CRON.indexOf("Promise.allSettled"));
  assert.match(
    jobs.slice(0, jobs.indexOf("]")),
    /runHealthWatchdog\(\)/,
    "Inside allSettled, so a broken watchman cannot stop an order email."
  );
  assert.match(
    CRON,
    /There is no behavioural test of this handler/,
    "What is not covered here is written down in the route, not left to be rediscovered."
  );

  // The publisher does not run here, and this is the only place that can hold
  // it. Nothing about it is visible from siteHealth.ts: the watchman reads the
  // record the publisher leaves, and a publisher running in this same request
  // was stamping that record while the watchman read it, with no order between
  // the two. Measured on one world and thirty mornings, the only difference
  // being which finished first: watchman first caught a removed Cloudflare
  // schedule on the eighth day, thirteen emails; publisher first gave thirty
  // green mornings and no email at all. Nothing is lost by its absence — the
  // Worker knocks every fifteen minutes and the GitHub workflow is still there
  // as a spare — and what is gained is that the record means one thing only.
  assert.ok(
    !CRON.includes("publishDuePosts"),
    "The job that writes the measurement must not run in the request that reads it."
  );
  assert.match(
    CRON,
    /draftPostsForNewProducts\(/,
    "Drafting stays: it only writes suggestions into the Studio, and it leaves no mark the watchman reads."
  );
});

/* ─── The query itself, run rather than read ─── */

/**
 * The one measurement no test above could reach, because it is made in GROQ.
 *
 * Everything else in this file judges facts that are handed to it, and for a
 * long time the only thing standing over the query that produces them was a
 * regular expression looking for field names in this file's own source. That
 * is not a test: delete the guard on `scheduledFor` in `lateWaiting`
 * altogether and every one of the tests stayed green, while a batch Kristina
 * dated for next month went back to counting as a batch the site was failing
 * to send — the very first mistake this watchman ever made, and the one the
 * comment above that clause is about.
 *
 * `groq-js` is Sanity's own parser and evaluator, and it is already here as
 * one of `sanity`'s own dependencies. So the query is parsed — a syntax error
 * now fails a test instead of turning into a red email every morning on
 * production — and then run against documents shaped like the real ones.
 */
async function askTheRealQuery(
  documents: Record<string, unknown>[],
  now: Date,
  /**
   * The line before which a booking is too old to be judged by a field that
   * did not exist yet. Overridable because this file's clock is 18 September
   * and the field's own dateline is the day after, so every fixture here would
   * otherwise fall the wrong side of it. The real constant is measured on its
   * own, below.
   */
  kristinaNoticeSince: string = KRISTINA_NOTICE_SINCE
): Promise<Record<string, number>> {
  const answer = await evaluate(parse(HEALTH_QUERY), {
    dataset: documents,
    params: {
      now: now.toISOString(),
      stuckBefore: new Date(now.getTime() - 2 * HOUR).toISOString(),
      reelsBefore: new Date(now.getTime() - 24 * HOUR).toISOString(),
      reelsAbandonedBefore: new Date(now.getTime() - 3 * DAY_MS).toISOString(),
      failuresSince: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
      lateBefore: new Date(now.getTime() - DAY_MS).toISOString(),
      // The watchman's own calendar line: two days, exactly as askTheDatabase
      // works it out. A change to ANSWER_BOOKING_WITHIN_DAYS that this did not
      // follow would show up as a failure here rather than as a customer
      // waiting a month.
      bookingsUnansweredBefore: new Date(now.getTime() - 2 * DAY_MS).toISOString(),
      kristinaNoticeSince,
      todayId: healthAlertDocumentId(now),
    },
  });
  return (await answer.get()) as Record<string, number>;
}

/** A post as Sanity holds it, with the two dates the query cares about. */
function socialPost(over: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: `post-${Math.random().toString(36).slice(2)}`,
    _type: "socialPost",
    status: "approved",
    createdAt: new Date(NOW.getTime() - 20 * DAY_MS).toISOString(),
    _updatedAt: new Date(NOW.getTime() - 20 * DAY_MS).toISOString(),
    ...over,
  };
}

test("the real query counts a post as overdue only once it could have gone out", async () => {
  const datedForNextMonth = socialPost({
    _updatedAt: inDays(-9),
    scheduledFor: inDays(30),
  });
  const approvedAnHourAgo = socialPost({
    _updatedAt: new Date(NOW.getTime() - HOUR).toISOString(),
  });
  const approvedTwoDaysAgo = socialPost({ _updatedAt: inDays(-2) });
  const stillADraft = socialPost({ status: "draft", _updatedAt: inDays(-9) });
  const alreadyOut = socialPost({
    _updatedAt: inDays(-9),
    status: "published",
    publishedAt: inDays(-9),
  });

  const answer = await askTheRealQuery(
    [datedForNextMonth, approvedAnHourAgo, approvedTwoDaysAgo, stillADraft, alreadyOut],
    NOW
  );

  assert.equal(
    answer.lateWaiting,
    1,
    "Only the post approved two days ago. A date in October is a promise, not a failure; an hour is not a day; a draft is nobody's fault; a published post has gone."
  );
  assert.equal(answer.approvedWaiting, 3, "Dated or not, approved is approved.");
  assert.equal(answer.dueWaiting, 2, "The October batch is approved and not due.");
  assert.equal(answer.draftsWaiting, 1);
});

test("the real query ignores the copy of a post that is still being edited", async () => {
  const beingEdited = socialPost({
    _id: "drafts.post-1",
    _updatedAt: inDays(-4),
  });
  const answer = await askTheRealQuery([beingEdited], NOW);
  assert.equal(
    answer.approvedWaiting,
    0,
    "Sanity keeps an unpublished copy under drafts. — counting it doubles every post she touches."
  );
  assert.equal(answer.lateWaiting, 0);
});

test("the real query tells a stuck post from a video Instagram still holds", async () => {
  const stuckWithNothingToResume = socialPost({
    status: "publishing",
    _updatedAt: new Date(NOW.getTime() - 5 * HOUR).toISOString(),
  });
  const slowReel = socialPost({
    status: "publishing",
    igCreationId: "17900000000000000",
    _updatedAt: inDays(-2),
  });
  const abandonedReel = socialPost({
    status: "publishing",
    igCreationId: "17900000000000001",
    _updatedAt: inDays(-5),
  });
  const justStartedPublishing = socialPost({
    status: "publishing",
    _updatedAt: new Date(NOW.getTime() - 20 * 60 * 1000).toISOString(),
  });

  const answer = await askTheRealQuery(
    [stuckWithNothingToResume, slowReel, abandonedReel, justStartedPublishing],
    NOW
  );

  assert.equal(
    answer.stuckPublishing,
    1,
    "A post with a container id is being retried by resumeReels, so it is not abandoned; one twenty minutes old is simply on its way."
  );
  assert.equal(answer.waitingOnInstagram, 2, "Both Reels have been with Instagram over a day.");
  assert.equal(answer.reelsAbandoned, 1, "Only the one past three days will never arrive.");
});

test("the real query only counts failures recent enough to be this morning's news", async () => {
  const yesterday = socialPost({
    status: "failed",
    _updatedAt: inDays(-1),
    lastError: "The aspect ratio is not supported",
  });
  const lastMonth = socialPost({ status: "failed", _updatedAt: inDays(-30), lastError: "old" });
  const answer = (await askTheRealQuery([yesterday, lastMonth], NOW)) as unknown as {
    failedRecently: number;
    lastFailureError: string;
    lastFailureAt: string;
  };
  assert.equal(answer.failedRecently, 1);
  assert.equal(answer.lastFailureError, "The aspect ratio is not supported");
  assert.equal(answer.lastFailureAt, inDays(-1));
});

test("the real query reads this morning's memory off yesterday's record, not today's", async () => {
  const today = {
    _id: healthAlertDocumentId(NOW),
    _type: "siteHealthAlert",
    checkedAt: NOW.toISOString(),
    problems: ["written by an earlier run this morning"],
    emailed: true,
    troubles: [],
    looked: [],
  };
  const yesterday = {
    _id: healthAlertDocumentId(new Date(NOW.getTime() - DAY_MS)),
    _type: "siteHealthAlert",
    checkedAt: inDays(-1),
    problems: ["Stuck posts ×1"],
    emailed: false,
    troubles: [INSTAGRAM_UNREACHABLE],
    looked: ASKED_EVERYTHING,
  };
  const lastWeek = {
    _id: healthAlertDocumentId(new Date(NOW.getTime() - 6 * DAY_MS)),
    _type: "siteHealthAlert",
    checkedAt: inDays(-6),
    problems: ["Instagram renewal"],
    worst: "warn",
    emailed: true,
    troubles: [],
    looked: ASKED_EVERYTHING,
  };

  const answer = (await askTheRealQuery([today, yesterday, lastWeek], NOW)) as unknown as {
    previousLook: { troubles: string[]; problems: string[]; looked: string[] };
    lastEmail: { problems: string[]; looked: string[] };
  };
  assert.deepEqual(
    answer.previousLook.troubles,
    [INSTAGRAM_UNREACHABLE],
    "A re-run this morning must not read its own first pass as yesterday."
  );
  assert.deepEqual(answer.previousLook.looked, ASKED_EVERYTHING);
  assert.deepEqual(
    answer.lastEmail.problems,
    ["Instagram renewal"],
    "Yesterday was written down but sent nothing, so the last email is last week's."
  );
  assert.deepEqual(
    answer.lastEmail.looked,
    ASKED_EVERYTHING,
    "And what that morning could ask comes back with it: an email sent on a morning that could not see the posts is not a clean bill of health for them."
  );
});

/**
 * The publisher's own record, read by the query rather than described.
 *
 * Three dates and a birthday, and they do different jobs — `at` says the
 * schedule is still knocking, `lastSentAt` says anything comes of it,
 * `lastFreeAt` says whether the rules have been letting it try, and
 * `_createdAt` says how long any of that has been observable. Dropping any one
 * of them from the projection leaves the watchman reading `undefined` and
 * drawing the gentlest possible conclusion. None of them was run by anything
 * until this. `_createdAt` in particular is Sanity's, not ours: it is spelled
 * with the underscore, it is not something the publisher writes, and a
 * projection that asked for `createdAt` would come back empty for ever with
 * nothing to say so.
 */
test("the real query reads all of the publisher's dates, and the absence of them", async () => {
  const heartbeat = {
    _id: "publisherHeartbeat",
    _type: "publisherHeartbeat",
    _createdAt: inDays(-40),
    at: inDays(-0.01),
    lastSentAt: inDays(-3),
    lastFreeAt: inDays(-0.02),
    outcome: "held",
    detail: "quiet-hours",
  };
  const answer = (await askTheRealQuery([heartbeat], NOW)) as unknown as {
    publisherPulse: {
      at?: string;
      lastSentAt?: string;
      lastFreeAt?: string;
      outcome?: string;
      detail?: string;
      _createdAt?: string;
    } | null;
  };
  assert.deepEqual(answer.publisherPulse, {
    at: heartbeat.at,
    lastSentAt: heartbeat.lastSentAt,
    lastFreeAt: heartbeat.lastFreeAt,
    _createdAt: heartbeat._createdAt,
    outcome: "held",
    detail: "quiet-hours",
  });

  // A record from before the rules were written down has no lastFreeAt at all,
  // and the watchman has to see that absence rather than a stale date: the
  // first shop to take this deploy has a document that predates the field.
  const beforeTheField = (await askTheRealQuery(
    [
      {
        _id: "publisherHeartbeat",
        _type: "publisherHeartbeat",
        _createdAt: inDays(-40),
        at: inDays(-0.01),
        lastSentAt: inDays(-3),
        outcome: "held",
        detail: "quiet-hours",
      },
    ],
    NOW
  )) as unknown as { publisherPulse: { lastFreeAt?: string | null } };
  assert.equal(
    beforeTheField.publisherPulse.lastFreeAt ?? null,
    null,
    "No date at all, rather than one that would read as the rules letting it through."
  );

  const nobodyKnocking = (await askTheRealQuery(
    [{ _id: "somethingElse", _type: "socialPost", status: "draft" }],
    NOW
  )) as unknown as { publisherPulse: unknown };
  assert.equal(
    nobodyKnocking.publisherPulse,
    null,
    "A shop where the publisher has never run has no record, and that is its own answer."
  );
});

/* ─── The one line that is about a person, measured in GROQ ─── */

/**
 * The check the 5 September incident was written for, run rather than read.
 *
 * Everything above judges a count that a fixture hands it, and for a while
 * that was the whole of the cover this check had: the query itself could be
 * changed to count a document type that does not exist, or to draw its line at
 * thirty days instead of two, and every test in the project stayed green while
 * the watchman went permanently blind. That is not a hypothetical either —
 * both mutations were tried, and both passed.
 *
 * So these run the real HEALTH_QUERY through Sanity's own parser against
 * documents shaped like the real ones. `arrivedAt` is deliberately `createdAt`
 * on some and `_createdAt` on others, because the query coalesces the two and
 * a booking written before that field existed has only the second.
 */
const NOTICE_LINE = "2026-09-01T00:00:00Z";

function bookingDoc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: `booking-${Math.random().toString(36).slice(2)}`,
    _type: "atelierBooking",
    status: "new",
    emailSealed: "sealed:…",
    displayName: "A",
    service: "Alterations",
    createdAt: inDays(-4),
    _createdAt: inDays(-4),
    ...over,
  };
}

function waitingIn(answer: Record<string, number>): string[] {
  return ((answer.bookingsUnanswered ?? []) as unknown as { at: string }[]).map((row) => row.at);
}

test("the real query finds a request that has had no answer, and only once it is old", async () => {
  const waiting = bookingDoc({ _id: "old-one", createdAt: inDays(-4) });
  const justArrived = bookingDoc({ _id: "new-one", createdAt: inDays(-0.5) });

  const answer = await askTheRealQuery([waiting, justArrived], NOW, NOTICE_LINE);
  assert.deepEqual(
    waitingIn(answer),
    [inDays(-4)],
    "Four days is a customer who has gone elsewhere; half a day is a normal morning."
  );
});

test("the real query reads the date off _createdAt when a booking has no createdAt of its own", async () => {
  const older = bookingDoc({ createdAt: undefined, _createdAt: inDays(-6) });
  const answer = await askTheRealQuery([older], NOW, NOTICE_LINE);
  assert.deepEqual(
    waitingIn(answer),
    [inDays(-6)],
    "A booking from before the site stamped its own date is still somebody waiting."
  );
});

/**
 * 🚨 The booking the incident was really about.
 *
 * A customer who picks their own time is written down as "confirmed" in the
 * same request, because the site has just confirmed it to them. Read `status`
 * alone and that booking is indistinguishable from one Kristina answered
 * herself — which is how a fitting sat in the diary for a fortnight with
 * nobody at the atelier knowing it existed. The only honest marker is whether
 * HER email was taken, and that is `kristinaNotifiedAt`.
 */
test("the real query sees a booked slot Kristina was never told about", async () => {
  const neverTold = bookingDoc({
    _id: "atelierBooking-2026-09-22T14:00",
    status: "confirmed",
    slotStart: "2026-09-22T14:00",
    createdAt: inDays(-4),
  });
  const answer = await askTheRealQuery([neverTold], NOW, NOTICE_LINE);
  assert.deepEqual(
    waitingIn(answer),
    [inDays(-4)],
    "Booked, confirmed to the customer, and nobody at the atelier knows. This is the whole point."
  );
});

test("the real query leaves alone a booked slot Kristina was told about", async () => {
  const told = bookingDoc({
    status: "confirmed",
    slotStart: "2026-09-22T14:00",
    kristinaNotifiedAt: inDays(-4),
    createdAt: inDays(-4),
  });
  assert.deepEqual(waitingIn(await askTheRealQuery([told], NOW, NOTICE_LINE)), []);
});

test("the real query does not chase Kristina about a booking she confirmed herself", async () => {
  // No slotStart: this is a request that came in as "new" and that she set to
  // Confirmed in the Studio. There is no kristinaNotifiedAt on it and there
  // never will be — that field is only written by the booking route — so
  // without the slotStart clause every booking she ever answers by hand would
  // be chased for ever.
  const herOwn = bookingDoc({ status: "confirmed", confirmedFor: "Tuesday, 2pm", createdAt: inDays(-9) });
  assert.deepEqual(waitingIn(await askTheRealQuery([herOwn], NOW, NOTICE_LINE)), []);
});

test("the real query counts an answer of any kind as an answer", async () => {
  const declined = bookingDoc({ status: "declined", createdAt: inDays(-9) });
  const completed = bookingDoc({ status: "completed", createdAt: inDays(-9) });
  // Even with a slot on it: she can only have set either of these by hand.
  const slotDone = bookingDoc({
    status: "completed",
    slotStart: "2026-09-10T14:00",
    createdAt: inDays(-9),
  });
  assert.deepEqual(waitingIn(await askTheRealQuery([declined, completed, slotDone], NOW, NOTICE_LINE)), []);
});

test("the real query ignores the copy of a booking that is still being edited", async () => {
  const beingEdited = bookingDoc({ _id: "drafts.booking-1", createdAt: inDays(-4) });
  const published = bookingDoc({ _id: "booking-1", createdAt: inDays(-4) });
  assert.deepEqual(
    waitingIn(await askTheRealQuery([beingEdited, published], NOW, NOTICE_LINE)),
    [inDays(-4)],
    "Sanity keeps an unpublished copy under drafts. — counting it doubles every booking she opens."
  );
});

test("the real query judges no booking by a field that did not exist when it was written", async () => {
  // The dateline itself, with the value that ships. Without it, every slot
  // booking ever taken lights up on the first morning after the deploy — a
  // dozen red rows about fittings that already happened, in the first email
  // the new check ever sends.
  const before = new Date(Date.parse(KRISTINA_NOTICE_SINCE) - 3 * DAY_MS);
  const after = new Date(Date.parse(KRISTINA_NOTICE_SINCE) + 3 * DAY_MS);
  const ancient = bookingDoc({
    status: "confirmed",
    slotStart: "2026-08-20T14:00",
    createdAt: before.toISOString(),
  });
  const modern = bookingDoc({
    status: "confirmed",
    slotStart: "2026-09-30T14:00",
    createdAt: after.toISOString(),
  });
  const morning = new Date(after.getTime() + 5 * DAY_MS);

  assert.deepEqual(
    waitingIn(await askTheRealQuery([ancient, modern], morning)),
    [after.toISOString()],
    "Only the booking taken after the site started stamping that field can be judged by it."
  );
});

test("the real query asks about atelier bookings and nothing else", async () => {
  // The mutation this is here for: point the clause at a document type that
  // does not exist and the watchman goes blind for ever, silently, with every
  // other test in the project still green.
  const notABooking = { _id: "x", _type: "order", status: "new", createdAt: inDays(-9) };
  const booking = bookingDoc({ createdAt: inDays(-9) });
  assert.deepEqual(waitingIn(await askTheRealQuery([notABooking, booking], NOW, NOTICE_LINE)), [
    inDays(-9),
  ]);
});
