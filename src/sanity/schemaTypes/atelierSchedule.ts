import { defineArrayMember, defineField, defineType } from "sanity";
import { closureCovers, closureLastDay, type Closure } from "@/lib/slots";

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

/** "2026-11-03" → "3 нояб." — short, as the warning lists them */
function dayRu(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The day after "2026-11-07": where a range of whole days stops, for a query */
function dayAfter(date: string): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * Closing days that already have bookings: the site stops offering them, but
 * the people booked are still coming. Said in the Studio as she saves — a
 * warning, not a refusal, since moving them is hers to do — so nobody arrives
 * at a locked door while she is away.
 */
const BOOKED_IN_CLOSURE = `*[
  _type == "atelierBooking"
  && !(_id in path("drafts.**"))
  && status in ["new", "confirmed"]
  && defined(slotStart)
  && slotStart >= $from && slotStart < $until
] | order(slotStart asc) { displayName, slotStart }`;

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
        "Уезжаете — поставьте «Дату» и «По»: сайт закроет все эти дни, и записаться на них будет нельзя. Оставьте время пустым, чтобы закрыть весь день. Заполните его, чтобы закрыть только часть дня — например, отвезти детей в школу или принять доставку. Уже сделанные записи сайт не отменяет — Studio предупредит, если они есть.",
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
              name: "until",
              title: "По (по желанию)",
              type: "date",
              options: { dateFormat: "YYYY-MM-DD" },
              description: "Для отъезда: последний закрытый день. Закроет все дни с «Даты» по этот включительно — не нужно добавлять каждый день отдельно.",
              validation: (Rule) =>
                Rule.custom((until, context) => {
                  const date = (context.parent as { date?: string } | undefined)?.date;
                  return !until || !date || until >= date ? true : "Не раньше, чем «Дата»";
                }),
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
          validation: (Rule) =>
            Rule.custom(async (value, context) => {
              const closure = value as Closure | undefined;
              if (!closure?.date) return true;
              const last = closureLastDay(closure);
              const booked = await context
                .getClient({ apiVersion: "2026-02-13" })
                .fetch<{ displayName?: string | null; slotStart: string }[]>(BOOKED_IN_CLOSURE, {
                  from: `${closure.date}T00:00`,
                  until: `${dayAfter(last)}T00:00`,
                });
              const inside = (booked ?? []).filter((booking) => closureCovers(closure, booking.slotStart));
              if (!inside.length) return true;
              const named = inside
                .slice(0, 5)
                .map((booking) => `${booking.displayName || "без имени"} — ${dayRu(booking.slotStart.slice(0, 10))} ${booking.slotStart.slice(11, 16)}`)
                .join("; ");
              return `На это время уже записаны: ${named}${inside.length > 5 ? ` и ещё ${inside.length - 5}` : ""}. Сайт их не отменит — перенесите или отмените эти записи в «Записях», иначе они придут.`;
            }).warning(),
          preview: {
            select: { date: "date", until: "until", from: "from", to: "to", note: "note" },
            prepare({ date, until, from, to, note }) {
              const days = until && date && until > date ? `${date} — ${until}` : date ?? "?";
              const when = from && to ? `${from}–${to}` : until && date && until > date ? "все дни" : "весь день";
              return { title: `${days} · ${when}`, subtitle: note };
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
