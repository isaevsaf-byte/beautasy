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

    /* ── Beautasy Friends ── */
    defineField({
      name: "referral",
      title: "Beautasy Friends (Give £5, get £5)",
      type: "object",
      description:
        "The refer-a-friend programme. Friends get money off their first order or first alteration; the person who sent them earns credit to spend in the shop or at the atelier. Amounts are in pence: 500 = £5.",
      fields: [
        defineField({
          name: "enabled",
          title: "Programme On",
          type: "boolean",
          initialValue: true,
          description: "Off: links still open, but no discounts are given and no credit is earned.",
        }),
        defineField({
          name: "friendShopDiscount",
          title: "Friend's Discount In The Shop (pence)",
          type: "number",
          initialValue: 500,
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "friendMinBasket",
          title: "Smallest Basket For It (pence)",
          type: "number",
          initialValue: 1500,
          description: "e.g. 1500 = the friend discount needs a £15 basket. 0 = no minimum.",
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "friendAtelierDiscount",
          title: "Friend's Discount At The Atelier (pence)",
          type: "number",
          initialValue: 500,
          description: "Taken off by hand when they pay — the booking says so.",
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "referrerReward",
          title: "Credit Earned Per Friend (pence)",
          type: "number",
          initialValue: 500,
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "creditValidityMonths",
          title: "Credit Lasts (months)",
          type: "number",
          initialValue: 12,
          description: "Counted from the last time credit was added.",
          validation: (Rule) => Rule.required().min(1).max(60),
        }),
        defineField({
          name: "maxRewardsPerYear",
          title: "Friends Rewarded Per Person Per Year",
          type: "number",
          initialValue: 20,
          description: "Stops a code posted on a voucher site from paying out forever.",
          validation: (Rule) => Rule.required().min(1),
        }),
      ],
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
