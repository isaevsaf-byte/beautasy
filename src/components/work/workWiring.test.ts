import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { videoFileProblem, workPiece } from "@/sanity/schemaTypes/workPiece";
import { schemaTypes } from "@/sanity/schemaTypes";
import { WORK_CATEGORIES, WORK_SHELVES } from "@/lib/work";
import { LOCAL_SERVICES } from "@/lib/localServices";

/**
 * Our Work is only useful where people meet it: the menu, the atelier page,
 * the service pages, the sitemap, the Studio. This holds each of those links in
 * place — the gallery's own behaviour is tested in @/lib/work and ./layout.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("the menu, the mobile menu and the footer lead to /work", () => {
  const header = read("src/components/Header.tsx");
  assert.match(header, /\{ label: "Our Work", href: "\/work", side: "right", from: "xl" \}/);
  assert.match(header, /link\.from === "xl" \? "hidden xl:inline"/);
  assert.match(header, /const MOBILE_ORDER = \[[^\]]*"Our Work"/);
  assert.match(read("src/components/Footer.tsx"), /\{ label: "Our Work", href: "\/work" \}/);
});

test("the home page shows the newest work, whichever side of the room it came from", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /\(await getWork\(\)\)\.pieces\.slice\(0, 4\)\.map\(showPiece\)/);
  assert.match(home, /<HomeContent\s+recentWork=/);
  assert.match(read("src/app/HomeContent.tsx"), /\{recentWork && \(/);
});

test("the atelier page and each service page show their finished work", () => {
  const atelier = read("src/app/atelier/page.tsx");
  assert.match(atelier, /atelierPieces\(pieces, 4\)\.map\(showPiece\)/);
  assert.match(atelier, /<AtelierContent\s+recentWork=/);
  assert.match(read("src/app/atelier/AtelierContent.tsx"), /\{recentWork && \(/);

  const service = read("src/app/alterations/[slug]/page.tsx");
  assert.match(service, /piecesForService\(work\.pieces, service\.slug\)/);
  assert.match(service, /<WorkStrip\s+pieces=\{doneHere\}/);
});

test("Google hears of /work once there is something on it, and not before", () => {
  assert.match(read("src/app/sitemap.ts"), /const workRoutes: MetadataRoute\.Sitemap = pieces\.length/);
  const page = read("src/app/work/page.tsx");
  assert.match(page, /\.\.\.\(pieces\.length === 0 \? \{ robots: \{ index: false, follow: true \} \} : \{\}\)/);
  assert.match(page, /alternates: \{ canonical: PAGE_URL \}/);
});

test("the Studio has Our Work, offering exactly the site's categories, shelves and service pages", () => {
  assert.ok(schemaTypes.includes(workPiece));
  assert.match(read("src/sanity/structure.ts"), /S\.documentTypeListItem\("workPiece"\)\.title\("Our Work"\)/);

  const fields = Object.fromEntries(workPiece.fields.map((f) => [f.name, f])) as Record<
    string,
    { options?: { list?: { value: string }[] } }
  >;
  const values = (name: string) => fields[name].options?.list?.map((o) => o.value);
  assert.deepEqual(values("category"), WORK_CATEGORIES.map((c) => c.value));
  assert.deepEqual(values("shelf"), WORK_SHELVES.map((s) => s.value));
  assert.deepEqual(values("service"), LOCAL_SERVICES.map((s) => s.slug));
});

test("a video that would stall a phone, or that half the browsers can't play, is turned back with a reason", () => {
  assert.equal(videoFileProblem({ size: 4 * 1024 * 1024, mimeType: "video/mp4" }), null);
  assert.equal(videoFileProblem(null), null);
  assert.match(videoFileProblem({ size: 180 * 1024 * 1024, mimeType: "video/mp4" }) ?? "", /180 MB/);
  assert.match(videoFileProblem({ size: 1024, mimeType: "video/quicktime" }) ?? "", /Only MP4/);
  assert.equal(videoFileProblem({ size: 40 * 1024 * 1024, mimeType: "video/mp4" }), null, "the limit itself is allowed");
});
