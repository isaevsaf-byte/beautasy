import { defineField, defineType } from "sanity";

export const subscriber = defineType({
  name: "subscriber",
  title: "Newsletter Subscriber",
  type: "document",
  fields: [
    defineField({
      name: "emailHint",
      title: "Email",
      type: "string",
      readOnly: true,
      description: "Masked. This dataset is readable by anyone, so the address itself is sealed.",
    }),
    defineField({ name: "emailSealed", title: "Email (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailFingerprint", title: "Email Fingerprint", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "source",
      title: "Signed Up From",
      type: "string",
      description: "Where on the site they subscribed.",
      options: {
        list: [
          { title: "Footer", value: "footer" },
          { title: "Checkout", value: "checkout" },
          { title: "Other", value: "other" },
        ],
      },
      initialValue: "footer",
    }),
    defineField({
      name: "welcomeCodeSealed",
      title: "Welcome Code (sealed)",
      type: "string",
      description: "The single-use code emailed to them. Sealed: a readable one-off discount is a readable discount.",
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: "unsubscribed",
      title: "Unsubscribed",
      type: "boolean",
      initialValue: false,
      description: "Set when someone asks to be removed — never email these.",
    }),
    defineField({
      name: "createdAt",
      title: "Subscribed At",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: "emailHint", subtitle: "source" },
  },
  orderings: [
    {
      title: "Newest first",
      name: "createdAtDesc",
      by: [{ field: "createdAt", direction: "desc" }],
    },
  ],
});
