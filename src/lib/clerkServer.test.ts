import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Structural guard: Clerk's server `auth()` may only be called through
 * `currentUserId()` in src/lib/clerkServer.ts.
 *
 * The checkout used to call `auth()` directly. With Clerk switched off (no
 * publishable key → no clerkMiddleware) that call throws, the route's catch
 * turned it into a 500, and every checkout failed with "Unable to start
 * checkout" — no error in the browser console, nothing in CI. The shop is
 * designed to sell to guests without Clerk, so the money path must never
 * depend on it. A wrapper that swallows the failure is the fix; this test is
 * what stops the next route from reaching for `auth()` directly.
 */

const SRC = join(process.cwd(), "src");
const ALLOWED = join(SRC, "lib", "clerkServer.ts");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

test("only clerkServer.ts imports auth() from @clerk/nextjs/server", () => {
  const importsAuth =
    /import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*["']@clerk\/nextjs\/server["']/;

  const offenders = filesUnder(SRC)
    .filter((f) => /\.(ts|tsx)$/.test(f) && f !== ALLOWED)
    .filter((f) => importsAuth.test(readFileSync(f, "utf8")))
    .map((f) => f.replace(process.cwd() + "/", ""));

  assert.deepEqual(
    offenders,
    [],
    `Call currentUserId() from @/lib/clerkServer instead: it returns null when Clerk is off or failing, so a guest can still pay.`
  );
});
