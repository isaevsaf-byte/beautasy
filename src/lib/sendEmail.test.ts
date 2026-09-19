import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { refusedTheEmail, sendEmail, SEND_TIMEOUT_MS } from "./sendEmail";

/**
 * The one thing that decides whether an email was sent or only attempted.
 *
 * Every shape below is the real SDK's, read off resend@6's own source rather
 * than remembered. A refusal is `{ data: null, error: { name, message,
 * statusCode } }`, resolved, never thrown; a success is `{ data: { id },
 * error: null }`. The SDK wraps its own fetch, so even a network failure comes
 * back resolved, with a null statusCode. That is why fifteen `try { await
 * resend.emails.send(…) } catch` blocks in this project were catching nothing
 * at all, and why a booking on 5 September was recorded as "Kristina has been
 * emailed" when Kristina had not been emailed.
 */

const REFUSED = {
  data: null,
  error: {
    statusCode: 403,
    name: "validation_error",
    message: "The beautasy.co.uk domain is not verified",
  },
};

const TAKEN = { data: { id: "5bd4e0f2-c2f1-4d69-9a2c-0000000000" }, error: null };

/** What the SDK makes of a request that never reached Resend at all. */
const COULD_NOT_REACH = {
  data: null,
  error: {
    statusCode: null,
    name: "application_error",
    message: "Unable to fetch data. The request could not be resolved.",
  },
};

test("a refusal Resend resolves is not a sent email", async () => {
  await assert.rejects(
    () => sendEmail({ from: "a", to: "b", subject: "c", html: "d" }, async () => REFUSED),
    /The beautasy.co.uk domain is not verified/,
    "The refusal has to come back as a failure, or every caller counts it as a delivery."
  );
});

test("an email Resend does take is not mistaken for a refusal", async () => {
  await sendEmail({ from: "a", to: "b", subject: "c", html: "d" }, async () => TAKEN);
});

test("a request that never reached Resend is a failure too", async () => {
  // statusCode is null here, which is why nothing reads it: the name and the
  // message are the two fields that are always there.
  await assert.rejects(
    () => sendEmail({ from: "a", to: "b", subject: "c", html: "d" }, async () => COULD_NOT_REACH),
    /The request could not be resolved/
  );
});

test("the reason a refusal gives is never allowed to carry an address", async () => {
  // This dataset is public, which is why every address in it is sealed. A
  // reason goes into the Vercel log and into the cron's answer, and a refusal
  // about a recipient is exactly the kind of message that might quote one.
  const reason = refusedTheEmail({
    data: null,
    error: { name: "validation_error", message: "kristina.customer@gmail.com is on the suppression list" },
  });
  assert.equal(reason, "an address is on the suppression list");
});

test("nothing in an answer Resend was happy with reads as a refusal", () => {
  assert.equal(refusedTheEmail(TAKEN), null);
  assert.equal(refusedTheEmail({ data: { id: "x" }, error: null, headers: {} }), null);
  // What `sendEmail` itself hands back, for the callers that pass it on
  assert.equal(refusedTheEmail(undefined), null);
  assert.equal(refusedTheEmail(null), null);
});

test("a refusal with no message at all still says no", () => {
  assert.equal(refusedTheEmail({ data: null, error: { name: "rate_limit_exceeded" } }), "rate_limit_exceeded");
  assert.equal(refusedTheEmail({ data: null, error: {} }), "Resend would not take the email");
});

/* ─── The guard that stops this coming back ─── */

/**
 * Every source file in the repository, not just the ones under src/.
 *
 * It used to walk src/ alone, and the two guards below were worth exactly as
 * much as that boundary: workers/publish-cron and scripts/ are ordinary
 * TypeScript that could import the Resend client tomorrow, and the habit the
 * guards protect against — `resend.emails.send(…)` reads like it works and
 * silently does not — is the same habit in a Worker. Nothing out there sends
 * email today. The point is that the test says so rather than never looking.
 */
const NOT_OURS = new Set(["node_modules", "dist", "out", "coverage"]);

