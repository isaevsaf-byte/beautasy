import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanityWriteClient } from "./sanity";
import {
  HEARTBEAT_ID,
  PULSE_WRITE_TIMEOUT_MS,
  publishDuePosts,
  pulseOf,
  waitAtMost,
} from "./socialQueue";
import type { PostingHold } from "./postingRules";

/**
 * The publisher's own word that it ran.
 *
 * Everything before this worked out whether the publisher was alive by
 * watching the feed — days of silence first, then whether the feed moved
 * between two mornings. Both readings were defeated by the same thing, because
 * the feed moves for reasons that have nothing to do with the schedule: a post
 * Kristina sends herself with "Post this now", a Reel `resumeReels` pushes
 * through two days late. Measured on the version before this one, with the
 * publisher dead for forty-five days and one post by hand every morning:
 * forty-two approved posts stranded, forty-five green mornings, no email of
 * any kind.
 *
 * So the publisher says so itself, in one document, on every run. Three things
 * have to hold for that to be worth anything, and they are what is tested here:
 * the mark is left even by a run that sent nothing, the date that says
 * "something actually went out" moves only when something actually went out,
 * and a mark that cannot be written never stops a post going out.
 */

const SOURCE = readFileSync(join(process.cwd(), "src", "lib", "socialQueue.ts"), "utf8");

type Written = { document?: Record<string, unknown>; set?: Record<string, unknown> };

/**
 * Stands in for the one Sanity call the heartbeat makes.
 *
 * `publishDuePosts` talks to the module's client directly — the same client
 * five other callers share — so the seam a test can hold is the client itself.
 */
function watchingSanity(commit: () => Promise<unknown> = async () => ({}) ): {
  written: Written[];
  restore: () => void;
} {
  const written: Written[] = [];
  const real = sanityWriteClient.transaction;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sanityWriteClient as any).transaction = () => {
    const mark: Written = {};
    written.push(mark);
    const chain = {
      createIfNotExists(document: Record<string, unknown>) {
        mark.document = document;
        return chain;
      },
      patch(_id: string, build: (p: unknown) => unknown) {
        const patch = {
          set(fields: Record<string, unknown>) {
            mark.set = fields;
            return patch;
          },
        };
        build(patch);
        return chain;
      },
      commit,
    };
    return chain;
  };
  return {
    written,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    restore: () => ((sanityWriteClient as any).transaction = real),
  };
}

