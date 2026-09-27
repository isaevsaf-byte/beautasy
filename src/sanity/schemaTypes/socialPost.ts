import { defineField, defineType } from "sanity";

/**
 * A post waiting to go out.
 *
 * The content pipeline has one rule: nothing reaches Instagram that Kristina
 * hasn't looked at. Drafts are written for her — from a new product, or by
 * hand — and only a document she has moved to "Approved" is ever published.
 * Everything else in here exists to make approving take ten seconds.
 */

const KINDS = [
  { title: "Товар", value: "product" },
  { title: "До / после", value: "before-after" },
  { title: "Процесс — крупным планом", value: "process" },
  { title: "Советы по посадке", value: "education" },
  { title: "Клиент / отзыв", value: "testimonial" },
  { title: "Сезонное", value: "seasonal" },
];

/** Each status as the line under a post in a list says it */
const STATUS_WORDS: Record<string, string> = {
  draft: "черновик",
  approved: "одобрен",
  publishing: "публикуется",
  published: "опубликован",
  failed: "не удалось",
};

export const socialPost = defineType({
  name: "socialPost",
  title: "Пост",
  type: "document",
  fields: [
    defineField({
      name: "format",
      title: "Фото или Reels",
      type: "string",
      options: {
        list: [
          { title: "Фото — уходит в ленту", value: "photo" },
          { title: "Reels — видео, его показывают и тем, кто на вас не подписан", value: "reel" },
        ],
        layout: "radio",
      },
      initialValue: "photo",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "image",
      title: "Картинка",
      type: "image",
      description:
        "То, что увидят люди. Instagram принимает JPEG или PNG — лучше всего квадрат или 4:5. У Reels эта картинка станет обложкой.",
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "video",
      title: "Видео",
      type: "file",
      options: { accept: "video/mp4" },
      description:
        "MP4, вертикальное (9:16), от 3 секунд до 15 минут, меньше 300 МБ. Ролик из папки video/ собирается ровно таким.",
      hidden: ({ parent }) => parent?.format !== "reel",
      validation: (Rule) =>
        Rule.custom((value, context) => {
          const parent = context.parent as { format?: string } | undefined;
          if (parent?.format === "reel" && !value) return "Для Reels нужно видео.";
          return true;
        }),
    }),
    defineField({
      name: "caption",
      title: "Подпись",
      type: "text",
      rows: 7,
      description:
        "Текст под картинкой, по-английски — его читают подписчики. Выберите один из вариантов ниже и правьте его, пока он не зазвучит как вы.",
      validation: (Rule) => Rule.required().max(2200),
    }),
    defineField({
      name: "captionOptions",
      title: "Варианты",
      type: "array",
      of: [{ type: "text", rows: 4 }],
      description:
        "Написаны для вас автоматически. Скопируйте понравившийся в «Подпись» выше — сами варианты никогда не публикуются.",
    }),
    defineField({
      name: "hashtags",
      title: "Хештеги",
      type: "string",
      description: "Добавляются в конец подписи, когда пост уходит.",
    }),
    defineField({
      name: "kind",
      title: "Тип поста",
      type: "string",
      options: {
        list: KINDS,
      },
      initialValue: "product",
    }),
    defineField({
      name: "pinToPinterest",
      title: "Сделать пин и в Pinterest",
      type: "boolean",
      initialValue: true,
      description:
        "Пост в Instagram живёт один день, а пин в Pinterest находят и через год — и в нём есть ссылка на товар. Выключите для всего, что не стоит хранить.",
    }),
    defineField({
      name: "pinUrl",
      title: "Ссылка на пин",
      type: "url",
      readOnly: true,
    }),
    defineField({
      name: "pinError",
      title: "Ответ Pinterest",
      type: "string",
      readOnly: true,
      description:
        "Заполняется, только если пин не получилось создать. Пост в Instagram при этом всё равно вышел — они нарочно не зависят друг от друга.",
    }),
    defineField({
      name: "product",
      title: "О каком товаре",
      type: "reference",
      to: [{ type: "product" }],
      description: "По желанию. Связывает пост с товаром, чтобы было видно, что уже публиковали.",
    }),
    defineField({
      name: "scheduledFor",
      title: "Когда опубликовать",
      type: "datetime",
      description:
        "Оставьте пустым — пост выйдет сразу после одобрения. С датой он выходит примерно в течение 15 минут после этого времени. Но если это время попадает в тихие часы или лимит постов на этот день уже исчерпан (и то и другое задаётся в «Настройки сайта» → «Публикация в Instagram»), пост ждёт ближайшего свободного окна.",
    }),
    defineField({
      name: "status",
      title: "Статус",
      type: "string",
      options: {
        list: [
          { title: "Черновик — посмотрите его", value: "draft" },
          { title: "Одобрен — будет опубликован", value: "approved" },
          { title: "Публикуется — уходит прямо сейчас", value: "publishing" },
          { title: "Опубликован", value: "published" },
          { title: "Не удалось — см. «Что пошло не так»", value: "failed" },
        ],
        layout: "radio",
      },
      description:
        "«Публикуется» ставит сайт, а не вы: он занимает пост на несколько секунд, чтобы два запуска никогда не отправили одну и ту же картинку дважды. Если пост и через несколько минут стоит на «Публикуется», что-то остановилось на полпути — проверьте Instagram и поставьте «Опубликован», если пост там появился, или верните «Одобрен», чтобы попробовать снова.",
      initialValue: "draft",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "publishedAt",
      title: "Когда опубликован",
      type: "datetime",
      readOnly: true,
    }),
    defineField({
      name: "permalink",
      title: "Ссылка на пост",
      type: "url",
      readOnly: true,
    }),
    defineField({
      name: "igCreationId",
      title: "Контейнер Instagram",
      type: "string",
      readOnly: true,
      hidden: true,
      description:
        "Instagram готовит видео до нескольких минут — дольше, чем длится один запуск публикации. Здесь запоминается недоделанная загрузка, чтобы следующий запуск её закончил, а не начинал заново.",
    }),
    defineField({
      name: "lastError",
      title: "Что пошло не так",
      type: "string",
      readOnly: true,
      description: "Заполняется, только если пост не удалось опубликовать.",
    }),
    defineField({
      name: "source",
      title: "Кто написал",
      type: "string",
      readOnly: true,
      options: {
        list: [
          { title: "Предложен автоматически", value: "auto" },
          { title: "Написан вручную", value: "manual" },
        ],
      },
      initialValue: "manual",
    }),
    defineField({
      name: "createdAt",
      title: "Создан",
      type: "datetime",
      readOnly: true,
      initialValue: () => new Date().toISOString(),
    }),
  ],
  orderings: [
    {
      title: "Ближайшие к публикации",
      name: "scheduledForAsc",
      by: [{ field: "scheduledFor", direction: "asc" }],
    },
    {
      title: "Сначала новые",
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
      const first = (caption ?? "Подписи пока нет").split("\n")[0];
      const when = scheduledFor
        ? new Date(scheduledFor).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "short",
            timeZone: "Europe/London",
          })
        : "без даты";
      const state = status ?? "draft";
      const type = kind ? (KINDS.find((k) => k.value === kind)?.title.toLowerCase() ?? kind) : null;
      return {
        title: first.length > 60 ? `${first.slice(0, 60)}…` : first,
        subtitle: `${STATUS_WORDS[state] ?? state} · ${when}${type ? ` · ${type}` : ""}`,
        media,
      };
    },
  },
});
