import { test } from "node:test";
import assert from "node:assert/strict";
import { fromThisSite } from "./sameOrigin";

function request(headers: Record<string, string>): Request {
  return new Request("https://www.beautasy.co.uk/api/notify", { method: "POST", headers });
}

test("a Studio button on the live site is let through", () => {
  assert.equal(
    fromThisSite(request({ host: "www.beautasy.co.uk", origin: "https://www.beautasy.co.uk" })),
    true
  );
});

test("a preview deployment's own Studio is let through too", () => {
  assert.equal(
    fromThisSite(
      request({
        host: "beautasy-abc123-isaevsaf-bytes-projects.vercel.app",
        origin: "https://beautasy-abc123-isaevsaf-bytes-projects.vercel.app",
      })
    ),
    true
  );
});

test("a bare curl from anywhere has no origin and is turned away", () => {
  assert.equal(fromThisSite(request({ host: "www.beautasy.co.uk" })), false);
});

test("a page on another site is turned away", () => {
  assert.equal(
    fromThisSite(request({ host: "www.beautasy.co.uk", origin: "https://evil.example" })),
    false
  );
});

test("behind a proxy the forwarded host is the one that counts", () => {
  assert.equal(
    fromThisSite(
      request({
        host: "internal-lb",
        "x-forwarded-host": "www.beautasy.co.uk",
        referer: "https://www.beautasy.co.uk/studio/desk",
      })
    ),
    true
  );
});
