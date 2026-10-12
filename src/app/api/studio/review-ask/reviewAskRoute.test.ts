import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { sealOptional } from "@/lib/pii";
import { BUSINESS } from "@/lib/business";
import { POST } from "./route";

/**
 * «🙏 Попросить отзыв» on the server (12.10.2026), run for real against a
 * stubbed Sanity: the sealed number opened only for a member of the project,
 * a wa.me link to it with her words typed in, and the booking stamped —
 * draft and all, so publishing the draft later cannot wipe the stamp.
 */

const TOKEN = "studio-session-token-0123456789";
// Set before any number is sealed below, and for the whole file
process.env.DATA_SECRET = "a passphrase for these tests only";
const STUDIO_REVIEW = "https://g.page/r/FROM-THE-STUDIO/review";

/** A Sanity holding these bookings, membership included, that keeps what was written */
function world(
  t: TestContext,
  docs: Record<string, unknown>[],
  { studioReview = null as string | null, commitFails = false } = {}
) {
  const written: unknown[] = [];
  const asked: unknown[] = [];
  process.env.SANITY_API_WRITE_TOKEN = "write-token";
  t.after(() => {
    delete process.env.SANITY_API_WRITE_TOKEN;
  });
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.sanity.io/")) {
      asked.push(url);
      return Response.json({ members: [{ id: "kristina", isCurrentUser: true, isRobot: false, role: "administrator" }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  t.mock.method(sanityWriteClient, "fetch", async (_query: string, params: { id: string }) =>
    docs.filter((doc) => doc._id === params.id || doc._id === `drafts.${params.id}`)
  );
  // The Studio's own review link, read by googleReviewUrl
  t.mock.method(sanityClient, "fetch", async () => studioReview);
  t.mock.method(sanityWriteClient, "mutate", async (mutations: unknown) => {
    if (commitFails) throw new Error("Sanity is down");
    written.push(mutations);
    return {};
  });
  return { written, asked };
}

let ip = 0;
const ask = (body: Record<string, unknown>, origin = "https://www.beautasy.co.uk") =>
  POST(
    new NextRequest("https://www.beautasy.co.uk/api/studio/review-ask", {
      method: "POST",
      headers: { origin, host: "www.beautasy.co.uk", "x-forwarded-for": `10.1.0.${++ip}` },
      body: JSON.stringify({ token: TOKEN, ...body }),
    })
  );

function booking(over: Record<string, unknown> = {}) {
  return {
    _id: "atelierBooking-1",
    _type: "atelierBooking",
    status: "completed",
    displayName: "Anna",
    service: "Repairs",
    phoneSealed: sealOptional("07700 900123"),
    ...over,
  };
}

test("a finished booking gives a WhatsApp link to her number, with the ask typed in, and is stamped", async (t) => {
  const { written } = world(t, [booking()]);
  const res = await ask({ id: "drafts.atelierBooking-1" });
  const reply = await res.json();
  assert.equal(res.status, 200, JSON.stringify(reply));
  assert.match(reply.text, /^Hi Anna! It was lovely working on your repairs/);
  assert.ok(reply.text.includes(BUSINESS.googleReviewUrl), "no link in the Studio: the one the site knows");
  assert.equal(reply.url, `https://wa.me/447700900123?text=${encodeURIComponent(reply.text)}`);
  assert.ok(!Number.isNaN(Date.parse(reply.askedAt)));
  assert.deepEqual(written, [[{ patch: { id: "atelierBooking-1", set: { reviewAskedAt: reply.askedAt } } }]]);
});

test("the review link pasted into the Studio comes before the one in the code", async (t) => {
  world(t, [booking()], { studioReview: STUDIO_REVIEW });
  const reply = await (await ask({ id: "atelierBooking-1" })).json();
  assert.ok(reply.text.includes(STUDIO_REVIEW));
  assert.ok(!reply.text.includes(BUSINESS.googleReviewUrl));
});

test("a draft open in the Studio is stamped as well, so publishing it cannot wipe the stamp", async (t) => {
  const { written } = world(t, [booking(), booking({ _id: "drafts.atelierBooking-1", replyNote: "typing…" })]);
  const reply = await (await ask({ id: "atelierBooking-1" })).json();
  assert.deepEqual(written, [
    [
      { patch: { id: "atelierBooking-1", set: { reviewAskedAt: reply.askedAt } } },
      { patch: { id: "drafts.atelierBooking-1", set: { reviewAskedAt: reply.askedAt } } },
    ],
  ]);
});

test("no number WhatsApp can take: the words to copy, a Russian reason, and no stamp", async (t) => {
  const { written } = world(t, [booking({ phoneSealed: undefined }), booking({ _id: "atelierBooking-2", phoneSealed: sealOptional("call me") })]);
  const none = await ask({ id: "atelierBooking-1" });
  assert.equal(none.status, 200);
  const noneReply = await none.json();
  assert.equal(noneReply.url, undefined);
  assert.match(noneReply.text, /^Hi Anna!/);
  assert.match(noneReply.error, /нет телефона.*Скопируйте текст/);
  const odd = await (await ask({ id: "atelierBooking-2" })).json();
  assert.match(odd.error, /WhatsApp его не примет/);
  assert.deepEqual(written, []);
});

test("refused, and nothing opened or written: a stranger, an outsider's token, a job not finished, a booking gone", async (t) => {
  const { written, asked } = world(t, [booking({ status: "confirmed" })]);
  assert.equal((await ask({ id: "atelierBooking-1" }, "https://evil.example")).status, 403);
  assert.equal(asked.length, 0, "a forged origin is turned away before Sanity is asked anything");
  assert.equal((await ask({ id: "atelierBooking-1", token: "short" })).status, 401);
  assert.equal((await ask({ id: "" })).status, 400);
  const early = await ask({ id: "atelierBooking-1" });
  assert.equal(early.status, 409);
  assert.match((await early.json()).error, /Работа готова/);
  assert.equal((await ask({ id: "atelierBooking-missing" })).status, 404);
  assert.deepEqual(written, []);
});

test("the stamp failing still gives her the link: only the reminder that she asked is lost", async (t) => {
  world(t, [booking()], { commitFails: true });
  const res = await ask({ id: "atelierBooking-1" });
  assert.equal(res.status, 200);
  assert.match((await res.json()).url, /^https:\/\/wa\.me\/447700900123\?text=/);
});
