import { defineField, defineType } from "sanity";

export const giftCard = defineType({
  name: "giftCard",
  title: "Gift Card",
  type: "document",
  description:
    "Issued automatically when someone buys a gift card. The balance goes down as it is spent, so a card can be used across several orders. The code itself is not kept here — only the recipient's email has it.",
  fields: [
    defineField({
      name: "codeHint",
      title: "Code Ends In",
      type: "string",
      readOnly: true,
      description:
        "The last four characters, for telling cards apart. The full code is deliberately not stored: this dataset is readable, and a readable code is spendable money.",
    }),
    defineField({
      name: "codeFingerprint",
      title: "Code Fingerprint",
      type: "string",
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: "codeSealed",
      title: "Sealed Code",
      type: "string",
      readOnly: true,
      hidden: true,
      description: "Encrypted copy, so a scheduled card can still be emailed on its day.",
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
      name: "recipientHint",
      title: "Recipient",
      type: "string",
      readOnly: true,
      description: "Masked. A gift message is personal, so it and the addresses are sealed.",
    }),
    defineField({ name: "recipientEmailSealed", title: "Recipient Email (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "recipientNameSealed", title: "Recipient Name (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "messageSealed", title: "Gift Message (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "purchaserEmailSealed", title: "Bought By (sealed)", type: "string", readOnly: true, hidden: true }),
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
      name: "source",
      title: "Kind",
      type: "string",
      readOnly: true,
      initialValue: "purchase",
      options: {
        list: [
          { title: "Bought as a gift", value: "purchase" },
          { title: "Friends credit — earned by referring", value: "referral" },
        ],
      },
    }),
    defineField({
      name: "referrer",
      title: "Belongs To (Friend Link)",
      type: "reference",
      to: [{ type: "referrer" }],
      weak: true,
      readOnly: true,
      description:
        "For Friends credit: whose balance this is. Their £5s land here. Spent in the bag like any gift card — or at the atelier, in which case take it off the Balance above by hand.",
    }),
    defineField({
      name: "createdAt",
      title: "Issued At",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { hint: "codeHint", balance: "balance", initial: "initialAmount", active: "active", source: "source", owner: "referrer.displayName" },
    prepare({ hint, balance, initial, active, source, owner }) {
      const left = typeof balance === "number" ? `£${(balance / 100).toFixed(2)}` : "—";
      const face = typeof initial === "number" ? `£${(initial / 100).toFixed(2)}` : "—";
      if (source === "referral") {
        return {
          title: `Friends credit — ${owner ?? "someone"}${hint ? ` …${hint}` : ""}`,
          subtitle: `${left} left, ${face} earned${active ? "" : " · disabled"}`,
        };
      }
      return {
        title: hint ? `Gift card …${hint}` : "Gift card",
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
