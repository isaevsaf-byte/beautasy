import { defineField, defineType } from "sanity";

export const abandonedCart = defineType({
  name: "abandonedCart",
  title: "Брошенная корзина",
  type: "document",
  description:
    "Оформление заказа, которое начали, но не оплатили. Один документ на одну сессию Stripe — поэтому напоминание отправляется только один раз.",
  fields: [
    defineField({
      name: "stripeSessionId",
      title: "ID сессии Stripe",
      type: "string",
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "emailHint",
      title: "Эл. почта",
      type: "string",
      readOnly: true,
      description: "Адрес показан не полностью: эту базу может прочитать кто угодно, поэтому сам адрес зашифрован.",
    }),
    defineField({ name: "emailSealed", title: "Эл. почта (зашифрована)", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "total",
      title: "Сумма корзины (в пенсах)",
      type: "number",
      readOnly: true,
    }),
    defineField({
      name: "items",
      title: "Товары",
      type: "array",
      readOnly: true,
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "name", title: "Название", type: "string" }),
            defineField({ name: "quantity", title: "Количество", type: "number" }),
          ],
          preview: { select: { title: "name", subtitle: "quantity" } },
        },
      ],
    }),
    defineField({
      name: "reminderSent",
      title: "Напоминание отправлено",
      type: "boolean",
      initialValue: false,
      readOnly: true,
    }),
    defineField({
      name: "recovered",
      title: "Покупатель вернулся",
      type: "boolean",
      initialValue: false,
      description: "Отметьте, если этот покупатель вернулся и сделал заказ.",
    }),
    defineField({
      name: "createdAt",
      title: "Когда брошена",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: "emailHint", subtitle: "total" },
    prepare({ title, subtitle }) {
      return {
        title: title || "Неизвестный покупатель",
        subtitle: typeof subtitle === "number" ? `£${(subtitle / 100).toFixed(2)}` : "",
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
