import { defineField, defineType } from "sanity";

export const stockAlert = defineType({
  name: "stockAlert",
  title: "Запрос о поступлении",
  type: "document",
  fields: [
    defineField({
      name: "product",
      title: "Товар",
      type: "reference",
      to: [{ type: "product" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "emailHint",
      title: "Эл. почта клиента",
      type: "string",
      readOnly: true,
      description: "Адрес показан не полностью: эту базу может прочитать кто угодно, поэтому сам адрес зашифрован.",
    }),
    defineField({ name: "emailSealed", title: "Эл. почта (зашифрована)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailFingerprint", title: "Отпечаток эл. почты", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "size",
      title: "Размер",
      type: "string",
      description: "Если указан, проверяется остаток только этого размера, а не общий остаток товара.",
    }),
    defineField({
      name: "notified",
      title: "Клиенту сообщили",
      type: "boolean",
      initialValue: false,
      readOnly: true,
      description: "Ставится автоматически, когда письмо о том, что товар снова в наличии, отправлено.",
    }),
    defineField({
      name: "createdAt",
      title: "Дата создания",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: "emailHint", productName: "product.name", notified: "notified" },
    prepare({ title, productName, notified }) {
      return {
        title: `${notified ? "✅" : "⏳"} ${title}`,
        subtitle: productName,
      };
    },
  },
});
