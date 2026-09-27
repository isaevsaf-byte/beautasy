import { defineField, defineType } from "sanity";

export const legalPage = defineType({
  name: "legalPage",
  title: "Инфо-страница",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Заголовок страницы",
      type: "string",
      description: "По-английски, например «Returns & Exchanges», «Privacy Policy», «About the Atelier». Текст страницы — тоже.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Адрес страницы (slug)",
      type: "slug",
      options: {
        source: "title",
        maxLength: 96,
      },
      description: "Путь в адресе страницы — например, «returns», «privacy», «about»",
      validation: (Rule) => Rule.required(),
    }),
    /* ── Hero / Main Image ── */
    defineField({
      name: "mainImage",
      title: "Главное фото (по желанию)",
      type: "image",
      options: { hotspot: true },
      description:
        "Фото на всю ширину сразу под заголовком страницы. Оставьте пустым, если не нужно.",
      fields: [
        defineField({
          name: "alt",
          title: "Описание фото",
          type: "string",
          description: "Что на фото — для незрячих посетителей",
        }),
        defineField({
          name: "caption",
          title: "Подпись (по желанию)",
          type: "string",
          description: "Короткая подпись под фото",
        }),
      ],
    }),
    /* ── Body / Content ── */
    defineField({
      name: "body",
      title: "Текст страницы",
      type: "array",
      of: [
        // Rich text blocks
        { type: "block" },
        // Inline image — can be dropped anywhere between paragraphs
        {
          type: "image",
          title: "Фото",
          options: { hotspot: true },
          fields: [
            defineField({
              name: "alt",
              title: "Описание фото",
              type: "string",
              description: "Что на фото — этот текст зачитывают вслух программы для незрячих",
            }),
            defineField({
              name: "caption",
              title: "Подпись (по желанию)",
              type: "string",
            }),
          ],
        },
        // Info box (existing)
        {
          type: "object",
          name: "infoBox",
          title: "Инфоблок",
          fields: [
            defineField({ name: "text", title: "Текст", type: "text", rows: 3 }),
            defineField({
              name: "style",
              title: "Вид",
              type: "string",
              options: {
                list: [
                  { title: "Заметка (лавандовый фон)", value: "note" },
                  { title: "Предупреждение (янтарный фон)", value: "warning" },
                ],
                layout: "radio",
              },
              initialValue: "note",
            }),
          ],
          preview: { select: { title: "text" } },
        },
      ],
    }),
    defineField({
      name: "lastUpdated",
      title: "Дата обновления",
      type: "date",
      description: "Показывается вверху страницы",
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "slug.current" },
  },
});
