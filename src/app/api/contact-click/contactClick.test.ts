import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "./route";

/**
 * /api/contact-click takes a beacon from the page as the visitor leaves for
 * WhatsApp or the dialler. It is open by nature — any page view can send one
 * — so what it guards is the shape of what it keeps: a tally, nothing else.
 */

const SITE = "https://www.beautasy.co.uk";

function beacon(body: string, origin = SITE, ip = "203.0.113.7"): NextRequest {
  return new NextRequest(`${SITE}/api/contact-click`, {
    method: "POST",
    headers: { host: "www.beautasy.co.uk", origin, "content-type": "text/plain;charset=UTF-8", "x-forwarded-for": ip },
    body,
  });
}

const GOOD = JSON.stringify({ method: "whatsapp", page: "atelier" });

test("a tap from a page on this site is taken, and nothing is said back", async () => {
  const saved = process.env.SANITY_API_WRITE_TOKEN;
  delete process.env.SANITY_API_WRITE_TOKEN;
  try {
    const res = await POST(beacon(GOOD, SITE, "203.0.113.1"));
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "");
  } finally {
    if (saved !== undefined) process.env.SANITY_API_WRITE_TOKEN = saved;
  }
});

test("another site cannot add to the tally", async () => {
  const res = await POST(beacon(GOOD, "https://evil.example", "203.0.113.2"));
  assert.equal(res.status, 403);
});

test("anything but a method and a kind of page is refused", async () => {
  for (const body of [
    "",
    "whatsapp",
    "{",
    JSON.stringify({ method: "whatsapp", page: "/r/ANNA-K7P2" }),
    JSON.stringify({ method: "sms", page: "home" }),
    JSON.stringify({ method: "whatsapp", page: "home", email: "x".repeat(300) }),
  ]) {
    const res = await POST(beacon(body, SITE, "203.0.113.3"));
    assert.equal(res.status, 400, `${body.slice(0, 40)} was accepted`);
  }
});

test("thirty taps an hour from one address, then no more", async () => {
  const saved = process.env.SANITY_API_WRITE_TOKEN;
  delete process.env.SANITY_API_WRITE_TOKEN;
  try {
    for (let i = 0; i < 30; i++) assert.equal((await POST(beacon(GOOD, SITE, "198.51.100.9"))).status, 204);
    assert.equal((await POST(beacon(GOOD, SITE, "198.51.100.9"))).status, 429);
    assert.equal((await POST(beacon(GOOD, SITE, "198.51.100.10"))).status, 204, "someone else is still counted");
  } finally {
    if (saved !== undefined) process.env.SANITY_API_WRITE_TOKEN = saved;
  }
});

test("what is written is the day's tally on Southampton's calendar, made by the shared mutations", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "contact-click", "route.ts"), "utf8");
  assert.match(route, /await sanityWriteClient\.mutate\(contactClickMutations\(localDateOf\(new Date\(\)\), click\)\);/);
  assert.doesNotMatch(route, /clientIp\(req\)[^;]*mutate|userAgent|referer/i, "nothing about the visitor is kept");
});
