import { defineField, defineType } from "sanity";

export const subscriber = defineType({
  name: "subscriber",
  title: "Newsletter Subscriber",
  type: "document",
  fields: [
    defineField({
      name: "email",
      title: "Email",
      type: "string",
      validation: (Rule) => Rule.required().email(),
    }),
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
      name: "welcomeCode",
      title: "Welcome Code Sent",
      type: "string",
      description: "The discount code emailed to them, if any.",
      readOnly: true,
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
    select: { title: "email", subtitle: "source" },
  },
  orderings: [
    {
      title: "Newest first",
      name: "createdAtDesc",
      by: [{ field: "createdAt", direction: "desc" }],
    },
  ],
});
