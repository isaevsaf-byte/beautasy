import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, parse } from "groq-js";
import { ConcreteRuleClass } from "sanity";
import { review } from "@/sanity/schemaTypes/review";
import { siteSettings } from "@/sanity/schemaTypes/siteSettings";
import {
  NEXTDOOR_REVIEWS_FILTER,
  NEXTDOOR_TEMPLATE_ID,
  SITE_REVIEWS_FILTER,
  nextdoorReviewTemplate,
} from "@/sanity/reviewLists";

/**
 * Recommendations from Nextdoor are typed into the Studio by Kristina, in the
 * same `review` documents the site's form writes. So the form has to become a
 * different form for them — no stars, no piece, an area and a date instead —
 * and the two lists in the sidebar have to split them the same way the site
 * does. What the site then shows is tested in @/lib/siteReviews.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

type Callback = (context: { document?: unknown; value?: unknown }) => boolean;
interface FieldDef {
  name: string;
  hidden?: boolean | Callback;
  readOnly?: boolean | Callback;
  validation?: (rule: never) => unknown;
}

function field(doc: { fields: unknown }, name: string): FieldDef {
  const found = (doc.fields as FieldDef[]).find((f) => f.name === name);
  assert.ok(found, `no field "${name}"`);
  return found;
}

const SITE = { _type: "review", source: "site" };
const OLD = { _type: "review" }; // saved before reviews had a source
const NEXTDOOR = { _type: "review", source: "nextdoor" };

function flag(value: FieldDef["hidden"], document: unknown, fieldValue?: unknown): boolean {
  return typeof value === "function" ? value({ document, value: fieldValue }) : Boolean(value);
}

/** What the Studio would say about a value, through Sanity's own rule engine */
async function says(rule: unknown, value: unknown, document: unknown): Promise<string[]> {
  const rules = (Array.isArray(rule) ? rule : [rule]) as {
    validate: (value: unknown, context: never) => Promise<{ level: string; message: string }[]>;
  }[];
  const context = { i18n: { t: (key: string) => key }, path: [], document } as never;
  const markers = (await Promise.all(rules.map((r) => r.validate(value, context)))).flat();
  return markers.map((marker) => `${marker.level}: ${marker.message}`);
}

const ratingRule = () => field(review, "rating").validation!(ConcreteRuleClass.number() as never);

test("a review written on the site needs its stars; a Nextdoor recommendation has none to give", async () => {
  assert.deepEqual(await says(ratingRule(), 5, SITE), []);
  assert.deepEqual(await says(ratingRule(), 5, OLD), []);
  assert.match((await says(ratingRule(), undefined, SITE)).join(), /^error: Поставьте оценку/);
  assert.match((await says(ratingRule(), undefined, OLD)).join(), /^error: Поставьте оценку/);
  assert.deepEqual(await says(ratingRule(), undefined, NEXTDOOR), [], "nothing stops Kristina publishing it");
  assert.notDeepEqual(await says(ratingRule(), 6, SITE), [], "still one to five");
});

test("the form for a Nextdoor recommendation asks only what Nextdoor has", () => {
  for (const name of ["rating", "product", "images", "orderId", "verifiedPurchase", "userId"]) {
    const hidden = field(review, name).hidden;
    assert.equal(flag(hidden, NEXTDOOR), true, `${name} is hidden for Nextdoor`);
    assert.equal(flag(hidden, SITE), false, `${name} still shows on a review from the site`);
    assert.equal(flag(hidden, OLD), false, `${name} still shows on an older review`);
  }
  const area = field(review, "neighbourhood").hidden;
  assert.equal(flag(area, NEXTDOOR), false);
  assert.equal(flag(area, SITE), true, "a site review has no area to fill in");

  // The date is the day the neighbour wrote it, so Kristina sets it; a review
  // from the site keeps the moment it arrived
  const date = field(review, "createdAt").readOnly;
  assert.equal(flag(date, NEXTDOOR), false);
  assert.equal(flag(date, SITE), true);
  assert.equal(flag(date, OLD), true);

  assert.equal(field(review, "source").readOnly, true, "where a review came from is never retyped");
});

test("«Рекомендация Nextdoor» starts marked as Nextdoor, approved, and dated today", async () => {
  assert.equal(nextdoorReviewTemplate.id, NEXTDOOR_TEMPLATE_ID);
  assert.equal(nextdoorReviewTemplate.schemaType, "review");
  const value = await (nextdoorReviewTemplate.value as () => Record<string, unknown>)();
  assert.equal(value.source, "nextdoor");
  assert.equal(value.approved, true);
  const age = Date.now() - Date.parse(String(value.createdAt));
  assert.ok(age >= 0 && age < 60_000, "dated now, for her to change");
});

test("the two lists split the reviews the way the site does, older ones counted as the site's", async () => {
  const dataset = [
    { _id: "old", ...OLD },
    { _id: "site", ...SITE },
    { _id: "nd", ...NEXTDOOR },
    { _id: "p", _type: "product", source: "site" },
  ];
  const ids = async (filter: string) =>
    (await (await evaluate(parse(`*[${filter}]._id`), { dataset })).get()) as string[];
  assert.deepEqual((await ids(SITE_REVIEWS_FILTER)).sort(), ["old", "site"]);
  assert.deepEqual(await ids(NEXTDOOR_REVIEWS_FILTER), ["nd"]);
});

test("the sidebar and the Studio use those lists and that template", () => {
  const structure = read("src/sanity/structure.ts");
  assert.match(structure, /\.id\("review"\)\s*\.title\("Отзывы"\)/, "the old address of the list still opens it");
  assert.match(structure, /\.filter\(SITE_REVIEWS_FILTER\)\s*\.initialValueTemplates\(\[S\.initialValueTemplateItem\("review"\)\]\)/);
  assert.match(structure, /\.title\("Рекомендации Nextdoor"\)/);
  assert.match(
    structure,
    /\.filter\(NEXTDOOR_REVIEWS_FILTER\)\s*\.initialValueTemplates\(\[S\.initialValueTemplateItem\(NEXTDOOR_TEMPLATE_ID\)\]\)/
  );
  assert.doesNotMatch(structure, /documentTypeListItem\("review"\)/, "one list for every review would mix the two again");
  assert.match(read("sanity.config.ts"), /templates: \(prev\) => \[\.\.\.prev, nextdoorReviewTemplate\]/);
});

test("the Nextdoor page in Site Settings takes a Nextdoor address and nothing else", async () => {
  const rule = field(siteSettings, "nextdoorUrl").validation!(ConcreteRuleClass.string() as never);
  assert.deepEqual(await says(rule, undefined, {}), [], "empty is fine: then there is no button");
  assert.deepEqual(await says(rule, "https://nextdoor.co.uk/pages/beautasy-atelier-southampton-eng/", {}), []);
  assert.notDeepEqual(await says(rule, "https://www.instagram.com/beautasy_lingerie_uk/", {}), []);
  assert.notDeepEqual(await says(rule, "http://nextdoor.co.uk/pages/beautasy/", {}), []);
});
