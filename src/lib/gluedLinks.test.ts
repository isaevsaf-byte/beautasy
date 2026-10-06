import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import nextConfig from "../../next.config";
import { gluedLinkTarget } from "./gluedLinks";

/**
 * Links glued to the word after them. Measured in Vercel's counter for
 * September: /atelierFeel (6 visitors, all from a Facebook post) and
 * /atelierПишите (1) — every one a "page not found".
 */

const ROOT = resolve(__dirname, "..", "..");

test("a link glued to the next word goes to the page it meant", () => {
  const cases: [string, string][] = [
    ["/atelierFeel", "/atelier"],
    ["/atelier%D0%9F%D0%B8%D1%88%D0%B8%D1%82%D0%B5", "/atelier"], // /atelierПишите, as the browser sends it
    ["/atelierПишите", "/atelier"],
    ["/atelier%20Feel", "/atelier"],
    ["/alterationsThanks", "/alterations"],
    ["/reviewsLove", "/reviews"],
    ["/shopNow", "/shop"],
    ["/workX", "/work"],
    ["/contactMe", "/contact"],
    ["/referA", "/refer"],
  ];
  for (const [path, page] of cases) assert.equal(gluedLinkTarget(path), page, path);
});

test("real addresses, and pages that may come later, are left alone", () => {
  for (const path of [
    "/atelier",
    "/reviews",
    "/review", // the short link to the form
    "/review/abc123",
    "/shop/lingerie",
    "/shop/the-pearl-blossom-thong",
    "/alterations/zip-replacement-southampton",
    "/atelier-booking",
    "/ateliers",
    "/workshops", // a page that may exist one day must not be sent to /work
    "/api/atelier-booking",
    "/studio",
    "/",
  ]) {
    assert.equal(gluedLinkTarget(path), null, path);
  }
});

test("the middleware sends glued links on before anything else, and /sanity leads to the Studio", async () => {
  const middleware = readFileSync(join(ROOT, "src/middleware.ts"), "utf8");
  assert.match(middleware, /const meant = gluedLinkTarget\(req\.nextUrl\.pathname\);/);
  assert.match(middleware, /NextResponse\.redirect\(url, 307\)/);
  assert.ok(
    middleware.indexOf("gluedLinkTarget(req") < middleware.indexOf("return auth(req, event)"),
    "the glued link is answered before sign-in looks at the request"
  );
  const redirects = await nextConfig.redirects!();
  assert.ok(redirects.some((r) => r.source === "/sanity" && r.destination === "/studio"));
  // Matching in next.config.ts ignores case, which is why the glued rule is not there
  assert.ok(!redirects.some((r) => /atelier\(/.test(r.source)));
});
