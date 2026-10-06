import { defineField, defineType } from "sanity";
import { isNextdoorUrl } from "@/lib/siteReviews";
import { collectionTerms, postcodeDistrict } from "@/lib/collection";
import { penceRules } from "./product";
import { portraitLocationRule } from "@/sanity/photoLocationRule";
import { MEET_KRISTINA_DEFAULT_TEXT, MEET_KRISTINA_MIN_SIDE, MEET_KRISTINA_TEXT_MAX, photoSizeProblem } from "@/lib/meetKristina";

/** Southampton clock hours, shown as 22:00 rather than 22. */
const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  title: `${String(hour).padStart(2, "0")}:00`,
  value: hour,
}));

/**
 * Said before Kristina uploads a photo of herself, not after: the file is
 * public the moment it lands, and a phone photo taken at home carries the
 * home's address. portraitLocationRule stops one that still does.
 */
const WITHOUT_LOCATION =
  "Сначала уберите из фото место съёмки, иначе по файлу найдут ваш дом: на iPhone «Поделиться» → «Параметры» вверху → выключите «Геопозиция», затем AirDrop на компьютер или «Сохранить в Файлы» и загружайте эту копию. Или отдайте фото Сафару. Фото с местом съёмки Studio не опубликует.";

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

    defineField({
      name: "nextdoorUrl",
      title: "Страница Beautasy на Nextdoor",
      type: "url",
      description:
        "Откройте страницу ателье на Nextdoor и скопируйте адрес из браузера. На странице отзывов появится кнопка «Recommend us on Nextdoor», а пометка «Recommended on Nextdoor» у рекомендаций будет вести сюда. Пусто — кнопки нет.",
      validation: (Rule) =>
        Rule.uri({ scheme: ["https"] }).custom((value) =>
          !value || isNextdoorUrl(value)
            ? true
            : "Это не адрес Nextdoor. Он начинается с https://nextdoor.co.uk/ — скопируйте его со своей страницы там."
        ),
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

    /* ── Collection & return ── */
    defineField({
      name: "collection",
      title: "Забор и доставка",
      type: "object",
      description:
        "Кристина забирает вещь у клиента и привозит обратно. В форме записи клиент выбирает «Collect & return», вводит индекс и сразу видит цену своей зоны, а время забора Кристина назначает кнопкой «🚗 Назначить забор» в заявке — из дневника или, если клиенту удобно только вне часов для примерок, в «Время вне часов дневника». Суммы в пенсах: 800 = £8.",
      fields: [
        defineField({
          name: "enabled",
          title: "Предлагать забор и доставку",
          type: "boolean",
          initialValue: true,
          description: "Выключите — и выбор «Collect & return» пропадёт из формы записи и со страниц сайта.",
        }),
        defineField({
          name: "zones",
          title: "Зоны",
          type: "array",
          description:
            "Зона — районы по почтовому индексу (первая половина: SO17) и своя цена. Если индекса клиента нет ни в одной зоне, сайт предложит ему прийти на примерку.",
          // A district in two zones would quietly take the first zone's price
          validation: (Rule) =>
            Rule.custom((zones) => {
              const seen = new Set<string>();
              const twice = new Set<string>();
              for (const zone of (zones as { districts?: unknown[] }[] | undefined) ?? []) {
                for (const district of new Set((zone.districts ?? []).map((d) => String(d).trim().toUpperCase()))) {
                  if (seen.has(district)) twice.add(district);
                  seen.add(district);
                }
              }
              return twice.size === 0
                ? true
                : `Район указан в двух зонах: ${[...twice].join(", ")}. Оставьте его в одной — иначе сайт возьмёт цену первой зоны.`;
            }),
          of: [
            {
              type: "object",
              name: "collectionZone",
              title: "Зона",
              fields: [
                defineField({
                  name: "name",
                  title: "Название для клиента",
                  type: "string",
                  description: "По-английски, его увидит клиент: например, «Southampton».",
                  validation: (Rule) => Rule.required().max(60),
                }),
                defineField({
                  name: "districts",
                  title: "Районы (первая половина индекса)",
                  type: "array",
                  of: [{ type: "string" }],
                  options: { layout: "tags" },
                  description: "Например: SO14, SO15, SO16, SO17, SO18, SO19.",
                  validation: (Rule) =>
                    Rule.required()
                      .min(1)
                      .custom((list) => {
                        const bad = ((list as string[] | undefined) ?? []).filter(
                          (d) => postcodeDistrict(d) !== String(d).trim().toUpperCase()
                        );
                        return bad.length === 0
                          ? true
                          : `Это не район по индексу: ${bad.join(", ")}. Нужна первая половина индекса, например SO17.`;
                      }),
                }),
                defineField({
                  name: "fee",
                  title: "Цена забора и доставки (в пенсах)",
                  type: "number",
                  description: "За оба конца. 800 = £8. 0 — всегда бесплатно.",
                  // "8" for £8 would show customers £0.08
                  validation: (Rule) => [Rule.required().min(0), ...penceRules(Rule)],
                }),
                defineField({
                  name: "freeFrom",
                  title: "Бесплатно при заказе от (в пенсах)",
                  type: "number",
                  initialValue: 0,
                  description: "4000 = бесплатно при заказе от £40. 0 — бесплатного порога нет, всегда по цене выше.",
                  validation: (Rule) => [Rule.min(0), ...penceRules(Rule)],
                }),
              ],
              preview: {
                select: { title: "name", districts: "districts", fee: "fee", freeFrom: "freeFrom" },
                prepare({ title, districts, fee, freeFrom }) {
                  const list = ((districts as string[] | undefined) ?? []).join(", ");
                  const terms =
                    typeof fee === "number" ? collectionTerms({ fee, freeFrom: typeof freeFrom === "number" ? freeFrom : 0 }) : "цена не указана";
                  return { title: title ?? "Без названия", subtitle: [list, terms].filter(Boolean).join(" · ") };
                },
              },
            },
          ],
        }),
        // Not read since 3 October 2026: Kristina drives and gives each
        // collection its time from the diary. Kept, hidden, so the windows
        // still saved here don't show up as an unknown field.
        defineField({
          name: "windows",
          title: "Окна забора (больше не используются)",
          type: "array",
          of: [{ type: "string" }],
          hidden: true,
        }),
        defineField({
          name: "note",
          title: "Для каких работ",
          type: "text",
          rows: 2,
          description: "По-английски, одна-две строки под выбором в форме записи.",
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

    /* ── Meet Kristina ── */
    defineField({
      name: "meetKristina",
      title: "Знакомьтесь, Кристина",
      type: "object",
      description:
        "Блок «Meet Kristina» с вашим фото и парой слов — на главной, на странице ателье, на /alterations и на каждой странице услуги, прямо перед формой записи. Пока нет главного фото, блока на сайте нет совсем. Под текстом две кнопки: «Choose a time» и «Send a photo on WhatsApp».",
      fields: [
        defineField({
          name: "photo",
          title: "Главное фото: портрет",
          type: "image",
          options: { hotspot: true },
          description: `Портрет при дневном свете: у окна, без вспышки, лицом к камере, можно с улыбкой. Не меньше ${MEET_KRISTINA_MIN_SIDE} пикселей по короткой стороне — скриншот и фото из WhatsApp для этого слишком маленькие. ${WITHOUT_LOCATION} На сайте фото вертикальное: после загрузки нажмите на значок обрезки (подсказка «Обрезать изображение») и перетащите кружок на лицо — тогда лицо не обрежется ни на телефоне, ни на компьютере.`,
          fields: [
            defineField({
              name: "alt",
              title: "Что на фото — по-английски",
              type: "string",
              description:
                "Одна фраза для незрячих посетителей и для Google. Например: Kristina in her Southampton workroom, smiling.",
              validation: (Rule) => Rule.required().max(160),
            }),
          ],
          // Located: stopped, the home address must never be published. Small:
          // only questioned, a slightly soft portrait is still better than none
          validation: (Rule) => [Rule.custom(portraitLocationRule), Rule.custom(photoSizeProblem).warning()],
        }),
        defineField({
          name: "atWork",
          title: "Второе фото: за работой (по желанию)",
          type: "image",
          options: { hotspot: true },
          description: `Вы за швейной машинкой или с булавками на манекене — руки и ткань крупно, без клиентов в кадре. Тоже не меньше ${MEET_KRISTINA_MIN_SIDE} пикселей по короткой стороне. ${WITHOUT_LOCATION} Встаёт рядом с портретом; без портрета не показывается.`,
          fields: [
            defineField({
              name: "alt",
              title: "Что на фото — по-английски",
              type: "string",
              description: "Например: Kristina pinning a hem at her sewing machine.",
              validation: (Rule) => Rule.required().max(160),
            }),
          ],
          // Located: stopped, the home address must never be published. Small:
          // only questioned, a slightly soft portrait is still better than none
          validation: (Rule) => [Rule.custom(portraitLocationRule), Rule.custom(photoSizeProblem).warning()],
        }),
        defineField({
          name: "text",
          title: "Пара слов о себе — по-английски (по желанию)",
          type: "text",
          rows: 4,
          description: `До ${MEET_KRISTINA_TEXT_MAX} знаков, от первого лица. Пустая строка начинает новый абзац. Оставьте пустым — на сайте будет: «${MEET_KRISTINA_DEFAULT_TEXT}»`,
          validation: (Rule) => Rule.max(MEET_KRISTINA_TEXT_MAX),
        }),
      ],
    }),

    /* ── Our Work page ── */
    defineField({
      name: "workPage",
      title: "Страница «Наши работы»",
      type: "object",
      description:
        "Короткий ролик в самом верху страницы /work. Его нарезает из видео в разделе «Сайт и настройки» → «Наши работы» скрипт scripts/gallery-import.mjs; если здесь пусто, вместо ролика показываются фото.",
      fields: [
        defineField({
          name: "showreel",
          title: "Шоурил",
          type: "file",
          options: { accept: "video/mp4" },
          readOnly: true,
          description: "Нарезается при импорте из видео в разделе «Сайт и настройки» → «Наши работы»: вертикальный, секунд десять, без звука, крутится по кругу.",
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
