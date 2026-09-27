/**
 * The Studio's own Russian names for the lists an Our Work piece picks from.
 *
 * The site shows WORK_CATEGORIES, WORK_SHELVES and LOCAL_SERVICES to customers
 * in English, so those lists stay exactly as they are. Kristina reads the
 * Studio in Russian: here each stored value gets the name she sees. Keyed by
 * value, so nothing stored changes — and a value added to one of the site's
 * lists without a name here fails src/components/work/workWiring.test.ts.
 */

import { WORK_CATEGORIES, WORK_SHELVES, type WorkCategory } from "@/lib/work";
import { LOCAL_SERVICES } from "@/lib/localServices";

export const WORK_CATEGORY_TITLES: Readonly<Record<WorkCategory, string>> = {
  alterations: "Подгонка и ремонт",
  home: "Шторы и дом",
  made: "Сшито с нуля",
  kids: "Детское (Mini)",
  accessories: "Аксессуары",
  workroom: "Мастерская: процесс",
};

/** Keyed by the shop link, as WORK_SHELVES writes it */
export const WORK_SHELF_TITLES: Readonly<Record<string, string>> = {
  "/shop/accessories?category=hair-accessories": "Аксессуары для волос",
  "/shop/accessories?category=pouches": "Косметички",
  "/shop/accessories?category=sleeping-masks": "Маски для сна",
  "/shop/kids?category=underwear": "Детское бельё",
  "/shop/kids": "Детский раздел Mini Beautasy",
  "/shop/lingerie": "Женское бельё",
  "/shop/home": "Декор для дома",
  "/gift-cards": "Подарочные карты",
};

/** Keyed by the service page's slug under /alterations */
export const WORK_SERVICE_TITLES: Readonly<Record<string, string>> = {
  "wedding-dress-southampton": "Подгонка свадебных платьев",
  "school-uniform-southampton": "Подгонка школьной формы",
  "prom-and-evening-dress-southampton": "Подгонка выпускных и вечерних платьев",
  "jeans-and-trousers-southampton": "Подгонка джинсов и брюк",
  "zip-replacement-southampton": "Замена молний и ремонт одежды",
  "curtains-and-home-southampton": "Шторы и домашний текстиль",
};

// The site's values in the site's order. A value with no Russian name yet
// still shows, under its English one, until the test above is answered.
export const WORK_CATEGORY_OPTIONS = WORK_CATEGORIES.map((c) => ({
  title: WORK_CATEGORY_TITLES[c.value] ?? c.label,
  value: c.value,
}));

export const WORK_SHELF_OPTIONS = WORK_SHELVES.map((s) => ({
  title: WORK_SHELF_TITLES[s.value] ?? s.title,
  value: s.value,
}));

export const WORK_SERVICE_OPTIONS = LOCAL_SERVICES.map((s) => ({
  title: WORK_SERVICE_TITLES[s.slug] ?? `${s.eyebrow} — ${s.serviceName}`,
  value: s.slug,
}));

/** A category as the Studio names it; the stored value for one the site no longer has */
export function workCategoryTitle(category: string): string {
  return (WORK_CATEGORY_TITLES as Readonly<Record<string, string>>)[category] ?? category;
}
