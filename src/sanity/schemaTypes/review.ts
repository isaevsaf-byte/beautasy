import { defineField, defineType } from "sanity";
import { REVIEW_TOPICS, type ReviewTopic } from "@/lib/siteReviews";

/**
 * What a review is about, in the Studio's Russian. The site shows the English
 * labels from REVIEW_TOPICS; a Record keyed by topic makes a new topic without
 * a Russian title a type error rather than a blank line in the list.
 */
export const REVIEW_TOPIC_TITLES: Record<ReviewTopic, string> = {
  alterations: "Подгонка по фигуре",
  repairs: "Ремонт одежды",
  made: "Пошив по меркам",
  home: "Шторы и дом",
  shop: "Вещь из магазина",
  other: "Другое",
};

/**
 * A recommendation Kristina copied in from Nextdoor, rather than a review
 * written on the site. It has no stars, no piece and no order, so the form
 * hides those fields and asks for the neighbourhood and the date instead.
 */
export function fromNextdoor(document: unknown): boolean {
  return (document as { source?: unknown } | undefined)?.source === "nextdoor";
}

/**
 * A review copied in from another site — a Nextdoor recommendation, or a
 * review from Google or Etsy — rather than one written here. None has a piece
 * on this site, photos or an order, and its date is the day it was written
 * there. Google's and Etsy's keep their stars; a Nextdoor one has none.
 */
export function fromElsewhere(document: unknown): boolean {
  const source = (document as { source?: unknown } | undefined)?.source;
  return source === "nextdoor" || source === "google" || source === "etsy";
}

const sourceOf = (document: unknown) => (document as { source?: unknown } | undefined)?.source;

/**
 * Stars are required on a review written here and on one from Google, and a
 * Nextdoor recommendation has none. Sanity checks a field even while it hides
 * it, so the rule itself has to know which kind of review it is looking at.
 */
export function ratingProblem(value: unknown, document: unknown): true | string {
  if (fromNextdoor(document)) return true;
  return typeof value === "number" ? true : "Поставьте оценку: от 1 до 5 звёзд.";
}

const hiddenForNextdoor = ({ document }: { document?: unknown }) => fromNextdoor(document);
const hiddenForElsewhere = ({ document }: { document?: unknown }) => fromElsewhere(document);

