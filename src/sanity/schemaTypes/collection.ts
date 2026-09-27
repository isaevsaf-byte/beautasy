import { defineField, defineType } from "sanity";

export const collection = defineType({
  name: "collection",
  title: "Коллекция",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Название коллекции",
      type: "string",
      description: "Например, Aria, Heritage, Liberty London",
      validation: (Rule) => Rule.required().min(2).max(80),
    }),
    defineField({
      name: "slug",
      title: "Адрес страницы (slug)",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "coverImage",
      title: "Обложка",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "description",
      title: "Описание",
      type: "array",
      of: [{ type: "block" }],
      description: "Показывается на странице коллекции — по-английски.",
    }),
    defineField({
      name: "season",
      title: "Сезон / год",
      type: "string",
      placeholder: "Spring 2025",
      description: "По желанию, например, «Spring 2025» или «AW24»",
    }),
  ],
  preview: {
    select: { title: "name", subtitle: "season", media: "coverImage" },
  },
});
