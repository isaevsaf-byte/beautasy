import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProjectMember,
  looksLikeAToken,
  MEMBERSHIP_TIMEOUT_MS,
} from "./studioMember";

/**
 * The only real door on the shop's numbers.
 *
 * `fromThisSite` turns away a browser on another page; it does not turn away
 * anybody willing to write one line of curl with an Origin header. This is the
 * check that asks Sanity who is calling, so it is the one whose answer has to
 * be exercised rather than read. Before these tests, replacing `return res.ok`
 * with `return true` left the entire suite green — the existing guard only
 * looked for the call site in the route's source, which stays there whatever
 * the function decides.
 */

/** A string that passes the shape test, so the request is actually attempted. */
const PLAUSIBLE = "sk" + "A".repeat(60);

function answering(status: number): { ask: typeof fetch; calls: Request[] } {
  const calls: Request[] = [];
  const ask = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(String(url), init));
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { ask, calls };
}

test("a token Sanity recognises as a member of this project is let through", async () => {
  const { ask } = answering(200);
  assert.equal(await isProjectMember(PLAUSIBLE, ask), true);
});

test("a token Sanity will not vouch for is turned away", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const { ask } = answering(status);
    assert.equal(
      await isProjectMember(PLAUSIBLE, ask),
      false,
      `Sanity answered ${status}; that is not a member.`
    );
  }
});

test("a question Sanity never answers turns the caller away rather than hanging", async () => {
  // A socket that accepts and says nothing. Without the deadline this inherits
  // undici's five minutes, inside a function Vercel kills at sixty seconds.
  const ask = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })) as unknown as typeof fetch;

  const started = Date.now();
  assert.equal(await isProjectMember(PLAUSIBLE, ask), false);
  assert.ok(
    Date.now() - started < MEMBERSHIP_TIMEOUT_MS + 2_000,
    "The check waited past its own deadline."
  );
});

test("a network that fails outright turns the caller away", async () => {
  const ask = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  assert.equal(await isProjectMember(PLAUSIBLE, ask), false);
});

test("rubbish is turned away without spending a request on it", async () => {
  const { ask, calls } = answering(200);
  for (const rubbish of ["", "short", "a b c", "<script>", "x".repeat(501)]) {
    assert.equal(await isProjectMember(rubbish, ask), false, `accepted: ${rubbish}`);
  }
  assert.equal(
    calls.length,
    0,
    "Sanity was asked about a string that cannot be a token — that is a free, anonymous way to sort stolen tokens."
  );
});

test("the token travels in the Authorization header and nowhere else", async () => {
  const { ask, calls } = answering(200);
  await isProjectMember(PLAUSIBLE, ask);

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.headers.get("Authorization"), `Bearer ${PLAUSIBLE}`);
  assert.ok(
    !call.url.includes(PLAUSIBLE),
    "A token in the URL is a token in every access log between here and Sanity."
  );
});

test("the shape test is loose enough for a real token and tight enough to be worth having", () => {
  assert.equal(looksLikeAToken("sk" + "0aZ_-.".repeat(12)), true);
  assert.equal(looksLikeAToken("sk short"), false);
  assert.equal(looksLikeAToken("sk/../../etc/passwd"), false);
});
