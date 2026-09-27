import { defineField, defineType, type NumberRule } from "sanity";

/*
 * The Studio speaks Russian to Kristina; what it stores does not change. Every
 * option's value is what the shop, its URLs and past orders read, so values
 * stay as they were and only the titles beside them are Russian.
 */

/** The shop's categories. The values are the keys of CATEGORY_SLUGS in @/lib/shelves. */
export const CATEGORIES = [
  { title: "Бельё", value: "Lingerie" },
  { title: "Детское", value: "Kids" },
  { title: "Аксессуары", value: "Accessories" },
  { title: "Для дома", value: "Home" },
];

/** Every size a piece can come in. The values are what the bag, orders and size prices read. */
export const SIZES = [
  // ── Adult sizes ──
  { title: "XXS", value: "XXS" },
  { title: "XS", value: "XS" },
  { title: "S", value: "S" },
  { title: "M", value: "M" },
  { title: "L", value: "L" },
  { title: "XL", value: "XL" },
  { title: "XXL", value: "XXL" },
  { title: "XXXL", value: "XXXL" },
  // ── Kids sizes ──
  { title: "1–1.5 года", value: "1-1.5Y" },
  { title: "2–3 года", value: "2-3Y" },
  { title: "4–5 лет", value: "4-5Y" },
  { title: "6–7 лет", value: "6-7Y" },
  { title: "8–9 лет", value: "8-9Y" },
  { title: "10–11 лет", value: "10-11Y" },
  { title: "12–13 лет", value: "12-13Y" },
];

/** The title the Studio gives a stored value — or the value itself, so one it has no title for never shows blank */
export function titleFor(options: { title: string; value: string }[], value: string): string {
  return options.find((option) => option.value === value)?.title ?? value;
}

/** A price in pence the way the shop writes it: 2500 → "£25.00" */
export function priceLabel(pence: unknown): string {
  return typeof pence === "number" ? `£${(pence / 100).toFixed(2)}` : "Цена не указана";
}

const PENCE_WORD: Record<string, string> = { one: "пенс", few: "пенса", many: "пенсов" };

/**
 * A price under £1, which here almost certainly means pounds were typed: 25
 * for £25 would sell the piece for 25p. Nothing in the shop costs less than a
 * pound. Returns the warning, with the number to type instead — or null.
 * Fractions are left to the integer rule, which turns them back on its own.
 */
export function poundsTypedAsPence(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 99) return null;
  const word = PENCE_WORD[new Intl.PluralRules("ru").select(value)] ?? "пенсов";
  return `Похоже, цена в фунтах: ${value} ${word} — это £${(value / 100).toFixed(2)}. Для £${value} введите ${value * 100}.`;
}

/**
 * Prices are kept in pence because Stripe charges in pence. A price with a
 * decimal point (25.99) is one Stripe refuses, so the whole checkout fails:
 * that is an error. A price typed in pounds only looks wrong, so it gets a
 * warning (audit item M9).
 */
export function penceRules(rule: NumberRule): NumberRule[] {
  return [
    rule.integer().error("Только целое число пенсов, без точки: £25.99 — это 2599."),
    rule.custom<number>((value) => poundsTypedAsPence(value) ?? true).warning(),
  ];
}

