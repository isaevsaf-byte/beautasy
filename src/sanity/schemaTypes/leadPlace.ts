import { defineField, defineType } from "sanity";
import { OpenLinkInput } from "../OpenLinkInput";

/**
 * Where people post that they need a maker, and a program cannot read: Facebook
 * groups and Facebook's own searches (see FACEBOOK_SEARCHES in @/lib/leadScout).
 * The morning search covers tenders and job boards; these are Kristina's to
 * open in her own app. She ticks what she has joined and where the bell is on,
 * and adds the groups she finds.
 */
export const LEAD_PLACE_KINDS = [
  { value: "group", title: "Группа Facebook" },
  { value: "search", title: "Поиск в Facebook" },
  { value: "site", title: "Сайт" },
] as const;

export const leadPlace = defineType({
  name: "leadPlace",
  title: "Где ищут мастеров",
  type: "document",
  fields: [
    defineField({ name: "name", title: "Название", type: "string", validation: (Rule) => Rule.required().max(80) }),
    defineField({
      name: "url",
      title: "Ссылка",
      type: "url",
      components: { input: OpenLinkInput as never },
      validation: (Rule) => Rule.required().uri({ scheme: ["https"] }),
    }),
    defineField({
      name: "kind",
      title: "Что это",
      type: "string",
      initialValue: "group",
      options: { list: LEAD_PLACE_KINDS.map(({ value, title }) => ({ value, title })), layout: "radio" },
    }),
    defineField({ name: "joined", title: "Вступила", type: "boolean", initialValue: false }),
    defineField({
      name: "bell",
      title: "Колокольчик «All posts» включён",
      type: "boolean",
      initialValue: false,
      description: "В группе: колокольчик → «All posts». Тогда каждый новый пост придёт уведомлением на телефон.",
    }),
    defineField({
      name: "note",
      title: "Заметка",
      type: "text",
      rows: 3,
      description: "Что за группа, живая ли, ищут ли там исполнителей. 🚨 База открытая — без телефонов и личного.",
    }),
  ],
  preview: {
    select: { title: "name", kind: "kind", joined: "joined", bell: "bell" },
    prepare({ title, kind, joined, bell }) {
      const what = LEAD_PLACE_KINDS.find((k) => k.value === kind)?.title ?? "";
      const marks = kind === "group" ? [joined ? "✅ вступила" : "не вступила", bell ? "🔔" : ""] : [];
      return { title: `${kind === "search" ? "🔎" : "👥"} ${title ?? "Без названия"}`, subtitle: [what, ...marks].filter(Boolean).join(" · ") };
    },
  },
});
