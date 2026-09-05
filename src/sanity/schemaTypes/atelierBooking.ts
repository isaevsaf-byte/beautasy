import { defineField, defineType } from "sanity";

export const atelierBooking = defineType({
  name: "atelierBooking",
  title: "Atelier Booking",
  type: "document",
  description:
    "A request for an alteration or fitting. Change the status to confirm or decline it — the customer is emailed automatically. Contact details are stored sealed; use \u201cShow contact details\u201d to read them.",
  fields: [
    defineField({
      name: "displayName",
      title: "First Name",
      type: "string",
      readOnly: true,
      description: "The rest of the contact details are sealed — this dataset is readable by anyone.",
    }),
    defineField({
      name: "emailHint",
      title: "Email",
      type: "string",
      readOnly: true,
      description: "Masked. Use \u201cShow contact details\u201d for the address itself.",
    }),
    defineField({ name: "nameSealed", title: "Name (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailSealed", title: "Email (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "phoneSealed", title: "Phone (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "notesSealed", title: "Notes (sealed)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "service", title: "Service", type: "string", readOnly: true }),
    defineField({
      name: "slotStart",
      title: "Booked Slot",
      type: "string",
      readOnly: true,
      description:
        "Set when the customer picked a time themselves — that time is then held for them and offered to nobody else.",
    }),
    defineField({
      name: "preferredDate",
      title: "Preferred Date",
      type: "string",
      readOnly: true,
      description: "What the customer asked for, when they could not pick a time.",
    }),
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
    select: {
      title: "displayName",
      service: "service",
      status: "status",
      date: "preferredDate",
      confirmedFor: "confirmedFor",
    },
    prepare({ title, service, status, date, confirmedFor }) {
      const when = confirmedFor ? ` · ${confirmedFor}` : date ? ` · asked for ${date}` : "";
      return {
        title: `${title ?? "Someone"} — ${service ?? "booking"}`,
        subtitle: `${status ?? "new"}${when}`,
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
