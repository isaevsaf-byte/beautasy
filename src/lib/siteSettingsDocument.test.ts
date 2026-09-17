import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SITE_SETTINGS, SITE_SETTINGS_ID } from "./siteSettingsDocument";

/**
 * The Studio and the site must mean the same Site Settings document.
 *
 * For three weeks they did not: the Studio edited "siteSettings" and every
 * reader took `*[_type == "siteSettings"][0]`, which was an older document.
 * Everything saved in Site Settings reached nobody. These keep it that way.
 */

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });
}

test("the Studio opens the document the site reads first", () => {
  assert.match(read("src", "sanity", "structure.ts"), /\.documentId\(SITE_SETTINGS_ID\)/);
  assert.ok(SITE_SETTINGS.indexOf(`_id == "${SITE_SETTINGS_ID}"`) < SITE_SETTINGS.indexOf("order(_updatedAt"));
});

test("no reader picks 'the first siteSettings' on its own", () => {
  const offenders = sources(join(ROOT, "src"))
    .filter((f) => !f.endsWith("siteSettingsDocument.ts"))
    .filter((f) => /_type\s*==\s*["']siteSettings["']/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], "Use SITE_SETTINGS from @/lib/siteSettingsDocument instead.");
});

test("the fallback never picks an unpublished draft", () => {
  assert.match(SITE_SETTINGS, /!\(_id in path\("drafts\.\*\*"\)\)/);
});
