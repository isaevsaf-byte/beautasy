import { defineArrayMember, defineField, defineType, type ValidationContext } from "sanity";
import { WORK_CATEGORIES, WORK_SHELVES, categoryLabel, type WorkCategory } from "@/lib/work";
import { LOCAL_SERVICES } from "@/lib/localServices";
import { carriesLocation } from "@/lib/photoLocation";

/**
 * Above this a video stalls on a phone. Straight from an iPhone a minute is
 * several hundred megabytes, in a format half the browsers can't play, and it
 * carries the spot where it was filmed — for a workroom at home, the address.
 * scripts/gallery-import.mjs fixes all three. Videos therefore arrive only
 * through it: an upload in the Studio would be public the moment it landed,
 * before any check could turn it back.
 */
const MAX_VIDEO_MB = 40;

export const PHOTO_LOCATION_PROBLEM =
  "This photo still carries the place it was taken — for a photo taken at home, that is the address, and the original file is public. Remove it here and put the photo in the Gallery folder for Safar instead: the import takes the location out. (Tell Safar, so he can delete this upload.)";

/** Answers per uploaded file: a file never changes, so neither does its answer */
const checked = new Map<string, Promise<boolean>>();

/**
 * Turns back a gallery photo whose file says where it was taken — see
 * @/lib/photoLocation. Reads the first 256 KB of the original, where the
 * metadata sits. If the file can't be read the photo is let through: a check
 * that fails closed would stop Kristina publishing at all on a bad connection.
 */
async function photoLocationRule(value: unknown, context: ValidationContext): Promise<string | true> {
  const ref = (value as { asset?: { _ref?: string } } | undefined)?.asset?._ref;
  if (!ref) return true;
  let answer = checked.get(ref);
  if (!answer) {
    answer = (async () => {
      const url = await context.getClient({ apiVersion: "2026-02-13" }).fetch<string | null>(`*[_id == $ref][0].url`, { ref });
      if (!url) return false;
      const response = await fetch(url, { headers: { Range: "bytes=0-262143" } });
      if (!response.ok) return false;
      return carriesLocation(new Uint8Array(await response.arrayBuffer()));
    })().catch(() => false);
    checked.set(ref, answer);
  }
  return (await answer) ? PHOTO_LOCATION_PROBLEM : true;
}

/**
 * What is wrong with an uploaded video, in words for Kristina — or null. Only
 * what Sanity knows about the file: whether it is MP4 and how big it is.
 */
export function videoFileProblem(asset: { size?: number; mimeType?: string } | null | undefined): string | null {
  if (asset?.mimeType && asset.mimeType !== "video/mp4") {
    return "Only MP4 plays in every browser. Put this one in the Gallery folder for Safar to convert.";
  }
  if (asset?.size && asset.size > MAX_VIDEO_MB * 1024 * 1024) {
    const mb = Math.round(asset.size / (1024 * 1024));
    return `This video is ${mb} MB — it would stall on a phone. Put it in the Gallery folder for Safar to shrink.`;
  }
  return null;
}

function altField(title: string) {
  return defineField({
    name: "alt",
    title,
    type: "string",
    description: "For people who can't see it, and for Google. Leave empty to use the title.",
    validation: (Rule) => Rule.max(160),
  });
}

export const workPiece = defineType({
  name: "workPiece",
  title: "Our Work",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description: "A short headline, e.g. “Curtains taken up to skim the floor”.",
      validation: (Rule) => Rule.required().max(70),
    }),
    defineField({
      name: "caption",
      title: "The story",
      type: "text",
      rows: 3,
      description: "A sentence or two about the job: what it was, what you did.",
      validation: (Rule) => Rule.max(280),
    }),
    defineField({
      name: "category",
      title: "Where it goes",
      type: "string",
      options: {
        list: WORK_CATEGORIES.map((c) => ({ title: c.label, value: c.value })),
        layout: "radio",
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "before",
      title: "Before photo",
      type: "image",
      options: { hotspot: true },
      description: "Optional. With a before, the first photo below is shown next to it as the after.",
      fields: [altField("What's in the picture")],
      validation: (Rule) => Rule.custom(photoLocationRule),
    }),
    defineField({
      name: "media",
      title: "Photos and videos",
      type: "array",
      description: "The first one is the cover. Drag to change the order.",
      of: [
        defineArrayMember({
          name: "workPhoto",
          title: "Photo",
          type: "image",
          options: { hotspot: true },
          fields: [altField("What's in the picture")],
          validation: (Rule) => Rule.custom(photoLocationRule),
        }),
        defineArrayMember({
          name: "workVideo",
          title: "Video",
          type: "object",
          fields: [
            defineField({
              name: "file",
              title: "Video",
              type: "file",
              options: { accept: "video/mp4" },
              readOnly: true,
              description:
                "Videos come in through the Gallery folder: put the file there and tell Safar. The import shrinks it to play on any phone and takes out where it was filmed. You can reorder videos here, change their words, or remove them.",
              validation: (Rule) => [
                Rule.required().error("Videos come in through the Gallery folder — remove this empty one."),
                Rule.custom(async (value, context) => {
                  const ref = (value as { asset?: { _ref?: string } } | undefined)?.asset?._ref;
                  if (!ref) return true;
                  const asset = await context
                    .getClient({ apiVersion: "2026-02-13" })
                    .fetch<{ size?: number; mimeType?: string } | null>(`*[_id == $ref][0]{ size, mimeType }`, { ref });
                  return videoFileProblem(asset) ?? true;
                }),
              ],
            }),
            defineField({
              name: "poster",
              title: "Cover picture",
              type: "image",
              options: { hotspot: true },
              readOnly: true,
              description: "Cut from the video by the import. Move its focus point with the crop tool if the cover crops badly.",
            }),
            altField("What happens in it"),
            // Written by the import, so the page can lay the video out before it loads
            defineField({ name: "width", type: "number", hidden: true }),
            defineField({ name: "height", type: "number", hidden: true }),
            defineField({ name: "duration", type: "number", hidden: true }),
          ],
          preview: {
            select: { alt: "alt", poster: "poster" },
            prepare: ({ alt, poster }) => ({ title: alt || "Video", subtitle: "Video", media: poster }),
          },
        }),
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "service",
      title: "Also show it on",
      type: "string",
      description: "Optional: the service page this job belongs on, so someone reading about it sees it done.",
      options: {
        list: LOCAL_SERVICES.map((s) => ({ title: `${s.eyebrow} — ${s.serviceName}`, value: s.slug })),
      },
    }),
    defineField({
      name: "shelf",
      title: "Link to the shop",
      type: "string",
      description: "Optional: where in the shop someone who likes it can buy one. Hidden while that shelf is empty.",
      options: { list: WORK_SHELVES.map((s) => ({ title: s.title, value: s.value })) },
    }),
    defineField({
      name: "date",
      title: "Date",
      type: "date",
      description: "Newest shows first. Change the date to move a piece up or down.",
      initialValue: () => new Date().toISOString().slice(0, 10),
    }),
  ],
  orderings: [{ title: "Newest first", name: "dateDesc", by: [{ field: "date", direction: "desc" }] }],
  preview: {
    select: { title: "title", category: "category", first: "media.0", poster: "media.0.poster", before: "before" },
    prepare: ({ title, category, first, poster, before }) => ({
      title,
      subtitle: [category ? categoryLabel(category as WorkCategory) : null, before?.asset ? "before & after" : null]
        .filter(Boolean)
        .join(" · "),
      media: first?.asset ? first : poster,
    }),
  },
});
