import { defineArrayMember, defineField, defineType } from "sanity";
import { photoLocationRule } from "@/sanity/photoLocationRule";
import { WORK_CATEGORY_OPTIONS, WORK_SERVICE_OPTIONS, WORK_SHELF_OPTIONS, workCategoryTitle } from "@/sanity/workLabels";

/**
 * Above this a video stalls on a phone. Straight from an iPhone a minute is
 * several hundred megabytes, in a format half the browsers can't play, and it
 * carries the spot where it was filmed — for a workroom at home, the address.
 * scripts/gallery-import.mjs fixes all three. Videos therefore arrive only
 * through it: an upload in the Studio would be public the moment it landed,
 * before any check could turn it back.
 */
const MAX_VIDEO_MB = 40;

/**
 * What is wrong with an uploaded video, in words for Kristina — or null. Only
 * what Sanity knows about the file: whether it is MP4 and how big it is.
 */
export function videoFileProblem(asset: { size?: number; mimeType?: string } | null | undefined): string | null {
  if (asset?.mimeType && asset.mimeType !== "video/mp4") {
    return "Во всех браузерах играет только MP4. Положите это видео в папку Gallery — Сафар его переконвертирует.";
  }
  if (asset?.size && asset.size > MAX_VIDEO_MB * 1024 * 1024) {
    const mb = Math.round(asset.size / (1024 * 1024));
    return `Это видео весит ${mb} МБ — на телефоне оно будет тормозить. Положите его в папку Gallery — Сафар его сожмёт.`;
  }
  return null;
}

function altField(title: string) {
  return defineField({
    name: "alt",
    title,
    type: "string",
    description: "По-английски: для тех, кто не может это увидеть, и для Google. Если оставить пустым, возьмётся заголовок.",
    validation: (Rule) => Rule.max(160),
  });
}

export const workPiece = defineType({
  name: "workPiece",
  title: "Работа",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Заголовок",
      type: "string",
      description: "Короткий заголовок по-английски, например «Curtains taken up to skim the floor».",
      validation: (Rule) => Rule.required().max(70),
    }),
    defineField({
      name: "caption",
      title: "История",
      type: "text",
      rows: 3,
      description: "Одно-два предложения по-английски: что это было и что вы сделали.",
      validation: (Rule) => Rule.max(280),
    }),
    defineField({
      name: "category",
      title: "Раздел",
      type: "string",
      options: {
        list: WORK_CATEGORY_OPTIONS,
        layout: "radio",
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "before",
      title: "Фото «до»",
      type: "image",
      options: { hotspot: true },
      description: "По желанию. Если есть фото «до», первое фото ниже показывается рядом с ним как «после».",
      fields: [altField("Что на снимке")],
      validation: (Rule) => Rule.custom(photoLocationRule),
    }),
    defineField({
      name: "media",
      title: "Фото и видео",
      type: "array",
      // 06.10: scrunchies and a quilted pouch shared one card, so beside the
      // pouch a visitor read about scrunchies and got a hair-accessories button
      description:
        "Первое — обложка. Перетаскивайте, чтобы поменять порядок. Все фото — про одну вещь или одну работу: заголовок, история и ссылка в магазин стоят рядом с каждым фото. Другая вещь — отдельная работа.",
      of: [
        defineArrayMember({
          name: "workPhoto",
          title: "Фото",
          type: "image",
          options: { hotspot: true },
          fields: [altField("Что на снимке")],
          validation: (Rule) => Rule.custom(photoLocationRule),
        }),
        defineArrayMember({
          name: "workVideo",
          title: "Видео",
          type: "object",
          fields: [
            defineField({
              name: "file",
              title: "Видео",
              type: "file",
              options: { accept: "video/mp4" },
              readOnly: true,
              description:
                "Видео попадают сюда только через папку Gallery: положите туда файл и скажите Сафару. Импорт сожмёт видео, чтобы оно шло на любом телефоне, и уберёт из него место съёмки. Здесь видео можно переставлять, менять их описание или удалять.",
              validation: (Rule) => [
                Rule.required().error("Видео добавляются только через папку Gallery — удалите этот пустой блок."),
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
              title: "Обложка",
              type: "image",
              options: { hotspot: true },
              readOnly: true,
              description: "Кадр из видео, его делает импорт. Если обложка плохо обрезается, сдвиньте точку фокуса инструментом обрезки.",
            }),
            altField("Что происходит в видео"),
            // Written by the import, so the page can lay the video out before it loads
            defineField({ name: "width", type: "number", hidden: true }),
            defineField({ name: "height", type: "number", hidden: true }),
            defineField({ name: "duration", type: "number", hidden: true }),
          ],
          preview: {
            select: { alt: "alt", poster: "poster" },
            prepare: ({ alt, poster }) => ({ title: alt || "Видео", subtitle: "Видео", media: poster }),
          },
        }),
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "service",
      title: "Показать также на странице услуги",
      type: "string",
      description: "По желанию: страница услуги, к которой относится эта работа, — чтобы тот, кто читает об услуге, увидел её результат.",
      options: {
        list: WORK_SERVICE_OPTIONS,
      },
    }),
    defineField({
      name: "shelf",
      title: "Ссылка в магазин",
      type: "string",
      description: "По желанию: где в магазине можно купить такую же вещь, если она понравилась. Пока этот раздел магазина пуст, ссылка не показывается.",
      options: { list: WORK_SHELF_OPTIONS },
    }),
    defineField({
      name: "date",
      title: "Дата",
      type: "date",
      description: "Новые показываются первыми. Поменяйте дату, чтобы поднять работу выше или опустить ниже.",
      initialValue: () => new Date().toISOString().slice(0, 10),
    }),
  ],
  orderings: [{ title: "Сначала новые", name: "dateDesc", by: [{ field: "date", direction: "desc" }] }],
  preview: {
    select: { title: "title", category: "category", first: "media.0", poster: "media.0.poster", before: "before" },
    prepare: ({ title, category, first, poster, before }) => ({
      title,
      subtitle: [category ? workCategoryTitle(category) : null, before?.asset ? "до и после" : null]
        .filter(Boolean)
        .join(" · "),
      media: first?.asset ? first : poster,
    }),
  },
});
