import { defineField, defineType } from "sanity";

export const atelierBooking = defineType({
  name: "atelierBooking",
  title: "Atelier Booking",
  type: "document",
  description:
    "A request for an alteration or fitting. Change the status to confirm or decline it — the customer is emailed automatically. To give it a time or move it, use \u201cChoose a time\u201d / \u201cMove to another time\u201d in the menu at the bottom. Contact details are stored sealed; use \u201cShow contact details\u201d to read them.",
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
    defineField({ name: "emailFingerprint", title: "Email Fingerprint", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "service", title: "Service", type: "string", readOnly: true }),
    defineField({
      name: "referredBy",
      title: "Referred By",
      type: "string",
      readOnly: true,
      description: "A friend sent them. Take the friend discount below off when they pay — it is not taken online.",
    }),
    defineField({
      name: "referralDiscount",
      title: "Friend Discount To Take Off (pence)",
      type: "number",
      readOnly: true,
      description: "e.g. 500 = £5 off this first visit. Marking the booking Done credits the friend who sent them.",
    }),
    defineField({
      name: "referrer",
      title: "Came Through (Friend Link)",
      type: "reference",
      to: [{ type: "referrer" }],
      weak: true,
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: "slotStart",
      title: "Booked Slot",
      type: "string",
      readOnly: true,
      description:
        "The time held in the diary for this booking — offered to nobody else online. To change it, use \u201cMove to another time\u201d in the menu at the bottom.",
    }),
    defineField({
      name: "movedFrom",
      title: "Moved From",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => !document?.movedFrom,
      description: "The time this booking had before it was moved. The customer was emailed the new one.",
    }),
    defineField({
      name: "bookedBy",
      title: "Booked By",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => !document?.bookedBy,
      description: "\u201cstudio\u201d when you booked it by hand, for someone who got in touch another way.",
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
          { title: "Can't make it — frees the time", value: "declined" },
          { title: "Client cancelled — frees the time", value: "cancelled" },
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
      // Typing a new time here held nothing: the site kept offering it, and a
      // second customer could book it. A booking with a time in the diary is
      // moved with the action, which holds the new time first.
      readOnly: ({ document }) => Boolean(document?.slotStart),
      description:
        "For a request only, in your own words — e.g. 'Tuesday 3 March, 2pm'. Better: \u201cChoose a time\u201d in the menu at the bottom, which holds the time in the diary and sends the confirmation with a calendar invite. The confirmation also tells them you'll send the address and how to find the door — so send it once you've confirmed.",
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
    /**
     * When Kristina herself was told this booking exists.
     *
     * Not the same question as `status`, and that difference is the whole
     * reason for the field. A customer who picks a time on the site is written
     * down as "confirmed" straight away, because the site has just confirmed it
     * to them — so `status` says nothing about whether anyone at the atelier
     * knows. On 5 September the email that would have told her was refused,
     * counted as sent, and the booking sat in the diary looking answered. A
     * watchman reading `status` could not have seen it; one reading this can.
     *
     * Stamped only after her notification has actually been taken by the mail
     * service, and by nothing else. Hidden because it is the site's own
     * bookkeeping: there is nothing here for her to fill in, and a date she
     * could type into would be a date the watchman has to distrust.
     */
    defineField({
      name: "kristinaNotifiedAt",
      title: "Kristina Told At",
      type: "datetime",
      readOnly: true,
      hidden: true,
    }),
    defineField({ name: "createdAt", title: "Requested At", type: "datetime", readOnly: true }),
    // The diary's own bookkeeping — see @/lib/diary
    defineField({ name: "releasedAt", title: "Time Given Back At", type: "datetime", readOnly: true, hidden: true }),
    defineField({ name: "movedAt", title: "Moved At", type: "datetime", readOnly: true, hidden: true }),
  ],
  preview: {
    select: {
      title: "displayName",
      service: "service",
      status: "status",
      date: "preferredDate",
      confirmedFor: "confirmedFor",
      referralDiscount: "referralDiscount",
      referredBy: "referredBy",
    },
    prepare({ title, service, status, date, confirmedFor, referralDiscount, referredBy }) {
      const when = confirmedFor ? ` · ${confirmedFor}` : date ? ` · asked for ${date}` : "";
      const friend =
        typeof referralDiscount === "number" && referralDiscount > 0
          ? ` · £${(referralDiscount / 100).toFixed(0)} off, sent by ${referredBy ?? "a friend"}`
          : "";
      return {
        title: `${title ?? "Someone"} — ${service ?? "booking"}`,
        subtitle: `${status ?? "new"}${when}${friend}`,
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
