import { defineField, defineType } from "sanity";

/**
 * One friend arriving through a link: what they did, and what came of it.
 *
 * Written when the reward is decided — after the friend's order is paid, or
 * when Kristina marks their fitting as done. Its id is derived from the order
 * or booking, so a retried webhook or a second run of the daily job cannot
 * reward the same friend twice.
 */
export const referral = defineType({
  name: "referral",
  title: "Friend Reward",
  type: "document",
  description:
    "A friend who bought or booked through someone's link, and whether that earned a reward. Created automatically — nothing here needs editing.",
  fields: [
    defineField({
      name: "referrer",
      title: "Through Whose Link",
      type: "reference",
      to: [{ type: "referrer" }],
      weak: true,
      readOnly: true,
    }),
    defineField({
      name: "kind",
      title: "What They Did",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "Ordered from the shop", value: "order" },
          { title: "Came to the atelier", value: "booking" },
        ],
      },
    }),
    defineField({ name: "orderId", title: "Order", type: "string", readOnly: true }),
    defineField({ name: "bookingId", title: "Booking", type: "string", readOnly: true }),
    defineField({ name: "friendName", title: "Friend", type: "string", readOnly: true }),
    defineField({ name: "friendEmailHint", title: "Friend's Email", type: "string", readOnly: true, description: "Masked." }),
    defineField({ name: "friendEmailFingerprint", title: "Friend Email Fingerprint", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "discount", title: "Friend's Discount (pence)", type: "number", readOnly: true }),
    defineField({ name: "reward", title: "Reward Credited (pence)", type: "number", readOnly: true }),
    defineField({
      name: "outcome",
      title: "Outcome",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "Rewarded", value: "rewarded" },
          { title: "Pending — crediting", value: "pending" },
          { title: "Not rewarded: own email", value: "self" },
          { title: "Not rewarded: not their first time", value: "repeat" },
          { title: "Not rewarded: yearly limit reached", value: "capped" },
          { title: "Not rewarded: link paused", value: "inactive" },
          { title: "Not rewarded: programme off", value: "disabled" },
        ],
      },
    }),
    defineField({ name: "claim", title: "Claim", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "rewardEmailedAt", title: "Reward Email Sent", type: "datetime", readOnly: true }),
    defineField({ name: "createdAt", title: "Created At", type: "datetime", readOnly: true }),
  ],
  preview: {
    select: { friend: "friendName", via: "referrer.displayName", outcome: "outcome", kind: "kind", reward: "reward" },
    prepare({ friend, via, outcome, kind, reward }) {
      const what = kind === "booking" ? "came to the atelier" : "ordered";
      const credited = typeof reward === "number" && reward > 0 ? ` · £${(reward / 100).toFixed(0)} to ${via ?? "the referrer"}` : "";
      return {
        title: `${friend ?? "A friend"} ${what} via ${via ?? "a link"}`,
        subtitle: `${outcome ?? "pending"}${credited}`,
      };
    },
  },
  orderings: [{ title: "Newest first", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] }],
});
