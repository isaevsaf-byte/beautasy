import { defineField, defineType } from "sanity";

export const giftBox = defineType({
  name: "giftBox",
  title: "Gift Box",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Gift Box Name",
      type: "string",
      validation: (Rule) => Rule.required().min(2).max(120),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: {
        source: "name",
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "images",
      title: "Gift Box Images",
      type: "array",
      of: [
        {
          type: "image",
          options: {
            hotspot: true,
          },
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "price",
      title: "Price in GBP",
      type: "number",
      description: "Price in pence (e.g. 4999 = £49.99)",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "array",
      of: [{ type: "block" }],
      description: "Rich text description of the gift box set",
    }),
    defineField({
      name: "contents",
      title: "Products Included",
      type: "array",
      of: [
        {
          type: "reference",
          to: [{ type: "product" }],
        },
      ],
      description: "Select the products included in this gift box",
    }),
    defineField({
      name: "contentsNote",
      title: "Additional Contents Note",
      type: "text",
      rows: 3,
      description:
        "Optional extra items not in the product catalogue (e.g. ribbon, tissue paper, greeting card)",
    }),
    defineField({
      name: "stock",
      title: "Stock Quantity",
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
        subtitle: price ? `£${(price / 100).toFixed(2)}` : "No price set",
        media,
      };
    },
  },
});
