import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { STUDIO_FOLDERS, STUDIO_MOVES, STUDIO_RENAMES, movedStudioPath } from "./studioMoves";
import { SITE_SETTINGS_ID } from "./siteSettingsDocument";
import { STUDIO_LISTS } from "./studioStats";

/**
 * The Studio sidebar folded into folders (06.10): 33 rows became 10. These
 * keep the sidebar, the old addresses and every sentence that names a list
 * in step with one another.
 */

const ROOT = resolve(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const STRUCTURE = read("src/sanity/structure.ts");

/** The ids a stretch of structure.ts gives its lists, panes left out */
function idsIn(text: string): string[] {
  const ids = [...text.matchAll(/\.id\("([^"]+)"\)|\.id\((SITE_SETTINGS_ID)\)|documentTypeListItem\("([^"]+)"\)/g)].map((m) =>
    m[2] ? SITE_SETTINGS_ID : (m[1] ?? m[3])
  );
  return [...new Set(ids)].filter((id) => !id.endsWith("-pane"));
}

/** Where each folder's block starts in structure.ts, in order */
function folderBlocks(): Map<string, string> {
  const starts = STUDIO_FOLDERS.map((folder) => {
    const at = STRUCTURE.indexOf(`.id("${folder}")`);
    assert.ok(at > 0, `folder ${folder} is in the sidebar`);
    return { folder, at };
  }).sort((a, b) => a.at - b.at);
  return new Map(starts.map(({ folder, at }, i) => [folder, STRUCTURE.slice(at, starts[i + 1]?.at ?? STRUCTURE.length)]));
}

test("the top of the sidebar is the five daily jobs, then five folders — ten rows, not thirty-three", () => {
  const top = STRUCTURE.slice(STRUCTURE.indexOf(".items(["), STRUCTURE.indexOf('.id("reviews")'));
  assert.deepEqual(idsIn(top), ["atelierBooking", "book-by-hand", "postyNaOdobrenie", "group-posts", "kassa"]);
  const folders = [...folderBlocks().keys()];
  assert.deepEqual(folders, ["reviews", "social", "shop", "friends", "settings"]);
  for (const id of idsIn(top)) assert.equal(STUDIO_MOVES[id], undefined, `${id} stayed at the top`);
});

test("every list in a folder is one the old addresses know is there, and the other way round", () => {
  for (const [folder, block] of folderBlocks()) {
    const inside = idsIn(block).filter((id) => id !== folder);
    const moved = Object.keys(STUDIO_MOVES).filter((id) => STUDIO_MOVES[id] === folder);
    assert.deepEqual(inside.sort(), moved.sort(), `«${folder}» and STUDIO_MOVES disagree`);
  }
  for (const folder of Object.values(STUDIO_MOVES)) assert.ok((STUDIO_FOLDERS as readonly string[]).includes(folder));
});

test("an old address to a moved list opens it in its folder, with the document after it", () => {
  assert.equal(movedStudioPath("/studio/structure/product;abc"), "/studio/structure/shop;product;abc");
  assert.equal(movedStudioPath("/studio/structure/review;abc"), "/studio/structure/reviews;review;abc");
  assert.equal(movedStudioPath("/studio/structure/postyVOcheredi"), "/studio/structure/social;postyVOcheredi");
  // The two settings took their documents' ids in the folder
  assert.equal(movedStudioPath("/studio/structure/nastroikiSaita"), "/studio/structure/settings;siteSettings");
  assert.equal(movedStudioPath("/studio/structure/chasyDlyaPrimerok;x"), "/studio/structure/settings;atelierSchedule;x");
  assert.equal(movedStudioPath("/studio/structure/partners;x,view=y"), "/studio/structure/friends;partners;x,view=y");
  assert.equal(movedStudioPath("/studio/structure/order%7Cfoo"), "/studio/structure/shop;order%7Cfoo");
});

test("what did not move, links in emails, and an address already moved are left alone — no loops", () => {
  for (const path of [
    "/studio/structure/atelierBooking;x",
    "/studio/structure/kassa",
    "/studio/structure/postyNaOdobrenie",
    "/studio/structure/book-by-hand",
    "/studio/structure/group-posts",
    "/studio/structure/shop;product;abc",
    "/studio/structure/reviews;review;abc",
    "/studio/structure/settings;siteSettings",
    "/studio/structure/constructor",
    "/studio/structure/__proto__",
    "/studio/structure/toString;x",
    "/studio/intent/edit/id=abc;type=review",
    "/studio",
    "/studio/dashboard",
    "/shop/product",
  ]) {
    assert.equal(movedStudioPath(path), null, path);
  }
  for (const folder of STUDIO_FOLDERS) assert.ok(!Object.hasOwn(STUDIO_MOVES, folder), `${folder} is a folder, not a list`);
  for (const [old, now] of Object.entries(STUDIO_RENAMES)) {
    assert.ok(!Object.hasOwn(STUDIO_MOVES, old), `${old} is an old id, not a list`);
    assert.ok(Object.hasOwn(STUDIO_MOVES, now), `${now} is in a folder`);
  }
});

test("lists inside folders still answer «open this document», and the two schedules keep their documents", () => {
  // A list with its own filter only answers one level down unless told —
  // the email about a new review, «+ Создать» and search depend on this
  const custom = [...STRUCTURE.matchAll(/S\.documentList\(\)[\s\S]*?\)\s*\n\s*\),?\n/g)].map((m) => m[0]);
  const nested = custom.filter((list) => !list.includes("Ждут вашего решения"));
  assert.equal(nested.length, 8, "four review lists, three Instagram lists, the friends' links");
  for (const list of nested) assert.match(list, /\.canHandleIntent\(defaultIntentChecker\)/, list.slice(0, 80));
  assert.match(STRUCTURE, /\.documentId\(SITE_SETTINGS_ID\)/);
  assert.match(STRUCTURE, /\.documentId\("atelierSchedule"\)/, "🚨 without it the Studio makes a second schedule");
  for (const id of ["postyNaOdobrenie", "postyVOcheredi", "reels", "uzheOpublikovany"]) {
    assert.match(STRUCTURE, new RegExp(`\\.id\\("${id}"\\)`), `${id}: the address Sanity gave it before, pinned`);
  }
  // A settings document opened from search is looked for by an item with its
  // own id — under any other id the pane said "returned no child"
  assert.match(STRUCTURE, /\.id\("atelierSchedule"\)\s*\.title\("Часы для примерок"\)\s*\.child\(S\.document\(\)\.schemaType\("atelierSchedule"\)\.documentId\("atelierSchedule"\)\)/);
  assert.match(STRUCTURE, /\.id\(SITE_SETTINGS_ID\)\s*\.title\("Настройки сайта"\)\s*\.child\(S\.document\(\)\.schemaType\("siteSettings"\)\.documentId\(SITE_SETTINGS_ID\)\)/);
  assert.doesNotMatch(STRUCTURE, /\.title\("[^"]*\p{Extended_Pictographic}/u, "no emoji in titles: sentences quote them");
});

