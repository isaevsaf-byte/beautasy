import { defineField, defineType } from "sanity";

// The Studio's words for where someone signed up. The values are what is
// stored, so only the titles are ever translated.
const SOURCE_OPTIONS = [
  { title: "Низ страницы", value: "footer" },
  { title: "Оформление заказа", value: "checkout" },
  { title: "Другое", value: "other" },
];

export const subscriber = defineType({
  name: "subscriber",
  title: "Подписчик рассылки",
  type: "document",
  fields: [
    defineField({
      name: "emailHint",
      title: "Эл. почта",
      type: "string",
      readOnly: true,
      description: "Адрес показан не полностью: эту базу может прочитать кто угодно, поэтому сам адрес зашифрован.",
    }),
    defineField({ name: "emailSealed", title: "Эл. почта (зашифрована)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailFingerprint", title: "Отпечаток эл. почты", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "source",
      title: "Где подписались",
      type: "string",
      description: "В каком месте сайта человек подписался.",
      options: {
        list: SOURCE_OPTIONS,
      },
      initialValue: "footer",
    }),
    defineField({
      name: "welcomeCodeSealed",
      title: "Приветственный код (зашифрован)",
      type: "string",
      description:
        "Одноразовый код, который пришёл подписчику в письме. Зашифрован: одноразовая скидка, которую можно прочитать, достанется любому, кто её прочитал.",
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: "unsubscribed",
      title: "Отписался",
      type: "boolean",
      initialValue: false,
      description: "Ставится, когда человек просит исключить его из рассылки, — таким никогда не пишите.",
    }),
    defineField({
      name: "createdAt",
      title: "Дата подписки",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: "emailHint", source: "source" },
    prepare({ title, source }) {
      return {
        title,
        // A source with no title shows as itself, never blank
        subtitle: SOURCE_OPTIONS.find((option) => option.value === source)?.title ?? source,
      };
    },
  },
  orderings: [
    {
      title: "Сначала новые",
      name: "createdAtDesc",
      by: [{ field: "createdAt", direction: "desc" }],
    },
  ],
});
