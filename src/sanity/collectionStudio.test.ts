import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConcreteRuleClass } from "sanity";
import { siteSettings } from "@/sanity/schemaTypes/siteSettings";
import { poundsTypedAsPence } from "@/sanity/schemaTypes/product";

/**
 * Collect & return in the Studio: the prices Kristina types, and the diary's
 * buttons, which a collection must not have. A collection happens at the
 * customer's door, so it never takes a fitting's time and never sends an
 * invite to the atelier; it is confirmed by its status.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const ROUTE = read("src/app/api/studio/diary/route.ts");
const ACTION = read("src/sanity/moveBookingAction.tsx");

interface FieldDef {
  name: string;
  validation?: (rule: never) => unknown;
  fields?: FieldDef[];
  of?: { fields?: FieldDef[] }[];
}

function field(parent: { fields?: unknown }, name: string): FieldDef {
  const found = ((parent.fields ?? []) as FieldDef[]).find((f) => f.name === name);
  assert.ok(found, `no field "${name}"`);
  return found;
}

const zones = field(field(siteSettings, "collection"), "zones");

function zoneField(name: string): FieldDef {
  const found = zones.of?.[0]?.fields?.find((f) => f.name === name);
  assert.ok(found, `no field "zones[].${name}"`);
  return found;
}

/** What the Studio would say about a value, through Sanity's own rule engine */
async function says(rule: unknown, value: unknown): Promise<string[]> {
  const rules = (Array.isArray(rule) ? rule : [rule]) as {
    validate: (value: unknown, context: never) => Promise<{ level: string; message: string }[]>;
  }[];
  const context = { i18n: { t: (key: string) => key }, path: [] } as never;
  const markers = (await Promise.all(rules.map((r) => r.validate(value, context)))).flat();
  return markers.map((marker) => `${marker.level}: ${marker.message}`);
}

test("a collection price typed in pounds is questioned, with the number to type instead", async () => {
  for (const name of ["fee", "freeFrom"]) {
    const rule = zoneField(name).validation!(ConcreteRuleClass.number() as never);
    assert.deepEqual(await says(rule, 8), [`warning: ${poundsTypedAsPence(8)}`], `${name}: 8 would show £0.08`);
    assert.deepEqual(await says(rule, 800), [], name);
    assert.deepEqual(await says(rule, 0), [], `${name}: 0 is a real answer — always free, or no threshold`);
  }
});

test("a district in two zones is refused: it would quietly take the first zone's price", async () => {
  const rule = zones.validation!(ConcreteRuleClass.array() as never);
  const southampton = { name: "Southampton", districts: ["SO14", "SO17"], fee: 800 };
  assert.deepEqual(await says(rule, [southampton, { name: "Hedge End", districts: ["SO30", "SO53"], fee: 1200 }]), []);

  const twice = await says(rule, [southampton, { name: "Hedge End", districts: ["so17 ", "SO30"], fee: 1200 }]);
  assert.equal(twice.length, 1, twice.join("; "));
  assert.match(twice[0], /^error: .*SO17/);

  assert.deepEqual(await says(rule, [{ ...southampton, districts: ["SO17", "SO17"] }]), [], "twice in one zone is still one price");
  assert.deepEqual(await says(rule, undefined), []);
});

test("the Studio offers no diary time to a collection", () => {
  assert.match(
    ACTION,
    /if \(!doc \|\| !canMove\(doc\.status\) \|\| doc\.collection\) return null;/,
    "«Назначить время» on a collection books a fitting nobody is coming to"
  );
});

test("the diary refuses a collection before moving anything, even from a Studio opened before the rule", () => {
  const move = ROUTE.slice(ROUTE.indexOf('if (body.action === "move")'));
  const refused = move.indexOf("if (from.collection)");
  assert.notEqual(refused, -1, "the diary route gives a collection a fitting's time");
  assert.ok(refused < move.indexOf("moveBooking("), "Refuse a collection before anything is moved.");
});

test("an email from the Studio's diary keeps the collection it is about", () => {
  const tell = ROUTE.slice(ROUTE.indexOf("async function tellCustomer"), ROUTE.indexOf("export async function POST"));
  assert.match(tell, /\bcollection:/, "without it, a collection is emailed as an appointment at the atelier");
});
