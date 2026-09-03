import { test } from "node:test";
import assert from "node:assert/strict";
import { LOCAL_SERVICES, seasonalNote } from "./localServices";

test("a seasonal banner switches itself off after its season", () => {
  const uniform = LOCAL_SERVICES.find((s) => s.slug === "school-uniform-southampton")!;
  assert.ok(uniform.seasonal, "the uniform page carries the September banner");
  assert.equal(seasonalNote(uniform, new Date("2026-09-15T10:00:00Z")), uniform.seasonal);
  assert.equal(seasonalNote(uniform, new Date("2026-12-01T10:00:00Z")), null);
});

test("a banner without an end date is shown as written", () => {
  const svc = { ...LOCAL_SERVICES[0], seasonal: "Open late this week", seasonalUntil: undefined };
  assert.equal(seasonalNote(svc, new Date("2030-01-01")), "Open late this week");
});

test("every local page answers its own search — no paragraph is shared between pages", () => {
  const seen = new Map<string, string>();
  for (const s of LOCAL_SERVICES) {
    for (const para of [...s.intro, ...s.faqs.map((f) => f.a)]) {
      const key = para.trim().toLowerCase();
      assert.ok(!seen.has(key), `"${para.slice(0, 50)}…" appears on both ${seen.get(key)} and ${s.slug}`);
      seen.set(key, s.slug);
    }
    assert.ok(s.metaTitle.includes("Southampton"), `${s.slug}: the title should name the place people search for`);
    assert.ok(s.prices.length >= 4, `${s.slug}: a price list this short does not answer "how much"`);
  }
});
