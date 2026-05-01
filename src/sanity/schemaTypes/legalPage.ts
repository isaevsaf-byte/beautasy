import { defineField, defineType } from "sanity";

export const legalPage = defineType({
  name: "legalPage",
  title: "Legal / Info Page",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Page Title",
      type: "string",
      description: "e.g. Returns & Exchanges, Privacy Policy, About the Atelier",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "title",
        maxLength: 96,
      },
      description: "URL path — e.g. 'returns', 'privacy', 'about'",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "body",
      title: "Content",
      type: "array",
      of: [
        { type: "block" },
        {
          type: "object",
          name: "infoBox",
          title: "Info Box",
          fields: [
            defineField({ name: "text", title: "Text", type: "text", rows: 3 }),
            defineField({
              name: "style",
              title: "Style",
              type: "string",
              options: {
                list: [
                  { title: "Note (lavender)", value: "note" },
                  { title: "Warning (amber)", value: "warning" },
                ],
                layout: "radio",
              },
              initialValue: "note",
            }),
          ],
          preview: { select: { title: "text" } },
        },
      ],
    }),
    defineField({
      name: "lastUpdated",
      title: "Last Updated",
      type: "date",
      description: "Shown at the top of the page",
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "slug.current" },
  },
});
