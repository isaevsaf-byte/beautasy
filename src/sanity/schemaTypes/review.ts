import { defineField, defineType } from "sanity";

export const review = defineType({
  name: "review",
  title: "Отзыв",
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
      name: "userId",
      title: "ID пользователя (Clerk)",
      type: "string",
      description:
        "Заполняется, если отзыв оставил клиент, вошедший в аккаунт; пусто — если отзыв оставлен по ссылке из письма с просьбой об отзыве.",
      readOnly: true,
    }),
    defineField({
      name: "userName",
      title: "Имя автора",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "rating",
      title: "Оценка",
      type: "number",
      validation: (Rule) => Rule.required().min(1).max(5).integer(),
      options: {
        list: [
          { title: "1 звезда", value: 1 },
          { title: "2 звезды", value: 2 },
          { title: "3 звезды", value: 3 },
          { title: "4 звезды", value: 4 },
          { title: "5 звёзд", value: 5 },
        ],
      },
    }),
    defineField({
      name: "comment",
      title: "Текст отзыва",
      type: "text",
      validation: (Rule) => Rule.required().min(10).max(1000),
    }),
    defineField({
      name: "images",
      title: "Фото",
      type: "array",
      of: [{ type: "image" }],
      validation: (Rule) => Rule.max(4),
      description: "Фото, которые клиент приложил к отзыву (не больше 4).",
    }),
    defineField({
      name: "orderId",
      title: "Заказ",
      type: "string",
      readOnly: true,
      description: "Заказ, из которого оставлен отзыв, — чтобы на одну вещь из заказа можно было оставить только один отзыв.",
    }),
    defineField({
      name: "verifiedPurchase",
      title: "Подтверждённая покупка",
      type: "boolean",
      initialValue: false,
      readOnly: true,
      description: "Ставится автоматически, если отзыв пришёл по ссылке из письма с просьбой об отзыве.",
    }),
    defineField({
      name: "approved",
      title: "Одобрен",
      type: "boolean",
      initialValue: false,
      description:
        "Отзыв не виден в магазине, пока вы не одобрите его здесь, — так спам и оскорбления не попадут на сайт.",
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
    select: {
      title: "userName",
      subtitle: "rating",
      productName: "product.name",
      approved: "approved",
    },
    prepare({ title, subtitle, productName, approved }) {
      return {
        title: `${approved ? "✅" : "⏳"} ${title} — ${"★".repeat(subtitle || 0)}`,
        subtitle: productName,
      };
    },
  },
});
