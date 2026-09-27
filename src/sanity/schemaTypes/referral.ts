import { defineField, defineType } from "sanity";

/**
 * One friend arriving through a link: what they did, and what came of it.
 *
 * Written when the reward is decided — after the friend's order is paid, or
 * when Kristina marks their fitting as done. Its id is derived from the order
 * or booking, so a retried webhook or a second run of the daily job cannot
 * reward the same friend twice.
 */

const OUTCOMES = [
  { title: "Бонус начислен", value: "rewarded" },
  { title: "Бонус отозван — за заказ вернули деньги", value: "reversed" },
  { title: "Ожидает — бонус начисляется", value: "pending" },
  { title: "Без бонуса: почта владельца ссылки", value: "self" },
  { title: "Без бонуса: не первый заказ или визит", value: "repeat" },
  { title: "Без бонуса: достигнут лимит за год", value: "capped" },
  { title: "Без бонуса: ссылка на паузе", value: "inactive" },
  { title: "Без бонуса: программа выключена", value: "disabled" },
];

export const referral = defineType({
  name: "referral",
  title: "Бонус за друга",
  type: "document",
  description:
    "Друг, который купил или записался по чьей-то ссылке, и принесло ли это бонус. Создаётся автоматически — здесь ничего не нужно править.",
  fields: [
    defineField({
      name: "referrer",
      title: "По чьей ссылке",
      type: "reference",
      to: [{ type: "referrer" }],
      weak: true,
      readOnly: true,
    }),
    defineField({
      name: "kind",
      title: "Что сделал друг",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "Заказ в магазине", value: "order" },
          { title: "Визит в ателье", value: "booking" },
        ],
      },
    }),
    defineField({ name: "orderId", title: "Заказ", type: "string", readOnly: true }),
    defineField({ name: "bookingId", title: "Запись", type: "string", readOnly: true }),
    defineField({ name: "friendName", title: "Друг", type: "string", readOnly: true }),
    defineField({ name: "friendEmailHint", title: "Эл. почта друга", type: "string", readOnly: true, description: "Скрыта частично." }),
    defineField({ name: "friendEmailFingerprint", title: "Отпечаток эл. почты друга", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "discount", title: "Скидка другу (в пенсах)", type: "number", readOnly: true }),
    defineField({ name: "reward", title: "Начисленный бонус (в пенсах)", type: "number", readOnly: true }),
    defineField({
      name: "outcome",
      title: "Итог",
      type: "string",
      readOnly: true,
      options: {
        list: OUTCOMES,
      },
    }),
    defineField({ name: "claim", title: "Метка обработки", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "rewardEmailedAt", title: "Письмо о бонусе отправлено", type: "datetime", readOnly: true }),
    defineField({
      name: "reversedAt",
      title: "Бонус отозван",
      type: "datetime",
      readOnly: true,
      description: "Заполняется, когда за заказ друга вернули деньги и бонус списали обратно.",
    }),
    defineField({ name: "createdAt", title: "Создан", type: "datetime", readOnly: true }),
  ],
  preview: {
    select: { friend: "friendName", via: "referrer.displayName", outcome: "outcome", kind: "kind", reward: "reward" },
    prepare({ friend, via, outcome, kind, reward }) {
      const what = kind === "booking" ? "визит в ателье" : "заказ";
      const credited =
        outcome !== "reversed" && typeof reward === "number" && reward > 0
          ? ` · £${(reward / 100).toFixed(0)} для ${via ?? "пригласившего"}`
          : "";
      const state = outcome ?? "pending";
      return {
        title: `${friend ?? "Друг"}: ${what} по ссылке${via ? ` от ${via}` : ""}`,
        subtitle: `${OUTCOMES.find((o) => o.value === state)?.title ?? state}${credited}`,
      };
    },
  },
  orderings: [{ title: "Сначала новые", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] }],
});
