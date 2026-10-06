import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LOCAL_SERVICES } from "./localServices";
import { GROUP_CODE_LENGTH, SHORT_WORDS, groupCode, groupShortLink, shortLinkTarget } from "./shortLinks";
import { groupPost } from "./groupPosts";

/**
 * Short links in Facebook group posts: www.beautasy.co.uk/g/prom/k3x instead
 * of 140 characters of address and tags.
 */

const ROOT = resolve(__dirname, "..", "..");
const at = (target: string | null) => new URL(target!, "https://www.beautasy.co.uk");

test("every service page has exactly one short word, and every word names a page", () => {
  const slugs = LOCAL_SERVICES.map((s) => s.slug).sort();
  assert.deepEqual(Object.values(SHORT_WORDS).sort(), slugs, "a page without a word gets the long link");
  for (const word of Object.keys(SHORT_WORDS)) assert.match(word, /^[a-z]{2,8}$/);
});

test("a group's code is three characters, the same every time, and differs between groups", () => {
  const code = groupCode("abc123-facebook-group");
  assert.equal(code.length, GROUP_CODE_LENGTH);
  assert.match(code, /^[a-km-np-z2-9]+$/, "no 0/o or 1/l to mix up");
  assert.equal(groupCode("abc123-facebook-group"), code);
  const codes = new Set(Array.from({ length: 15 }, (_, i) => groupCode(`group-${i}-a1b2c3`)));
  assert.equal(codes.size, 15, "fifteen groups, fifteen codes");
});

test("the short link is the word and the code, with no scheme in the text and the full one to click", () => {
  const link = groupShortLink("prom-and-evening-dress-southampton", "group-id");
  assert.ok(link);
  assert.equal(link.shown, `www.beautasy.co.uk/g/prom/${groupCode("group-id")}`);
  assert.equal(link.href, `https://${link.shown}`);
  assert.ok(link.shown.length <= 30, "short is the point");
  assert.equal(groupShortLink("no-such-page", "group-id"), null);
});

test("a short link opens the service page with the group's tags", () => {
  const url = at(shortLinkTarget("/g/zip/k3x"));
  assert.equal(url.pathname, "/alterations/zip-replacement-southampton");
  assert.equal(url.searchParams.get("utm_source"), "facebook");
  assert.equal(url.searchParams.get("utm_medium"), "group");
  assert.equal(url.searchParams.get("utm_campaign"), "fb-k3x");
});

test("whatever is glued after the link stays out of it", () => {
  for (const path of ["/g/zip/k3xFeel", "/g/zip/k3x%D0%9F%D0%B8%D1%88%D0%B8%D1%82%D0%B5", "/g/zip/k3x%20Feel", "/g/zip/k3x%F0%9F%A4%8D", "/g/zip/k3xand"]) {
    const url = at(shortLinkTarget(path));
    assert.equal(url.pathname, "/alterations/zip-replacement-southampton", path);
    assert.equal(url.searchParams.get("utm_campaign"), "fb-k3x", path);
  }
  assert.equal(at(shortLinkTarget("/g/zipFeel")).pathname, "/alterations/zip-replacement-southampton");
  assert.equal(at(shortLinkTarget("/g/Zip/k3x")).pathname, "/alterations/zip-replacement-southampton");
});

test("Facebook's click id comes along, and tags already on the link are replaced", () => {
  const url = at(shortLinkTarget("/g/prom/k3x", "?fbclid=abc&utm_source=whatsapp&utm_campaign=x"));
  assert.equal(url.searchParams.get("fbclid"), "abc");
  assert.deepEqual(url.searchParams.getAll("utm_source"), ["facebook"]);
  assert.deepEqual(url.searchParams.getAll("utm_campaign"), ["fb-k3x"]);
});

test("a short link is never a dead end, and never leaves the site", () => {
  assert.equal(at(shortLinkTarget("/g/coat/k3x")).pathname, "/alterations", "unknown word: every service");
  assert.equal(at(shortLinkTarget("/g/coat/k3x")).searchParams.get("utm_campaign"), "fb-k3x");
  for (const word of ["constructor", "Constructor", "toString", "__proto__"]) {
    assert.equal(at(shortLinkTarget(`/g/${word}/k3x`)).pathname, "/alterations", `${word} is not a word on the list`);
  }
  for (const path of ["/g", "/g/"]) assert.equal(at(shortLinkTarget(path)).pathname, "/alterations");
  for (const path of ["/g/zip", "/g/zip/", "/g/zip/0", "/g/zip/K3X"]) {
    const url = at(shortLinkTarget(path));
    assert.equal(url.pathname, "/alterations/zip-replacement-southampton", path);
    assert.equal(url.searchParams.get("utm_campaign"), null, `${path}: no group, no tag`);
  }
  for (const path of ["/g//evil.com", "/g/zip/%2F%2Fevil.com", "/g/zip/k3x/../../x", "/g/%2F%2Fevil.com/k3x"]) {
    const target = shortLinkTarget(path)!;
    assert.match(target, /^\/alterations[/?]/, path);
    assert.equal(at(target).origin, "https://www.beautasy.co.uk", path);
  }
});

test("only /g/ is a short link", () => {
  for (const path of ["/gift-cards", "/gift-boxes/x", "/go", "/alterations/zip-replacement-southampton", "/", "/studio/g/zip"]) {
    assert.equal(shortLinkTarget(path), null, path);
  }
});

test("every group post's link comes back to the page it was written about, tagged with its group", () => {
  const now = new Date("2026-10-05T09:00:00Z");
  for (let i = 0; i < 24; i++) {
    const group = { _id: `group-${i}`, name: `Group ${i}` };
    const post = groupPost(group, new Date(now.getTime() + i * 7 * 86_400_000));
    assert.ok(post.link && post.shown);
    assert.ok(post.text.endsWith(post.shown), "the short link closes the post");
    const url = at(shortLinkTarget(new URL(post.link).pathname));
    assert.equal(url.pathname, `/alterations/${post.service}`);
    assert.equal(url.searchParams.get("utm_campaign"), `fb-${groupCode(group._id)}`);
  }
});

test("the middleware answers a short link before anything else", () => {
  const middleware = readFileSync(join(ROOT, "src/middleware.ts"), "utf8");
  assert.match(middleware, /const short = shortLinkTarget\(req\.nextUrl\.pathname, req\.nextUrl\.search\);/);
  assert.match(middleware, /NextResponse\.redirect\(new URL\(short, req\.nextUrl\.origin\), 307\)/);
  assert.ok(middleware.indexOf("shortLinkTarget(req") < middleware.indexOf("return auth(req, event)"));
  const robots = readFileSync(join(ROOT, "src/app/robots.ts"), "utf8");
  assert.doesNotMatch(robots, /["']\/g\//, "Facebook's preview has to follow the link");
});
