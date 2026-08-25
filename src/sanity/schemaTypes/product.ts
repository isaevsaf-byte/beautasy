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
      name: "gender",
      title: "Gender",
      type: "string",
      description: "Required by Google Shopping for apparel products.",
      options: {
        list: [
          { title: "Female", value: "female" },
          { title: "Male", value: "male" },
          { title: "Unisex", value: "unisex" },
        ],
        layout: "radio",
      },
    }),
    defineField({
      name: "ageGroup",
      title: "Age Group",
      type: "string",
      description: "Required by Google Shopping for apparel products.",
      options: {
        list: [
          { title: "Adult (13+)", value: "adult" },
          { title: "Kids (5–13 years)", value: "kids" },
          { title: "Toddler (1–5 years)", value: "toddler" },
          { title: "Infant (3–12 months)", value: "infant" },
          { title: "Newborn (0–3 months)", value: "newborn" },
        ],
        layout: "radio",
      },
    }),
    defineField({
      name: "color",
      title: "Primary Colour",
      type: "string",
      description: "Main colour for Google Shopping (e.g. Black, Cream, Sage). Required for apparel.",
      placeholder: "Cream",
    }),
    defineField({
      name: "productBadges",
      title: "Product Badges",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: [
          { title: "New In", value: "new-in" },
          { title: "Best Seller", value: "best-seller" },
          { title: "Limited Edition", value: "limited-edition" },
        ],
        layout: "grid",
      },
      description: "Badges shown on the product page and shop grid (e.g. Best Seller).",
    }),
    defineField({
      name: "stock",
      title: "Stock Quantity",
      type: "number",
      initialValue: 0,
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "handmadeDisclaimer",
      title: "Handmade Disclaimer",
      type: "string",
      placeholder: "Handcrafted specifically for you in our Southampton studio. Please allow 3–5 days for production.",
      description: "Short note shown below the Add to Bag button. Leave empty to hide.",
    }),
    defineField({
      name: "productionTime",
      title: "Production Time",
      type: "string",
      description: "e.g. '2–3 days', '5–7 days'. Shown as an info badge on the product page.",
      placeholder: "3–5 days",
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
          // Lingerie
          { title: "Bras (Lingerie)", value: "bras" },
          { title: "Knickers (Lingerie)", value: "knickers" },
          { title: "Belts (Lingerie)", value: "belts" },
          { title: "Garters (Lingerie)", value: "garters" },
          { title: "Sleeping Masks (Lingerie)", value: "sleeping-masks" },
          { title: "Sets (Lingerie)", value: "sets" },
          // Mini / Kids
          { title: "Kids' Underwear (Mini)", value: "underwear" },
          { title: "Pyjamas (Mini)", value: "pyjamas" },
          { title: "Blankets (Mini)", value: "blankets" },
          { title: "Muslin Cloths & Bibs (Mini)", value: "muslin-cloths" },
          { title: "Kids' Accessories (Mini)", value: "accessories" },
          // Accessories & Bags
          { title: "Hair Accessories", value: "hair-accessories" },
          { title: "Pouches", value: "pouches" },
          { title: "Organisers", value: "organisers" },
          // Home Decor
          { title: "Cushion Cover (Home)", value: "cushion-cover" },
          { title: "Table Runner (Home)", value: "table-runner" },
          { title: "Placemats (Home)", value: "placemats" },
          { title: "Napkins (Home)", value: "napkins" },
        ],
        layout: "radio",
      },
      description:
        "Subcategory used for filtered navigation links in the menu.",
    }),
    defineField({
      name: "collection",
      title: "Collection",
      type: "reference",
      to: [{ type: "collection" }],
      description: "Optional: link this product to a named collection (e.g. Aria, Heritage).",
    }),
    defineField({
      name: "sizeGuide",
      title: "Size Guide",
      type: "reference",
      to: [{ type: "sizeGuide" }],
      description: "Optional: attach a reusable size guide to this product.",
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
      name: "sizeStock",
      title: "Stock Per Size",
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
              name: "quantity",
              title: "Ready-Made Quantity",
              type: "number",
              initialValue: 0,
              validation: (Rule) => Rule.required().min(0),
            }),
          ],
          preview: {
            select: { title: "size", subtitle: "quantity" },
            prepare({ title, subtitle }: { title?: string; subtitle?: number }) {
              return { title: `Size ${title ?? "?"}`, subtitle: `Qty: ${subtitle ?? 0}` };
            },
          },
        },
      ],
      description:
        "Optional: track ready-made stock per size, so a sold-out size shows correctly even while other sizes remain. Leave empty to use the overall Stock Quantity for every size (made-to-order model).",
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
                "Hex code shown as a colour dot (e.g. #F5E8D0). Leave empty to show name only.",
              validation: (Rule) =>
                Rule.regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
                  name: "hex",
                  invert: false,
                }).warning("Use a valid hex code like #F5E8D0"),
            }),
            defineField({
              name: "variantImage",
              title: "Variant Image (optional)",
              type: "image",
              options: { hotspot: true },
              description:
                "When a customer clicks this colour, the main product image switches to this photo automatically.",
            }),
          ],
          preview: {
            select: { title: "name", subtitle: "hex", media: "variantImage" },
          },
        },
      ],
      description:
        "Add colour options (e.g. scrunchies). Leave empty if the product has only one colour. Each colour can have its own photo — clicking the swatch switches the main image.",
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
