import { defineField, defineType } from "sanity";

export const sizeGuide = defineType({
  name: "sizeGuide",
  title: "Таблица размеров",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Название таблицы",
      type: "string",
      // Not internal: the product page shows it as the heading of the size guide
      description:
        "Заголовок таблицы на странице товара — покупатели его видят, так что по-английски. Например, «Women's Briefs Guide», «Kids Knickers Guide».",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "rows",
      title: "Размеры",
      type: "array",
      of: [
        {
          type: "object",
          title: "Размер",
          fields: [
            defineField({ name: "size", title: "Размер", type: "string", description: "Например, XS, S, 4–5Y" }),
            defineField({ name: "uk", title: "UK", type: "string" }),
            defineField({ name: "eu", title: "EU", type: "string" }),
            defineField({ name: "bust", title: "Обхват груди (см)", type: "string" }),
            defineField({ name: "waist", title: "Обхват талии (см)", type: "string" }),
            defineField({ name: "hips", title: "Обхват бёдер (см)", type: "string" }),
          ],
          preview: {
            select: { title: "size", subtitle: "uk" },
          },
        },
      ],
      description: "По строке на каждый размер. Заполняйте только те столбцы, что нужны этой таблице.",
    }),
    defineField({
      name: "notes",
      title: "Подсказки по посадке",
      type: "text",
      rows: 3,
      description: "Любые дополнительные подсказки, например, «If between sizes, size up for comfort.»",
    }),
  ],
  preview: {
    select: { title: "name" },
  },
});
