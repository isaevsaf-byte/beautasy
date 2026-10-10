import { defaultIntentChecker, type StructureBuilder, type StructureResolver } from "sanity/structure";
import { SITE_SETTINGS_ID } from "@/lib/siteSettingsDocument";
import { UPCOMING_FITTINGS_FILTER, upcomingFittingsParams } from "./upcomingFittings";
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
 * It had grown to 33 rows. Now the five things Kristina opens most days sit
 * at the top — bookings, booking by hand, posts to approve, group posts, the
 * till — and everything else is in five folders: reviews, social media, the
 * shop, friends & partners, the site and its settings. Nothing is more than
 * two clicks away.
 *
 * Moving a list into a folder changes its address in the Studio
 * (/studio/structure/shop;product;…), so three things keep old links working:
 *
 *  - Every list has a fixed .id(). Without one Sanity makes it from the
 *    title, and renaming a list would move its address too. Four are pinned
 *    to exactly the ids Sanity derived before (postyNaOdobrenie…); the two
 *    settings documents take their own ids (atelierSchedule, siteSettings),
 *    which is what lets search open them.
 *  - A bookmark or a copied address to a list that moved is sent on to its
 *    new place by the middleware — see @/lib/studioMoves, which also lists
 *    which folder each moved list is in, and the two settings' old ids.
 *  - A list with its own filter only answers "open this document" one level
 *    down unless told otherwise. The lists inside folders say
 *    .canHandleIntent(defaultIntentChecker), so the link in the new-review
 *    email, «+ Создать» and search still open beside the right list.
 *
 * Emails, the Dashboard and hints in the Studio name lists in words; when a
 * list moves, they say «Folder» → «List» (STUDIO_LISTS in @/lib/studioStats).
 */
/**
 * «Ближайшие примерки»: confirmed visits still ahead, soonest first. A child
 * resolver rather than a list, so "now" is read each time the list is opened —
 * see @/sanity/upcomingFittings.
 *
 * No «+ Создать» here: a booking is made with «Записать вручную», and one
 * created blank in this list would not even appear in it. It does not take
 * over «open this document» either (no canHandleIntent) — a booking opened
 * from search or an email still opens beside «Записи в ателье».
 */
