"use client";

import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./src/sanity/schemaTypes";
import { notifyCustomerAction } from "./src/sanity/notifyAction";

export default defineConfig({
  name: "beautasy",
  title: "Beautasy Studio",

  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "5uun6fw6",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",

  basePath: "/studio",

  plugins: [structureTool(), visionTool()],

  schema: {
    types: schemaTypes,
  },

  document: {
    // "Email the customer now" on the documents whose status drives an email,
    // so Kristina doesn't have to wait for the nightly job.
    actions: (prev, context) =>
      context.schemaType === "order" || context.schemaType === "atelierBooking"
        ? [...prev, notifyCustomerAction]
        : prev,
  },
});
