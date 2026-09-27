import { defineField, defineType } from "sanity";
import { penceRules, priceLabel } from "./product";

export const giftBox = defineType({
  name: "giftBox",
  title: "Подарочный бокс",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Название бокса",
      type: "string",
      validation: (Rule) => Rule.required().min(2).max(120),
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
      title: "Фотографии бокса",
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
      description: "4999 = £49.99. Только целое число, без точки и знака £.",
      validation: (Rule) => [Rule.required().min(1), ...penceRules(Rule)],
    }),
    defineField({
      name: "description",
      title: "Описание",
      type: "array",
      of: [{ type: "block" }],
      description: "Описание подарочного набора, можно с форматированием",
    }),
    defineField({
      name: "contents",
      title: "Товары в боксе",
      type: "array",
      of: [
        {
          type: "reference",
          to: [{ type: "product" }],
        },
      ],
      description: "Выберите товары, которые входят в этот бокс",
    }),
    defineField({
      name: "contentsNote",
      title: "Что ещё в боксе",
      type: "text",
      rows: 3,
      description:
        "По желанию: что ещё лежит в боксе, кроме товаров из каталога, например, «ribbon, tissue paper, greeting card»",
    }),
    defineField({
      name: "stock",
      title: "Количество в наличии",
      type: "number",
      initialValue: 0,
      validation: (Rule) => Rule.required().min(0),
    }),
  ],
  preview: {
    select: {
      title: "name",
      media: "images.0",
      price: "price",
    },
    prepare({ title, media, price }) {
      return {
        title,
        subtitle: priceLabel(price),
        media,
      };
    },
  },
});
