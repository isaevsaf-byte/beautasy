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
      name: "subcategory",
      title: "Subcategory",
      type: "string",
      options: {
        list: [
          { title: "Bralettes (Lingerie)", value: "bralettes" },
          { title: "Panties (Lingerie)", value: "panties" },
          { title: "Sets (Lingerie)", value: "sets" },
          { title: "Sleepwear (Lingerie)", value: "sleepwear" },
          { title: "Blanket (Kids)", value: "blanket" },
          { title: "Muslin Cloths (Kids)", value: "muslin-cloths" },
          { title: "Bibs (Kids)", value: "bibs" },
          { title: "Pyjama (Kids)", value: "pyjama" },
          { title: "Accessories (Kids)", value: "accessories" },
        ],
        layout: "radio",
      },
      description:
        "Subcategory used for filtered navigation links in the menu.",
    }),
    defineField({
      name: "availableSizes",
      title: "Available Sizes",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: [
          // ── Adult sizes ──
          { title: "XXS", value: "XXS" },
          { title: "XS", value: "XS" },
          { title: "S", value: "S" },
          { title: "M", value: "M" },
          { title: "L", value: "L" },
          { title: "XL", value: "XL" },
          { title: "XXL", value: "XXL" },
          { title: "XXXL", value: "XXXL" },
          // ── Kids sizes ──
          { title: "1–1.5 Years", value: "1-1.5Y" },
          { title: "2–3 Years", value: "2-3Y" },
          { title: "4–5 Years", value: "4-5Y" },
          { title: "6–7 Years", value: "6-7Y" },
          { title: "8–9 Years", value: "8-9Y" },
          { title: "10–11 Years", value: "10-11Y" },
          { title: "12–13 Years", value: "12-13Y" },
        ],
        layout: "grid",
      },
      description:
        "Tick every size available for this product. Leave empty for accessories or one-size items.",
    }),
    defineField({
      name: "sizePrices",
      title: "Size-Based Pricing",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "size",
              title: "Size",
              type: "string",
              options: {
                list: [
                  { title: "XXS", value: "XXS" },
                  { title: "XS", value: "XS" },
                  { title: "S", value: "S" },
                  { title: "M", value: "M" },
                  { title: "L", value: "L" },
                  { title: "XL", value: "XL" },
                  { title: "XXL", value: "XXL" },
                  { title: "XXXL", value: "XXXL" },
                  { title: "1–1.5 Years", value: "1-1.5Y" },
                  { title: "2–3 Years", value: "2-3Y" },
                  { title: "4–5 Years", value: "4-5Y" },
                  { title: "6–7 Years", value: "6-7Y" },
                  { title: "8–9 Years", value: "8-9Y" },
                  { title: "10–11 Years", value: "10-11Y" },
                  { title: "12–13 Years", value: "12-13Y" },
                ],
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "price",
              title: "Price (pence)",
              type: "number",
              description: "Price in pence (e.g. 1500 = £15.00)",
              validation: (Rule) => Rule.required().min(1),
            }),
          ],
          preview: {
            select: { title: "size", subtitle: "price" },
            prepare({ title, subtitle }: { title?: string; subtitle?: number }) {
              return {
                title: `Size ${title ?? "?"}`,
                subtitle: subtitle ? `£${(subtitle / 100).toFixed(2)}` : "No price set",
              };
            },
          },
        },
      ],
      description:
        "Optional: set a different price per size. Leave empty to use the base price for all sizes.",
    }),
    defineField({
      name: "availableColors",
      title: "Available Colours",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({
              name: "name",
              title: "Colour Name",
              type: "string",
              description: "e.g. Cream, Sage, Peach, Burgundy",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "hex",
              title: "Swatch Hex (optional)",
              type: "string",
              description:
                "Hex code shown as a swatch on the product page (e.g. #F5E8D0). Leave empty to show the name only.",
              validation: (Rule) =>
                Rule.regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
                  name: "hex",
                  invert: false,
                }).warning("Use a valid hex code like #F5E8D0"),
            }),
          ],
          preview: {
            select: { title: "name", subtitle: "hex" },
          },
        },
      ],
      description:
        "Add colour options for products like scrunchies. Leave empty if the product has only one colour.",
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
