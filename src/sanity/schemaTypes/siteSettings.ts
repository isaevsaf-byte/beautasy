import { defineField, defineType } from "sanity";

/** Southampton clock hours, shown as 22:00 rather than 22. */
const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  title: `${String(hour).padStart(2, "0")}:00`,
  value: hour,
}));

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Настройки сайта",
  type: "document",
  // Singleton — only one document of this type should exist (enforced via Studio structure)
  fields: [
    /* ── Announcement Bar ── */
    defineField({
      name: "announcementBar",
      title: "Полоса объявления",
      type: "object",
      description: "Узкая полоса с объявлением на самом верху каждой страницы. Оставьте «Текст» пустым, чтобы её скрыть.",
      fields: [
        defineField({
          name: "enabled",
          title: "Показывать полосу",
          type: "boolean",
          initialValue: false,
        }),
        defineField({
          name: "text",
          title: "Текст",
          type: "string",
          description: "По-английски — его видит каждый посетитель.",
          placeholder: "Например: Free UK shipping on orders over £50 🎁",
        }),
        defineField({
          name: "link",
          title: "Ссылка (по желанию)",
          type: "url",
          description: "Сделает полосу кликабельной (например, /gift-boxes)",
        }),
        defineField({
          name: "bgColor",
          title: "Фон",
          type: "string",
          options: {
            list: [
              { title: "Лавандовый (по умолчанию)", value: "lavender" },
              { title: "Графитовый", value: "charcoal" },
              { title: "Кремовый", value: "cream" },
            ],
            layout: "radio",
          },
          initialValue: "lavender",
        }),
      ],
    }),

    /* ── Shipping ── */
    defineField({
      name: "shipping",
      title: "Стоимость доставки",
      type: "object",
      description: "Эти суммы берутся при оформлении заказа и показываются в корзине.",
      fields: [
        defineField({
          name: "ukRate",
          title: "Доставка по Великобритании (в пенсах)",
          type: "number",
          description: "например, 300 = £3.00",
          initialValue: 300,
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "internationalRate",
          title: "Международная доставка (в пенсах)",
          type: "number",
          description: "например, 1200 = £12.00",
          initialValue: 1200,
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "freeShippingThreshold",
          title: "Бесплатная доставка по Великобритании от (в пенсах)",
          type: "number",
          description: "например, 5000 = бесплатная доставка, если в корзине от £50. Поставьте 0, чтобы отключить.",
          initialValue: 5000,
          validation: (Rule) => Rule.required().min(0),
        }),
      ],
    }),

    /* ── Gift Card ── */
    defineField({
      name: "giftCardPlaceholder",
      title: "Подсказка в поле послания к подарочной карте",
      type: "string",
      description: "Серый текст-подсказка внутри поля для послания к подарочной карте на странице товара.",
      initialValue: "Write a short note to include with the gift card…",
      placeholder: "По умолчанию: Write a short note to include with the gift card…",
    }),

    defineField({
      name: "googleReviewUrl",
      title: "Ссылка на отзыв в Google",
      type: "url",
      description:
        "Ссылка «написать отзыв», которую получает каждый клиент, чья примерка отмечена как «Выполнена». Оставьте пустым — возьмётся собственная ссылка профиля Beautasy Atelier в Google, она на сайте уже есть. Вставляйте другую, только если профиль сменится: в Google Business Profile → Read reviews → Get more reviews → copy link.",
      validation: (Rule) =>
        Rule.uri({ scheme: ["http", "https"] }).custom((value) => {
          if (!value) return true;
          const url = String(value);
          // A profile link shows the reviews; only the write link opens the box
          // with the stars already in it, and the difference is most of the
          // reviews you get.
          const writesAReview =
            url.includes("writereview") || /\/review\b/.test(url) || url.includes("g.page/r/");
          return writesAReview
            ? true
            : "Похоже, это ссылка на ваш профиль, а не на окно отзыва. Возьмите ссылку через Get more reviews → copy link.";
        }),
    }),

    /* ── Instagram posting ── */
    defineField({
      name: "socialPosting",
      title: "Публикация в Instagram",
      type: "object",
      description:
        "Как сайт сам отправляет одобренные посты. Кнопка «Выложить в Instagram» на посте отправляет его сразу, что бы здесь ни было указано, — и он всё равно засчитывается в посты этого дня.",
      fields: [
        defineField({
          name: "postsPerDay",
          title: "Постов в день",
          type: "number",
          initialValue: 1,
          description:
            "Сколько постов самое большее выходит за один день. Остальные ждут следующего дня. Между двумя постами всегда не меньше 3 часов.",
          validation: (Rule) => Rule.required().integer().min(1).max(5),
        }),
        defineField({
          name: "quietHoursEnabled",
          title: "Тихие часы",
          type: "boolean",
          initialValue: true,
          description: "В эти часы ничего не публикуется. Пост, назначенный на это время, ждёт, пока они закончатся.",
        }),
        defineField({
          name: "quietFrom",
          title: "Тихие часы с",
          type: "number",
          initialValue: 22,
          options: { list: HOURS },
          hidden: ({ parent }) => parent?.quietHoursEnabled === false,
        }),
        defineField({
          name: "quietUntil",
          title: "Тихие часы до",
          type: "number",
          initialValue: 8,
          options: { list: HOURS },
          hidden: ({ parent }) => parent?.quietHoursEnabled === false,
        }),
      ],
    }),

    /* ── Beautasy Friends ── */
    defineField({
      name: "referral",
      title: "Программа Beautasy Friends («Give £5, get £5»)",
      type: "object",
      description:
        "Программа «приведи друга». Друзья получают скидку на первый заказ или первую подгонку, а тот, кто их пригласил, — бонусы, которые можно потратить в магазине или в ателье. Суммы в пенсах: 500 = £5.",
      fields: [
        defineField({
          name: "enabled",
          title: "Программа включена",
          type: "boolean",
          initialValue: true,
          description: "Если выключить, ссылки по-прежнему открываются, но скидок нет и бонусы не начисляются.",
        }),
        defineField({
          name: "friendShopDiscount",
          title: "Скидка другу в магазине (в пенсах)",
          type: "number",
          initialValue: 500,
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "friendMinBasket",
          title: "Минимальная корзина для этой скидки (в пенсах)",
          type: "number",
          initialValue: 1500,
          description: "например, 1500 = скидка другу действует при корзине от £15. 0 = без минимума.",
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "friendAtelierDiscount",
          title: "Скидка другу в ателье (в пенсах)",
          type: "number",
          initialValue: 500,
          description: "Вычитается вручную при оплате — в записи об этом сказано.",
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "referrerReward",
          title: "Бонус за каждого друга (в пенсах)",
          type: "number",
          initialValue: 500,
          validation: (Rule) => Rule.required().min(0),
        }),
        defineField({
          name: "creditValidityMonths",
          title: "Срок действия бонусов (в месяцах)",
          type: "number",
          initialValue: 12,
          description: "Отсчитывается от последнего начисления.",
          validation: (Rule) => Rule.required().min(1).max(60),
        }),
        defineField({
          name: "maxRewardsPerYear",
          title: "Сколько друзей в год засчитывается одному человеку",
          type: "number",
          initialValue: 20,
          description: "Чтобы код, выложенный на сайте с купонами, не приносил бонусы бесконечно.",
          validation: (Rule) => Rule.required().min(1),
        }),
      ],
    }),

    /* ── Social Links ── */
    defineField({
      name: "socialLinks",
      title: "Ссылки на соцсети",
      type: "object",
      fields: [
        defineField({
          name: "instagram",
          title: "Ссылка на Instagram",
          type: "url",
          placeholder: "https://instagram.com/beautasy",
        }),
        defineField({
          name: "tiktok",
          title: "Ссылка на TikTok",
          type: "url",
          placeholder: "https://tiktok.com/@beautasy",
        }),
        defineField({
          name: "pinterest",
          title: "Ссылка на Pinterest",
          type: "url",
          placeholder: "https://pinterest.com/beautasy",
        }),
      ],
    }),

    /* ── Payment Icons ── */
    defineField({
      name: "paymentIcons",
      title: "Значки оплаты внизу сайта",
      type: "object",
      description: "Выберите, какие значки способов оплаты показывать внизу сайта.",
      fields: [
        defineField({ name: "showVisa", title: "Visa", type: "boolean", initialValue: true }),
        defineField({ name: "showMastercard", title: "Mastercard", type: "boolean", initialValue: true }),
        defineField({ name: "showPaypal", title: "PayPal", type: "boolean", initialValue: true }),
        defineField({ name: "showApplePay", title: "Apple Pay", type: "boolean", initialValue: true }),
        defineField({ name: "showGooglePay", title: "Google Pay", type: "boolean", initialValue: false }),
        defineField({ name: "showAmex", title: "Amex", type: "boolean", initialValue: false }),
      ],
    }),

    /* ── Our Work page ── */
    defineField({
      name: "workPage",
      title: "Страница «Наши работы»",
      type: "object",
      description:
        "Короткий ролик в самом верху страницы /work. Его нарезает из видео в разделе «Наши работы» скрипт scripts/gallery-import.mjs; если здесь пусто, вместо ролика показываются фото.",
      fields: [
        defineField({
          name: "showreel",
          title: "Шоурил",
          type: "file",
          options: { accept: "video/mp4" },
          readOnly: true,
          description: "Нарезается при импорте из видео в разделе «Наши работы»: вертикальный, секунд десять, без звука, крутится по кругу.",
        }),
        defineField({
          name: "showreelPoster",
          title: "Обложка шоурила",
          type: "image",
          readOnly: true,
          description: "Видна, пока ролик не запустился, и показывается вместо него тем, у кого в телефоне включено «Уменьшение движения».",
        }),
      ],
    }),
  ],
  preview: {
    prepare() {
      return { title: "Настройки сайта" };
    },
  },
});
