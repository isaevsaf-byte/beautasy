import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, parse } from "groq-js";
import { ConcreteRuleClass } from "sanity";
import { review } from "@/sanity/schemaTypes/review";
import { siteSettings } from "@/sanity/schemaTypes/siteSettings";
import {
  ETSY_REVIEWS_FILTER,
  ETSY_TEMPLATE_ID,
  GOOGLE_REVIEWS_FILTER,
  GOOGLE_TEMPLATE_ID,
  NEXTDOOR_REVIEWS_FILTER,
  NEXTDOOR_TEMPLATE_ID,
  SITE_REVIEWS_FILTER,
  etsyReviewTemplate,
  googleReviewTemplate,
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
const GOOGLE = { _type: "review", source: "google" };
const ETSY = { _type: "review", source: "etsy" };

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
  // Google's and Etsy's reviews come with stars, so they need them here too
  assert.match((await says(ratingRule(), undefined, GOOGLE)).join(), /^error: Поставьте оценку/);
  assert.match((await says(ratingRule(), undefined, ETSY)).join(), /^error: Поставьте оценку/);
  assert.deepEqual(await says(ratingRule(), 5, GOOGLE), []);
  assert.notDeepEqual(await says(ratingRule(), 6, SITE), [], "still one to five");
});

test("the form for a Nextdoor recommendation asks only what Nextdoor has", () => {
  for (const name of ["rating", "product", "images", "orderId", "verifiedPurchase", "userId"]) {
    const hidden = field(review, name).hidden;
    assert.equal(flag(hidden, NEXTDOOR), true, `${name} is hidden for Nextdoor`);
    assert.equal(flag(hidden, SITE), false, `${name} still shows on a review from the site`);
    assert.equal(flag(hidden, OLD), false, `${name} still shows on an older review`);
  }
  // Google and Etsy have no piece here, photos or order either — but they have stars
  for (const name of ["product", "images", "orderId", "verifiedPurchase", "userId"]) {
    const hidden = field(review, name).hidden;
    assert.equal(flag(hidden, GOOGLE), true, `${name} is hidden for Google`);
    assert.equal(flag(hidden, ETSY), true, `${name} is hidden for Etsy`);
  }
  assert.equal(flag(field(review, "rating").hidden, GOOGLE), false);
  assert.equal(flag(field(review, "rating").hidden, ETSY), false);
  const item = field(review, "item").hidden;
  assert.equal(flag(item, ETSY), false, "what was bought on Etsy");
  assert.equal(flag(item, GOOGLE), true);
  assert.equal(flag(item, SITE), true);
  const area = field(review, "neighbourhood").hidden;
  assert.equal(flag(area, NEXTDOOR), false);
  assert.equal(flag(area, SITE), true, "a site review has no area to fill in");
  assert.equal(flag(area, GOOGLE), true);
  assert.equal(flag(area, ETSY), true);

  // The date is the day the neighbour wrote it, so Kristina sets it; a review
  // from the site keeps the moment it arrived
  const date = field(review, "createdAt").readOnly;
  assert.equal(flag(date, NEXTDOOR), false);
  assert.equal(flag(date, GOOGLE), false);
  assert.equal(flag(date, ETSY), false);
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

  assert.equal(googleReviewTemplate.id, GOOGLE_TEMPLATE_ID);
  const google = await (googleReviewTemplate.value as () => Record<string, unknown>)();
  assert.equal(google.source, "google");
  assert.equal(google.approved, true);

  assert.equal(etsyReviewTemplate.id, ETSY_TEMPLATE_ID);
  const etsy = await (etsyReviewTemplate.value as () => Record<string, unknown>)();
  assert.equal(etsy.source, "etsy");
  assert.equal(etsy.approved, true);
  assert.equal(etsy.about, "shop", "every Etsy review is about a piece from the shop");
});

test("the two lists split the reviews the way the site does, older ones counted as the site's", async () => {
  const dataset = [
    { _id: "old", ...OLD },
    { _id: "site", ...SITE },
    { _id: "nd", ...NEXTDOOR },
    { _id: "g", ...GOOGLE },
    { _id: "e", ...ETSY },
    { _id: "p", _type: "product", source: "site" },
  ];
  const ids = async (filter: string) =>
    (await (await evaluate(parse(`*[${filter}]._id`), { dataset })).get()) as string[];
  assert.deepEqual((await ids(SITE_REVIEWS_FILTER)).sort(), ["old", "site"]);
  assert.deepEqual(await ids(NEXTDOOR_REVIEWS_FILTER), ["nd"]);
  assert.deepEqual(await ids(GOOGLE_REVIEWS_FILTER), ["g"]);
  assert.deepEqual(await ids(ETSY_REVIEWS_FILTER), ["e"]);
});

test("the sidebar and the Studio use those lists and that template", () => {
  const structure = read("src/sanity/structure.ts");
  // The list keeps its id inside the «Отзывы» folder; an old address to it
  // (/studio/structure/review;…) is sent on to reviews;review;… — see studioMoves
  assert.match(structure, /\.id\("reviews"\)\s*\.title\("Отзывы"\)/, "every review in one folder");
  assert.match(structure, /\.id\("review"\)\s*\.title\("Отзывы с сайта"\)/, "the site's list keeps its id");
  // Each list's own template, and set LAST: every later call on the list
  // copies it and Sanity guesses the templates afresh — all four review
  // kinds — so «+ Создать» used to offer every kind in every list
  for (const [filter, template] of [
    ["SITE_REVIEWS_FILTER", '"review"'],
    ["NEXTDOOR_REVIEWS_FILTER", "NEXTDOOR_TEMPLATE_ID"],
    ["GOOGLE_REVIEWS_FILTER", "GOOGLE_TEMPLATE_ID"],
    ["ETSY_REVIEWS_FILTER", "ETSY_TEMPLATE_ID"],
  ]) {
    const list = new RegExp(
      `\\.filter\\(${filter}\\)[^]*?\\.initialValueTemplates\\(\\[S\\.initialValueTemplateItem\\(${template}\\)\\]\\)\\s*\\)`
    );
    assert.match(structure, list, `${filter}: its own template, as the list's last call`);
    const body = list.exec(structure)![0];
    assert.equal(body.match(/\.initialValueTemplates\(/g)?.length, 1, `${filter}: one template call, no other list's`);
  }
  assert.match(structure, /\.title\("Рекомендации Nextdoor"\)/);
  assert.doesNotMatch(structure, /documentTypeListItem\("review"\)/, "one list for every review would mix the two again");
  assert.match(
    read("sanity.config.ts"),
    /templates: \(prev\) => \[\.\.\.prev, nextdoorReviewTemplate, googleReviewTemplate, etsyReviewTemplate\]/
  );
});

test("the Nextdoor page in Site Settings takes a Nextdoor address and nothing else", async () => {
  const rule = field(siteSettings, "nextdoorUrl").validation!(ConcreteRuleClass.string() as never);
  assert.deepEqual(await says(rule, undefined, {}), [], "empty is fine: then there is no button");
  assert.deepEqual(await says(rule, "https://nextdoor.co.uk/pages/beautasy-atelier-southampton-eng/", {}), []);
  assert.notDeepEqual(await says(rule, "https://www.instagram.com/beautasy_lingerie_uk/", {}), []);
  assert.notDeepEqual(await says(rule, "http://nextdoor.co.uk/pages/beautasy/", {}), []);
});
