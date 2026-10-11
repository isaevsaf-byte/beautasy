import { defineField, defineType } from "sanity";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/leadScout";

/**
 * Someone looking for a maker Kristina could be: a soft-furnishings business
 * that sends curtains out, a theatre that needs a costume hand, a council
 * tender for school curtains. The morning search finds these and writes one
 * document each (see @/lib/leadScout); she decides what to do with them here.
 *
 * Everything in it was already public — an advert, a tender, a forum post.
 * The dataset is public too (Sanity's free plan has no private ones), so the
 * note below is the one field she writes herself, and it says so.
 */
export const lead = defineType({
  name: "lead",
  title: "Ищут мастера",
  type: "document",
  fields: [
    defineField({
      name: "status",
      title: "Что с этим делаем",
      type: "string",
      initialValue: "new",
      options: { list: LEAD_STATUSES.map(({ value, title }) => ({ value, title })), layout: "radio" },
    }),
    defineField({ name: "title", title: "Заголовок", type: "string", readOnly: true }),
    defineField({ name: "url", title: "Ссылка", type: "url", readOnly: true }),
    defineField({
      name: "source",
      title: "Где нашли",
      type: "string",
      readOnly: true,
      options: { list: LEAD_SOURCES.map(({ value, title }) => ({ value, title })) },
    }),
    defineField({ name: "who", title: "Кто ищет", type: "string", readOnly: true }),
    defineField({ name: "place", title: "Где", type: "string", readOnly: true }),
    defineField({ name: "text", title: "Текст объявления", type: "text", rows: 8, readOnly: true }),
    defineField({ name: "pay", title: "Оплата / бюджет", type: "string", readOnly: true }),
    defineField({ name: "deadline", title: "Подать до", type: "datetime", readOnly: true }),
    defineField({ name: "postedAt", title: "Опубликовано", type: "datetime", readOnly: true }),
    defineField({ name: "foundAt", title: "Нашли", type: "datetime", readOnly: true }),
    defineField({
      name: "score",
      title: "Насколько подходит",
      type: "number",
      readOnly: true,
      description: "Считает поиск: ремесло + «ищут» + рядом с Саутгемптоном. Чем больше, тем ближе.",
    }),
    defineField({ name: "why", title: "Почему показали", type: "array", of: [{ type: "string" }], readOnly: true }),
    defineField({
      name: "note",
      title: "Заметка для себя",
      type: "text",
      rows: 3,
      description: "🚨 База сайта открытая — сюда не писать телефоны, цены и ничего личного.",
    }),
  ],
  orderings: [
    { title: "Сначала новые", name: "foundDesc", by: [{ field: "foundAt", direction: "desc" }] },
    { title: "Сначала подходящие", name: "scoreDesc", by: [{ field: "score", direction: "desc" }] },
  ],
  preview: {
    select: { title: "title", status: "status", source: "source", place: "place", score: "score" },
    prepare({ title, status, source, place, score }) {
      const mark = LEAD_STATUSES.find((s) => s.value === status)?.mark ?? "🆕";
      const from = LEAD_SOURCES.find((s) => s.value === source)?.title ?? source;
      return {
        title: `${mark} ${title ?? "Без заголовка"}`,
        subtitle: [from, place, score != null && `★${score}`].filter(Boolean).join(" · "),
      };
    },
  },
});
