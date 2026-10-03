import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST as notify } from "../notify/route";
import { POST as generate } from "./generate/route";
import { POST as publish } from "./publish/route";
import { GET as status } from "./status/route";

/**
 * The four doors the Studio's buttons knock on: send the emails due now,
 * draft posts, post one now, and say which Instagram account is connected.
 *
 * They used to check only that the request came from a page on this site —
 * an Origin header, which is one line of curl. Now each asks Sanity who is
 * calling, with the Studio's own session token, the way /api/studio/diary
 * does: a person who edits this project gets in, and nobody else.
 *
 * These call the routes themselves. Sanity is a pretend one, put in place of
 * fetch, so a test can say what Sanity answers and count what was asked; and
 * every way past the door would reach for the network, so "nothing was asked
 * except the membership question" is how a test sees the door held.
 */

const SITE = "https://www.beautasy.co.uk";
const TOKEN = "sk" + "B".repeat(60);

/** What the pretend Sanity says about TOKEN: a person who edits, or the site's own robot. */
type Who = "editor" | "robot";

function pretendSanity(who: Who): { asked: string[]; restore: () => void } {
  const asked: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const address = String(url instanceof Request ? url.url : url);
    asked.push(address);
    if (address.startsWith("https://api.sanity.io/v2021-06-07/projects/")) {
      return Response.json({
        members: [{ id: "p1", isCurrentUser: true, isRobot: who === "robot", roles: [{ name: "editor" }] }],
      });
    }
    // Anything past the door: refused, so a test that gets this far fails loudly rather than posting
    return new Response("not in this test", { status: 599 });
  }) as typeof fetch;
  return { asked, restore: () => void (globalThis.fetch = real) };
}

function fromStudio(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new NextRequest(`${SITE}${path}`, {
    method: init.method ?? "POST",
    headers: { host: "www.beautasy.co.uk", origin: SITE, "content-type": "application/json", ...init.headers },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

const POSTS: [string, (req: NextRequest) => Promise<Response>, Record<string, unknown>][] = [
  ["/api/notify", notify, {}],
  ["/api/social/generate", generate, {}],
  ["/api/social/publish", publish, { id: "socialPost-1" }],
];

test("a page on this site with no Studio session is turned away before anything is done", async () => {
  for (const [path, handler, body] of POSTS) {
    const sanity = pretendSanity("editor");
    try {
      const res = await handler(fromStudio(path, { body }));
      assert.equal(res.status, 401, `${path} let a forged Origin through`);
      assert.deepEqual(sanity.asked, [], `${path} reached out without a token at all`);
      const said = (await res.json()) as { error?: string };
      assert.match(said.error ?? "", /сессию Studio/, `${path} answers the Studio in Russian`);
    } finally {
      sanity.restore();
    }
  }
});

test("a robot's token is turned away, though Sanity knows it", async () => {
  for (const [path, handler, body] of POSTS) {
    const sanity = pretendSanity("robot");
    try {
      const res = await handler(fromStudio(path, { body: { ...body, token: TOKEN } }));
      assert.equal(res.status, 401, `${path} opened for a robot token`);
      assert.equal(sanity.asked.length, 1, `${path} did more than ask who was calling`);
    } finally {
      sanity.restore();
    }
  }
});

test("someone who edits the project is let past the door", async () => {
  // Past the door each route goes to work, and the pretend network refuses
  // everything after the membership question; what is checked here is only
  // that the door opened, i.e. something beyond it was attempted.
  for (const [path, handler, body] of POSTS) {
    const sanity = pretendSanity("editor");
    try {
      const outcome = await handler(fromStudio(path, { body: { ...body, token: TOKEN } })).then(
        (res) => res.status,
        () => "went to work and met the pretend network"
      );
      assert.ok(sanity.asked[0]?.startsWith("https://api.sanity.io/v2021-06-07/projects/"), `${path} never asked Sanity`);
      assert.ok(outcome !== 401 && outcome !== 403, `${path} turned a member away (${outcome})`);
    } finally {
      sanity.restore();
    }
  }
});

test("a request from another site is turned away whatever it carries", async () => {
  for (const [path, handler, body] of POSTS) {
    const sanity = pretendSanity("editor");
    try {
      const res = await handler(fromStudio(path, { body: { ...body, token: TOKEN }, headers: { origin: "https://evil.example" } }));
      assert.equal(res.status, 403, path);
      assert.deepEqual(sanity.asked, []);
    } finally {
      sanity.restore();
    }
  }
});

test("which Instagram account is connected is told to a member or the schedule, not to a forged Origin", async () => {
  const sanity = pretendSanity("robot");
  try {
    const bare = await status(fromStudio("/api/social/status", { method: "GET" }));
    assert.equal(bare.status, 403, "a page on this site with no session");
    const robot = await status(fromStudio("/api/social/status", { method: "GET", headers: { authorization: `Bearer ${TOKEN}` } }));
    assert.equal(robot.status, 403, "a robot token");
    assert.equal(sanity.asked.length, 1, "only the membership question was asked");
  } finally {
    sanity.restore();
  }
});

test("the schedule's secret still opens publish and status, so the Worker keeps posting", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), "src", "app", "api", "social", ...p), "utf8");
  const publishSource = read("publish", "route.ts");
  const secret = publishSource.indexOf("Bearer ${process.env.CRON_SECRET}");
  const member = publishSource.indexOf("await isProjectMember(token)");
  assert.ok(secret !== -1 && member !== -1);
  assert.match(publishSource, /if \(!authorised\) \{[\s\S]*await isProjectMember\(token\)[\s\S]*\n {2}\}\n/, "the member check is for callers without the secret");
  assert.match(read("status", "route.ts"), /const byMachine = !!process\.env\.CRON_SECRET && bearer === process\.env\.CRON_SECRET;/);
});

test("the Studio's buttons send their session with the request", () => {
  const read = (...p: string[]) => readFileSync(join(process.cwd(), "src", "sanity", ...p), "utf8");
  const notifyButton = read("notifyAction.ts");
  assert.match(notifyButton, /const token = studioToken\(client\.config\(\)\.token\);/);
  assert.match(notifyButton, /fetch\("\/api\/notify", \{[\s\S]*body: JSON\.stringify\(\{ token \}\)/);
  assert.match(notifyButton, /if \(!res\.ok\) \{/, "a refusal is not reported as 'nothing to send'");

  const publishButton = read("socialActions.ts");
  assert.match(publishButton, /const token = studioToken\(client\.config\(\)\.token\);/);
  assert.match(publishButton, /body: JSON\.stringify\(\{ id: publishedIdOf\(props\.id\), token \}\)/);
});