export const product = defineType({
  name: "product",
  title: "Товар",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Название товара",
      type: "string",
      description: "Видят покупатели и Google — по-английски.",
      validation: (Rule) => Rule.required().min(2).max(100),
    }),
    defineField({
      name: "slug",
      title: "Адрес страницы (slug)",
      type: "slug",
      options: {
        source: "name",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "images",
      title: "Фотографии товара",
      type: "array",
      of: [
        {
          type: "image",
          title: "Фото",
          options: {
            hotspot: true,
          },
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "price",
      title: "Цена в пенсах",
      type: "number",
      description: "2500 = £25.00. Только целое число, без точки и знака £.",
      validation: (Rule) => [Rule.required().min(1), ...penceRules(Rule)],
    }),
    defineField({
      name: "description",
      title: "Описание",
      type: "array",
      of: [{ type: "block" }],
      description: "Текст на странице товара — по-английски, своими словами.",
    }),
    defineField({
      name: "category",
      title: "Категория",
      type: "string",
      options: {
        list: CATEGORIES,
        layout: "radio",
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "gender",
      title: "Пол",
      type: "string",
      description: "Обязательно для одежды в Google Shopping.",
      options: {
        list: [
          { title: "Женский", value: "female" },
          { title: "Мужской", value: "male" },
          { title: "Унисекс", value: "unisex" },
        ],
        layout: "radio",
      },
    }),
    defineField({
      name: "ageGroup",
      title: "Возрастная группа",
      type: "string",
      description: "Обязательно для одежды в Google Shopping.",
      options: {
        list: [
          { title: "Взрослые (13+)", value: "adult" },
          { title: "Дети (5–13 лет)", value: "kids" },
          { title: "Малыши (1–5 лет)", value: "toddler" },
          { title: "Младенцы (3–12 месяцев)", value: "infant" },
          { title: "Новорождённые (0–3 месяца)", value: "newborn" },
        ],
        layout: "radio",
      },
    }),
    defineField({
      name: "color",
      title: "Основной цвет",
      type: "string",
      description:
        "Основной цвет для Google Shopping, по-английски (например, Black, Cream, Sage). Для одежды обязателен.",
      placeholder: "Cream",
    }),
    defineField({
      name: "productBadges",
      title: "Метки товара",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: [
          { title: "Новинка («New In»)", value: "new-in" },
          { title: "Хит продаж («Best Seller»)", value: "best-seller" },
          { title: "Лимитированная серия («Limited Edition»)", value: "limited-edition" },
        ],
        layout: "grid",
      },
      description: "Показываются на странице товара и в каталоге магазина (например, «Best Seller»).",
    }),
    defineField({
      name: "stock",
      title: "Количество в наличии",
      type: "number",
      initialValue: 0,
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "handmadeDisclaimer",
      title: "Пометка о ручной работе",
      type: "string",
      placeholder: "Handcrafted specifically for you in our Southampton studio. Please allow 3–5 days for production.",
      description: "Короткая заметка под кнопкой «Add to Bag». Оставьте пустым, чтобы скрыть.",
    }),
    defineField({
      name: "productionTime",
      title: "Срок изготовления",
      type: "string",
      description: "Например, «2–3 days», «5–7 days». Показывается отдельной меткой на странице товара.",
      placeholder: "3–5 days",
    }),
    defineField({
      name: "careInstructions",
      title: "Уход за изделием",
      type: "array",
      of: [{ type: "block" }],
      description:
        "Как ухаживать за изделием: стирка, сушка, хранение и т. п.",
    }),
    defineField({
      name: "shippingInfo",
      title: "Доставка",
      type: "array",
      of: [{ type: "block" }],
      description:
        "Сроки, способы и стоимость доставки именно этого товара.",
    }),
    defineField({
      name: "packagingInfo",
      title: "Упаковка и подарочное оформление",
      type: "array",
      of: [{ type: "block" }],
      description: "Как товар упакован и оформлен.",
    }),
    defineField({
      name: "subcategory",
      title: "Подкатегория",
      type: "string",
      options: {
        list: [
          // Lingerie
          { title: "Бюстгальтеры (Бельё)", value: "bras" },
          { title: "Трусики (Бельё)", value: "knickers" },
          { title: "Пояса для чулок (Бельё)", value: "belts" },
          { title: "Подвязки (Бельё)", value: "garters" },
          { title: "Маски для сна (Бельё)", value: "sleeping-masks" },
          { title: "Комплекты (Бельё)", value: "sets" },
          // Mini / Kids
          { title: "Детское бельё (Mini)", value: "underwear" },
          { title: "Пижамы (Mini)", value: "pyjamas" },
          { title: "Пледы (Mini)", value: "blankets" },
          { title: "Муслиновые пелёнки и слюнявчики (Mini)", value: "muslin-cloths" },
          { title: "Детские аксессуары (Mini)", value: "accessories" },
          // Accessories & Bags
          { title: "Аксессуары для волос", value: "hair-accessories" },
          { title: "Косметички", value: "pouches" },
          { title: "Органайзеры", value: "organisers" },
          // Home Decor
          { title: "Чехлы для подушек (Для дома)", value: "cushion-cover" },
          { title: "Дорожки на стол (Для дома)", value: "table-runner" },
          { title: "Сервировочные салфетки (Для дома)", value: "placemats" },
          { title: "Тканевые салфетки (Для дома)", value: "napkins" },
        ],
        layout: "radio",
      },
      description:
        "По подкатегории работают ссылки-фильтры в меню сайта.",
    }),
    defineField({
      name: "collection",
      title: "Коллекция",
      type: "reference",
      to: [{ type: "collection" }],
      description: "По желанию: привяжите товар к коллекции (например, Aria, Heritage).",
    }),
    defineField({
      name: "sizeGuide",
      title: "Таблица размеров",
      type: "reference",
      to: [{ type: "sizeGuide" }],
      description: "По желанию: прикрепите таблицу размеров. Одну таблицу можно прикрепить к разным товарам.",
    }),
    defineField({
      name: "availableSizes",
      title: "Доступные размеры",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: SIZES,
        layout: "grid",
      },
      description:
        "Отметьте все размеры, в которых есть этот товар. Для аксессуаров и вещей одного размера оставьте пустым.",
    }),
    defineField({
      name: "sizePrices",
      title: "Цены по размерам",
      type: "array",
      of: [
        {
          type: "object",
          title: "Размер с ценой",
          fields: [
            defineField({
              name: "size",
              title: "Размер",
              type: "string",
              options: {
                list: SIZES,
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "price",
              title: "Цена в пенсах",
              type: "number",
              description: "1500 = £15.00. Только целое число, без точки и знака £.",
              validation: (Rule) => [Rule.required().min(1), ...penceRules(Rule)],
            }),
          ],
          preview: {
            select: { title: "size", subtitle: "price" },
            prepare({ title, subtitle }: { title?: string; subtitle?: number }) {
              return {
                title: `Размер ${title ? titleFor(SIZES, title) : "?"}`,
                subtitle: priceLabel(subtitle),
              };
            },
          },
        },
      ],
      description:
        "По желанию: своя цена для каждого размера. Оставьте пустым — для всех размеров будет основная цена.",
    }),
    defineField({
      name: "sizeStock",
      title: "Остаток по размерам",
      type: "array",
      of: [
        {
          type: "object",
          title: "Размер с остатком",
          fields: [
            defineField({
              name: "size",
              title: "Размер",
              type: "string",
              options: {
                list: SIZES,
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "quantity",
              title: "Готовых изделий, шт.",
              type: "number",
              initialValue: 0,
              validation: (Rule) => Rule.required().min(0),
            }),
          ],
          preview: {
            select: { title: "size", subtitle: "quantity" },
            prepare({ title, subtitle }: { title?: string; subtitle?: number }) {
              return { title: `Размер ${title ? titleFor(SIZES, title) : "?"}`, subtitle: `Готовых: ${subtitle ?? 0} шт.` };
            },
          },
        },
      ],
      description:
        "По желанию: сколько готовых изделий есть в каждом размере — тогда распроданный размер покажется распроданным, даже пока другие ещё есть. Оставьте пустым — для всех размеров будет общее «Количество в наличии» (когда всё шьётся на заказ).",
    }),
    defineField({
      name: "availableColors",
      title: "Цвета",
      type: "array",
      of: [
        {
          type: "object",
          title: "Цвет",
          fields: [
            defineField({
              name: "name",
              title: "Название цвета",
              type: "string",
              description: "По-английски, например, Cream, Sage, Peach, Burgundy.",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "hex",
              title: "Код цвета (по желанию)",
              type: "string",
              description:
                "HEX-код для кружка цвета (например, #F5E8D0). Оставьте пустым — покажется только название.",
              validation: (Rule) =>
                Rule.regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
                  name: "hex",
                  invert: false,
                }).warning("Нужен HEX-код вида #F5E8D0"),
            }),
            defineField({
              name: "variantImage",
              title: "Фото этого цвета (по желанию)",
              type: "image",
              options: { hotspot: true },
              description:
                "Когда покупатель выбирает этот цвет, главное фото товара само меняется на это.",
            }),
          ],
          preview: {
            select: { title: "name", subtitle: "hex", media: "variantImage" },
          },
        },
      ],
      description:
        "Добавьте варианты цвета (например, у скранчи). Если цвет один — оставьте пустым. У каждого цвета может быть своё фото: нажатие на кружок цвета меняет главное фото.",
    }),
    defineField({
      name: "madeToMeasureAvailable",
      title: "Предлагать пошив по меркам",
      type: "boolean",
      initialValue: false,
      description: "Покупатель сможет прислать свои мерки, и изделие скроят по ним.",
    }),
    defineField({
      name: "madeToMeasurePrice",
      title: "Доплата за пошив по меркам, в пенсах",
      type: "number",
      initialValue: 0,
      description: "Прибавляется к цене изделия: 1500 = £15.00. Только целое число, без точки и знака £.",
      hidden: ({ parent }) => !parent?.madeToMeasureAvailable,
      validation: (Rule) => [Rule.min(0), ...penceRules(Rule)],
    }),
    defineField({
      name: "giftBoxAvailable",
      title: "Предлагать подарочную коробку",
      type: "boolean",
      initialValue: false,
      description: "Можно ли упаковать этот товар в подарочную коробку Beautasy? На сайте это галочка «Add Gift Box».",
    }),
    defineField({
      name: "giftBoxPrice",
      title: "Цена подарочной коробки, в пенсах",
      type: "number",
      description: "500 = £5.00. Только целое число, без точки и знака £.",
      hidden: ({ parent }: { parent?: { giftBoxAvailable?: boolean } }) =>
        !parent?.giftBoxAvailable,
      validation: (Rule) => [Rule.min(0), ...penceRules(Rule)],
    }),
  ],
  preview: {
    select: {
      title: "name",
      category: "category",
      price: "price",
      media: "images.0",
    },
    // Category and price, so a price typed in pounds (£0.25) stands out in the list
    prepare({ title, category, price, media }) {
      return {
        title,
        subtitle: [category ? titleFor(CATEGORIES, category) : null, priceLabel(price)].filter(Boolean).join(" · "),
        media,
      };
    },
  },
});
