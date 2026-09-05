import type { StructureResolver } from "sanity/structure";

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
        .title("Posts to approve")
        .child(
          S.documentList()
            .title("Waiting for you")
            .filter('_type == "socialPost" && status in ["draft", "failed"]')
            .defaultOrdering([{ field: "createdAt", direction: "desc" }])
        ),
      S.listItem()
        .title("Posts going out")
        .child(
          S.documentList()
            .title("Approved")
            // "publishing" belongs here too. The site sets it for the few
            // seconds a post is on its way to Instagram, so that two runs can
            // never send the same picture — but if something stops halfway the
            // post keeps that status, and this is the list where it has to be
            // visible rather than quietly belonging to no list at all.
            .filter('_type == "socialPost" && status in ["approved", "publishing"]')
            .defaultOrdering([{ field: "scheduledFor", direction: "asc" }])
        ),
      S.listItem()
        .title("Posted already")
        .child(
          S.documentList()
            .title("Published")
            .filter('_type == "socialPost" && status == "published"')
            .defaultOrdering([{ field: "publishedAt", direction: "desc" }])
        ),

      S.divider(),

      S.documentTypeListItem("product").title("Products"),
      S.documentTypeListItem("collection").title("Collections"),
      S.documentTypeListItem("giftBox").title("Gift Boxes"),
      S.documentTypeListItem("giftCard").title("Gift Cards"),
      S.documentTypeListItem("sizeGuide").title("Size Guides"),

      S.divider(),

      S.documentTypeListItem("atelierBooking").title("Atelier Bookings"),
      S.listItem()
        .title("Fitting Times")
        .child(S.document().schemaType("atelierSchedule").documentId("atelierSchedule")),
      S.documentTypeListItem("order").title("Orders"),
      S.documentTypeListItem("review").title("Reviews"),
      S.documentTypeListItem("subscriber").title("Subscribers"),
      S.documentTypeListItem("stockAlert").title("Stock Alerts"),
      S.documentTypeListItem("abandonedCart").title("Abandoned Carts"),

      S.divider(),

      S.documentTypeListItem("legalPage").title("Info Pages"),
      S.listItem()
        .title("Site Settings")
        .child(S.document().schemaType("siteSettings").documentId("siteSettings")),
    ]);
