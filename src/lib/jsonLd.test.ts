import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jsonLdScript } from "./jsonLd";

/**
 * A review is the one thing in the shop's structured data that a stranger
 * writes, and a review that contained "</script>" used to end the product
 * page's structured-data tag early and run whatever followed it. See
 * @/lib/jsonLd.
 */

const BREAKOUT = "Beautiful fit! </script><script>alert(document.domain)</script>";

test("a review cannot close the structured-data tag", () => {
  const json = jsonLdScript({ review: [{ reviewBody: BREAKOUT, author: { name: "</script>" } }] });

  assert.equal(json.includes("<"), false, "no raw < survives");
  assert.deepEqual(JSON.parse(json), {
    review: [{ reviewBody: BREAKOUT, author: { name: "</script>" } }],
  });
});

test("the page React renders has exactly one script, and it still reads as the review", () => {
  const html = renderToStaticMarkup(
    createElement("script", {
      type: "application/ld+json",
      dangerouslySetInnerHTML: { __html: jsonLdScript({ reviewBody: BREAKOUT }) },
    })
  );

  assert.equal(html.match(/<script/g)?.length, 1, html);
  assert.equal(html.match(/<\/script>/g)?.length, 1, html);

  const body = html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  assert.equal(JSON.parse(body).reviewBody, BREAKOUT);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx|ts)$/.test(entry) && !entry.includes(".test.") ? [path] : [];
  });
}

/**
 * The one script the site writes into a page that is not data: the root
 * layout's mark for a page whose first stitch is sewn. It may pass because it
 * is nothing but quoted text written in the same file — no value from
 * anywhere else can reach it.
 */
const CONSTANT_SCRIPTS: Record<string, string> = { "src/app/layout.tsx": "SEWN_ONCE" };

test("every block of HTML the site writes by hand goes through jsonLdScript", () => {
  const raw = sourceFiles(join(process.cwd(), "src")).flatMap((path) =>
    readFileSync(path, "utf8")
      .split("\n")
      .map((line, i) => ({ path, line: i + 1, text: line }))
      .filter(({ text }) => text.includes("__html:") && !/__html:\s*jsonLdScript\(/.test(text))
      .filter(({ path, text }) => {
        const name = CONSTANT_SCRIPTS[path.replace(process.cwd() + "/", "")];
        return !(name && new RegExp(`__html: ${name} \\}`).test(text));
      })
  );

  assert.deepEqual(
    raw.map(({ path, line, text }) => `${path.replace(process.cwd(), "")}:${line} ${text.trim()}`),
    []
  );
});

test("the script allowed past the guard is only quoted text from its own file", () => {
  for (const [file, name] of Object.entries(CONSTANT_SCRIPTS)) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    const value = new RegExp(`const ${name} =([\\s\\S]*?);\\n`).exec(source)?.[1];
    assert.ok(value, `${file} defines ${name}`);
    // Double-quoted pieces joined by +, nothing interpolated, nothing named
    assert.match(value.trim(), /^"[^"`$\\]*"(\s*\+\s*"[^"`$\\]*")*$/, value);
  }
});

test("the guard above is looking at real files", () => {
  const uses = sourceFiles(join(process.cwd(), "src")).filter((path) =>
    /__html:\s*jsonLdScript\(/.test(readFileSync(path, "utf8"))
  );
  // layout, product page, /alterations, /alterations/[slug]
  assert.ok(uses.length >= 4, `found ${uses.length}`);
});
