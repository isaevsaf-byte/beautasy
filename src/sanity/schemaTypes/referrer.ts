import { defineField, defineType } from "sanity";

/**
 * A Beautasy Friends link: "Give £5, get £5".
 *
 * One document per person, keyed on their email, so the same customer gets
 * the same link whether it was minted after an order, after a fitting or from
 * the /refer page. The code itself is stored the way gift card codes are —
 * keyed and sealed — because this dataset is readable by anyone, and a list
 * of readable codes is a list of free £5 discounts and of rewards paid to
 * strangers. See src/lib/referrals.ts.
 */
export const referrer = defineType({
  name: "referrer",
  title: "Friend Link",
  type: "document",
  description:
    "Someone with a Beautasy Friends link (“Give £5, get £5”). Created automatically after an order, after a fitting, or from the /refer page. Untick Active and publish to stop a link earning rewards — for instance if its code has turned up on a voucher site.",
  fields: [
    defineField({
      name: "displayName",
      title: "First Name",
      type: "string",
      readOnly: true,
      description: "Shown to the friends they invite (“Anna sent you £5”). The rest is sealed.",
    }),
    defineField({
      name: "emailHint",
      title: "Email",
      type: "string",
      readOnly: true,
      description: "Masked. Use “Show contact details” for the address itself.",
    }),
    defineField({ name: "emailFingerprint", title: "Email Fingerprint", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailSealed", title: "Email (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "codeHint",
      title: "Code Ends In",
      type: "string",
      readOnly: true,
      description: "The last four characters of their link code. The full code is only in their emails — and behind “Show contact details”.",
    }),
    defineField({ name: "codeFingerprint", title: "Code Fingerprint", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "codeSealed", title: "Sealed Code", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "source",
      title: "Link Came From",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "After an order", value: "order" },
          { title: "After a fitting", value: "booking" },
          { title: "The /refer page", value: "page" },
        ],
      },
    }),
    defineField({
      name: "active",
      title: "Active",
      type: "boolean",
      initialValue: true,
      description: "Untick to stop this link giving discounts or earning rewards. Publish to apply.",
    }),
    defineField({
      name: "rewardsCount",
      title: "Friends Rewarded",
      type: "number",
      readOnly: true,
      initialValue: 0,
    }),
    defineField({
      name: "creditCard",
      title: "Credit Balance (gift card)",
      type: "reference",
      to: [{ type: "giftCard" }],
      weak: true,
      readOnly: true,
      description: "Where their £5s accumulate. Spent in the bag like any gift card, or at the atelier.",
    }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", readOnly: true }),
    defineField({ name: "lastRewardAt", title: "Last Reward", type: "datetime", readOnly: true }),
  ],
  preview: {
    select: { name: "displayName", hint: "codeHint", rewards: "rewardsCount", source: "source", active: "active" },
    prepare({ name, hint, rewards, source, active }) {
      const count = typeof rewards === "number" ? rewards : 0;
      return {
        title: `${name ?? "Someone"}${hint ? ` …${hint}` : ""}`,
        subtitle: `${count} friend${count === 1 ? "" : "s"} rewarded · ${source ?? "link"}${active === false ? " · paused" : ""}`,
      };
    },
  },
  orderings: [
    { title: "Most rewards", name: "rewardsDesc", by: [{ field: "rewardsCount", direction: "desc" }] },
    { title: "Newest first", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] },
  ],
});
