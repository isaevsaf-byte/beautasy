import { defineField, defineType } from "sanity";

export const order = defineType({
  name: "order",
  title: "Order",
  type: "document",
  fields: [
    defineField({
      name: "stripeSessionId",
      title: "Stripe Checkout Session ID",
      type: "string",
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "userId",
      title: "User ID (Clerk)",
      type: "string",
      readOnly: true,
      description: "Empty for guest checkouts — order won't appear in any account's order history.",
    }),
    defineField({
      name: "customerEmail",
      title: "Customer Email",
      type: "string",
      readOnly: true,
    }),
    defineField({
      name: "customerName",
      title: "Customer Name",
      type: "string",
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
            defineField({ name: "productId", title: "Product ID", type: "string" }),
            defineField({ name: "name", title: "Name", type: "string" }),
            defineField({ name: "quantity", title: "Quantity", type: "number" }),
            defineField({ name: "amountTotal", title: "Amount Total (pence)", type: "number" }),
            defineField({ name: "image", title: "Image URL", type: "string" }),
          ],
          preview: {
            select: { title: "name", subtitle: "quantity" },
            prepare({ title, subtitle }: { title?: string; subtitle?: number }) {
              return { title, subtitle: subtitle ? `× ${subtitle}` : undefined };
            },
          },
        },
      ],
    }),
    defineField({
      name: "total",
      title: "Total (pence)",
      type: "number",
      readOnly: true,
    }),
    defineField({
      name: "shippingAddress",
      title: "Shipping Address",
      type: "text",
      readOnly: true,
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Paid", value: "paid" },
          { title: "In Production", value: "in-production" },
          { title: "Shipped", value: "shipped" },
          { title: "Delivered", value: "delivered" },
        ],
        layout: "radio",
      },
      initialValue: "paid",
      description: "Update this as the order moves through production and delivery.",
    }),
    defineField({
      name: "trackingUrl",
      title: "Tracking Link",
      type: "url",
      description: "Royal Mail / courier tracking link. Included in the dispatch email if set.",
    }),
    defineField({
      name: "notifiedStatus",
      title: "Customer Notified Of",
      type: "string",
      readOnly: true,
      description: "The last status the customer was emailed about. Set automatically.",
    }),
    defineField({
      name: "reviewToken",
      title: "Review Token",
      type: "string",
      readOnly: true,
      description: "Secret in the review-request email link, so a customer can review without an account.",
    }),
    defineField({
      name: "reviewRequestSentAt",
      title: "Review Request Sent",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "createdAt",
      title: "Created At",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { customerName: "customerName", email: "customerEmail", total: "total", status: "status" },
    prepare({ customerName, email, total, status }) {
      return {
        title: `${customerName || email || "Guest"} — £${((total || 0) / 100).toFixed(2)}`,
        subtitle: status,
      };
    },
  },
});