function upcomingFittings(S: StructureBuilder) {
  return () =>
    S.documentList()
      .id("upcoming-fittings-list")
      .title("Ближайшие примерки")
      .schemaType("atelierBooking")
      .apiVersion("2024-01-29")
      .filter(UPCOMING_FITTINGS_FILTER)
      .params(upcomingFittingsParams())
      .defaultOrdering([{ field: "slotStart", direction: "asc" }])
      // Last, as in the review lists: a call after it would bring the templates back
      .initialValueTemplates([]);
}

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Beautasy")
    .items([
      // ─── Every day ───
      S.documentTypeListItem("atelierBooking").title("Записи в ателье"),
      // The diary from now on, soonest first: "Записи в ателье" is every
      // request ever made, newest first, and the next visitor is somewhere in it
      S.listItem()
        .id("upcoming-fittings")
        .title("Ближайшие примерки")
        .schemaType("atelierBooking")
        .child(upcomingFittings(S)),
      // For someone who got in touch on WhatsApp, by phone or on Nextdoor: the
      // time goes into the same diary the site books from, so it closes online
      S.listItem()
        .id("book-by-hand")
        .title("Записать вручную")
        .child(S.component(ManualBookingPane).id("book-by-hand-pane").title("Запись клиента вручную")),
      S.listItem()
        .id("postyNaOdobrenie")
        .title("Посты на одобрение")
        .child(
          S.documentList()
            .title("Ждут вашего решения")
            .apiVersion("2024-01-29")
            .filter('_type == "socialPost" && status in ["draft", "failed"]')
            .defaultOrdering([{ field: "createdAt", direction: "desc" }])
        ),
      // Facebook lets no site post to a group, so the Studio writes each
      // group's post and Kristina publishes it herself — see FacebookGroupsPane
      S.listItem()
        .id("group-posts")
        .title("Посты в группы")
        .child(S.component(FacebookGroupsPane).id("group-posts-pane").title("Посты в группы")),
      // What came in and what went out. Entries are sealed (the dataset is
      // public), so this is a pane that asks the server, not a document list
      S.listItem().id("kassa").title("Касса").child(S.component(LedgerPane).id("kassa-pane").title("Касса")),

      S.divider(),

      // ─── Reviews: written on the site and waiting for approval, and those
      // copied in by hand from Nextdoor, Google and Etsy. See reviewLists.ts.
      S.listItem()
        .id("reviews")
        .title("Отзывы")
        .child(
          S.list()
            .id("reviews")
            .title("Отзывы")
            .items([
              // .initialValueTemplates() comes last on purpose: every later call
              // copies the list and Sanity guesses the templates again — all four
              // review kinds — so «+ Создать» offered every kind in every list
              S.listItem()
                .id("review")
                .title("Отзывы с сайта")
                .schemaType("review")
                .child(
                  S.documentList()
                    .title("Отзывы с сайта")
                    .schemaType("review")
                    .apiVersion("2024-01-29")
                    .filter(SITE_REVIEWS_FILTER)
                    .defaultOrdering([{ field: "createdAt", direction: "desc" }])
                    .canHandleIntent(defaultIntentChecker)
                    .initialValueTemplates([S.initialValueTemplateItem("review")])
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
                    .defaultOrdering([{ field: "createdAt", direction: "desc" }])
                    .canHandleIntent(defaultIntentChecker)
                    .initialValueTemplates([S.initialValueTemplateItem(NEXTDOOR_TEMPLATE_ID)])
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
                    .defaultOrdering([{ field: "createdAt", direction: "desc" }])
                    .canHandleIntent(defaultIntentChecker)
                    .initialValueTemplates([S.initialValueTemplateItem(GOOGLE_TEMPLATE_ID)])
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
                    .defaultOrdering([{ field: "createdAt", direction: "desc" }])
                    .canHandleIntent(defaultIntentChecker)
                    .initialValueTemplates([S.initialValueTemplateItem(ETSY_TEMPLATE_ID)])
                ),
            ])
        ),

      // ─── Social media: Instagram's queue, and the Facebook groups
      S.listItem()
        .id("social")
        .title("Соцсети")
        .child(
          S.list()
            .id("social")
            .title("Соцсети")
            .items([
              S.divider().title("Instagram"),
              S.listItem()
                .id("postyVOcheredi")
                .title("Посты в очереди")
                .child(
                  S.documentList()
                    .title("Одобренные")
                    .apiVersion("2024-01-29")
                    // "publishing" belongs here too. The site sets it for the few
                    // seconds a post is on its way to Instagram, so that two runs can
                    // never send the same picture — but if something stops halfway the
                    // post keeps that status, and this is the list where it has to be
                    // visible rather than quietly belonging to no list at all.
                    .filter('_type == "socialPost" && status in ["approved", "publishing"]')
                    .defaultOrdering([{ field: "scheduledFor", direction: "asc" }])
                    .canHandleIntent(defaultIntentChecker)
                ),
              S.listItem()
                .id("reels")
                .title("Reels")
                .child(
                  S.documentList()
                    .title("Видеопосты")
                    .apiVersion("2024-01-29")
                    // Reels are their own job: a video has to be rendered and uploaded
                    // before it can be approved, so they collect here rather than
                    // sitting among photos that are ready to go in one click.
                    .filter('_type == "socialPost" && format == "reel"')
                    .defaultOrdering([{ field: "createdAt", direction: "desc" }])
                    .canHandleIntent(defaultIntentChecker)
                ),
              S.listItem()
                .id("uzheOpublikovany")
                .title("Уже опубликованы")
                .child(
                  S.documentList()
                    .title("Опубликованные")
                    .apiVersion("2024-01-29")
                    .filter('_type == "socialPost" && status == "published"')
                    .defaultOrdering([{ field: "publishedAt", direction: "desc" }])
                    .canHandleIntent(defaultIntentChecker)
                ),
              S.divider().title("Facebook"),
              S.documentTypeListItem("facebookGroup").title("Группы Facebook"),
            ])
        ),

      // ─── The shop: what is for sale, what was sold, and the records she only reads
      S.listItem()
        .id("shop")
        .title("Магазин")
        .child(
          S.list()
            .id("shop")
            .title("Магазин")
            .items([
              S.documentTypeListItem("product").title("Товары"),
              S.documentTypeListItem("order").title("Заказы"),
              S.documentTypeListItem("giftCard").title("Подарочные карты"),
              S.divider(),
              S.documentTypeListItem("collection").title("Коллекции"),
              S.documentTypeListItem("giftBox").title("Подарочные боксы"),
              S.documentTypeListItem("sizeGuide").title("Таблицы размеров"),
              S.divider().title("Покупатели"),
              S.documentTypeListItem("stockAlert").title("Ждут поступления"),
              S.documentTypeListItem("abandonedCart").title("Брошенные корзины"),
              S.documentTypeListItem("subscriber").title("Подписчики"),
            ])
        ),

      // ─── Who sends clients: salons and shops, and "Give £5, get £5"
      S.listItem()
        .id("friends")
        .title("Друзья и партнёры")
        .child(
          S.list()
            .id("friends")
            .title("Друзья и партнёры")
            .items([
              // Salons and shops that send their clients, each with a link, a card and
              // a month's statement. Contacts and payments are sealed, so it is a pane
              // that asks the server — see PartnersPane
              S.listItem()
                .id("partners")
                .title("Партнёры")
                .child(S.component(PartnersPane).id("partners-pane").title("Партнёры")),
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
                    .canHandleIntent(defaultIntentChecker)
                ),
              S.documentTypeListItem("referral").title("Бонусы за друзей"),
            ])
        ),

      // ─── What the site shows, and how it runs
      S.listItem()
        .id("settings")
        .title("Сайт и настройки")
        .child(
          S.list()
            .id("settings")
            .title("Сайт и настройки")
            .items([
              // The pictures of finished jobs on /work: the atelier's shop window
              S.documentTypeListItem("workPiece").title("Наши работы"),
              // 🚨 The documentId is what the site, the outside watcher and the
              // booking form read; without it the Studio would make a second schedule.
              // The item's id is the document's own, so a search result or a link
              // to the document opens it here (Sanity looks for an item by that id)
              S.listItem()
                .id("atelierSchedule")
                .title("Часы для примерок")
                .child(S.document().schemaType("atelierSchedule").documentId("atelierSchedule")),
              S.documentTypeListItem("legalPage").title("Инфо-страницы"),
              S.listItem()
                .id(SITE_SETTINGS_ID)
                .title("Настройки сайта")
                .child(S.document().schemaType("siteSettings").documentId(SITE_SETTINGS_ID)),
            ])
        ),
    ]);
