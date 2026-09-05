import { defineArrayMember, defineField, defineType } from "sanity";

const DAYS = [
  { title: "Monday", value: "mon" },
  { title: "Tuesday", value: "tue" },
  { title: "Wednesday", value: "wed" },
  { title: "Thursday", value: "thu" },
  { title: "Friday", value: "fri" },
  { title: "Saturday", value: "sat" },
  { title: "Sunday", value: "sun" },
];

const TIME_RULE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * When people can book a fitting.
 *
 * Until this is switched on, the booking form works the way it always has: the
 * customer asks for a time and waits to hear back. Switch it on and the same
 * form offers real times and confirms on the spot — which is the difference
 * between "we'll get back to you" and an appointment in the diary.
 */
export const atelierSchedule = defineType({
  name: "atelierSchedule",
  title: "Fitting Times",
  type: "document",
  description:
    "The times customers can book a fitting for themselves. Leave it switched off and they'll go on asking for a time by hand.",
  fields: [
    defineField({
      name: "enabled",
      title: "Let customers book a time themselves",
      type: "boolean",
      initialValue: false,
      description:
        "While this is off, the form still works — it just asks for a preferred date instead of offering times.",
    }),
    defineField({
      name: "weekly",
      title: "Opening hours",
      type: "array",
      description:
        "One row per stretch of the week you take fittings. Two rows on the same day give you a morning and an afternoon with a gap in between.",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "day",
              title: "Day",
              type: "string",
              options: { list: DAYS },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "from",
              title: "From",
              type: "string",
              placeholder: "09:00",
              validation: (Rule) =>
                Rule.required().regex(TIME_RULE, { name: "time" }).error("Use 24-hour time, like 09:00"),
            }),
            defineField({
              name: "to",
              title: "To",
              type: "string",
              placeholder: "18:00",
              description: "The last fitting finishes by this time — it never starts on it.",
              validation: (Rule) =>
                Rule.required().regex(TIME_RULE, { name: "time" }).error("Use 24-hour time, like 18:00"),
            }),
          ],
          preview: {
            select: { day: "day", from: "from", to: "to" },
            prepare({ day, from, to }) {
              const name = DAYS.find((d) => d.value === day)?.title ?? day;
              return { title: `${name} ${from ?? "?"}–${to ?? "?"}` };
            },
          },
        }),
      ],
    }),
    defineField({
      name: "slotMinutes",
      title: "How long is one fitting",
      type: "number",
      initialValue: 30,
      description: "In minutes. Ten-minute looks and full bridal fittings both come out of this one length, so pick the length you want your day cut into.",
      validation: (Rule) => Rule.required().min(5).max(240),
    }),
    defineField({
      name: "leadTimeHours",
      title: "Notice you need",
      type: "number",
      initialValue: 24,
      description: "In hours. Nothing sooner than this is offered, so nobody books you for twenty minutes' time.",
      validation: (Rule) => Rule.required().min(0).max(24 * 14),
    }),
    defineField({
      name: "horizonDays",
      title: "How far ahead people can book",
      type: "number",
      initialValue: 28,
      description: "In days.",
      validation: (Rule) => Rule.required().min(1).max(180),
    }),
    defineField({
      name: "closures",
      title: "Days off and breaks",
      type: "array",
      description:
        "Leave the times empty to close the whole day. Fill them in to block part of one — a school run, a delivery.",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "date",
              title: "Date",
              type: "date",
              options: { dateFormat: "YYYY-MM-DD" },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "from",
              title: "From (optional)",
              type: "string",
              placeholder: "12:00",
              validation: (Rule) => Rule.regex(TIME_RULE, { name: "time" }).warning("Use 24-hour time, like 12:00"),
            }),
            defineField({
              name: "to",
              title: "To (optional)",
              type: "string",
              placeholder: "13:00",
              validation: (Rule) => Rule.regex(TIME_RULE, { name: "time" }).warning("Use 24-hour time, like 13:00"),
            }),
            defineField({ name: "note", title: "Why", type: "string", placeholder: "Away" }),
          ],
          preview: {
            select: { date: "date", from: "from", to: "to", note: "note" },
            prepare({ date, from, to, note }) {
              const when = from && to ? `${from}–${to}` : "all day";
              return { title: `${date ?? "?"} · ${when}`, subtitle: note };
            },
          },
        }),
      ],
    }),
  ],
  preview: {
    select: { enabled: "enabled", weekly: "weekly" },
    prepare({ enabled, weekly }) {
      const rows = Array.isArray(weekly) ? weekly.length : 0;
      return {
        title: "Fitting Times",
        subtitle: enabled
          ? `On · ${rows} opening ${rows === 1 ? "period" : "periods"}`
          : "Off — customers ask for a time by hand",
      };
    },
  },
});
