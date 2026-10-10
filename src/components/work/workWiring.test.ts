import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { videoFileProblem, workPiece } from "@/sanity/schemaTypes/workPiece";
import { schemaTypes } from "@/sanity/schemaTypes";
import { WORK_CATEGORIES, WORK_SHELVES } from "@/lib/work";
import { LOCAL_SERVICES } from "@/lib/localServices";
import { WORK_CATEGORY_TITLES, WORK_SERVICE_TITLES, WORK_SHELF_TITLES } from "@/sanity/workLabels";

/**
 * Our Work is only useful where people meet it: the menu, the atelier page,
 * the service pages, the sitemap, the Studio. This holds each of those links in
 * place — the gallery's own behaviour is tested in @/lib/work and ./layout.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("the menu, the mobile menu and the footer lead to /work", () => {
  const header = read("src/components/Header.tsx");
  // One list for both menus, shown whole at every width that has a desktop bar
  assert.match(header, /\{ label: "Our Work", href: "\/work", side: "left" \}/);
  assert.match(header, /\{navLinks\.map\(\(link\) => \(/, "the phone menu lists every link");
  assert.doesNotMatch(header, /hidden xl:inline|hidden lg:inline/, "no desktop link waits for a wider screen");
  assert.match(read("src/components/Footer.tsx"), /\{ label: "Our Work", href: "\/work" \}/);
});

test("the home page shows the newest work, whichever side of the room it came from", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /const \[work, reviews, nextdoorUrl\] = await Promise\.all\(\[getWork\(\), getReviews\(\), nextdoorPageUrl\(\)\]\);/);
  assert.match(home, /const recent = work\.pieces\.slice\(0, 4\)\.map\(showPiece\);/);
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
  assert.match(read("src/app/sitemap.ts"), /const workRoutes: MetadataRoute\.Sitemap = pieces\.length \|\| !known/);
  const page = read("src/app/work/page.tsx");
  // A Sanity failure must not rebuild the page as an empty, noindexed one
  assert.match(page, /^import \{ readWork \} from "@\/lib\/getWork";$/m);
  assert.doesNotMatch(page.replace('"@/lib/getWork"', ""), /getWork/, "not the reader that shrugs off a failure");
  assert.equal(page.match(/await readWork\(\)/g)?.length, 2);
  assert.match(page, /\.\.\.\(pieces\.length === 0 \? \{ robots: \{ index: false, follow: true \} \} : \{\}\)/);
  assert.match(page, /alternates: \{ canonical: PAGE_URL \}/);
});

test("the Studio has Our Work, offering exactly the site's categories, shelves and service pages", () => {
  assert.ok(schemaTypes.includes(workPiece));
  assert.match(read("src/sanity/structure.ts"), /S\.documentTypeListItem\("workPiece"\)\.title\("Наши работы"\)/);

  const fields = Object.fromEntries(workPiece.fields.map((f) => [f.name, f])) as Record<
    string,
    { options?: { list?: { value: string }[] } }
  >;
  const values = (name: string) => fields[name].options?.list?.map((o) => o.value);
  assert.deepEqual(values("category"), WORK_CATEGORIES.map((c) => c.value));
  assert.deepEqual(values("shelf"), WORK_SHELVES.map((s) => s.value));
  assert.deepEqual(values("service"), LOCAL_SERVICES.map((s) => s.slug));
});

test("the Studio names every category, shelf and service page in Russian, while the site keeps its English", () => {
  // The site shows these lists to customers in English; Kristina picks from
  // them in Russian. A value added to one of the site's lists with no Russian
  // name would reach her in English — this is where that fails.
  const fields = Object.fromEntries(workPiece.fields.map((f) => [f.name, f])) as Record<
    string,
    { options?: { list?: { title: string; value: string }[] } }
  >;
  const lists: [string, Readonly<Record<string, string>>, string[]][] = [
    ["category", WORK_CATEGORY_TITLES, WORK_CATEGORIES.map((c) => c.value)],
    ["shelf", WORK_SHELF_TITLES, WORK_SHELVES.map((s) => s.value)],
    ["service", WORK_SERVICE_TITLES, LOCAL_SERVICES.map((s) => s.slug)],
  ];
  for (const [field, russian, siteValues] of lists) {
    assert.deepEqual(
      Object.keys(russian).sort(),
      [...siteValues].sort(),
      `${field}: every value the site has needs a Russian name, and a name for a value that is gone should go too`
    );
    for (const option of fields[field].options?.list ?? []) {
      assert.equal(option.title, russian[option.value], `${field} "${option.value}" is shown by its Russian name`);
      assert.match(option.title, /[А-ЯЁа-яё]/, `${field} "${option.value}" is named in Russian`);
    }
  }
  const siteWords = [
    ...WORK_CATEGORIES.map((c) => c.label),
    ...WORK_SHELVES.flatMap((s) => [s.title, s.cta]),
    ...LOCAL_SERVICES.flatMap((s) => [s.eyebrow, s.serviceName]),
  ];
  for (const words of siteWords) assert.doesNotMatch(words, /[А-ЯЁа-яё]/, `"${words}" is for customers, in English`);
});

test("a video that would stall a phone, or that half the browsers can't play, is turned back with a reason", () => {
  assert.equal(videoFileProblem({ size: 4 * 1024 * 1024, mimeType: "video/mp4" }), null);
  assert.equal(videoFileProblem(null), null);
  assert.match(videoFileProblem({ size: 180 * 1024 * 1024, mimeType: "video/mp4" }) ?? "", /180 МБ/);
  assert.match(videoFileProblem({ size: 1024, mimeType: "video/quicktime" }) ?? "", /только MP4/);
  assert.equal(videoFileProblem({ size: 40 * 1024 * 1024, mimeType: "video/mp4" }), null, "the limit itself is allowed");
});

test("the viewer's links lead where they say, and a swipe is only a swipe", () => {
  const viewer = read("src/components/work/WorkViewer.tsx");
  // Closing steps history back, which cancels the page a link was opening
  assert.equal(viewer.match(/onClick=\{onClose\}/g)?.length, 1, "only the close button closes");
  assert.match(viewer, /e\.touches\.length === 1 && !zoomed && !onVideo/);
  assert.match(viewer, /if \(e\.touches\.length > 1\) touch\.current = null;/);
});

test("the viewer fades in when opened from a tile, never between pieces, and the before-and-after can turn back mid-wipe", () => {
  const gallery = read("src/components/work/WorkGallery.tsx");
  // The viewer is drawn afresh for each piece (key={piece.id}): an entrance
  // that played every time would blink the screen on each "next"
  assert.match(gallery, /setArriving\(true\);\s+writeHash\(anchor, true\);/, "a tile opens it arriving");
  assert.match(gallery, /setArriving\(false\);\s+writeHash\(browsing\[index\]\.anchor, false\);/, "moving on doesn't");
  assert.match(gallery, /arriving=\{arriving\}/);
  const viewer = read("src/components/work/WorkViewer.tsx");
  assert.match(viewer, /arriving \? "transition-opacity duration-200 ease-out starting:opacity-0 motion-reduce:duration-\[120ms\]" : ""/);
  // A transition, not an animation: a second tap reverses from where it is
  assert.match(viewer, /const SHUTTER = "duration-\[450ms\] ease-in-out motion-reduce:duration-150";/);
  assert.match(viewer, /\[clip-path:inset\(0_100%_0_0\)\]/);
  assert.match(viewer, /sameFraming\(before, after\) \?/);
});

test("the showreel waits to be allowed, and can always be stopped", () => {
  const reel = read("src/components/work/Showreel.tsx");
  assert.doesNotMatch(reel, /autoPlay/, "the server's page must not start a film");
  assert.match(reel, /preload="none"/);
  assert.match(reel, /useSyncExternalStore\(subscribe, stillOnly, \(\) => true\)/);
  assert.match(reel, /aria-label=\{playing \? "Pause the film" : "Play the film"\}/);
});

test("the Studio never publishes where a photo was taken, and takes videos only from the import", () => {
  const schema = read("src/sanity/schemaTypes/workPiece.ts");
  assert.equal(schema.match(/validation: \(Rule\) => Rule\.custom\(photoLocationRule\)/g)?.length, 2, "before and every photo");
  assert.match(schema, /name: "file",\s+title: "Видео",\s+type: "file",\s+options: \{ accept: "video\/mp4" \},\s+readOnly: true,/);
  assert.match(schema, /name: "poster",\s+title: "Обложка",\s+type: "image",\s+options: \{ hotspot: true \},\s+readOnly: true,/);
  const settings = read("src/sanity/schemaTypes/siteSettings.ts");
  assert.equal(settings.match(/readOnly: true,/g)?.length, 2, "the showreel and its cover");
});

test("the showreel comes back when its tab does, and the tiles keep their sharpness and the keyboard's place", () => {
  const reel = read("src/components/work/Showreel.tsx");
  assert.match(reel, /document\.addEventListener\("visibilitychange", update\);/);
  assert.match(reel, /if \(inView && document\.visibilityState === "visible"\) video\.play\(\)/);
  // Each half of a before-and-after crops a photo drawn at the tile's full width
  assert.match(read("src/components/work/TileFace.tsx"), /<Photo photo=\{photo\} sizes=\{sizes\} eager=\{eager\} className=\{PICTURE\} \/>/);
  const gallery = read("src/components/work/WorkGallery.tsx");
  assert.match(gallery, /element\.dataset\.workTile === anchor && element\.offsetParent !== null/);
  assert.match(gallery, /data-work-tile=\{piece\.anchor\}/);
});
