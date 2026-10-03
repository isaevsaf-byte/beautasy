import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isProjectMember,
  looksLikeAToken,
  mayUseStudioRoutes,
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
 *
 * And "Sanity answered 200" was itself too generous: the project's robot
 * tokens get 200 too. The site's own editor token and a read-only CI token
 * both passed every /api/studio/* door. Now the answer is read for who is
 * asking, and only a person with an editing role is let through.
 */

/** A string that passes the shape test, so the request is actually attempted. */
const PLAUSIBLE = "sk" + "A".repeat(60);

/** Members as Sanity's GET /projects/<id> lists them. */
const KRISTINA = { id: "pKristina", isRobot: false, roles: [{ name: "administrator", title: "Administrator" }] };
const HELPER = { id: "pHelper", isRobot: false, roles: [{ name: "editor", title: "Editor" }] };
const LOOKER = { id: "pLooker", isRobot: false, roles: [{ name: "viewer", title: "Viewer" }] };
const SITE_ROBOT = { id: "rSite", isRobot: true, roles: [{ name: "editor", title: "Editor" }] };
const CI_ROBOT = { id: "rCi", isRobot: true, roles: [{ name: "viewer", title: "Viewer" }] };

function project(): { id: string; members: Record<string, unknown>[] } {
  return { id: "5uun6fw6", members: [KRISTINA, HELPER, LOOKER, SITE_ROBOT, CI_ROBOT].map((m) => ({ ...m })) };
}

/** The project's member list with `caller` marked as the one asking. */
function projectAskedBy(caller: { id: string }) {
  const body = project();
  for (const member of body.members) member.isCurrentUser = member.id === caller.id;
  return body;
}

/**
 * A pretend Sanity: `answers` maps the end of a URL to [status, body]. Every
 * question is recorded, so a test can say what was asked and how.
 */
function sanity(answers: Record<string, [number, unknown]>): { ask: typeof fetch; calls: Request[] } {
  const calls: Request[] = [];
  const ask = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(String(url), init));
    const key = Object.keys(answers).find((end) => String(url).endsWith(end));
    if (!key) return new Response(null, { status: 404 });
    const [status, body] = answers[key];
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { ask, calls };
}

const PROJECT = "/projects/5uun6fw6";

test("Kristina, an administrator, is let through", async () => {
  const { ask } = sanity({ [PROJECT]: [200, projectAskedBy(KRISTINA)] });
  assert.equal(await isProjectMember(PLAUSIBLE, ask), true);
});

test("a person who edits the content is let through too", async () => {
  const { ask } = sanity({ [PROJECT]: [200, projectAskedBy(HELPER)] });
  assert.equal(await isProjectMember(PLAUSIBLE, ask), true);
});

test("a robot token is turned away, though Sanity answers 200 for it", async () => {
  for (const robot of [SITE_ROBOT, CI_ROBOT]) {
    const { ask } = sanity({ [PROJECT]: [200, projectAskedBy(robot)] });
    assert.equal(
      await isProjectMember(PLAUSIBLE, ask),
      false,
      `${robot.id} passed: a token from CI or the server would open every sealed contact.`
    );
  }
});

test("a member who can only look is turned away", async () => {
  const { ask } = sanity({ [PROJECT]: [200, projectAskedBy(LOOKER)] });
  assert.equal(await isProjectMember(PLAUSIBLE, ask), false);
});

test("a member whose entry does not say it is human is not assumed to be", () => {
  assert.equal(mayUseStudioRoutes({ roles: [{ name: "administrator" }] }), false);
  assert.equal(mayUseStudioRoutes({ isRobot: "false", roles: [{ name: "administrator" }] }), false);
  assert.equal(mayUseStudioRoutes({ isRobot: false, roles: [] }), false);
  assert.equal(mayUseStudioRoutes({ isRobot: false }), false);
  assert.equal(mayUseStudioRoutes(null), false);
  // Both spellings Sanity has used for a role are read
  assert.equal(mayUseStudioRoutes({ isRobot: false, roles: ["editor"] }), true);
  assert.equal(mayUseStudioRoutes({ isRobot: false, role: "administrator" }), true);
});

