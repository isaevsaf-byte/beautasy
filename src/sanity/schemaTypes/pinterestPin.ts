import { defineArrayMember, defineField, defineType } from "sanity";
import { ownPhotoLocationRule } from "@/sanity/photoLocationRule";

/**
 * A Pin, ready to go on Pinterest.
 *
 * An Instagram post lives a day; a Pin is found by search for a year, and it
 * carries a link back to the site. Each one here is made from the gallery —
 * a step-by-step picture, a few photos to swipe through, or a film — with the
 * words Pinterest asks for already written.
 *
 * Until the site is connected to Pinterest (see «Как подключить Pinterest»)
 * Kristina posts them herself: download the pictures, «Create Pin», paste the
 * words, and mark it «Выложен» here so it is not offered again.
 */

const STATUS_WORDS: Record<string, string> = {
  ready: "готов",
  posted: "выложен",
};

export const pinterestPin = defineType({
  name: "pinterestPin",
  title: "Пин",
  type: "document",
  fields: [
    defineField({
      name: "images",
      title: "Картинки",
      type: "array",
      description:
        "Одна картинка — обычный пин. От двух до пяти — карусель: в Pinterest их листают пальцем, загружайте все в том же порядке. Все 1000×1500 — так Pinterest даёт пину больше всего места.",
      of: [
        defineArrayMember({
          type: "image",
          fields: [
            defineField({
              name: "alt",
              title: "Что на картинке",
              type: "string",
              description: "По-английски, для тех, кто не видит картинку. В Pinterest — поле «Alt text».",
            }),
          ],
          validation: (Rule) => Rule.custom(ownPhotoLocationRule),
        }),
      ],
      validation: (Rule) => Rule.min(1).max(5),
    }),
    defineField({
      name: "video",
      title: "Видео",
      type: "file",
      options: { accept: "video/mp4" },
      description: "Если есть — можно выложить и видео-пином. Вертикальное, 9:16.",
    }),
    defineField({
      name: "title",
      title: "Заголовок",
      type: "string",
      description: "По-английски, до 100 знаков. Это то, что ищут: «Quilted vanity case», а не «Новинка!».",
      validation: (Rule) => Rule.required().max(100),
    }),
    defineField({
      name: "description",
      title: "Описание",
      type: "text",
      rows: 5,
      description: "По-английски, до 500 знаков. Первые строки видны в поиске — главное в начало.",
      validation: (Rule) => Rule.max(500),
    }),
    defineField({
      name: "link",
      title: "Ссылка",
      type: "url",
      description: "Куда ведёт пин — страница этой работы на сайте или товар.",
      validation: (Rule) => Rule.uri({ scheme: ["https"] }),
    }),
    defineField({
      name: "board",
      title: "Доска",
      type: "string",
      description: "В какую доску Pinterest. Если такой ещё нет — создайте её с этим названием.",
    }),
    defineField({
      name: "status",
      title: "Статус",
      type: "string",
      options: {
        list: [
          { title: "Готов — выложите его", value: "ready" },
          { title: "Выложен", value: "posted" },
        ],
        layout: "radio",
      },
      initialValue: "ready",
    }),
    defineField({
      name: "pinUrl",
      title: "Ссылка на пин",
      type: "url",
      description: "По желанию: вставьте адрес пина, когда выложите.",
    }),
    defineField({
      name: "createdAt",
      title: "Создан",
      type: "datetime",
      readOnly: true,
    }),
  ],
  orderings: [
    { title: "Сначала новые", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] },
  ],
  preview: {
    select: { title: "title", status: "status", board: "board", media: "images.0", count: "images.length" },
    prepare({ title, status, board, media, count }) {
      const kind = typeof count === "number" && count > 1 ? `карусель из ${count}` : "пин";
      return {
        title: title ?? "Без заголовка",
        subtitle: [STATUS_WORDS[status ?? "ready"] ?? status, kind, board].filter(Boolean).join(" · "),
        media,
      };
    },
  },
});
