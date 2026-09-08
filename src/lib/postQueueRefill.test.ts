import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the two ways this queue dies.
 *
 * It ran dry first: drafts were only written for products that had never been
 * posted, so once every product had one the pipeline went silent for good,
 * with nothing in the logs to say why. The cure is rotation — come round to
 * the piece it has been longest since we mentioned.
 *
 * Rotation introduces the opposite failure: three drafts a day, forever, until
 * the Studio is unusable and the one job Kristina has here becomes a chore. So
 * it tops up to a backlog rather than drafting on every run.
 *
 * And a repeat has to be worth reading, which is why the angle turns with the
 * count instead of always taking the first of five.
 */

const QUEUE = readFileSync(join(process.cwd(), "src", "lib", "socialQueue.ts"), "utf8");

test("drafting no longer asks for products that have never been posted", () => {
  assert.ok(
    !QUEUE.includes('count(*[_type == "socialPost" && product._ref == ^._id]) == 0'),
    "That condition is what emptied the queue permanently."
  );
});

test("the piece posted longest ago comes round first", () => {
  assert.match(
    QUEUE,
    /order\(coalesce\(lastPostAt, ""\) asc\)/,
    "Oldest first, and never-posted before that — an empty string sorts before any date."
  );
});

test("a piece is rested before it comes round again", () => {
  assert.match(QUEUE, /COOLDOWN_DAYS/, "Without a cooldown the same product posts every day.");
  assert.match(QUEUE, /lastPostAt < \$notSince/, "The cooldown has to reach the query.");
});

test("drafts top up to a backlog instead of growing without end", () => {
  assert.match(QUEUE, /TARGET_BACKLOG - waiting/, "Draft only what is missing from the backlog.");
  // Scoped to the function: the query constant is declared far above it, so
  // searching the whole file would compare against the wrong occurrence.
  const fn = QUEUE.slice(QUEUE.indexOf("export async function draftPostsForNewProducts"));
  const check = fn.indexOf("const waiting = await");
  const fetchProducts = fn.indexOf("NEXT_TO_POST");
  assert.notEqual(check, -1, "the backlog is no longer counted");
  assert.ok(check < fetchProducts, "Count what is waiting before choosing anything to write.");
});

test("the angle turns, so coming round again is not the same post", () => {
  assert.match(
    QUEUE,
    /const turn = \(product\.timesPosted \?\? 0\) % options\.length/,
    "Five angles exist; always taking the first is why twelve posts read as one."
  );
  assert.match(QUEUE, /caption: options\[turn\]/, "…and the chosen angle has to be the one used.");
});
