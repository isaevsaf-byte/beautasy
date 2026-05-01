import { defineField, defineType } from "sanity";

export const collection = defineType({
  name: "collection",
  title: "Collection",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Collection Name",
      type: "string",
      description: "e.g. Aria, Heritage, Liberty London",
      validation: (Rule) => Rule.required().min(2).max(80),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "coverImage",
      title: "Cover Image",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "array",
      of: [{ type: "block" }],
      description: "Shown on the collection page",
    }),
    defineField({
      name: "season",
      title: "Season / Year",
      type: "string",
      placeholder: "Spring 2025",
      description: "Optional label like 'Spring 2025' or 'AW24'",
    }),
  ],
  preview: {
    select: { title: "name", subtitle: "season", media: "coverImage" },
  },
});
