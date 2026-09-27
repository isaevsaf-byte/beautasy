import { test } from "node:test";
import assert from "node:assert/strict";
import { ConcreteRuleClass } from "sanity";
import { CATEGORY_SLUGS } from "@/lib/shelves";
import {
  CATEGORIES,
  SIZES,
  poundsTypedAsPence,
  priceLabel,
  product,
  titleFor,
} from "@/sanity/schemaTypes/product";
import { giftBox } from "@/sanity/schemaTypes/giftBox";

/**
 * The product and gift box forms speak Russian to Kristina, but what they
 * store is read by the shop, its URLs, past orders and Stripe. So the values
 * stay English, prices stay in pence, and anything the Studio has no Russian
 * title for is shown as it is stored rather than as a blank.
 */

type Option = { title: string; value: string };
type Prepare = (value: Record<string, unknown>) => Record<string, unknown>;
interface FieldDef {
  name: string;
  title?: string;
  validation?: (rule: never) => unknown;
  options?: { list?: Option[] };
  of?: { fields?: FieldDef[]; preview?: { prepare?: Prepare } }[];
}

function field(doc: { fields: unknown }, name: string): FieldDef {
  const found = (doc.fields as FieldDef[]).find((f) => f.name === name);
  assert.ok(found, `no field "${name}"`);
  return found;
}

function inner(parent: FieldDef, name: string): FieldDef {
  const found = parent.of?.[0]?.fields?.find((f) => f.name === name);
  assert.ok(found, `no field "${parent.name}.${name}"`);
  return found;
}

const CYRILLIC = /[а-яё]/i;

/** What the Studio would say about a value, through Sanity's own rule engine */
async function says(numberField: FieldDef, value: unknown): Promise<string[]> {
  const built = numberField.validation!(ConcreteRuleClass.number() as never);
  const rules = (Array.isArray(built) ? built : [built]) as {
    validate: (value: unknown, context: never) => Promise<{ level: string; message: string }[]>;
  }[];
  const context = { i18n: { t: (key: string) => key }, path: [] } as never;
  const markers = (await Promise.all(rules.map((rule) => rule.validate(value, context)))).flat();
  return markers.map((marker) => `${marker.level}: ${marker.message}`);
}

test("the Studio offers exactly the shop's categories, each under a Russian title", () => {
  assert.deepEqual(
    CATEGORIES.map((c) => c.value).sort(),
    Object.keys(CATEGORY_SLUGS).sort(),
    "a category the shop has no address for would be a shelf nobody can reach"
  );
  assert.deepEqual(field(product, "category").options?.list, CATEGORIES);
  for (const { title, value } of CATEGORIES) assert.match(title, CYRILLIC, value);
});

test("the values the shop and past orders read are the ones they always were", () => {
  assert.deepEqual(
    field(product, "subcategory").options?.list?.map((o) => o.value),
    ["bras", "knickers", "belts", "garters", "sleeping-masks", "sets", "underwear", "pyjamas", "blankets",
      "muslin-cloths", "accessories", "hair-accessories", "pouches", "organisers", "cushion-cover",
      "table-runner", "placemats", "napkins"]
  );
  const sizes = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "1-1.5Y", "2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y", "12-13Y"];
  assert.deepEqual(SIZES.map((s) => s.value), sizes);
  // The three places a size is picked offer the same list
  assert.deepEqual(field(product, "availableSizes").options?.list, SIZES);
  assert.deepEqual(inner(field(product, "sizePrices"), "size").options?.list, SIZES);
  assert.deepEqual(inner(field(product, "sizeStock"), "size").options?.list, SIZES);
  assert.deepEqual(field(product, "gender").options?.list?.map((o) => o.value), ["female", "male", "unisex"]);
  assert.deepEqual(field(product, "ageGroup").options?.list?.map((o) => o.value), ["adult", "kids", "toddler", "infant", "newborn"]);
  assert.deepEqual(field(product, "productBadges").options?.list?.map((o) => o.value), ["new-in", "best-seller", "limited-edition"]);

  // Every option Kristina reads is in Russian — letter sizes are the same in both
  for (const name of ["subcategory", "gender", "ageGroup", "productBadges"]) {
    for (const { title, value } of field(product, name).options?.list ?? []) assert.match(title, CYRILLIC, `${name}: ${value}`);
  }
  for (const { title, value } of SIZES) assert.ok(title.trim(), value);
});

