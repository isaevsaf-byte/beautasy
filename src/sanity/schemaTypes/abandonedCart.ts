import { defineField, defineType } from "sanity";

export const abandonedCart = defineType({
  name: "abandonedCart",
  title: "Abandoned Cart",
  type: "document",
  description:
    "A checkout that was started but never paid. One document per Stripe session, so the reminder is only ever sent once.",
  fields: [
    defineField({
      name: "stripeSessionId",
      title: "Stripe Session ID",
      type: "string",
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "email",
      title: "Email",
      type: "string",
      readOnly: true,
    }),
    defineField({
      name: "total",
      title: "Cart Total (pence)",
      type: "number",
      readOnly: true,
    }),
    defineField({
      name: "items",
      title: "Items",
      type: "array",
      readOnly: true,
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "name", title: "Name", type: "string" }),
            defineField({ name: "quantity", title: "Quantity", type: "number" }),
          ],
          preview: { select: { title: "name", subtitle: "quantity" } },
        },
      ],
    }),
    defineField({
      name: "reminderSent",
      title: "Reminder Sent",
      type: "boolean",
      initialValue: false,
      readOnly: true,
    }),
    defineField({
      name: "recovered",
      title: "Recovered",
      type: "boolean",
      initialValue: false,
      description: "Tick if this customer came back and ordered.",
    }),
    defineField({
      name: "createdAt",
      title: "Abandoned At",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: "email", subtitle: "total" },
    prepare({ title, subtitle }) {
      return {
        title: title || "Unknown shopper",
        subtitle: typeof subtitle === "number" ? `£${(subtitle / 100).toFixed(2)}` : "",
      };
    },
  },
  orderings: [
    {
      title: "Newest first",
      name: "createdAtDesc",
      by: [{ field: "createdAt", direction: "desc" }],
    },
  ],
});
