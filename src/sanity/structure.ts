import type { StructureResolver } from "sanity/structure";
import { SITE_SETTINGS_ID } from "@/lib/siteSettingsDocument";
import { ManualBookingPane } from "./ManualBookingPane";
import { LedgerPane } from "./LedgerPane";
import { PartnersPane } from "./PartnersPane";
import { FacebookGroupsPane } from "./FacebookGroupsPane";
import {
  ETSY_REVIEWS_FILTER,
  ETSY_TEMPLATE_ID,
  GOOGLE_REVIEWS_FILTER,
  GOOGLE_TEMPLATE_ID,
  NEXTDOOR_REVIEWS_FILTER,
  NEXTDOOR_TEMPLATE_ID,
  SITE_REVIEWS_FILTER,
} from "./reviewLists";

/**
 * The Studio sidebar.
 *
 * The default list is every document type in alphabetical order, which buries
 * the two things Kristina opens daily. This puts the shop first, gives the
 * content queue its own section split by what needs doing, and pushes the
 * records she only reads (orders, subscribers) to the bottom.
 */
export const structure: StructureResolver = (S) =>
  S.list()
    .title("Beautasy")
    .items([
      S.listItem()
        .title("Посты на одобрение")
        .child(
          S.documentList()
            .title("Ждут вашего решения")
            .filter('_type == "socialPost" && status in ["draft", "failed"]')
            .defaultOrdering([{ field: "createdAt", direction: "desc" }])
        ),
      S.listItem()
        .title("Посты в очереди")
        .child(
          S.documentList()
            .title("Одобренные")
            // "publishing" belongs here too. The site sets it for the few
            // seconds a post is on its way to Instagram, so that two runs can
            // never send the same picture — but if something stops halfway the
            // post keeps that status, and this is the list where it has to be
            // visible rather than quietly belonging to no list at all.
            .filter('_type == "socialPost" && status in ["approved", "publishing"]')
            .defaultOrdering([{ field: "scheduledFor", direction: "asc" }])
        ),
      S.listItem()
        .title("Reels")
        .child(
          S.documentList()
            .title("Видеопосты")
            // Reels are their own job: a video has to be rendered and uploaded
            // before it can be approved, so they collect here rather than
            // sitting among photos that are ready to go in one click.
            .filter('_type == "socialPost" && format == "reel"')
            .defaultOrdering([{ field: 'createdAt', direction: 'desc' }])
        ),
      S.listItem()
        .title("Уже опубликованы")
        .child(
          S.documentList()
            .title("Опубликованные")
            .filter('_type == "socialPost" && status == "published"')
            .defaultOrdering([{ field: "publishedAt", direction: "desc" }])
        ),
      // Facebook lets no site post to a group, so the Studio writes each
      // group's post and Kristina publishes it herself — see FacebookGroupsPane
      S.listItem()
        .id("group-posts")
        .title("Посты в группы")
        .child(S.component(FacebookGroupsPane).id("group-posts-pane").title("Посты в группы")),
      S.documentTypeListItem("facebookGroup").title("Группы Facebook"),

      S.divider(),

      S.documentTypeListItem("product").title("Товары"),
      S.documentTypeListItem("collection").title("Коллекции"),
      S.documentTypeListItem("giftBox").title("Подарочные боксы"),
      S.documentTypeListItem("giftCard").title("Подарочные карты"),
      S.documentTypeListItem("sizeGuide").title("Таблицы размеров"),

      S.divider(),

      S.documentTypeListItem("atelierBooking").title("Записи в ателье"),
      // For someone who got in touch on WhatsApp, by phone or on Nextdoor: the
      // time goes into the same diary the site books from, so it closes online
      S.listItem()
        .id("book-by-hand")
        .title("Записать вручную")
        .child(S.component(ManualBookingPane).id("book-by-hand-pane").title("Запись клиента вручную")),
      S.listItem()
        .title("Часы для примерок")
        .child(S.document().schemaType("atelierSchedule").documentId("atelierSchedule")),
      // What came in and what went out. Entries are sealed (the dataset is
      // public), so this is a pane that asks the server, not a document list
      S.listItem().id("kassa").title("Касса").child(S.component(LedgerPane).id("kassa-pane").title("Касса")),
      // Salons and shops that send their clients, each with a link, a card and
      // a month's statement. Contacts and payments are sealed, so it is a pane
      // that asks the server — see PartnersPane
      S.listItem()
        .id("partners")
        .title("Партнёры")
        .child(S.component(PartnersPane).id("partners-pane").title("Партнёры")),
      S.documentTypeListItem("order").title("Заказы"),
      // Reviews written on the site wait here for approval; recommendations
      // from Nextdoor and reviews from Google and Etsy are copied in by hand
      // beside them. See reviewLists.ts.
      S.listItem()
        .id("review")
        .title("Отзывы")
        .schemaType("review")
        .child(
          S.documentList()
            .title("Отзывы с сайта")
            .schemaType("review")
            .apiVersion("2024-01-29")
            .filter(SITE_REVIEWS_FILTER)
            .initialValueTemplates([S.initialValueTemplateItem("review")])
            .defaultOrdering([{ field: "createdAt", direction: "desc" }])
        ),
      S.listItem()
        .id("nextdoor")
        .title("Рекомендации Nextdoor")
        .schemaType("review")
        .child(
          S.documentList()
            .title("Рекомендации Nextdoor")
            .schemaType("review")
            .apiVersion("2024-01-29")
            .filter(NEXTDOOR_REVIEWS_FILTER)
            .initialValueTemplates([S.initialValueTemplateItem(NEXTDOOR_TEMPLATE_ID)])
            .defaultOrdering([{ field: "createdAt", direction: "desc" }])
        ),
      S.listItem()
        .id("google-reviews")
        .title("Отзывы Google")
        .schemaType("review")
        .child(
          S.documentList()
            .title("Отзывы Google")
            .schemaType("review")
            .apiVersion("2024-01-29")
            .filter(GOOGLE_REVIEWS_FILTER)
            .initialValueTemplates([S.initialValueTemplateItem(GOOGLE_TEMPLATE_ID)])
            .defaultOrdering([{ field: "createdAt", direction: "desc" }])
        ),
      S.listItem()
        .id("etsy-reviews")
        .title("Отзывы Etsy")
        .schemaType("review")
        .child(
          S.documentList()
            .title("Отзывы Etsy")
            .schemaType("review")
            .apiVersion("2024-01-29")
            .filter(ETSY_REVIEWS_FILTER)
            .initialValueTemplates([S.initialValueTemplateItem(ETSY_TEMPLATE_ID)])
            .defaultOrdering([{ field: "createdAt", direction: "desc" }])
        ),
      // The pictures of finished jobs on /work: the atelier's shop window
      S.documentTypeListItem("workPiece").title("Наши работы"),

      S.divider(),

      // "Give £5, get £5": who has a link, and every friend who came through one.
      // A partner's link is a referrer too, and lives in «Партнёры» instead
      S.listItem()
        .id("referrer")
        .title("Ссылки для друзей")
        .schemaType("referrer")
        .child(
          S.documentList()
            .title("Ссылки для друзей")
            .schemaType("referrer")
            .apiVersion("2024-01-29")
            .filter('_type == "referrer" && !defined(partner)')
            .defaultOrdering([{ field: "createdAt", direction: "desc" }])
        ),
      S.documentTypeListItem("referral").title("Бонусы за друзей"),

      S.divider(),

      S.documentTypeListItem("subscriber").title("Подписчики"),
      S.documentTypeListItem("stockAlert").title("Ждут поступления"),
      S.documentTypeListItem("abandonedCart").title("Брошенные корзины"),

      S.divider(),

      S.documentTypeListItem("legalPage").title("Инфо-страницы"),
      S.listItem()
        .title("Настройки сайта")
        .child(S.document().schemaType("siteSettings").documentId(SITE_SETTINGS_ID)),
    ]);
