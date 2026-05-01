import { defineField, defineType } from "sanity";

export const sizeGuide = defineType({
  name: "sizeGuide",
  title: "Size Guide",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Size Guide Name",
      type: "string",
      description: "Internal label, e.g. 'Women's Briefs Guide', 'Kids Knickers Guide'",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "rows",
      title: "Size Rows",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "size", title: "Size Label", type: "string", description: "e.g. XS, S, 4–5Y" }),
            defineField({ name: "uk", title: "UK", type: "string" }),
            defineField({ name: "eu", title: "EU", type: "string" }),
            defineField({ name: "bust", title: "Bust (cm)", type: "string" }),
            defineField({ name: "waist", title: "Waist (cm)", type: "string" }),
            defineField({ name: "hips", title: "Hips (cm)", type: "string" }),
          ],
          preview: {
            select: { title: "size", subtitle: "uk" },
          },
        },
      ],
      description: "Add one row per size. Only fill in the columns relevant to this guide.",
    }),
    defineField({
      name: "notes",
      title: "Fitting Notes",
      type: "text",
      rows: 3,
      description: "Any extra guidance, e.g. 'If between sizes, size up for comfort.'",
    }),
  ],
  preview: {
    select: { title: "name" },
  },
});
