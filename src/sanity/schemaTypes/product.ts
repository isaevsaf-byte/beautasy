import { defineField, defineType } from "sanity";

export const product = defineType({
  name: "product",
  title: "Product",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Product Name",
      type: "string",
      validation: (Rule) => Rule.required().min(2).max(100),
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
      title: "Product Images",
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
      description: "Price in pence (e.g. 2999 = £29.99)",
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: {
        list: [
          { title: "Lingerie", value: "Lingerie" },
          { title: "Kids", value: "Kids" },
          { title: "Accessories", value: "Accessories" },
          { title: "Home", value: "Home" },
        ],
        layout: "radio",
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "stock",
      title: "Stock Quantity",
      type: "number",
      initialValue: 0,
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "careInstructions",
      title: "Care Instructions",
      type: "array",
      of: [{ type: "block" }],
      description:
        "How to care for this product (washing, drying, storage, etc.)",
    }),
    defineField({
      name: "shippingInfo",
      title: "Shipping Information",
      type: "array",
      of: [{ type: "block" }],
      description:
        "Delivery timelines, methods, and costs specific to this product",
    }),
    defineField({
      name: "packagingInfo",
      title: "Packaging & Gift Options",
      type: "array",
      of: [{ type: "block" }],
      description: "How this product is packaged and presented",
    }),
    defineField({
      name: "giftBoxAvailable",
      title: "Gift Box Available",
      type: "boolean",
      initialValue: false,
      description: "Can this product be gift-wrapped in a Beautasy gift box?",
    }),
    defineField({
      name: "giftBoxPrice",
      title: "Gift Box Price",
      type: "number",
      description: "Price in pence for gift box option (e.g. 500 = £5.00)",
      hidden: ({ parent }: { parent?: { giftBoxAvailable?: boolean } }) =>
        !parent?.giftBoxAvailable,
      validation: (Rule) => Rule.min(0),
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "category",
      media: "images.0",
    },
  },
});
