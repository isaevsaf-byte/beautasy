import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * No invisible characters in the source.
 *
 * A byte-order mark, a no-break space, a zero-width space or a character that
 * turns text around cannot be seen in an editor, and an editor can strip one
 * without anyone noticing. A test that compares against an invisible
 * character then compares against nothing, and stays green whatever the code
 * does — the reason «Касса»'s export test was rewritten to spell its BOM out.
 *
 * It happened twice anyway: the tools used to write this code turn a
 * backslash-u escape into the character itself, so the spelled-out BOM went
 * back to being invisible, and so did the partner form's list of characters
 * it strips. This walks every source file and names each one by its code
 * point, so it has to be written as an escape.
 */

const ROOT = process.cwd();
const DIRS = ["src", "scripts", "workers"];
const FILES = ["sanity.config.ts", "next.config.ts"];
const EXTENSIONS = /\.(ts|tsx|js|mjs|cjs)$/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTENSIONS.test(name)) out.push(path);
  }
}

/** Format characters, controls other than tab and line breaks, and every space that is not a space. */
function isHidden(ch: string): boolean {
  if (ch === "\t" || ch === "\n" || ch === "\r" || ch === " ") return false;
  return /\p{Cf}|\p{Cc}|\p{Z}/u.test(ch);
}

test("no source file carries a character nobody can see", () => {
  const files: string[] = [];
  for (const dir of DIRS) {
    try {
      walk(join(ROOT, dir), files);
    } catch {
      // A folder that is not there has nothing hidden in it
    }
  }
  for (const file of FILES) files.push(join(ROOT, file));

  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    let line = 1;
    for (const ch of text) {
      if (ch === "\n") line += 1;
      else if (isHidden(ch)) {
        found.push(`${relative(ROOT, file)}:${line} U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
      }
    }
  }
  assert.ok(files.length > 100, "the walk found the source");
  assert.deepEqual(found, [], `Write these as escapes instead:\n${found.join("\n")}`);
});

test("the check itself sees what it is looking for", () => {
  for (const code of [0xfeff, 0xa0, 0x200b, 0x202e, 0x2066, 0x0]) {
    assert.equal(isHidden(String.fromCodePoint(code)), true, `U+${code.toString(16)}`);
  }
  for (const visible of ["a", "Я", "£", "—", "💜", " ", "\t", "\n"]) assert.equal(isHidden(visible), false, visible);
});
