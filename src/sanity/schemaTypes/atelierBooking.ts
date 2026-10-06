import { defineField, defineType, type ValidationContext } from "sanity";
import { instantOf } from "@/lib/slots";

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

/**
 * Whether a booking may be published as "new" or "confirmed" — the statuses
 * that hold a time. One whose time is already given back (declined or
 * cancelled, as published) may not: a collection holds a whole trip, so its
 * time may have gone without anyone taking its id, and flipping the status
 * would put two people on one time and email this one a time somebody else
 * holds. «Записать снова» asks the diary first. «Выполнена» is what sends
 * the thank-you and settles the friend's and the salon's reward, so it is
 * allowed once the visit's time has come; before then it would hold that
 * time again just the same, unchecked.
 *
 * The published version is asked, not the draft: the draft already carries
 * the new status.
 */
export async function statusTakesTimeBack(
  value: unknown,
  context: ValidationContext,
  now: number = Date.now()
): Promise<string | true> {
  const doc = context.document as { _id?: string; slotStart?: unknown } | undefined;
  if (!doc?._id || !doc.slotStart) return true;
  const ahead = instantOf(String(doc.slotStart)).getTime() > now;
  const holdsAgain = value === "new" || value === "confirmed" || (value === "completed" && ahead);
  if (!holdsAgain) return true;
  let published: { status?: string } | null | undefined;
  try {
    published = await context
      .getClient({ apiVersion: "2026-02-13" })
      .getDocument<{ _id: string; status?: string }>(doc._id.replace(/^drafts\./, ""));
  } catch {
    // Only this one flip waits on the answer; every other status publishes as usual
    return "Не удалось проверить, свободно ли ещё время этой записи. Проверьте интернет и попробуйте ещё раз.";
  }
  if (!published || !["declined", "cancelled"].includes(String(published.status))) return true;
  return value === "completed"
    ? "Визит ещё впереди, а его время уже освобождено. «Выполнена» ставится после визита; если клиент всё-таки придёт, сначала нажмите «Записать снова»."
    : "Время уже освобождено — его мог занять другой клиент. Чтобы вернуть запись, нажмите «Записать снова» (или «🚗 Назначить забор снова»).";
}

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
    "Заявка на подгонку, ремонт или примерку. Смените статус, чтобы подтвердить её или отказать, — клиенту автоматически придёт письмо. Чтобы назначить время, перенести запись или записать клиента снова, нажмите «Назначить время», «Перенести на другое время» или «Записать снова» в меню внизу. Заявке на забор (🚗) время назначает кнопка «🚗 Назначить забор»: она закрывает в дневнике время поездки, а время вне часов дневника вписывается там же, в «Время вне часов дневника». Вписывать время руками в «Подтверждено на» стоит, только если онлайн-запись выключена и это примерка. Контакты хранятся в зашифрованном виде — чтобы их прочитать, нажмите «Показать контакты».",
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
    // Keyed and one-way, like the email's: how the site knows the same form sent again when its answer was lost
    defineField({ name: "requestFingerprint", title: "Отпечаток заявки", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "service", title: "Услуга", type: "string", readOnly: true }),
    defineField({
      name: "referredBy",
      title: "Кто порекомендовал",
      type: "string",
      readOnly: true,
      description:
        "Клиента прислал друг или салон-партнёр. Когда клиент будет платить, вычтите скидку (поле ниже) — онлайн она не списывается. Клиентку из WhatsApp можно приписать салону кнопкой «🤝 Кто прислал» в меню внизу.",
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
      name: "referralOutcome",
      title: "Бонус тому, кто прислал",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => !document?.referralOutcome,
      description: "Решается сам, когда запись отмечена «Выполнена». Все бонусы — в разделе «Друзья и партнёры» → «Бонусы за друзей».",
      options: {
        list: [
          { title: "Начислен", value: "rewarded" },
          { title: "Ожидает — не удалось начислить, проверьте «Друзья и партнёры» → «Бонусы за друзей»", value: "pending" },
          { title: "Отозван — за заказ вернули деньги", value: "reversed" },
          { title: "Не положен: почта клиентки совпадает с почтой того, кто прислал", value: "self" },
          { title: "Не положен: не первый визит клиентки", value: "repeat" },
          { title: "Не положен: исчерпан лимит за год", value: "capped" },
          { title: "Не положен: ссылка на паузе", value: "inactive" },
          { title: "Не положен: программа выключена", value: "disabled" },
          { title: "Не удалось начислить — проверьте «Друзья и партнёры» → «Бонусы за друзей»", value: "failed" },
          { title: "Ссылки больше нет", value: "missing" },
        ],
      },
    }),
    // Set by the morning job once the reward is decided, so it is asked about once
    defineField({ name: "referralSettledAt", title: "Бонус решён", type: "datetime", readOnly: true, hidden: true }),
    // "studio" when Kristina put the booking down to a partner by hand
    defineField({ name: "referralSource", title: "Как приписан", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "slotStart",
      title: "Забронированное время",
      type: "string",
      readOnly: true,
      description:
        "Время, закреплённое за этой записью в дневнике записей, — онлайн его больше никому не предложат. Чтобы его изменить, нажмите «Перенести на другое время» в меню внизу (у забора — «🚗 Перенести забор»).",
    }),
    defineField({
      name: "slotEnd",
      title: "Занято до",
      type: "string",
      readOnly: true,
      hidden: ({ document }) => !document?.slotEnd,
      description:
        "До какого времени дневник закрыт под эту запись. Так бывает у забора — пока вы ездите, на примерку в ателье никто не запишется, — и у свадебной примерки: она занимает два слота подряд.",
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
      name: "collection",
      title: "🚗 Забор и доставка",
      type: "object",
      readOnly: true,
      hidden: ({ document }) => !document?.collection,
      description:
        "Клиент попросил забрать вещь и привезти обратно. Сайт хранит только район, полный индекс и когда клиенту удобно — в письме вам (и в заметках, кнопка «Показать контакты»). Время назначьте кнопкой «🚗 Назначить забор» в меню внизу: выберите день, время и сколько займёт поездка — это время закроется в дневнике, а клиенту уйдёт письмо «Your collection is arranged» с окном и приглашением в календарь. Время вне часов дневника впишите в том же окне, в «Время вне часов дневника». Адрес спросите в переписке. Цена — по условиям ниже, их видел клиент.",
      fields: [
        defineField({ name: "district", title: "Район (индекс)", type: "string" }),
        defineField({ name: "zone", title: "Зона", type: "string" }),
        // From before Kristina drove, when the customer picked one of Safar's windows
        defineField({
          name: "window",
          title: "Окно, которое выбрал клиент",
          type: "string",
          hidden: ({ parent }) => !(parent as { window?: string } | undefined)?.window,
        }),
        defineField({ name: "terms", title: "Условия, которые увидел клиент", type: "string" }),
      ],
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
      // Its time went to another customer: confirming it again would put two
      // people on one time. "Book again" takes a free one.
      readOnly: ({ document }) => Boolean(document?.releasedAt),
      // Any other booking that gave its time back may still be finished, but
      // not take its time back by its status — see statusTakesTimeBack
      validation: (rule) => rule.custom(statusTakesTimeBack),
      description:
        "Отменённую запись со временем вернуть в «Новая» или «Подтверждена» можно только кнопкой «Записать снова» (у забора — «🚗 Назначить забор снова»): она проверит, что время всё ещё свободно. «Выполнена» поставить можно после времени визита — например, если клиент отменил, а потом всё-таки пришёл. Если статус поменяли по ошибке и ещё не опубликовали, нажмите «Отменить изменения».",
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
        "Только для заявки, своими словами — например, «Tuesday 3 March, 2pm». Это попадёт в письмо клиенту, поэтому пишите по-английски. Лучше нажмите «Назначить время» в меню внизу (у забора — «🚗 Назначить забор»): кнопка закрепит время в дневнике записей и отправит подтверждение с приглашением в календарь. В подтверждении примерки также сказано, что вы пришлёте адрес и объясните, как найти дверь, — так что после подтверждения пришлите их. Вписывать время сюда вручную стоит, только когда кнопкой нельзя — онлайн-запись выключена. Забор вне часов дневника — например, «Monday 5 October, 7:30pm» — назначьте кнопкой «🚗 Назначить забор», в «Время вне часов дневника»: она сама напишет клиенту и освободит в дневнике прежнее время забора. Вписанное здесь время в дневнике не закроется.",
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
      district: "collection.district",
      collectAt: "collection.window",
    },
    prepare({ title, service, status, date, confirmedFor, referralDiscount, referredBy, district, collectAt }) {
      const when = confirmedFor
        ? `${district ? " · 🚗" : ""} · ${confirmedFor}`
        : district
        ? ` · 🚗 забрать: ${[district, collectAt].filter(Boolean).join(", ")} — время не назначено`
        : date
        ? ` · желаемая дата: ${date}`
        : "";
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
