import { defineField, defineType } from "sanity";

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  // Singleton — only one document of this type should exist (enforced via Studio structure)
  fields: [
    /* ── Announcement Bar ── */
    defineField({
      name: "announcementBar",
      title: "Announcement Bar",
      type: "object",
      description: "The slim banner shown at the very top of every page. Leave 'text' empty to hide it.",
      fields: [
        defineField({
          name: "enabled",
          title: "Show Bar",
          type: "boolean",
          initialValue: false,
        }),
        defineField({
          name: "text",
          title: "Text",
          type: "string",
          placeholder: "Free UK shipping on orders over £50 🎁",
        }),
        defineField({
          name: "link",
          title: "Link (optional)",
          type: "url",
          description: "Make the bar clickable (e.g. /gift-boxes)",
        }),
        defineField({
          name: "bgColor",
          title: "Background",
          type: "string",
          options: {
            list: [
              { title: "Lavender (default)", value: "lavender" },
              { title: "Charcoal", value: "charcoal" },
              { title: "Cream", value: "cream" },
            ],
            layout: "radio",
          },
          initialValue: "lavender",
        }),
      ],
    }),

    /* ── Shipping ── */
    defineField({
      name: "shipping",
      title: "Shipping Rates",
      type: "object",
      description: "These values are used in the checkout and displayed in the cart.",
      fields: [
        defineField({
          name: "ukRate",
          title: "UK Delivery (pence)",
          type: "number",
          description: "e.g. 300 = £3.00",
          initialValue: 300,
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "internationalRate",
          title: "International Delivery (pence)",
          type: "number",
          description: "e.g. 1200 = £12.00",
          initialValue: 1200,
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "freeShippingThreshold",
          title: "Free UK Shipping Threshold (pence)",
          type: "number",
          description: "e.g. 5000 = free shipping when cart ≥ £50. Set to 0 to disable.",
          initialValue: 5000,
          validation: (Rule) => Rule.required().min(0),
        }),
      ],
    }),

    /* ── Gift Card ── */
    defineField({
      name: "giftCardPlaceholder",
      title: "Gift Card Message Placeholder",
      type: "string",
      description: "Hint text shown inside the gift card textarea on product pages.",
      initialValue: "Write a short note to include with the gift card…",
      placeholder: "Write a short note to include with the gift card…",
    }),

    /* ── Social Links ── */
    defineField({
      name: "socialLinks",
      title: "Social Media Links",
      type: "object",
      fields: [
        defineField({
          name: "instagram",
          title: "Instagram URL",
          type: "url",
          placeholder: "https://instagram.com/beautasy",
        }),
        defineField({
          name: "tiktok",
          title: "TikTok URL",
          type: "url",
          placeholder: "https://tiktok.com/@beautasy",
        }),
        defineField({
          name: "pinterest",
          title: "Pinterest URL",
          type: "url",
          placeholder: "https://pinterest.com/beautasy",
        }),
      ],
    }),

    /* ── Payment Icons ── */
    defineField({
      name: "paymentIcons",
      title: "Payment Icons in Footer",
      type: "object",
      description: "Toggle which payment badges appear in the footer.",
      fields: [
        defineField({ name: "showVisa", title: "Visa", type: "boolean", initialValue: true }),
        defineField({ name: "showMastercard", title: "Mastercard", type: "boolean", initialValue: true }),
        defineField({ name: "showPaypal", title: "PayPal", type: "boolean", initialValue: true }),
        defineField({ name: "showApplePay", title: "Apple Pay", type: "boolean", initialValue: true }),
        defineField({ name: "showGooglePay", title: "Google Pay", type: "boolean", initialValue: false }),
        defineField({ name: "showAmex", title: "Amex", type: "boolean", initialValue: false }),
      ],
    }),
  ],
  preview: {
    prepare() {
      return { title: "Site Settings" };
    },
  },
});