test("the middleware sends old Studio addresses on before sign-in looks at them", () => {
  const middleware = read("src/middleware.ts");
  assert.match(middleware, /const moved = movedStudioPath\(req\.nextUrl\.pathname\);/);
  assert.ok(middleware.indexOf("movedStudioPath(req") < middleware.indexOf("return auth(req, event)"));
});

test("the Dashboard names a list in a folder with its folder first", () => {
  const stats = read("src/lib/studioStats.ts");
  for (const key of ["postsGoingOut", "products", "orders", "giftCards", "siteSettings", "siteReviews"] as const) {
    assert.doesNotMatch(stats, new RegExp(`Откройте "\\$\\{STUDIO_LISTS\\.${key}\\}"`), `${STUDIO_LISTS[key]} is in a folder now`);
  }
  for (const name of [STUDIO_LISTS.reviews, STUDIO_LISTS.social, STUDIO_LISTS.shop, STUDIO_LISTS.settings]) {
    assert.match(STRUCTURE, new RegExp(`\\.title\\("${name}"\\)`), `${name} is a folder in the sidebar`);
  }
});

/** Every .ts and .tsx file under src, as paths from the project root */
function sourceFiles(dir = "src"): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("a hint that sends Kristina to a list in a folder names the folder first", () => {
  // The lists inside folders, by the title the sidebar shows
  const folderTitles = new Set(
    STUDIO_FOLDERS.map((folder) => new RegExp(`\\.id\\("${folder}"\\)\\s*\\.title\\("([^"]+)"\\)`).exec(STRUCTURE)![1])
  );
  const nested = [...folderBlocks().values()]
    .flatMap((block) => [...block.matchAll(/(?<!divider\(\))\.title\("([^"]+)"\)/g)].map((m) => m[1]))
    .filter((title) => !folderTitles.has(title));
  assert.ok(nested.includes("Партнёры") && nested.includes("Часы для примерок") && nested.length > 20);
  // Not a list: the page /work, whose settings block is called after it
  const notAHint = ["Страница «Наши работы»"];
  const offenders: string[] = [];
  const files = sourceFiles();
  assert.ok(files.length > 100, "the walk found the source");
  for (const file of files) {
    if (file.includes(".test.") || file.endsWith("sanity/structure.ts")) continue;
    read(file).split("\n").forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return;
      if (/Настройках сайта/.test(code)) offenders.push(`${file}:${i + 1} «Настройках сайта»`);
      for (const title of nested) {
        for (const at of code.matchAll(new RegExp(`«${title}»`, "g"))) {
          const before = code.slice(0, at.index);
          if (!/→ ?$/.test(before) && !notAHint.some((ok) => code.includes(ok))) offenders.push(`${file}:${i + 1} «${title}»`);
        }
      }
    });
  }
  assert.deepEqual(offenders, [], "write «Folder» → «List»: the list is no longer at the top");
});

test("the morning email sends failed posts to the list they are really in", () => {
  // Until 06.10 it said "Посты в очереди"; a failed post sits with the drafts
  const line = read("src/lib/siteHealth.ts").split("\n").find((l) => l.includes("could not go out in the last")) ?? "";
  assert.match(line, /"Посты на одобрение"/);
  assert.doesNotMatch(line, /Посты в очереди/);
  assert.match(STRUCTURE, /\.title\("Посты на одобрение"\)[\s\S]{0,200}status in \["draft", "failed"\]/);
});
