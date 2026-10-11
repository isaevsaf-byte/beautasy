import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { PENDING_ONE_QUERY } from "@/lib/bookingEmails";
import { POST } from "./route";

/**
 * «✓ Работа готова» on the server (11.10.2026), run for real against a
 * stubbed Sanity: one write, against the version Kristina was looking at,
 * with the status and the label together; then this booking's thank-you,
 * and nobody else's.
 */

const TOKEN = "studio-session-token-0123456789";

/** A patch as the real client serialises it and sends it to Sanity */
interface Written {
  id: string;
  ifRevisionID?: string;
  set?: Record<string, unknown>;
  unset?: string[];
}

/** A Sanity that answers for one booking, membership included, and keeps what was written */
function world(t: TestContext, doc: Record<string, unknown> | null, { commitFails = 0 }: { commitFails?: number } = {}) {
  const written: Written[] = [];
  const fetched: { query: string; params: unknown }[] = [];
  process.env.SANITY_API_WRITE_TOKEN = "write-token";
  process.env.RESEND_API_KEY = "resend-key";
  t.after(() => {
    delete process.env.SANITY_API_WRITE_TOKEN;
    delete process.env.RESEND_API_KEY;
  });
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.sanity.io/")) {
      return Response.json({ members: [{ id: "kristina", isCurrentUser: true, isRobot: false, role: "administrator" }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  t.mock.method(sanityWriteClient, "getDocument", async (id: string) => (doc && doc._id === id ? doc : undefined));
  t.mock.method(sanityWriteClient, "fetch", async (query: string, params: unknown) => {
    fetched.push({ query, params });
    return [];
  });
  // The real patch builder, and only the send stubbed: a builder written for
  // the test once hid that a second .unset() replaces the first
  t.mock.method(sanityWriteClient, "mutate", async (mutation: { patch: Written }) => {
    if (commitFails) throw Object.assign(new Error("revision mismatch"), { statusCode: commitFails });
    written.push(mutation.patch);
    return {};
  });
  return { written, fetched };
}

let ip = 0;
const done = (body: Record<string, unknown>, origin = "https://www.beautasy.co.uk") =>
  POST(
    new NextRequest("https://www.beautasy.co.uk/api/studio/done", {
      method: "POST",
      headers: { origin, host: "www.beautasy.co.uk", "x-forwarded-for": `10.0.0.${++ip}` },
      body: JSON.stringify({ token: TOKEN, ...body }),
    })
  );

const booking = {
  _id: "atelierBooking-1",
  _rev: "rev-1",
  _type: "atelierBooking",
  status: "confirmed",
  emailSealed: "sealed",
  replyNote: "Please bring the shoes.",
};

test("marked done with its label in one write, against the version she saw, and her thank-you sent alone", async (t) => {
  const { written, fetched } = world(t, booking);
  const res = await done({ id: "drafts.atelierBooking-1", rev: "rev-1", lines: [{ phrase: "hem", a: 4, b: 2 }], clearNote: true });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.deepEqual(await res.json(), { ok: true, emailed: false, hadEmail: true });
  assert.deepEqual(written, [
    {
      id: "atelierBooking-1",
      ifRevisionID: "rev-1",
      set: { status: "completed", careLabel: [{ _key: "line1", _type: "careLine", phrase: "hem", a: 4, b: 2 }] },
      unset: ["replyNote"],
    },
  ]);
  // The thank-you is this booking's alone, asked for on the queue's own terms
  const asked = fetched.filter((f) => f.query === PENDING_ONE_QUERY);
  assert.deepEqual(asked.map((f) => f.params), [{ id: "atelierBooking-1" }]);
  assert.ok(!fetched.some((f) => /\$limit/.test(f.query)), "never the whole queue");
});

test("no line is an answer too: the label then is the service's own, an old one is taken off, and so is the note she ticked", async (t) => {
  const { written } = world(t, { ...booking, status: "completed" });
  assert.equal((await done({ id: "atelierBooking-1", lines: [], clearNote: true })).status, 200);
  assert.deepEqual(written[0].set, { status: "completed" });
  assert.deepEqual(written[0].unset, ["replyNote", "careLabel"], "both, in one unset");
  // A note she keeps is kept, and nothing is unset for nothing
  assert.equal((await done({ id: "atelierBooking-1", lines: [], clearNote: false })).status, 200);
  assert.deepEqual(written[1].unset, ["careLabel"]);
  assert.equal((await done({ id: "atelierBooking-1", lines: [{ phrase: "taper" }], clearNote: false })).status, 200);
  assert.equal(written[2].unset, undefined);
});

test("refused, and nothing written: a stranger, a thanked booking, a changed one, a broken line", async (t) => {
  const { written } = world(t, booking);
  assert.equal((await done({ id: "atelierBooking-1", lines: [] }, "https://evil.example")).status, 403);
  assert.equal((await done({ id: "atelierBooking-1", token: "short", lines: [] })).status, 401);
  const stale = await done({ id: "atelierBooking-1", rev: "rev-0", lines: [] });
  assert.equal(stale.status, 409);
  assert.match((await stale.json()).error, /изменили/);
  const broken = await done({ id: "atelierBooking-1", lines: [{ phrase: "hem" }] });
  assert.equal(broken.status, 400);
  assert.match((await broken.json()).error, /Укажите/);
  assert.equal((await done({ id: "", lines: [] })).status, 400);
  assert.equal((await done({ id: "atelierBooking-missing", lines: [] })).status, 409);
  assert.deepEqual(written, []);
});

test("a finished booking with no email has no thank-you to carry a label: refused", async (t) => {
  const { written } = world(t, { ...booking, status: "completed", emailSealed: undefined });
  const res = await done({ id: "atelierBooking-1", lines: [{ phrase: "taper" }] });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /эл\. почты в ней нет/);
  assert.deepEqual(written, []);
});

test("a booking already thanked keeps its email as it went", async (t) => {
  const { written } = world(t, { ...booking, status: "completed", notifiedStatus: "completed" });
  const res = await done({ id: "atelierBooking-1", lines: [{ phrase: "taper" }] });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /уже ушло/);
  assert.deepEqual(written, []);
});

test("changed while she chose: Sanity refuses the write, and she is told to open it again", async (t) => {
  world(t, booking, { commitFails: 409 });
  const res = await done({ id: "atelierBooking-1", rev: "rev-1", lines: [] });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Пока вы выбирали бирку/);
});

test("no email in the request: done, and nothing sent", async (t) => {
  const { written, fetched } = world(t, { ...booking, emailSealed: undefined });
  const res = await done({ id: "atelierBooking-1", lines: [{ phrase: "zip" }] });
  assert.deepEqual(await res.json(), { ok: true, emailed: false, hadEmail: false });
  assert.equal(written.length, 1);
  assert.ok(!fetched.some((f) => f.query === PENDING_ONE_QUERY));
});