test("an answer that does not mark the caller is settled by asking who the token belongs to", async () => {
  const unmarked = project();
  const helper = sanity({ [PROJECT]: [200, unmarked], "/users/me": [200, { id: HELPER.id, provider: "google" }] });
  assert.equal(await isProjectMember(PLAUSIBLE, helper.ask), true);
  assert.equal(helper.calls.length, 2);

  const robot = sanity({ [PROJECT]: [200, unmarked], "/users/me": [200, { id: CI_ROBOT.id, provider: "sanity-token" }] });
  assert.equal(await isProjectMember(PLAUSIBLE, robot.ask), false, "the CI token is a robot however it is found");

  const stranger = sanity({ [PROJECT]: [200, unmarked], "/users/me": [200, { id: "pSomeoneElse" }] });
  assert.equal(await isProjectMember(PLAUSIBLE, stranger.ask), false, "not on this project's list");

  const silent = sanity({ [PROJECT]: [200, unmarked], "/users/me": [401, { error: "Unauthorized" }] });
  assert.equal(await isProjectMember(PLAUSIBLE, silent.ask), false);

  const nobody = sanity({ [PROJECT]: [200, unmarked], "/users/me": [200, {}] });
  assert.equal(await isProjectMember(PLAUSIBLE, nobody.ask), false);
});

test("a 200 that is not a project is not a member", async () => {
  for (const body of [undefined, null, {}, { members: "everyone" }, { members: [] }, []]) {
    const { ask } = sanity({ [PROJECT]: [200, body], "/users/me": [200, { id: KRISTINA.id }] });
    assert.equal(await isProjectMember(PLAUSIBLE, ask), false, `accepted ${JSON.stringify(body)}`);
  }
});

test("a token Sanity will not vouch for is turned away", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const { ask, calls } = sanity({ [PROJECT]: [status, projectAskedBy(KRISTINA)] });
    assert.equal(
      await isProjectMember(PLAUSIBLE, ask),
      false,
      `Sanity answered ${status}; that is not a member.`
    );
    assert.equal(calls.length, 1, "a refusal is the answer; nothing more is asked");
  }
});

test("a question Sanity never answers turns the caller away rather than hanging", async () => {
  // A socket that accepts and says nothing. Without the deadline this inherits
  // undici's five minutes, inside a function Vercel kills at sixty seconds.
  const ask = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })) as unknown as typeof fetch;

  // A real socket keeps the process alive while it waits; this fake holds
  // nothing, and the deadline's own timer does not count (AbortSignal.timeout
  // is unref'd). On Node 22 — what CI runs — the test runner then found an
  // empty event loop, cancelled this test and the four after it, and CI had
  // been red since 19 September with every test passing locally on Node 24.
  const keepAlive = setInterval(() => {}, 1_000);
  const started = Date.now();
  try {
    assert.equal(await isProjectMember(PLAUSIBLE, ask), false);
  } finally {
    clearInterval(keepAlive);
  }
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
  const { ask, calls } = sanity({ [PROJECT]: [200, projectAskedBy(KRISTINA)] });
  for (const rubbish of ["", "short", "a b c", "<script>", "x".repeat(501)]) {
    assert.equal(await isProjectMember(rubbish, ask), false, `accepted: ${rubbish}`);
  }
  assert.equal(
    calls.length,
    0,
    "Sanity was asked about a string that cannot be a token — that is a free, anonymous way to sort stolen tokens."
  );
});

test("the token travels in the Authorization header and nowhere else, on every question", async () => {
  const { ask, calls } = sanity({ [PROJECT]: [200, project()], "/users/me": [200, { id: KRISTINA.id }] });
  assert.equal(await isProjectMember(PLAUSIBLE, ask), true);

  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith(PROJECT));
  assert.ok(calls[1].url.endsWith("/users/me"));
  for (const call of calls) {
    assert.ok(call.url.startsWith("https://api.sanity.io/"), call.url);
    assert.equal(call.headers.get("Authorization"), `Bearer ${PLAUSIBLE}`);
    assert.ok(
      !call.url.includes(PLAUSIBLE),
      "A token in the URL is a token in every access log between here and Sanity."
    );
  }
});

test("the shape test is loose enough for a real token and tight enough to be worth having", () => {
  assert.equal(looksLikeAToken("sk" + "0aZ_-.".repeat(12)), true);
  assert.equal(looksLikeAToken("sk short"), false);
  assert.equal(looksLikeAToken("sk/../../etc/passwd"), false);
});