/** Runs `work` with a write token and no Instagram, and puts the world back. */
async function withoutInstagram(work: () => Promise<void>): Promise<void> {
  const before = {
    token: process.env.SANITY_API_WRITE_TOKEN,
    ig: process.env.IG_ACCESS_TOKEN,
    meta: process.env.META_ACCESS_TOKEN,
    account: process.env.IG_ACCOUNT_ID,
  };
  process.env.SANITY_API_WRITE_TOKEN = "test-token";
  delete process.env.IG_ACCESS_TOKEN;
  delete process.env.META_ACCESS_TOKEN;
  delete process.env.IG_ACCOUNT_ID;
  try {
    await work();
  } finally {
    for (const [key, value] of [
      ["SANITY_API_WRITE_TOKEN", before.token],
      ["IG_ACCESS_TOKEN", before.ig],
      ["META_ACCESS_TOKEN", before.meta],
      ["IG_ACCOUNT_ID", before.account],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * A run that sends nothing is still a run, and that is the whole point.
 *
 * The question the watchman asks is "is anything still waking you?", not "have
 * you posted lately". A publisher held back by quiet hours, by the daily
 * number, or by an Instagram that is not connected at all is working exactly
 * as it should — and if only sending left a mark, a shop in quiet hours
 * overnight would look identical to a schedule that had stopped.
 */
test("a run that sends nothing still says it ran", async () => {
  const sanity = watchingSanity();
  try {
    await withoutInstagram(async () => {
      const summary = await publishDuePosts(5);
      assert.equal(summary.skipped, "Instagram is not connected");
    });

    assert.equal(sanity.written.length, 1, "One write a run, into one document.");
    assert.deepEqual(sanity.written[0].document, {
      _id: HEARTBEAT_ID,
      _type: "publisherHeartbeat",
    });
    const set = sanity.written[0].set ?? {};
    assert.equal(set.outcome, "skipped");
    assert.equal(set.detail, "Instagram is not connected");
    assert.ok(typeof set.at === "string", "When it ran is the measurement; without it there is none.");
    assert.ok(
      !("lastSentAt" in set),
      "Nothing went out, so the date that means 'something went out' must not move."
    );
  } finally {
    sanity.restore();
  }
});

/**
 * Watching must never cost a post.
 *
 * Publishing is the job. If Sanity will not take the mark — a write token
 * without write rights, a bad minute at Sanity — the run has to finish exactly
 * as it would have done, and the watchman has its own line for a database that
 * refuses writes.
 */
test("a mark that cannot be written does not stop the publisher", async () => {
  const sanity = watchingSanity(async () => {
    throw new Error("Insufficient permissions; permission \"create\" required");
  });
  try {
    await withoutInstagram(async () => {
      const summary = await publishDuePosts(5);
      assert.equal(
        summary.skipped,
        "Instagram is not connected",
        "The run's own answer is unchanged by a heartbeat that failed."
      );
    });
    assert.equal(sanity.written.length, 1, "It was tried, and the failure was swallowed.");
  } finally {
    sanity.restore();
  }
});

/**
 * Nothing Kristina does by hand may leave a mark.
 *
 * This is the choice the whole signal rests on. The Studio's "Post this now"
 * button posts to the same route, with an id, and the route sends that through
 * `publishPostById` — a different function. If the mark were left in the route,
 * or in `publishOne` where both paths meet, then posting by hand would read as
 * the schedule being alive, which is precisely the masking measured over
 * forty-five days. So the assertion is where the call sits: inside
 * `publishDuePosts`, and nowhere that `publishPostById` can reach.
 */
test("posting by hand cannot pass for the schedule still running", () => {
  const pulseAt = SOURCE.indexOf("async function leaveAPulse");
  assert.notEqual(pulseAt, -1, "leaveAPulse has been renamed — update this test");

  const byHand = SOURCE.slice(SOURCE.indexOf("export async function publishPostById"));
  assert.ok(
    !byHand.includes("leaveAPulse("),
    "A post Kristina sends herself must not say the schedule is alive."
  );

  const publishOne = SOURCE.slice(
    SOURCE.indexOf("async function publishOne"),
    SOURCE.indexOf("async function pinIfWanted")
  );
  assert.ok(
    !publishOne.includes("leaveAPulse("),
    "publishOne is where both paths meet, so a mark left there would count the hand-sent ones too."
  );

  const scheduled = SOURCE.slice(
    SOURCE.indexOf("export async function publishDuePosts"),
    SOURCE.indexOf("async function sendWhatIsDue")
  );
  assert.match(scheduled, /leaveAPulse\(/, "The scheduled run is the one that leaves the mark.");
});

/**
 * The date that means "something went out" is the one that must not lie.
 *
 * `at` says the schedule is still knocking; `lastSentAt` says anything comes
 * of it. Setting the second on every run would make a publisher that knocks
 * and sends nothing for ever look perfectly healthy — which is the second of
 * the two breakages the watchman now tells apart.
 */
test("only a run that sent something moves the date that says so", () => {
  const pulse = SOURCE.slice(
    SOURCE.indexOf("async function leaveAPulse"),
    SOURCE.indexOf("export function pulseOf")
  );
  assert.match(
    pulse,
    /\.\.\.\(mark\.sent \? \{ lastSentAt: now \} : \{\}\)/,
    "lastSentAt is written only when the run actually put something on the feed."
  );
  assert.match(
    pulse,
    /\.\.\.\(mark\.free \? \{ lastFreeAt: now \} : \{\}\)/,
    "And lastFreeAt only when the rules let this run through."
  );
  assert.match(
    SOURCE,
    /if \(summary\.published > 0\) return \{ outcome: "published", sent: true, \.\.\.wasFree \}/,
    "And 'actually put something on the feed' is the published count, not the attempt."
  );
});

/**
 * The third date, and the false alarm that bought it.
 *
 * A run the rules held back proves nothing about the publisher, and the
 * watchman needs to know when one last got past them. Kristina's own post
 * counts against the daily number — POSTING_STATE counts everything that
 * reached the feed today — so at the Studio's defaults a post she sends at
 * seven in the morning leaves every run for the rest of that day rightly held,
 * `lastSentAt` still, and nothing wrong anywhere. Measured on the watchman
 * before this: twelve emails over forty-five days, half of them red, at a shop
 * in perfect health.
 *
 * "Free" is the rules and only the rules: a run that never reached them
 * because Instagram is not connected has not been let through either, and
 * writing the date for it would say the pipeline had its chance.
 */
test("a run the rules held back does not claim it was free to send", () => {
  const summary = (over: Partial<Parameters<typeof pulseOf>[0]> = {}) => ({
    published: 0,
    failed: 0,
    posts: [],
    ...over,
  });

  const everyHold: PostingHold[] = ["quiet-hours", "daily-limit", "too-soon", "in-flight"];
  for (const held of everyHold) {
    assert.notEqual(
      pulseOf(summary({ held })).free,
      true,
      `A run held by ${held} was never let near Instagram, so it is not evidence of anything.`
    );
  }
  assert.notEqual(
    pulseOf(summary({ skipped: "Instagram is not connected" })).free,
    true,
    "A run that stopped before the rules were even asked has not been let through by them."
  );

  assert.equal(pulseOf(summary({ published: 1 })).free, true);
  assert.equal(
    pulseOf(summary()).free,
    true,
    "An empty queue means the rules said yes and there was nothing to send — the publisher had its chance."
  );
  assert.equal(
    pulseOf(summary({ failed: 1 })).free,
    true,
    "A post Instagram refused is the clearest chance of all: it got as far as asking."
  );
  assert.notEqual(
    pulseOf(summary({ failed: 1, held: "quiet-hours" })).free,
    true,
    "resumeReels can finish an old post while the rules hold the new ones — that is the old post's chance, not this run's."
  );
});

/**
 * A run that reached Sanity and threw still has to say so.
 *
 * Nothing covered this, and the mutation that deleted the whole `catch` write
 * survived the suite. It matters more than its size: a publisher woken every
 * fifteen minutes that dies on every run leaves no mark at all without it, and
 * "no mark" is the watchman's word for "nothing is waking it" — which sends
 * Kristina to Cloudflare, where the schedule is firing perfectly.
 */
test("a run that fell over still writes down that it happened", async () => {
  const sanity = watchingSanity();
  const realFetch = sanityWriteClient.fetch;
  const before = {
    token: process.env.SANITY_API_WRITE_TOKEN,
    ig: process.env.IG_ACCESS_TOKEN,
    account: process.env.IG_ACCOUNT_ID,
  };
  process.env.SANITY_API_WRITE_TOKEN = "test-token";
  process.env.IG_ACCESS_TOKEN = "test-ig-token";
  process.env.IG_ACCOUNT_ID = "test-account";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sanityWriteClient as any).fetch = async () => {
    throw new Error("The database is not answering");
  };

  try {
    await assert.rejects(
      () => publishDuePosts(5),
      /not answering/,
      "The error still comes out: watching a run must not swallow it."
    );
    assert.equal(sanity.written.length, 1, "One mark, written before the error was let out.");
    const set = sanity.written[0].set ?? {};
    assert.equal(set.outcome, "failed");
    assert.equal(set.detail, "The database is not answering");
    assert.ok(
      !("lastSentAt" in set) && !("lastFreeAt" in set),
      "It got nowhere near sending, and nowhere near the rules either."
    );
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sanityWriteClient as any).fetch = realFetch;
    sanity.restore();
    for (const [key, value] of [
      ["SANITY_API_WRITE_TOKEN", before.token],
      ["IG_ACCESS_TOKEN", before.ig],
      ["IG_ACCOUNT_ID", before.account],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

/**
 * Watching must not cost the run either.
 *
 * This was the one call on the publishing path with no limit on it, and the
 * Sanity client has none of its own. It cannot cost a post — it is made after
 * the post has gone out, and its failure is swallowed — but /api/social/publish
 * has sixty seconds before Vercel kills it and the Worker gives up at ninety,
 * so a mark that hangs turns a run which has already done its job into a red
 * invocation in the Cloudflare dashboard, pointing at the one place where
 * nothing is wrong.
 *
 * The deadline is held here rather than by hanging a real run: a test that
 * waits out the constant proves only that the constant exists, takes three
 * seconds off every run of the suite, and passes just as happily if somebody
 * sets it to half an hour.
 */
test("a mark Sanity will not finish taking is given up on", async () => {
  const started = Date.now();
  assert.equal(
    await waitAtMost(5, new Promise(() => {})),
    null,
    "A write that never answers gives back nothing, rather than never giving back."
  );
  assert.ok(Date.now() - started < 1000, "And it gives it back at the deadline, not later.");

  assert.equal(await waitAtMost(1000, Promise.resolve("written")), "written");

  // A commit that fails after we stopped waiting must not take the process
  // down with it: nothing is left listening for it except the race itself.
  const late = new Promise((_, reject) => setTimeout(() => reject(new Error("too late")), 5));
  assert.equal(await waitAtMost(1, late), null);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.ok(
    PULSE_WRITE_TIMEOUT_MS > 500 && PULSE_WRITE_TIMEOUT_MS <= 10_000,
    "Seconds, not minutes: the point is to leave the rest of the request its budget."
  );
  const pulse = SOURCE.slice(
    SOURCE.indexOf("async function leaveAPulse"),
    SOURCE.indexOf("export function pulseOf")
  );
  assert.match(
    pulse,
    /await waitAtMost\(\s*PULSE_WRITE_TIMEOUT_MS,/,
    "And the mark is the call that is capped — it is the only one here with nothing else limiting it."
  );
});

/**
 * The word a run leaves behind, and why the words are not interchangeable.
 *
 * This is everything the watchman can say about a publisher that is running
 * and producing nothing, so each answer has to be its own. The one that has to
 * be separate above all is a run whose posts Instagram refused: it leaves
 * exactly the same silent feed as a run with an empty queue and means the
 * opposite thing, and folding it into "nothing to send" would put "it found
 * nothing to send" in front of Kristina on a morning when it had found the
 * posts and been turned away.
 */
test("each kind of run leaves its own word, and only one of them claims to have sent", () => {
  const summary = (over: Partial<Parameters<typeof pulseOf>[0]> = {}) => ({
    published: 0,
    failed: 0,
    posts: [],
    ...over,
  });

  assert.deepEqual(pulseOf(summary({ published: 1 })), {
    outcome: "published",
    sent: true,
    free: true,
  });
  assert.deepEqual(pulseOf(summary({ failed: 2 })), {
    outcome: "failed",
    detail: "2 post(s) failed",
    free: true,
  });
  assert.deepEqual(pulseOf(summary({ skipped: "Instagram is not connected" })), {
    outcome: "skipped",
    detail: "Instagram is not connected",
  });
  assert.deepEqual(pulseOf(summary({ held: "quiet-hours" })), {
    outcome: "held",
    detail: "quiet-hours",
  });
  assert.deepEqual(pulseOf(summary()), { outcome: "nothing-due", free: true });

  // A run that both sent one and lost one is a working publisher.
  assert.deepEqual(pulseOf(summary({ published: 1, failed: 1 })), {
    outcome: "published",
    sent: true,
    free: true,
  });
  // A rule holding new posts back does not stop resumeReels finishing an old
  // one, so a run can hold and fail in the same breath. The failure is the one
  // worth saying: "it was waiting for the quiet hours to end" sends her
  // looking at the settings for a post Instagram refused.
  assert.deepEqual(pulseOf(summary({ failed: 1, held: "quiet-hours" })), {
    outcome: "failed",
    detail: "1 post(s) failed",
  });
  for (const answer of [
    summary({ failed: 1 }),
    summary({ skipped: "x" }),
    summary({ held: "too-soon" }),
    summary(),
  ]) {
    assert.notEqual(
      pulseOf(answer).sent,
      true,
      "Only a run that actually put something on the feed may move the date that says so."
    );
  }
});
