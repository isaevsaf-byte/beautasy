import { defineField, defineType } from "sanity";

export const atelierBooking = defineType({
  name: "atelierBooking",
  title: "Atelier Booking",
  type: "document",
  description:
    "A request for an alteration or fitting. Change the status to confirm or decline it — the customer is emailed automatically.",
  fields: [
    defineField({ name: "name", title: "Name", type: "string", readOnly: true }),
    defineField({ name: "email", title: "Email", type: "string", readOnly: true }),
    defineField({ name: "phone", title: "Phone", type: "string", readOnly: true }),
    defineField({ name: "service", title: "Service", type: "string", readOnly: true }),
    defineField({
      name: "preferredDate",
      title: "Preferred Date",
      type: "string",
      readOnly: true,
      description: "What the customer asked for.",
    }),
    defineField({ name: "notes", title: "Notes", type: "text", rows: 3, readOnly: true }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "New — needs a reply", value: "new" },
          { title: "Confirmed", value: "confirmed" },
          { title: "Can't make it", value: "declined" },
          { title: "Done — thanks them and asks for a review", value: "completed" },
        ],
        layout: "radio",
      },
      initialValue: "new",
    }),
    defineField({
      name: "confirmedFor",
      title: "Confirmed For",
      type: "string",
      description:
        "The date and time you're confirming, in your own words — e.g. 'Tuesday 3 March, 2pm'. Included in the confirmation email.",
    }),
    defineField({
      name: "replyNote",
      title: "Note To Customer",
      type: "text",
      rows: 2,
      description: "Optional line added to the email — e.g. an alternative time you can offer.",
    }),
    defineField({
      name: "notifiedStatus",
      title: "Customer Notified Of",
      type: "string",
      readOnly: true,
      description: "The last status the customer was emailed about. Set automatically.",
    }),
    defineField({ name: "createdAt", title: "Requested At", type: "datetime", readOnly: true }),
  ],
  preview: {
    select: { title: "name", service: "service", status: "status", date: "preferredDate" },
    prepare({ title, service, status, date }) {
      return {
        title: `${title ?? "Someone"} — ${service ?? "booking"}`,
        subtitle: `${status ?? "new"}${date ? ` · asked for ${date}` : ""}`,
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
