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

test("every block of HTML the site writes by hand goes through jsonLdScript", () => {
  const raw = sourceFiles(join(process.cwd(), "src")).flatMap((path) =>
    readFileSync(path, "utf8")
      .split("\n")
      .map((line, i) => ({ path, line: i + 1, text: line }))
      .filter(({ text }) => text.includes("__html:") && !/__html:\s*jsonLdScript\(/.test(text))
  );

  assert.deepEqual(
    raw.map(({ path, line, text }) => `${path.replace(process.cwd(), "")}:${line} ${text.trim()}`),
    []
  );
});

test("the guard above is looking at real files", () => {
  const uses = sourceFiles(join(process.cwd(), "src")).filter((path) =>
    /__html:\s*jsonLdScript\(/.test(readFileSync(path, "utf8"))
  );
  // layout, product page, /alterations, /alterations/[slug]
  assert.ok(uses.length >= 4, `found ${uses.length}`);
});
