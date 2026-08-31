import { defineField, defineType } from "sanity";

/**
 * A post waiting to go out.
 *
 * The content pipeline has one rule: nothing reaches Instagram that Kristina
 * hasn't looked at. Drafts are written for her — from a new product, or by
 * hand — and only a document she has moved to "Approved" is ever published.
 * Everything else in here exists to make approving take ten seconds.
 */
export const socialPost = defineType({
  name: "socialPost",
  title: "Social Post",
  type: "document",
  fields: [
    defineField({
      name: "image",
      title: "Picture",
      type: "image",
      description:
        "What people will see. Instagram needs a JPEG or PNG — square or 4:5 works best.",
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "caption",
      title: "Caption",
      type: "text",
      rows: 7,
      description:
        "The words under the picture. Pick one of the suggestions below and edit it until it sounds like you.",
      validation: (Rule) => Rule.required().max(2200),
    }),
    defineField({
      name: "captionOptions",
      title: "Suggestions",
      type: "array",
      of: [{ type: "text", rows: 4 }],
      description:
        "Written for you automatically. Copy the one you like into Caption above — these are never posted.",
    }),
    defineField({
      name: "hashtags",
      title: "Hashtags",
      type: "string",
      description: "Added to the end of the caption when the post goes out.",
    }),
    defineField({
      name: "kind",
      title: "Type of post",
      type: "string",
      options: {
        list: [
          { title: "Product", value: "product" },
          { title: "Before / after", value: "before-after" },
          { title: "Process — close up", value: "process" },
          { title: "Fit advice", value: "education" },
          { title: "Customer / review", value: "testimonial" },
          { title: "Seasonal", value: "seasonal" },
        ],
      },
      initialValue: "product",
    }),
    defineField({
      name: "product",
      title: "About this product",
      type: "reference",
      to: [{ type: "product" }],
      description: "Optional. Links the post to a product so you can see what has been posted.",
    }),
    defineField({
      name: "scheduledFor",
      title: "Go out on",
      type: "datetime",
      description:
        "Leave empty to post at the next run once approved. The site publishes what is due each morning.",
    }),
    defineField({
      name: "status",
      title: "Status",
      type: "string",
      options: {
        list: [
          { title: "Draft — needs your eyes", value: "draft" },
          { title: "Approved — will go out", value: "approved" },
          { title: "Publishing — going out right now", value: "publishing" },
          { title: "Published", value: "published" },
          { title: "Failed — see the note", value: "failed" },
        ],
        layout: "radio",
      },
      description:
        "Publishing is set by the site, not by you: it claims the post for a few seconds so two runs can never send the same picture twice. If one is still sitting on Publishing minutes later, something stopped halfway — check Instagram, then set it to Published if it arrived, or back to Approved to try again.",
      initialValue: "draft",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "publishedAt",
      title: "Published At",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "permalink",
      title: "Link To The Post",
      type: "url",
      readOnly: true,
    }),
    defineField({
      name: "lastError",
      title: "What Went Wrong",
      type: "string",
      readOnly: true,
      description: "Filled in only when a post could not be published.",
    }),
    defineField({
      name: "source",
      title: "Written By",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "Suggested automatically", value: "auto" },
          { title: "Written by hand", value: "manual" },
        ],
      },
      initialValue: "manual",
    }),
    defineField({
      name: "createdAt",
      title: "Created",
      type: "datetime",
      readOnly: true,
      initialValue: () => new Date().toISOString(),
    }),
  ],
  orderings: [
    {
      title: "Going out soonest",
      name: "scheduledForAsc",
      by: [{ field: "scheduledFor", direction: "asc" }],
    },
    {
      title: "Newest first",
      name: "createdAtDesc",
      by: [{ field: "createdAt", direction: "desc" }],
    },
  ],
  preview: {
    select: {
      caption: "caption",
      status: "status",
      scheduledFor: "scheduledFor",
      media: "image",
      kind: "kind",
    },
    prepare({ caption, status, scheduledFor, media, kind }) {
      const first = (caption ?? "No caption yet").split("\n")[0];
      const when = scheduledFor
        ? new Date(scheduledFor).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
          })
        : "no date";
      return {
        title: first.length > 60 ? `${first.slice(0, 60)}…` : first,
        subtitle: `${status ?? "draft"} · ${when}${kind ? ` · ${kind}` : ""}`,
        media,
      };
    },
  },
});
