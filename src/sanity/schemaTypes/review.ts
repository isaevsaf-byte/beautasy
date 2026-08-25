import { defineField, defineType } from "sanity";

export const review = defineType({
  name: "review",
  title: "Review",
  type: "document",
  fields: [
    defineField({
      name: "product",
      title: "Product",
      type: "reference",
      to: [{ type: "product" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "userId",
      title: "User ID (Clerk)",
      type: "string",
      validation: (Rule) => Rule.required(),
      readOnly: true,
    }),
    defineField({
      name: "userName",
      title: "User Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "rating",
      title: "Rating",
      type: "number",
      validation: (Rule) => Rule.required().min(1).max(5).integer(),
      options: {
        list: [
          { title: "1 Star", value: 1 },
          { title: "2 Stars", value: 2 },
          { title: "3 Stars", value: 3 },
          { title: "4 Stars", value: 4 },
          { title: "5 Stars", value: 5 },
        ],
      },
    }),
    defineField({
      name: "comment",
      title: "Comment",
      type: "text",
      validation: (Rule) => Rule.required().min(10).max(1000),
    }),
    defineField({
      name: "images",
      title: "Photos",
      type: "array",
      of: [{ type: "image" }],
      validation: (Rule) => Rule.max(4),
      description: "Photos the customer attached to their review (max 4).",
    }),
    defineField({
      name: "approved",
      title: "Approved",
      type: "boolean",
      initialValue: false,
      description:
        "Reviews are hidden from the shop until approved here, to filter out spam or abuse before publishing.",
    }),
    defineField({
      name: "createdAt",
      title: "Created At",
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
