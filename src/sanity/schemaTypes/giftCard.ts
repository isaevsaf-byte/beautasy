import { defineField, defineType } from "sanity";

export const giftCard = defineType({
  name: "giftCard",
  title: "Подарочная карта",
  type: "document",
  description:
    "Выпускается автоматически, когда кто-то покупает подарочную карту. Баланс уменьшается по мере трат, так что картой можно платить в нескольких заказах. Самого кода здесь нет — он есть только в письме получателю.",
  fields: [
    defineField({
      name: "codeHint",
      title: "Код заканчивается на",
      type: "string",
      readOnly: true,
      description:
        "Последние четыре символа — чтобы отличать карты друг от друга. Полный код специально не хранится: эту базу может прочитать кто угодно, а прочитанный код — это деньги, которые можно потратить.",
    }),
    defineField({
      name: "codeFingerprint",
      title: "Отпечаток кода",
      type: "string",
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: "codeSealed",
      title: "Зашифрованный код",
      type: "string",
      readOnly: true,
      hidden: true,
      description: "Зашифрованная копия — чтобы карту с отложенной отправкой всё равно можно было отправить письмом в нужный день.",
    }),
    defineField({
      name: "initialAmount",
      title: "Номинал (в пенсах)",
      type: "number",
      readOnly: true,
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "balance",
      title: "Остаток (в пенсах)",
      type: "number",
      description: "Меняйте, только чтобы исправить ошибку, — обычно остаток обновляется автоматически.",
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: "recipientHint",
      title: "Получатель",
      type: "string",
      readOnly: true,
      description: "Показан не полностью. Подарочное послание — это личное, поэтому оно и адреса зашифрованы.",
    }),
    defineField({ name: "recipientEmailSealed", title: "Эл. почта получателя (зашифрована)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "recipientNameSealed", title: "Имя получателя (зашифровано)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "messageSealed", title: "Подарочное послание (зашифровано)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "purchaserEmailSealed", title: "Кто купил (зашифровано)", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "deliverAt",
      title: "Дата отправки",
      type: "datetime",
      readOnly: true,
      description: "Когда получатель должен её получить. Пусто — значит сразу.",
    }),
    defineField({
      name: "sentAt",
      title: "Когда отправлена",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "expiresAt",
      title: "Действует до",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "active",
      title: "Активна",
      type: "boolean",
      initialValue: true,
      description: "Снимите галочку, чтобы картой больше нельзя было платить (потеряна, деньги возвращены, оспорена).",
    }),
    defineField({
      name: "reservedSession",
      title: "Удержана при оформлении заказа",
      type: "string",
      readOnly: true,
      description:
        "Заполняется, пока открыто оформление заказа с этой картой, — чтобы второе оформление не потратило тот же баланс. Очищается, когда этот заказ оплачен или время на оплату истекло.",
    }),
    defineField({
      name: "reservedAmount",
      title: "Удержанная сумма (в пенсах)",
      type: "number",
      readOnly: true,
    }),
    defineField({
      name: "reservedUntil",
      title: "Удержана до",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "stripeSessionId",
      title: "Куплена в сессии Stripe",
      type: "string",
      readOnly: true,
    }),
    defineField({
      name: "source",
      title: "Тип",
      type: "string",
      readOnly: true,
      initialValue: "purchase",
      options: {
        list: [
          { title: "Куплена в подарок", value: "purchase" },
          { title: "Бонусы за друзей — начислены за рекомендации", value: "referral" },
        ],
      },
    }),
    defineField({
      name: "referrer",
      title: "Владелец (ссылка для друга)",
      type: "reference",
      to: [{ type: "referrer" }],
      weak: true,
      readOnly: true,
      description:
        "Для бонусов за друзей: чей это баланс. Сюда приходят их £5. Тратится в корзине, как любая подарочная карта, — или в ателье; тогда вычтите сумму из «Остатка» выше вручную.",
    }),
    defineField({
      name: "createdAt",
      title: "Дата выпуска",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { hint: "codeHint", balance: "balance", initial: "initialAmount", active: "active", source: "source", owner: "referrer.displayName" },
    prepare({ hint, balance, initial, active, source, owner }) {
      const left = typeof balance === "number" ? `£${(balance / 100).toFixed(2)}` : "—";
      const face = typeof initial === "number" ? `£${(initial / 100).toFixed(2)}` : "—";
      if (source === "referral") {
        return {
          title: `Бонусы за друзей — ${owner ?? "без имени"}${hint ? ` …${hint}` : ""}`,
          subtitle: `Осталось ${left}, заработано ${face}${active ? "" : " · карта отключена"}`,
        };
      }
      return {
        title: hint ? `Подарочная карта …${hint}` : "Подарочная карта",
        subtitle: `Осталось ${left} из ${face}${active ? "" : " · карта отключена"}`,
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
