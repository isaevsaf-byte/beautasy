import { defineField, defineType } from "sanity";
import { WEEKDAYS, isFacebookGroupUrl } from "@/lib/groupPosts";
import { groupCode } from "@/lib/shortLinks";

/**
 * A Facebook group Kristina has joined, and its rules for posts like hers.
 * «Посты в группы» reads these to say which groups allow a post today and
 * to write one for each (see @/lib/groupPosts); she publishes it herself.
 */
export const facebookGroup = defineType({
  name: "facebookGroup",
  title: "Группа Facebook",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Название группы",
      type: "string",
      description: "Как группа называется в Facebook. Переименовать можно: короткая ссылка в постах (www.beautasy.co.uk/g/…) привязана к самой группе, а не к названию, и по ней видно, какая группа привела клиента.",
      validation: (Rule) => Rule.required().max(80),
    }),
    defineField({
      name: "url",
      title: "Ссылка на группу",
      type: "url",
      description: "Откройте группу в Facebook и скопируйте адрес: https://www.facebook.com/groups/…",
      validation: (Rule) =>
        Rule.required().custom((value) =>
          !value || isFacebookGroupUrl(value)
            ? true
            : "Это не ссылка на группу Facebook. Она начинается с https://www.facebook.com/groups/"
        ),
    }),
    defineField({
      name: "active",
      title: "Публикуем в этой группе",
      type: "boolean",
      initialValue: true,
      description: "Снимите галочку — и группа уйдёт на паузу, из списка на сегодня пропадёт.",
    }),
    defineField({
      name: "days",
      title: "В какие дни можно рекламу",
      type: "array",
      of: [{ type: "string" }],
      options: {
        list: WEEKDAYS.map((day) => ({ title: day.title, value: day.value })),
        layout: "grid",
      },
      description: "Как в правилах группы: например, только суббота. Ничего не отмечено — в любой день.",
    }),
    defineField({
      name: "everyDays",
      title: "Не чаще, чем раз в … дней",
      type: "number",
      initialValue: 7,
      description: "Если правила молчат — раз в неделю: чаще группы считают спамом.",
      validation: (Rule) => Rule.required().integer().min(1).max(60),
    }),
    defineField({
      name: "links",
      title: "Можно ставить ссылку на сайт",
      type: "boolean",
      initialValue: true,
      description: "Если ссылки запрещены, в тексте вместо ссылки будет WhatsApp.",
    }),
    defineField({
      name: "area",
      title: "Район группы",
      type: "string",
      description:
        "По-английски, как говорят местные: Shirley, Portswood, Hedge End. Попадёт в текст — «a seamstress here in Shirley». Пусто — Southampton.",
      validation: (Rule) => Rule.max(40),
    }),
    defineField({
      name: "rules",
      title: "Правила группы своими словами",
      type: "text",
      rows: 3,
      description: "Для себя: что можно, что нельзя. Показывается рядом с готовым постом.",
    }),
    defineField({
      name: "lastPostedAt",
      title: "Последний пост",
      type: "datetime",
      description:
        "Ставится кнопкой «Опубликовала» в «Посты в группы». Если публиковали раньше сами — поставьте дату, чтобы не было поста чаще, чем разрешено.",
    }),
  ],
  preview: {
    select: { title: "name", active: "active", days: "days", everyDays: "everyDays", area: "area", id: "_id" },
    prepare({ title, active, days, everyDays, area, id }) {
      const when = (days as string[] | undefined)?.length
        ? WEEKDAYS.filter((day) => (days as string[]).includes(day.value))
            .map((day) => day.title)
            .join(", ")
        : "любой день";
      return {
        title: `${active === false ? "⏸" : "👥"} ${title ?? "Без названия"}`,
        // The group's tag in visit statistics (utm_campaign fb-…), the same as
        // in its short link. A draft's id carries "drafts.", which is not the group's
        subtitle: [area, when, `раз в ${everyDays ?? 7} дн.`, id && `метка fb-${groupCode(String(id).replace(/^drafts\./, ""))}`]
          .filter(Boolean)
          .join(" · "),
      };
    },
  },
});
