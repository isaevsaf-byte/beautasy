"use client";

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { ruKZLocale } from "@sanity/locale-ru-kz";
import { schemaTypes } from "./src/sanity/schemaTypes";
import { notifyCustomerAction } from "./src/sanity/notifyAction";
import { approvePostAction, publishNowAction } from "./src/sanity/socialActions";
import { revealContactAction } from "./src/sanity/revealAction";
import { moveBookingAction } from "./src/sanity/moveBookingAction";
import { collectionTimeAction } from "./src/sanity/collectionAction";
import { recordPaymentAction } from "./src/sanity/paymentAction";
import { partnerAttributionAction } from "./src/sanity/partnerAction";
import { structure } from "./src/sanity/structure";
import { etsyReviewTemplate, googleReviewTemplate, nextdoorReviewTemplate } from "./src/sanity/reviewLists";
import { dashboardTool } from "./src/sanity/dashboardTool";

export default defineConfig({
  name: "beautasy",
  title: "Beautasy Studio",

  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "5uun6fw6",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",

  basePath: "/studio",

  // The session token lives in this browser's storage, where the Studio's own
  // tools can hand it to the site: "Book by hand", "Move to another time",
  // "Show contact details" and the dashboard all ask the server to act for a
  // signed-in member, and prove who is asking with that token. Sanity's
  // default ("dual") keeps the session in a cookie on its own domain wherever
  // the browser allows — Chrome does, Safari doesn't — and a cookie there is
  // out of the page's reach. So those tools worked in Safari and told a Chrome
  // user "Could not find your Studio session". Found on 27 September 2026.
  auth: { loginMethod: "token" },

  // Kristina and Safar read Russian, so the Studio speaks it: Sanity's own
  // buttons and menus come from the locale plugin, and everything this project
  // wrote — lists, fields, the Dashboard — is written in Russian in the first
  // place. What reaches customers (the site, emails, Instagram) stays English.
  // The plugin's locale is listed last, and the Studio opens in the last
  // locale unless someone has picked another from the menu under their avatar.
  plugins: [structureTool({ structure }), visionTool(), ruKZLocale()],

  // "Dashboard" goes in front of Structure so that opening the Studio answers
  // "how is the shop doing" before it asks "which document did you want". The
  // list is composed rather than replaced: `prev` is what the plugins above
  // contributed, and overwriting it would take Structure and Vision away.
  tools: (prev) => [dashboardTool, ...prev],

  schema: {
    types: schemaTypes,
    // "Рекомендация Nextdoor", "Отзыв из Google" and "Отзыв из Etsy" start a
    // review already marked as coming from there, and approved; each list
    // offers only its own. `prev` keeps every type's ordinary template.
    templates: (prev) => [...prev, nextdoorReviewTemplate, googleReviewTemplate, etsyReviewTemplate],
  },

  document: {
    // "Email the customer now" on the documents whose status drives an email,
    // so Kristina doesn't have to wait for the nightly job.
    actions: (prev, context) => {
      // Customer details are sealed in the dataset, so every document that
      // holds any needs the one door back. See src/lib/pii.ts.
      const sealed = [
        "order",
        "atelierBooking",
        "giftCard",
        "subscriber",
        "stockAlert",
        "abandonedCart",
        "referrer",
      ];
      // A booking is given a time, or moved, through the diary — never by
      // typing into "Confirmed For", which held nothing. See moveBookingAction;
      // a collection gets the time Kristina drives out, see collectionAction.
      // "Кто прислал" puts a WhatsApp client down to the salon that sent her.
      if (context.schemaType === "atelierBooking") {
        return [
          ...prev,
          moveBookingAction,
          collectionTimeAction,
          recordPaymentAction,
          partnerAttributionAction,
          notifyCustomerAction,
          revealContactAction,
        ];
      }
      if (context.schemaType === "order") {
        return [...prev, notifyCustomerAction, revealContactAction];
      }
      if (sealed.includes(context.schemaType)) {
        return [...prev, revealContactAction];
      }
      // Approving is the only gate between a suggestion and a public post, so
      // both buttons sit on the document itself.
      if (context.schemaType === "socialPost") {
        return [approvePostAction, publishNowAction, ...prev];
      }
      return prev;
    },
  },
});
