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
      name: "emailHint",
      title: "Customer Email",
      type: "string",
      readOnly: true,
      description: "Masked. This dataset is readable by anyone, so the address itself is sealed.",
    }),
    defineField({ name: "emailSealed", title: "Email (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailFingerprint", title: "Email Fingerprint", type: "string", readOnly: true, hidden: true }),
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
    select: { title: "emailHint", productName: "product.name", notified: "notified" },
    prepare({ title, productName, notified }) {
      return {
        title: `${notified ? "✅" : "⏳"} ${title}`,
        subtitle: productName,
      };
    },
  },
});
