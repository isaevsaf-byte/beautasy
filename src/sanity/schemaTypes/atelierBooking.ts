import { defineField, defineType } from "sanity";

// The Studio's words for each status. The values are what is stored, and what
// the site and the emails read, so only the titles are ever translated. The
// part before " — " is also the short word the list preview shows.
const STATUS_OPTIONS = [
  { title: "Новая — нужен ответ", value: "new" },
  { title: "Подтверждена", value: "confirmed" },
  { title: "Отказано — время освободится", value: "declined" },
  { title: "Клиент отменил — время освободится", value: "cancelled" },
  { title: "Выполнена — клиент получит благодарность и просьбу об отзыве", value: "completed" },
];

/** A status as the list preview names it. A value with no title shows as itself, never blank. */
function statusWord(value: string): string {
  const title = STATUS_OPTIONS.find((option) => option.value === value)?.title;
  return title ? title.split(" — ")[0] : value;
}

export const atelierBooking = defineType({
  name: "atelierBooking",
  title: "Запись в ателье",
  type: "document",
  description:
    "Заявка на подгонку, ремонт или примерку. Смените статус, чтобы подтвердить её или отказать, — клиенту автоматически придёт письмо. Чтобы назначить время, перенести запись или записать клиента снова, нажмите «Назначить время», «Перенести на другое время» или «Записать снова» в меню внизу. Контакты хранятся в зашифрованном виде — чтобы их прочитать, нажмите «Показать контакты».",
  fields: [
    defineField({
      name: "displayName",
      title: "Имя",
      type: "string",
      readOnly: true,
      description: "Остальные контакты зашифрованы — эту базу может прочитать кто угодно.",
    }),
    defineField({
      name: "emailHint",
      title: "Эл. почта",
      type: "string",
      readOnly: true,
      description: "Адрес показан не полностью. Целиком — по кнопке «Показать контакты».",
    }),
    defineField({ name: "nameSealed", title: "Имя (зашифровано)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailSealed", title: "Эл. почта (зашифрована)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "phoneSealed", title: "Телефон (зашифрован)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "notesSealed", title: "Заметки (зашифрованы)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailFingerprint", title: "Отпечаток эл. почты", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "service", title: "Услуга", type: "string", readOnly: true }),
    defineField({
      name: "referredBy",
      title: "Кто порекомендовал",
      type: "string",
      readOnly: true,
      description:
        "Клиента прислал друг. Когда клиент будет платить, вычтите скидку за друга (поле ниже) — онлайн она не списывается.",
    }),
    defineField({
      name: "referralDiscount",
      title: "Вычесть скидку за друга (в пенсах)",
      type: "number",
      readOnly: true,
      description:
        "Например, 500 = скидка £5 на этот первый визит. Когда вы поставите записи статус «Выполнена», другу, который прислал клиента, начислится бонус.",
    }),
    defineField({
      name: "referrer",
      title: "Пришли по ссылке друга",
      type: "reference",
      to: [{ type: "referrer" }],
      weak: true,
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: "slotStart",
      title: "Забронированное время",
      type: "string",
      readOnly: true,
      description:
        "Время, закреплённое за этой записью в дневнике записей, — онлайн его больше никому не предложат. Чтобы его изменить, нажмите «Перенести на другое время» в меню внизу.",
    }),
    defineField({
      name: "movedFrom",
      title: "Перенесено с",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => !document?.movedFrom,
      description: "Время, которое было у записи до переноса. Клиенту ушло письмо с новым временем.",
    }),
    defineField({
      name: "bookedBy",
      title: "Кто записал",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => !document?.bookedBy,
      description: "Здесь стоит «studio», если вы записали клиента вручную — когда он связался с вами другим способом.",
    }),
    defineField({
      name: "preferredDate",
      title: "Желаемая дата",
      type: "string",
      readOnly: true,
      description: "Что попросил клиент, когда не смог выбрать время сам.",
    }),
    defineField({
      name: "releasedAt",
      title: "Её время занял другой клиент",
      type: "datetime",
      readOnly: true,
      hidden: ({ document }) => !document?.releasedAt,
      description:
        "После того как эта запись освободила своё время, его занял другой клиент — здесь отмечено, когда это случилось. Чтобы записать этого клиента снова, нажмите «Записать снова» в меню внизу: кнопка займёт свободное время и отправит клиенту письмо.",
    }),
    defineField({
      name: "status",
      title: "Статус",
      type: "string",
      // Confirming it again would put two people on one time, and email this
      // one a time somebody else now holds. "Book again" takes a free one.
      readOnly: ({ document }) => Boolean(document?.releasedAt),
      options: {
        list: STATUS_OPTIONS,
        layout: "radio",
      },
      initialValue: "new",
    }),
    defineField({
      name: "confirmedFor",
      title: "Подтверждено на",
      type: "string",
      // Typing a new time here held nothing: the site kept offering it, and a
      // second customer could book it. A booking with a time in the diary is
      // moved with the action, which holds the new time first.
      readOnly: ({ document }) => Boolean(document?.slotStart),
      description:
        "Только для заявки, своими словами — например, «Tuesday 3 March, 2pm». Это попадёт в письмо клиенту, поэтому пишите по-английски. Лучше нажмите «Назначить время» в меню внизу: кнопка закрепит время в дневнике записей и отправит подтверждение с приглашением в календарь. В подтверждении также сказано, что вы пришлёте адрес и объясните, как найти дверь, — так что после подтверждения пришлите их.",
    }),
    defineField({
      name: "replyNote",
      title: "Сообщение клиенту",
      type: "text",
      rows: 2,
      description:
        "По желанию: строка, которая добавится в письмо, — например, другое время, которое вы можете предложить. Клиент прочитает её в письме, поэтому пишите по-английски.",
    }),
    defineField({
      name: "notifiedStatus",
      title: "О каком статусе клиенту сообщили",
      type: "string",
      readOnly: true,
      description: "Последний статус, о котором клиенту ушло письмо. Заполняется автоматически.",
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
      title: "Когда сообщили Кристине",
      type: "datetime",
      readOnly: true,
      hidden: true,
    }),
    defineField({ name: "createdAt", title: "Дата заявки", type: "datetime", readOnly: true }),
    // The diary's own bookkeeping — see @/lib/diary
    defineField({ name: "movedAt", title: "Когда перенесли", type: "datetime", readOnly: true, hidden: true }),
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
      const when = confirmedFor ? ` · ${confirmedFor}` : date ? ` · желаемая дата: ${date}` : "";
      const friend =
        typeof referralDiscount === "number" && referralDiscount > 0
          ? ` · скидка £${(referralDiscount / 100).toFixed(0)}, рекомендация от ${referredBy ?? "друга"}`
          : "";
      return {
        title: `${title ?? "Без имени"} — ${service ?? "запись"}`,
        subtitle: `${statusWord(status ?? "new")}${when}${friend}`,
      };
    },
  },
  orderings: [
    {
      title: "Сначала новые",
      name: "createdAtDesc",
      by: [{ field: "createdAt", direction: "desc" }],
    },
  ],
});