test("a value the Studio has no title for shows as it is stored, never as a blank", () => {
  assert.equal(titleFor(CATEGORIES, "Lingerie"), "Бельё");
  assert.equal(titleFor(CATEGORIES, "Mini"), "Mini");
  assert.equal(titleFor(SIZES, "4-5Y"), "4–5 лет");
  assert.equal(titleFor(SIZES, "3-4Y"), "3-4Y");

  const list = product.preview!.prepare! as unknown as Prepare;
  assert.deepEqual(list({ title: "Silk slip", category: "Lingerie", price: 2500 }), {
    title: "Silk slip",
    subtitle: "Бельё · £25.00",
    media: undefined,
  });
  // A price typed in pounds stands out in the list
  assert.equal(list({ title: "Old", category: "Mini", price: 25 }).subtitle, "Mini · £0.25");
  assert.equal(list({ title: "Draft" }).subtitle, "Цена не указана");

  const sizePrice = field(product, "sizePrices").of![0].preview!.prepare!;
  assert.deepEqual(sizePrice({ title: "4-5Y", subtitle: 1500 }), { title: "Размер 4–5 лет", subtitle: "£15.00" });
  assert.deepEqual(sizePrice({ title: "3-4Y" }), { title: "Размер 3-4Y", subtitle: "Цена не указана" });
  assert.deepEqual(sizePrice({}), { title: "Размер ?", subtitle: "Цена не указана" });

  const sizeStock = field(product, "sizeStock").of![0].preview!.prepare!;
  assert.deepEqual(sizeStock({ title: "M", subtitle: 2 }), { title: "Размер M", subtitle: "Готовых: 2 шт." });
  assert.deepEqual(sizeStock({ title: "3-4Y" }), { title: "Размер 3-4Y", subtitle: "Готовых: 0 шт." });

  const box = giftBox.preview!.prepare! as unknown as Prepare;
  assert.equal(box({ title: "Box", price: 4999 }).subtitle, "£49.99");
  assert.equal(box({ title: "Box" }).subtitle, "Цена не указана");
  assert.equal(priceLabel(0), "£0.00", "a zero price is a price, and says so");
});

test("a price typed in pounds is questioned, with the number to type instead", () => {
  assert.equal(poundsTypedAsPence(25), "Похоже, цена в фунтах: 25 пенсов — это £0.25. Для £25 введите 2500.");
  assert.equal(poundsTypedAsPence(1), "Похоже, цена в фунтах: 1 пенс — это £0.01. Для £1 введите 100.");
  assert.match(poundsTypedAsPence(2) ?? "", /^Похоже, цена в фунтах: 2 пенса /);
  assert.match(poundsTypedAsPence(11) ?? "", / 11 пенсов /);
  assert.match(poundsTypedAsPence(21) ?? "", / 21 пенс /);
  assert.match(poundsTypedAsPence(22) ?? "", / 22 пенса /);
  assert.match(poundsTypedAsPence(99) ?? "", / 99 пенсов — это £0\.99\. Для £99 введите 9900\.$/);
  for (const fine of [100, 2500, 0, -5, 25.5, "25", undefined, null]) assert.equal(poundsTypedAsPence(fine), null, String(fine));
});

test("every price is labelled in pence, refuses a decimal point and questions pounds (M9)", async () => {
  const productPrice = field(product, "price");
  const prices: [string, FieldDef][] = [
    ["product.price", productPrice],
    ["product.sizePrices[].price", inner(field(product, "sizePrices"), "price")],
    ["product.madeToMeasurePrice", field(product, "madeToMeasurePrice")],
    ["product.giftBoxPrice", field(product, "giftBoxPrice")],
    ["giftBox.price", field(giftBox, "price")],
  ];
  for (const [where, price] of prices) {
    assert.match(price.title ?? "", /в пенсах/, where);
    // 25.99 is a price Stripe refuses: the whole checkout would fail
    assert.deepEqual(await says(price, 25.99), ["error: Только целое число пенсов, без точки: £25.99 — это 2599."], where);
    assert.deepEqual(await says(price, 25), [`warning: ${poundsTypedAsPence(25)}`], where);
    assert.deepEqual(await says(price, 2500), [], where);
  }

  // Every price in the shop on 27 September 2026 passes untouched, so no
  // product is stopped from being published by the new rules
  for (const pence of [1000, 1200, 1500, 1800, 2000, 2200, 2500, 2800, 2900]) {
    assert.deepEqual(await says(productPrice, pence), [], String(pence));
  }
  assert.deepEqual(await says(field(product, "giftBoxPrice"), 450), []);

  // The optional add-ons may be left at nothing; the prices themselves may not
  assert.deepEqual(await says(field(product, "madeToMeasurePrice"), 0), []);
  assert.deepEqual(await says(field(product, "giftBoxPrice"), undefined), []);
  const missing = await says(productPrice, undefined);
  assert.ok(missing.includes("error: validation:generic.required"), missing.join("; "));
  assert.ok(missing.every((m) => m.startsWith("error: validation:")), "only Sanity's own messages, as before");
});
