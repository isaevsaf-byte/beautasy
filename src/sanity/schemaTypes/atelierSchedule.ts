import { defineArrayMember, defineField, defineType } from "sanity";

const DAYS = [
  { title: "Понедельник", value: "mon" },
  { title: "Вторник", value: "tue" },
  { title: "Среда", value: "wed" },
  { title: "Четверг", value: "thu" },
  { title: "Пятница", value: "fri" },
  { title: "Суббота", value: "sat" },
  { title: "Воскресенье", value: "sun" },
];

const TIME_RULE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "1 период", "3 периода", "5 периодов": a Russian count needs three forms, not two. */
function openingPeriods(count: number): string {
  const form = new Intl.PluralRules("ru-RU").select(count);
  const word = form === "one" ? "период" : form === "few" ? "периода" : "периодов";
  return `${count} ${word} приёма`;
}

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
  title: "Часы для примерок",
  type: "document",
  description:
    "Время, на которое клиенты могут сами записаться на примерку. Пока это выключено, они, как и раньше, просят время в заявке.",
  fields: [
    defineField({
      name: "enabled",
      title: "Разрешить клиентам самим выбирать время",
      type: "boolean",
      initialValue: false,
      description:
        "Пока это выключено, форма всё равно работает — просто вместо свободного времени она спрашивает желаемую дату.",
    }),
    defineField({
      name: "weekly",
      title: "Часы приёма",
      type: "array",
      description:
        "Одна строка — один отрезок недели, когда вы принимаете на примерку. Две строки на один день — это утро и вторая половина дня с перерывом между ними.",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "day",
              title: "День",
              type: "string",
              options: { list: DAYS },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "from",
              title: "Начало",
              type: "string",
              placeholder: "09:00",
              validation: (Rule) =>
                Rule.required().regex(TIME_RULE, { name: "time" }).error("Пишите время в 24-часовом формате, например 09:00"),
            }),
            defineField({
              name: "to",
              title: "Конец",
              type: "string",
              placeholder: "18:00",
              description: "К этому времени последняя примерка уже заканчивается — в это время ни одна не начинается.",
              validation: (Rule) =>
                Rule.required().regex(TIME_RULE, { name: "time" }).error("Пишите время в 24-часовом формате, например 18:00"),
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
      title: "Сколько длится одна примерка",
      type: "number",
      initialValue: 30,
      description: "В минутах. И десятиминутный осмотр вещи, и полная свадебная примерка складываются из этой одной длины — поэтому выберите шаг, на который удобно делить ваш день.",
      validation: (Rule) => Rule.required().min(5).max(240),
    }),
    defineField({
      name: "leadTimeHours",
      title: "За сколько записываться заранее",
      type: "number",
      initialValue: 24,
      description: "В часах. Время ближе этого срока не предлагается — чтобы никто не записался к вам за двадцать минут до примерки.",
      validation: (Rule) => Rule.required().min(0).max(24 * 14),
    }),
    defineField({
      name: "horizonDays",
      title: "На сколько вперёд можно записаться",
      type: "number",
      initialValue: 28,
      description: "В днях.",
      validation: (Rule) => Rule.required().min(1).max(180),
    }),
    defineField({
      name: "workBankHolidays",
      title: "Работать в банковские выходные",
      type: "boolean",
      initialValue: false,
      description:
        "Пока это выключено, сайт сам закрывает запись в банковские выходные Англии и Уэльса: Новый год, Страстную пятницу, Пасхальный понедельник, оба майских понедельника, последний понедельник августа и будние дни, на которые переносят Новый год, Рождество и День подарков, если они выпали на субботу или воскресенье: в 2026 году это понедельник, 28 декабря. Вписывать их в «Выходные и перерывы» не нужно. Включите, если работаете в эти дни. 25 и 26 декабря закрыты в любом случае.",
    }),
    defineField({
      name: "closures",
      title: "Выходные и перерывы",
      type: "array",
      description:
        "Оставьте время пустым, чтобы закрыть весь день. Заполните его, чтобы закрыть только часть дня — например, отвезти детей в школу или принять доставку.",
      of: [
        defineArrayMember({
          type: "object",
          fields: [
            defineField({
              name: "date",
              title: "Дата",
              type: "date",
              options: { dateFormat: "YYYY-MM-DD" },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "from",
              title: "Начало (по желанию)",
              type: "string",
              placeholder: "12:00",
              validation: (Rule) => Rule.regex(TIME_RULE, { name: "time" }).warning("Пишите время в 24-часовом формате, например 12:00"),
            }),
            defineField({
              name: "to",
              title: "Конец (по желанию)",
              type: "string",
              placeholder: "13:00",
              validation: (Rule) => Rule.regex(TIME_RULE, { name: "time" }).warning("Пишите время в 24-часовом формате, например 13:00"),
            }),
            defineField({ name: "note", title: "Причина", type: "string", placeholder: "В отъезде" }),
          ],
          preview: {
            select: { date: "date", from: "from", to: "to", note: "note" },
            prepare({ date, from, to, note }) {
              const when = from && to ? `${from}–${to}` : "весь день";
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
        title: "Часы для примерок",
        subtitle: enabled
          ? `Включено · ${openingPeriods(rows)} в неделю`
          : "Выключено — клиенты оставляют заявку и ждут ответа",
      };
    },
  },
});
