import { defineField, defineType } from "sanity";

/**
 * A Beautasy Friends link: "Give £5, get £5".
 *
 * One document per person, keyed on their email, so the same customer gets
 * the same link whether it was minted after an order, after a fitting or from
 * the /refer page. The code itself is stored the way gift card codes are —
 * keyed and sealed — because this dataset is readable by anyone, and a list
 * of readable codes is a list of free £5 discounts and of rewards paid to
 * strangers. See src/lib/referrals.ts.
 */

const SOURCES = [
  { title: "После заказа", value: "order" },
  { title: "После примерки", value: "booking" },
  { title: "Страница /refer", value: "page" },
  { title: "Партнёр — салон или магазин", value: "partner" },
];

// Kept in step with PARTNER_KINDS in @/lib/partners, which the server checks against
const PARTNER_KINDS = [
  { title: "Салон красоты или парикмахерская", value: "salon" },
  { title: "Свадебный или вечерний салон", value: "bridal" },
  { title: "Другое: химчистка, отель, магазин", value: "other" },
];

export const referrer = defineType({
  name: "referrer",
  title: "Ссылка для друга",
  type: "document",
  description:
    "Человек со ссылкой Beautasy Friends («Give £5, get £5»). Создаётся автоматически после заказа, после примерки или со страницы /refer. Чтобы ссылка перестала приносить бонусы — например, если её код всплыл на сайте с купонами, — снимите галочку «Активна» и опубликуйте.",
  fields: [
    defineField({
      name: "displayName",
      title: "Имя",
      type: "string",
      readOnly: true,
      description: "Его видят друзья, которых приглашает этот человек («Anna sent you £5»). Всё остальное зашифровано.",
    }),
    defineField({
      name: "emailHint",
      title: "Эл. почта",
      type: "string",
      readOnly: true,
      description: "Скрыта частично. Сам адрес — по кнопке «Показать контакты».",
    }),
    defineField({ name: "emailFingerprint", title: "Отпечаток эл. почты", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "emailSealed", title: "Эл. почта (зашифрована)", type: "string", readOnly: true, hidden: true }),
    // No longer written: a code is the name and four more characters, and the
    // name is in the open, so the last four rebuilt a working link from the
    // public dataset. Kept, hidden, only so the links made before carry no
    // "unknown field" until it is taken off them.
    defineField({ name: "codeHint", title: "Код заканчивается на", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "codeFingerprint", title: "Отпечаток кода", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "codeSealed", title: "Код (зашифрован)", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "source",
      title: "Откуда ссылка",
      type: "string",
      readOnly: true,
      options: {
        list: SOURCES,
      },
    }),
    defineField({
      name: "active",
      title: "Активна",
      type: "boolean",
      initialValue: true,
      description: "Снимите галочку, чтобы ссылка перестала давать скидки и приносить бонусы. Чтобы это сработало, опубликуйте.",
    }),
    defineField({
      name: "rewardsCount",
      title: "Друзей с бонусом",
      type: "number",
      readOnly: true,
      initialValue: 0,
    }),
    defineField({
      name: "creditCard",
      title: "Бонусный баланс (подарочная карта)",
      type: "reference",
      to: [{ type: "giftCard" }],
      weak: true,
      readOnly: true,
      description: "Сюда копятся бонусы по £5. Их тратят в корзине, как любую подарочную карту, или в ателье.",
    }),
    defineField({ name: "createdAt", title: "Создана", type: "datetime", readOnly: true }),
    defineField({ name: "lastRewardAt", title: "Последний бонус", type: "datetime", readOnly: true }),
    defineField({
      name: "partner",
      title: "Партнёр",
      type: "object",
      readOnly: true,
      hidden: ({ document }) => !document?.partner,
      description:
        "Это ссылка салона-партнёра. Её название, условия, отчёт за месяц и карточки для печати — в разделе «Друзья и партнёры» → «Партнёры»; меняйте их там.",
      fields: [
        defineField({ name: "name", title: "Название", type: "string" }),
        defineField({ name: "slug", title: "Ссылка: beautasy.co.uk/p/…", type: "string" }),
        defineField({ name: "kind", title: "Кто это", type: "string", options: { list: PARTNER_KINDS } }),
        // Sealed, like the phone: what one salon is paid is not for the next to
        // read, and the owner is a person. «Партнёры» shows them, opened by the site.
        defineField({ name: "commissionSealed", title: "Комиссия (зашифрована)", type: "string", hidden: true }),
        defineField({ name: "contactNameSealed", title: "Имя владелицы (зашифровано)", type: "string", hidden: true }),
        defineField({ name: "phoneSealed", title: "Телефон (зашифрован)", type: "string", hidden: true }),
        // The open copies a partner made before sealing may carry; its next save in «Партнёры» takes them off
        defineField({ name: "commissionPercent", title: "Комиссия деньгами, %", type: "number", hidden: true }),
        defineField({ name: "contactName", title: "Имя владелицы", type: "string", hidden: true }),
      ],
    }),
  ],
  preview: {
    select: {
      name: "displayName",
      // Tells two Annas apart. It used to be the code's last four, which with
      // the name in front of them was the whole link.
      hint: "emailHint",
      rewards: "rewardsCount",
      source: "source",
      active: "active",
      partnerSlug: "partner.slug",
    },
    prepare({ name, hint, rewards, source, active, partnerSlug }) {
      const count = typeof rewards === "number" ? rewards : 0;
      if (partnerSlug) {
        return {
          title: name ?? "Партнёр",
          subtitle: `Партнёр · /p/${partnerSlug} · клиенток с бонусом: ${count}${active === false ? " · на паузе" : ""}`,
        };
      }
      const from = SOURCES.find((s) => s.value === source)?.title.toLowerCase() ?? source ?? "ссылка";
      return {
        title: `${name ?? "Без имени"}${hint ? ` · ${hint}` : ""}`,
        subtitle: `Друзей с бонусом: ${count} · ${from}${active === false ? " · на паузе" : ""}`,
      };
    },
  },
  orderings: [
    { title: "Больше всего бонусов", name: "rewardsDesc", by: [{ field: "rewardsCount", direction: "desc" }] },
    { title: "Сначала новые", name: "createdAtDesc", by: [{ field: "createdAt", direction: "desc" }] },
  ],
});
