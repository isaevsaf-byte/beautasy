"use client";

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./src/sanity/schemaTypes";
import { notifyCustomerAction } from "./src/sanity/notifyAction";
import { approvePostAction, publishNowAction } from "./src/sanity/socialActions";
import { structure } from "./src/sanity/structure";

export default defineConfig({
  name: "beautasy",
  title: "Beautasy Studio",

  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "5uun6fw6",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",

  basePath: "/studio",

  plugins: [structureTool({ structure }), visionTool()],

  schema: {
    types: schemaTypes,
  },

  document: {
    // "Email the customer now" on the documents whose status drives an email,
    // so Kristina doesn't have to wait for the nightly job.
    actions: (prev, context) => {
      if (context.schemaType === "order" || context.schemaType === "atelierBooking") {
        return [...prev, notifyCustomerAction];
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
