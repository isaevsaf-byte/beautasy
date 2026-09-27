import { defineField, defineType } from "sanity";

// The Studio's words for each status. The values are what is stored, and what
// the emails and the customer's own order page read, so only the titles are
// ever translated.
const STATUS_OPTIONS = [
  { title: "Оплачен", value: "paid" },
  { title: "В работе", value: "in-production" },
  { title: "Отправлен", value: "shipped" },
  { title: "Доставлен", value: "delivered" },
];

export const order = defineType({
  name: "order",
  title: "Заказ",
  type: "document",
  fields: [
    defineField({
      name: "stripeSessionId",
      title: "ID сессии оплаты Stripe",
      type: "string",
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "userId",
      title: "ID пользователя (Clerk)",
      type: "string",
      readOnly: true,
      description: "Пусто, если заказ оформлен без входа в аккаунт, — тогда он не появится ни в чьей истории заказов.",
    }),
    defineField({
      name: "displayName",
      title: "Имя",
      type: "string",
      readOnly: true,
      description: "Остальное зашифровано — эту базу может прочитать кто угодно. Нажмите «Показать контакты».",
    }),
    defineField({
      name: "emailHint",
      title: "Эл. почта",
      type: "string",
      readOnly: true,
      description: "Адрес показан не полностью. Целиком — по кнопке «Показать контакты».",
    }),
    defineField({ name: "customerEmailSealed", title: "Эл. почта (зашифрована)", type: "string", readOnly: true, hidden: true }),
    defineField({ name: "customerNameSealed", title: "Имя (зашифровано)", type: "string", readOnly: true, hidden: true }),
    defineField({
      name: "emailFingerprint",
      title: "Отпечаток эл. почты",
      type: "string",
      readOnly: true,
      hidden: true,
      description:
        "Необратимый и с секретным ключом — по нему магазин может проверить «заказывали ли уже с этого адреса?» для скидки за друга.",
    }),
    defineField({
      name: "referrer",
      title: "Пришли по ссылке друга",
      type: "reference",
      to: [{ type: "referrer" }],
      weak: true,
      readOnly: true,
      description:
        "Заполняется, если на этот заказ пришли по ссылке друга и часть суммы покрыла скидка. Сам бонус другу — в разделе «Бонусы за друзей».",
    }),
    defineField({ name: "referredBy", title: "Кто порекомендовал", type: "string", readOnly: true }),
    defineField({ name: "referralDiscount", title: "Применённая скидка за друга (в пенсах)", type: "number", readOnly: true }),
    defineField({
      name: "items",
      title: "Товары",
      type: "array",
      readOnly: true,
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "productId", title: "ID товара", type: "string" }),
            defineField({ name: "name", title: "Название", type: "string" }),
            defineField({ name: "quantity", title: "Количество", type: "number" }),
            defineField({ name: "amountTotal", title: "Сумма (в пенсах)", type: "number" }),
            defineField({ name: "image", title: "Ссылка на фото", type: "string" }),
          ],
          preview: {
            select: { title: "name", subtitle: "quantity" },
            prepare({ title, subtitle }: { title?: string; subtitle?: number }) {
              return { title, subtitle: subtitle ? `× ${subtitle}` : undefined };
            },
          },
        },
      ],
    }),
    defineField({
      name: "total",
      title: "Итого (в пенсах)",
      type: "number",
      readOnly: true,
    }),
    defineField({
      name: "shippingAddressSealed",
      title: "Адрес доставки (зашифрован)",
      type: "text",
      readOnly: true,
      hidden: true,
      description: "Прочитать его можно кнопкой «Показать контакты»; он также есть в письме о заказе.",
    }),
    defineField({
      name: "status",
      title: "Статус",
      type: "string",
      options: {
        list: STATUS_OPTIONS,
        layout: "radio",
      },
      initialValue: "paid",
      description: "Меняйте статус по мере изготовления и доставки заказа.",
    }),
    defineField({
      name: "trackingUrl",
      title: "Ссылка для отслеживания",
      type: "url",
      description: "Ссылка для отслеживания посылки Royal Mail или курьера. Если она заполнена, то попадёт в письмо об отправке.",
    }),
    defineField({
      name: "notifiedStatus",
      title: "О каком статусе клиенту сообщили",
      type: "string",
      readOnly: true,
      description: "Последний статус, о котором клиенту ушло письмо. Заполняется автоматически.",
    }),
    defineField({
      name: "reviewTokenFingerprint",
      title: "Отпечаток ссылки для отзыва",
      type: "string",
      readOnly: true,
      hidden: true,
      description:
        "Узнаёт ссылку для отзыва, отправленную в письме. Сам секрет ссылки не хранится: эту базу может прочитать кто угодно, а прочитанный секрет — это значок «Verified purchase», который мог бы поставить себе любой.",
    }),
    defineField({
      name: "reviewRequestSentAt",
      title: "Просьба об отзыве отправлена",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "createdAt",
      title: "Дата создания",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: { customerName: "displayName", email: "emailHint", total: "total", status: "status" },
    prepare({ customerName, email, total, status }) {
      return {
        title: `${customerName || email || "Гость"} — £${((total || 0) / 100).toFixed(2)}`,
        // A status with no title shows as itself, never blank
        subtitle: STATUS_OPTIONS.find((option) => option.value === status)?.title ?? status,
      };
    },
  },
});
