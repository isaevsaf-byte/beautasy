import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard for the bug that shipped a dead shop.
 *
 * Every route under /shop once rendered correctly and then did nothing: React
 * never hydrated it, so Add to Bag, the thumbnails and the image viewer were
 * inert for anyone who landed on the page directly rather than clicking through
 * from the homepage. There was no error anywhere — not in the browser console,
 * not in the server log, not in CI — which is exactly why it survived so long.
 *
 * The cause is a Suspense boundary that the server streams separately. When the
 * Sanity fetch is slow enough, Next flushes the fallback first and sends the
 * content afterwards; React marks that boundary "$~" and never returns to
 * hydrate it. A `loading.tsx` creates such a boundary for its whole segment by
 * convention — nested routes included — and an explicit <Suspense> creates one
 * too.
 *
 * A comment cannot stop someone adding the file back, and nothing else in the
 * pipeline would notice, so this test is the thing that says no. It is a
 * structural check rather than a behavioural one because reproducing the bug
 * needs a production build, a slow upstream and a real browser.
 *
 * This is a defect in the Next version we run (16.1.6), not a rule about how
 * Suspense ought to work; 16.3.3 does not fix it. If a future upgrade does,
 * verify against a production build — dev is not evidence, because a fast dev
 * server simply never streams the boundary — and then delete this test.
 *
 * The hazard is not unique to /shop; any segment whose boundary gets streamed
 * should behave the same way. It is pinned here because /shop is where it was
 * measured, and where it was costing sales.
 */

const SHOP_DIR = join(process.cwd(), "src", "app", "shop");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const shopFiles = filesUnder(SHOP_DIR);

test("no loading.tsx anywhere under /shop", () => {
  const offenders = shopFiles
    .filter((f) => /(^|\/)loading\.(tsx|ts|jsx|js)$/.test(f))
    .map((f) => f.replace(process.cwd() + "/", ""));

  assert.deepEqual(
    offenders,
    [],
    `A loading.tsx wraps its whole segment — nested routes and all — in a Suspense boundary the server streams, and a streamed boundary never finishes hydrating on a direct page load. The shop renders but nothing in it responds. Show a skeleton some other way, or read the note at the top of this file before deciding the framework has been fixed.`
  );
});

test("the shop listings are not wrapped in <Suspense>", () => {
  // Matched on the import rather than on "<Suspense", so that the comments
  // explaining why the boundary is gone don't read as the boundary itself.
  // A page that never imports Suspense cannot render one.
  const importsSuspense = /^import\s*\{[^}]*\bSuspense\b[^}]*\}\s*from\s*["']react["']/m;

  const offenders = shopFiles
    .filter((f) => f.endsWith("page.tsx"))
    .filter((f) => importsSuspense.test(readFileSync(f, "utf8")))
    .map((f) => f.replace(process.cwd() + "/", ""));

  assert.deepEqual(
    offenders,
    [],
    `These pages await their data before returning any JSX, so a boundary around the listing can never show its fallback for data — it can only cost the page its hydration. See the note at the top of this file.`
  );
});
