import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../../next.config";
import robots from "./robots";
import { summaryFromBlocks, DESCRIPTION_LIMIT } from "../lib/pageSummary";
import { sanityConfig } from "../lib/sanity";

/**
 * Which addresses lead somewhere, which are sent on, and which search
 * engines are told about — so an old link, a bookmark or a crawler arrives
 * at a real page rather than a dead end.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("old and retired addresses are sent on for good", async () => {
  const redirects = await nextConfig.redirects!();
  const to = (source: string) => redirects.find((r) => r.source === source && !("has" in r && r.has));
  const expected: Record<string, string> = {
    "/mini": "/shop/kids",
    "/pages/contact-us": "/contact",
    "/products/:slug": "/shop/:slug",
    "/collections/:path*": "/shop",
    "/cart": "/shop",
  };
  for (const [source, destination] of Object.entries(expected)) {
    const rule = to(source);
    assert.ok(rule, `a redirect for ${source}`);
    assert.equal(rule.destination, destination, source);
    assert.equal(rule.permanent, true, `${source} moved for good`);
  }
  // The vercel.app copy is moved to the real address first, in one hop
  const host = redirects.findIndex((r) => "has" in r && r.has?.some((h) => h.type === "host"));
  const mini = redirects.findIndex((r) => r.source === "/mini");
  assert.ok(host > -1 && host < mini);
  // /mini is a redirect now, not a page with placeholder pictures behind it
  assert.ok(!existsSync(join(process.cwd(), "src/app/mini")));
});

test("the sitemap lists no address that is redirected or linked from nowhere", () => {
  const sitemap = read("src/app/sitemap.ts");
  assert.doesNotMatch(sitemap, /\{ url: `\$\{base\}\/shop\/collections`/, "/shop/collections is linked from nowhere");
  assert.doesNotMatch(sitemap, /\/mini\b/);
  assert.match(sitemap, /const REDIRECTED_LEGAL_PAGES = new Set\(\["contact-us"\]\);/);
  assert.match(sitemap, /pages\.filter\(\(p\) => !REDIRECTED_LEGAL_PAGES\.has\(p\.slug\)\)/);
});

test("robots.txt closes the sign-in pages whole, trailing slash or not", () => {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const disallow = ([] as string[]).concat(rule.disallow ?? []);
  // robots.txt matches by prefix: "/sign-in/" never covered "/sign-in"
  const blocked = (path: string) => disallow.some((prefix) => path.startsWith(prefix));
  for (const path of ["/sign-in", "/sign-in/", "/sign-in/factor-one", "/sign-up", "/sign-up/verify", "/studio", "/r/ANNA-K7P2"]) {
    assert.ok(blocked(path), `${path} is left open`);
  }
  for (const path of ["/", "/atelier", "/shop", "/alterations/wedding-dress-southampton", "/reviews"]) {
    assert.ok(!blocked(path), `${path} is closed`);
  }
});

test("only this project's pictures can be resized through the site", () => {
  const patterns = nextConfig.images?.remotePatterns ?? [];
  const sanity = patterns.find((p) => typeof p === "object" && "hostname" in p && p.hostname === "cdn.sanity.io");
  assert.ok(sanity && "pathname" in sanity, "cdn.sanity.io is limited to a path");
  // The project the site's own Sanity client reads
  assert.equal(sanity.pathname, `/images/${sanityConfig.projectId}/**`);
  for (const pattern of patterns) {
    assert.ok(typeof pattern === "object" && "pathname" in pattern && pattern.pathname, "no host is allowed whole");
  }
});

test("a Studio page is described by its own first words, cut at a word", () => {
  const block = (text: string, style = "normal") => ({ _type: "block", style, children: [{ _type: "span", text }] });
  assert.equal(
    summaryFromBlocks([block("About Us", "h2"), block("Located in Southampton."), block("Made by hand.")]),
    "Located in Southampton. Made by hand.",
  );
  const long = summaryFromBlocks([block("word ".repeat(80))]);
  assert.ok(long && long.length <= DESCRIPTION_LIMIT, `${long?.length} characters`);
  assert.match(long!, /word…$/, "ends on a whole word");
  assert.equal(summaryFromBlocks([]), null);
  assert.equal(summaryFromBlocks(undefined), null);
  assert.equal(summaryFromBlocks([{ _type: "image" }]), null);

  const page = read("src/app/pages/[slug]/page.tsx");
  assert.match(page, /description: summaryFromBlocks\(page\.body\) \?\? `\$\{page\.title\} — Beautasy`/);
});

test("/work's description fits in a search result", () => {
  const work = read("src/app/work/page.tsx");
  const description = work.match(/const DESCRIPTION =\s*"([^"]+)"/)?.[1] ?? "";
  assert.ok(description.length > 0 && description.length <= DESCRIPTION_LIMIT, `${description.length} characters`);
});
