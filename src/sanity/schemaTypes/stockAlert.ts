import { defineField, defineType } from "sanity";

export const stockAlert = defineType({
  name: "stockAlert",
  title: "Stock Alert",
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
      name: "email",
      title: "Customer Email",
      type: "string",
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: "size",
      title: "Size",
      type: "string",
      description: "When set, only that size's per-size stock is checked instead of the product's overall stock.",
    }),
    defineField({
      name: "notified",
      title: "Notified",
      type: "boolean",
      initialValue: false,
      readOnly: true,
      description: "Set automatically once the back-in-stock email has been sent.",
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
    select: { title: "email", productName: "product.name", notified: "notified" },
    prepare({ title, productName, notified }) {
      return {
        title: `${notified ? "✅" : "⏳"} ${title}`,
        subtitle: productName,
      };
    },
  },
});
