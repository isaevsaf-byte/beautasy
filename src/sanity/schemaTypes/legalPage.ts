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
    /* ── Hero / Main Image ── */
    defineField({
      name: "mainImage",
      title: "Main Image (optional)",
      type: "image",
      options: { hotspot: true },
      description:
        "A full-width hero photo shown just below the page title. Leave empty to skip.",
      fields: [
        defineField({
          name: "alt",
          title: "Alt text",
          type: "string",
          description: "Describe the image for accessibility",
        }),
        defineField({
          name: "caption",
          title: "Caption (optional)",
          type: "string",
          description: "Short caption shown below the image",
        }),
      ],
    }),
    /* ── Body / Content ── */
    defineField({
      name: "body",
      title: "Content",
      type: "array",
      of: [
        // Rich text blocks
        { type: "block" },
        // Inline image — can be dropped anywhere between paragraphs
        {
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({
              name: "alt",
              title: "Alt text",
              type: "string",
              description: "Describe the image for screen readers",
            }),
            defineField({
              name: "caption",
              title: "Caption (optional)",
              type: "string",
            }),
          ],
        },
        // Info box (existing)
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
