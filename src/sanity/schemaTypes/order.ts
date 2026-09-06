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
      name: "displayName",
      title: "First Name",
      type: "string",
      readOnly: true,
      description: "The rest is sealed — this dataset is readable by anyone. Use \u201cShow contact details\u201d.",
    }),
    defineField({
      name: "emailHint",
      title: "Email",
      type: "string",
      readOnly: true,
      description: "Masked. Use \u201cShow contact details\u201d for the address itself.",
    }),
    defineField({ name: "customerEmailSealed", title: "Email (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "customerNameSealed", title: "Name (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "emailFingerprint",
      title: "Email Fingerprint",
      type: "string",
      readOnly: true,
      hidden: true,
      description: "Keyed and one-way — lets the shop ask “has this address ordered before?” for the friend discount.",
    }),
    defineField({
      name: "referrer",
      title: "Came Through (Friend Link)",
      type: "reference",
      to: [{ type: "referrer" }],
      weak: true,
      readOnly: true,
      description: "Set when a friend's link paid for part of this order. The reward itself is under Friend Rewards.",
    }),
    defineField({ name: "referredBy", title: "Referred By", type: "string", readOnly: true }),
    defineField({ name: "referralDiscount", title: "Friend Discount Applied (pence)", type: "number", readOnly: true }),
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
      name: "shippingAddressSealed",
      title: "Delivery Address (sealed)",
      type: "text",
      readOnly: true,
      hidden: true,
      description: "Read it with \u201cShow contact details\u201d; it is also in the order email.",
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
      name: "reviewTokenFingerprint",
      title: "Review Link Fingerprint",
      type: "string",
      readOnly: true,
      hidden: true,
      description:
        "Recognises the review link that was emailed. The link's secret is not stored — this dataset is readable, and a readable token is a \"verified purchase\" badge anyone could print.",
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
    select: { customerName: "displayName", email: "emailHint", total: "total", status: "status" },
    prepare({ customerName, email, total, status }) {
      return {
        title: `${customerName || email || "Guest"} — £${((total || 0) / 100).toFixed(2)}`,
        subtitle: status,
      };
    },
  },
});
