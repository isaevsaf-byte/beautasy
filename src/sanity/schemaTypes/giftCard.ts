import { defineField, defineType } from "sanity";

export const giftCard = defineType({
  name: "giftCard",
  title: "Gift Card",
  type: "document",
  description:
    "Issued automatically when someone buys a gift card. The balance goes down as it is spent, so a card can be used across several orders.",
  fields: [
    defineField({
      name: "code",
      title: "Code",
      type: "string",
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "initialAmount",
      title: "Face Value (pence)",
      type: "number",
      readOnly: true,
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "balance",
      title: "Remaining Balance (pence)",
      type: "number",
      description: "Edit only to correct a mistake — normally maintained automatically.",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "recipientEmail",
      title: "Recipient Email",
      type: "string",
      readOnly: true,
    }),
    defineField({
      name: "recipientName",
      title: "Recipient Name",
      type: "string",
      readOnly: true,
    }),
    defineField({
      name: "message",
      title: "Gift Message",
      type: "text",
      rows: 3,
      readOnly: true,
    }),
    defineField({
      name: "purchaserEmail",
      title: "Bought By",
      type: "string",
      readOnly: true,
    }),
    defineField({
      name: "deliverAt",
      title: "Deliver On",
      type: "datetime",
      readOnly: true,
      description: "When the recipient should receive it. Empty means straight away.",
    }),
    defineField({
      name: "sentAt",
      title: "Sent At",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "expiresAt",
      title: "Expires",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "active",
      title: "Active",
      type: "boolean",
      initialValue: true,
      description: "Untick to stop a card being used (lost, refunded, disputed).",
    }),
    defineField({
      name: "reservedSession",
      title: "Held By Checkout",
      type: "string",
      readOnly: true,
      description:
        "Set while a checkout using this card is open, so a second checkout cannot spend the same balance. Cleared when that checkout is paid or expires.",
    }),
    defineField({
      name: "reservedAmount",
      title: "Amount Held (pence)",
      type: "number",
      readOnly: true,
    }),
    defineField({
      name: "reservedUntil",
      title: "Held Until",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "stripeSessionId",
      title: "Bought In Session",
      type: "string",
      readOnly: true,
    }),
    defineField({
      name: "createdAt",
      title: "Issued At",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: "code", balance: "balance", initial: "initialAmount", active: "active" },
    prepare({ title, balance, initial, active }) {
      const left = typeof balance === "number" ? `£${(balance / 100).toFixed(2)}` : "—";
      const face = typeof initial === "number" ? `£${(initial / 100).toFixed(2)}` : "—";
      return {
        title: title ?? "Gift card",
        subtitle: `${left} left of ${face}${active ? "" : " · disabled"}`,
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