function sourceFiles(from: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    // Anything hidden is somebody else's copy of this repository, not this
    // one: .next is a build, .git is history, and .claude/worktrees holds
    // whole checkouts of older versions of these very files, which is how the
    // first attempt at widening this test managed to fail against eight files
    // that no longer exist.
    if (entry.name.startsWith(".") || NOT_OURS.has(entry.name)) continue;
    const path = join(from, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/**
 * One sender, and a test that fails the day somebody adds a sixteenth.
 *
 * The hole this closes is not a bug in any one file, it is a habit: the
 * obvious way to send an email is `resend.emails.send(…)`, it reads like it
 * works, and it silently does not. Six months from now the next email in this
 * shop will be written by somebody copying the nearest example, and the
 * nearest example will be a call to `sendEmail`. If it is not, this says so
 * here rather than on the morning a customer is lost.
 */
test("every email in the shop goes out through the one sender", () => {
  const root = process.cwd();
  const sender = join(root, "src", "lib", "sendEmail.ts");
  const offenders = sourceFiles(root)
    .filter((file) => file !== sender && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
    .filter((file) => /emails\s*\.\s*send\s*\(/.test(readFileSync(file, "utf8")))
    .map((file) => relative(root, file));

  assert.deepEqual(
    offenders,
    [],
    `These talk to Resend directly, so a refusal will read as a delivery there: ${offenders.join(", ")}. Send through sendEmail in @/lib/sendEmail instead.`
  );
});

test("the one sender is the only place that imports the Resend client", () => {
  // The same rule from the other end. A file that builds its own client is a
  // file one line away from calling it, and `new Resend(...)` used to be
  // written out in nine places, three different ways.
  const root = process.cwd();
  const sender = join(root, "src", "lib", "sendEmail.ts");
  const offenders = sourceFiles(root)
    .filter((file) => file !== sender && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
    .filter((file) => /from\s+["']resend["']/.test(readFileSync(file, "utf8")))
    .map((file) => relative(root, file));

  assert.deepEqual(offenders, [], `Only sendEmail.ts builds the Resend client: ${offenders.join(", ")}`);
});

/**
 * The cap, and the reason it is not left to undici.
 *
 * `emails.send` goes through a bare fetch with no AbortSignal, so with nothing
 * here a socket that opens and goes quiet runs for five minutes, while the
 * daily cron has sixty seconds for everything. That is not a slow morning: the
 * claim on the document goes on BEFORE the send and the release comes after
 * it, so a function Vercel kills mid-flight leaves an order, a booking or a
 * stock alert marked as told for ever — the exact loss the whole change is
 * about, reached more easily than the duplicate the missing cap was guarding
 * against. See SEND_TIMEOUT_MS for the price of the number.
 */
test("a mail service that never answers is given up on rather than waited for", async () => {
  const started = Date.now();
  // The test keeps its own clock as well. Without the cap this send never
  // settles at all, and a test that only waits for a rejection would hang the
  // whole run rather than fail it — which reads as a broken machine instead of
  // a broken guard.
  const answered = sendEmail(
    { from: "a", to: "b", subject: "c", html: "d" },
    () => new Promise(() => {}),
    30
  ).then(
    () => "sent",
    (err: Error) => `refused: ${err.message}`
  );
  const verdict = await Promise.race([
    answered,
    new Promise<string>((resolve) => setTimeout(() => resolve("still waiting"), 3000)),
  ]);
  assert.match(
    verdict,
    /^refused: .*did not answer within/,
    "A send with no end to it has to become a refusal, or it spends the whole morning's budget."
  );
  assert.ok(Date.now() - started < 3000, "And it has to give up quickly, not eventually.");
});

test("the cap is short enough to leave the morning time to write down what it did", () => {
  // src/app/api/cron/daily/route.ts gives the whole run sixty seconds.
  assert.ok(SEND_TIMEOUT_MS > 0 && SEND_TIMEOUT_MS <= 30_000, "Two of these in a row must still fit inside the cron.");
});

test("a slow answer that arrives in time is not turned into a refusal", async () => {
  await sendEmail(
    { from: "a", to: "b", subject: "c", html: "d" },
    () => new Promise((resolve) => setTimeout(() => resolve(TAKEN), 10)),
    500
  );
});

/**
 * 🚨 And the other place an address can leave this shop: the log.
 *
 * `withoutAddresses` above cuts them out of a refusal because the Vercel log
 * is not a safer place for a customer's address than the dataset is — the
 * dataset is public, which is why every address in it is sealed. That reason
 * does not stop at refusals, and two ordinary `console.log` lines in the
 * Stripe webhook were printing whole addresses in the clear beside it.
 *
 * So the rule is the file-wide one: nothing that looks like an address may
 * reach a log unless `maskEmail` has been round it first. Text is fine —
 * "Failed to send welcome email" carries nobody.
 */
test("no address reaches a log without being masked first", () => {
  const root = process.cwd();
  const alreadyOneWay = /^(maskEmail|emailHint|emailFingerprint)$/;
  const offenders: string[] = [];

  for (const file of sourceFiles(root)) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
    const source = readFileSync(file, "utf8");
    for (const call of source.matchAll(/console\.(?:log|info|warn|error)\(([^;]*?)\);/g)) {
      const args = call[1]
        // Anything inside quotes or backticks is prose, not a value
        .replace(/`(?:[^`\\]|\\[\s\S])*`/g, "")
        .replace(/"(?:[^"\\]|\\.)*"/g, "")
        .replace(/'(?:[^'\\]|\\.)*'/g, "")
        // A masked address is the whole point of the exercise
        .replace(/maskEmail\([^()]*\)/g, "");
      for (const name of args.matchAll(/\b[\w$]*[Ee]mail[\w$]*\b/g)) {
        if (alreadyOneWay.test(name[0])) continue;
        offenders.push(`${relative(root, file)}: ${name[0]}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `These print a customer's address into the Vercel log: ${offenders.join(", ")}. Wrap it in maskEmail from @/lib/pii.`
  );
});
