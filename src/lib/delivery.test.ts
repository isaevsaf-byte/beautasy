import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DELIVERY_TIMES,
  INTERNATIONAL_DELIVERY_DAYS,
  UK_DELIVERY_DAYS,
  withoutQuotedDays,
} from "./delivery";

/**
 * The product page and Stripe's payment page must quote the same delivery
 * times. They once said UK 2–3 / rest of world 6–7 against Stripe's 3–5 and
 * 7–14, and a buyer reading both could not tell which we would keep.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("the product page quotes the delivery times checkout gives Stripe", () => {
  const route = read("src/app/api/checkout/route.ts");
  if (/from\s+["']@\/lib\/delivery["']/.test(route)) return; // the route uses these very constants

  const estimates = [
    ...route.matchAll(
      /display_name:[^\n]*?"([^"]*)"[^]*?delivery_estimate:\s*\{\s*minimum:\s*\{[^}]*value:\s*(\d+)\s*\},\s*maximum:\s*\{[^}]*value:\s*(\d+)/g
    ),
  ].map(([, name, min, max]) => ({ international: /international/i.test(name), min: Number(min), max: Number(max) }));

  assert.ok(estimates.some((e) => !e.international), "found the UK rate");
  assert.ok(estimates.some((e) => e.international), "found the international rate");
  for (const e of estimates) {
    const ours = e.international ? INTERNATIONAL_DELIVERY_DAYS : UK_DELIVERY_DAYS;
    assert.deepEqual(
      { min: e.min, max: e.max },
      { ...ours },
      "Stripe and the Shipping section would promise different days — change both, in @/lib/delivery"
    );
  }
});

test("the Shipping section says those times in words", () => {
  assert.ok(DELIVERY_TIMES.some((line) => /^UK: .*3–5 business days/.test(line)));
  assert.ok(DELIVERY_TIMES.some((line) => /^International: .*7–14 business days/.test(line)));
});

const block = (text: string) => ({ _type: "block", children: [{ _type: "span", text }] });

test("Kristina's own Shipping text loses the days it quotes, and keeps the rest", () => {
  // The text every product carried on 3 October 2026
  const studio = [
    block("Processing: Individually handcrafted in our Southampton studio. Ready to dispatch within 3–5 business days."),
    block("UK Delivery: Royal Mail Tracked 48 (typically 2–3 business days) — £3.50 or FREE on orders over £50."),
    block("International Shipping: Tracked worldwide shipping via Royal Mail International Tracked from £12.00."),
    block("Europe: 3–5 business days."),
    block("Rest of the World: 6–7 business days."),
    block("Customs & Import Duties: Please note that international orders may be subject to local taxes and duties."),
  ];
  const kept = withoutQuotedDays(studio) as ReturnType<typeof block>[];
  assert.deepEqual(
    kept.map((b) => b.children[0].text.split(":")[0]),
    ["International Shipping", "Customs & Import Duties"]
  );
  assert.deepEqual(withoutQuotedDays([block("Dispatched in 7 days")]), []);
  assert.deepEqual(withoutQuotedDays([block("Sent 2-3 working days later")]), []);
  assert.deepEqual(withoutQuotedDays(null), []);
});