export const review = defineType({
  name: "review",
  title: "Отзыв",
  type: "document",
  fields: [
    defineField({
      name: "source",
      title: "Откуда",
      type: "string",
      // Set once, by where the review was added: the site's form and the
      // emailed links write "site"; «Рекомендации Nextdoor», «Отзывы Google»
      // and «Отзывы Etsy» write their own
      readOnly: true,
      initialValue: "site",
      hidden: ({ value }) => !value,
      options: {
        list: [
          { title: "С сайта", value: "site" },
          { title: "Nextdoor", value: "nextdoor" },
          { title: "Google", value: "google" },
          { title: "Etsy", value: "etsy" },
        ],
      },
    }),
    defineField({
      name: "product",
      title: "Товар",
      type: "reference",
      to: [{ type: "product" }],
      description: "Заполнено, если отзыв о вещи из магазина, — тогда он показывается и на её странице.",
      hidden: hiddenForElsewhere,
    }),
    defineField({
      name: "about",
      title: "О чём отзыв",
      type: "string",
      description:
        "Что клиент выбрал в форме на сайте. Для рекомендации из Nextdoor выберите сами, о какой она работе. У отзывов покупателей по ссылке из письма пусто — там видно товар.",
      options: {
        list: REVIEW_TOPICS.map((topic) => ({ title: REVIEW_TOPIC_TITLES[topic.value], value: topic.value })),
      },
    }),
    defineField({
      name: "userId",
      title: "ID пользователя (Clerk)",
      type: "string",
      description:
        "Заполняется, если отзыв оставил клиент, вошедший в аккаунт; пусто — если отзыв оставлен по ссылке из письма с просьбой об отзыве.",
      readOnly: true,
      hidden: hiddenForElsewhere,
    }),
    defineField({
      name: "userName",
      title: "Имя автора",
      type: "string",
      description:
        "Так отзыв подписан на сайте. Для Nextdoor — имя и первая буква фамилии, как на странице Nextdoor: Sarah M. Для Google и Etsy — имя, как оно стоит над отзывом (у Etsy бывает «Etsy buyer»).",
      validation: (Rule) => Rule.required().max(60),
    }),
    defineField({
      name: "neighbourhood",
      title: "Район",
      type: "string",
      description:
        "Как район подписан у соседа на Nextdoor, по-английски: Shirley, Portswood, Bassett. На сайте стоит рядом с именем.",
      hidden: ({ document }) => !fromNextdoor(document),
      validation: (Rule) => Rule.max(40),
    }),
    defineField({
      name: "item",
      title: "Что купили на Etsy",
      type: "string",
      description:
        "Коротко и по-английски, как вещь называют люди, а не как заголовок на Etsy: Floral scrunchie, Girls' cotton briefs. Стоит под отзывом.",
      hidden: ({ document }) => sourceOf(document) !== "etsy",
      validation: (Rule) => Rule.max(60),
    }),
    defineField({
      name: "rating",
      title: "Оценка",
      type: "number",
      hidden: hiddenForNextdoor,
      validation: (Rule) =>
        Rule.min(1)
          .max(5)
          .integer()
          .custom((value, context) => ratingProblem(value, context.document)),
      options: {
        list: [
          { title: "1 звезда", value: 1 },
          { title: "2 звезды", value: 2 },
          { title: "3 звезды", value: 3 },
          { title: "4 звезды", value: 4 },
          { title: "5 звёзд", value: 5 },
        ],
      },
    }),
    defineField({
      name: "comment",
      title: "Текст отзыва",
      type: "text",
      description: "Для Nextdoor, Google и Etsy вставьте текст как есть, без правок.",
      // A neighbour's "Brilliant, thank you!" is a whole recommendation; the
      // form on the site asks for at least ten characters on its own
      validation: (Rule) => Rule.required().min(2).max(2000),
    }),
    defineField({
      name: "images",
      title: "Фото",
      type: "array",
      of: [{ type: "image" }],
      validation: (Rule) => Rule.max(4),
      description: "Фото, которые клиент приложил к отзыву (не больше 4).",
      hidden: hiddenForElsewhere,
    }),
    defineField({
      name: "orderId",
      title: "Заказ",
      type: "string",
      readOnly: true,
      description: "Заказ, из которого оставлен отзыв, — чтобы на одну вещь из заказа можно было оставить только один отзыв.",
      hidden: hiddenForElsewhere,
    }),
    defineField({
      name: "verifiedPurchase",
      title: "Подтверждённая покупка",
      type: "boolean",
      initialValue: false,
      readOnly: true,
      description: "Ставится автоматически, если отзыв пришёл по ссылке из письма с просьбой об отзыве.",
      hidden: hiddenForElsewhere,
    }),
    defineField({
      name: "approved",
      title: "Одобрен",
      type: "boolean",
      initialValue: false,
      description:
        "Отзыв не виден на сайте, пока здесь нет галочки, — так спам и оскорбления не попадут на сайт. У рекомендаций из Nextdoor и отзывов из Google и Etsy галочка стоит сразу: их вносите вы сами.",
    }),
    defineField({
      name: "createdAt",
      title: "Дата отзыва",
      type: "datetime",
      description:
        "Для Nextdoor, Google и Etsy поставьте день, когда отзыв написали там (у Google «3 недели назад» — примерно): по этой дате отзывы идут на сайте по порядку.",
      initialValue: () => new Date().toISOString(),
      readOnly: ({ document }) => !fromElsewhere(document),
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: "userName",
      rating: "rating",
      productName: "product.name",
      about: "about",
      approved: "approved",
      source: "source",
      neighbourhood: "neighbourhood",
      item: "item",
    },
    prepare({ title, rating, productName, about, approved, source, neighbourhood, item }) {
      const mark = approved ? "✅" : "⏳";
      const topic = REVIEW_TOPIC_TITLES[about as ReviewTopic] ?? about;
      if (source === "nextdoor") {
        return {
          title: `${mark} ${title} — Nextdoor`,
          subtitle: [neighbourhood, topic].filter(Boolean).join(" · "),
        };
      }
      if (source === "google") {
        return {
          title: `${mark} ${title} — Google ${"★".repeat(rating || 0)}`,
          subtitle: topic ?? "",
        };
      }
      if (source === "etsy") {
        return {
          title: `${mark} ${title} — Etsy ${"★".repeat(rating || 0)}`,
          subtitle: item ?? "",
        };
      }
      return {
        title: `${mark} ${title} — ${"★".repeat(rating || 0)}`,
        subtitle: productName ?? topic ?? "",
      };
    },
  },
});
