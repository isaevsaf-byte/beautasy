import { defineField, defineType } from "sanity";
import { OpenLinkInput } from "../OpenLinkInput";
import { EbaySearchInput } from "../EbaySearchInput";
import { SUPPLY_GROUPS, SUPPLY_UNITS, bestOffer, perUnit, unitPrice, type SupplyUnit } from "@/lib/supplies";

/**
 * «Где брать мини-опт»: one thing she sews with — 25 mm elastic, pencil tape,
 * curtain hooks — and the shops that sell it by the roll or the box, each
 * with what a mid-size buy costs. The cheapest per unit leads the list. The
 * Monday run keeps Empress Mills' prices current and tells her what fell
 * (see @/lib/supplies, @/lib/supplyRun); the others she checks by hand.
 *
 * 🚨 The dataset is public: shops and prices only — not what she pays or how
 * much she uses, beyond the one optional «Сколько плачу сейчас».
 */
export const supplyItem = defineType({
  name: "supplyItem",
  title: "Где брать мини-опт",
  type: "document",
  // Edits land as she types — no draft waiting for «Publish» that the Monday run would not see
  liveEdit: true,
  fields: [
    defineField({ name: "name", title: "Что", type: "string", validation: (Rule) => Rule.required().max(80) }),
    defineField({
      name: "group",
      title: "Раздел",
      type: "string",
      initialValue: "other",
      options: { list: SUPPLY_GROUPS.map(({ value, title }) => ({ value, title })), layout: "radio" },
    }),
    defineField({
      name: "spec",
      title: "Как ищут по-английски",
      type: "string",
      description: "Слова для поиска в магазинах и на eBay — например, «25mm elastic 25m roll».",
      components: { input: EbaySearchInput as never },
      validation: (Rule) => Rule.required().max(120),
    }),
    defineField({
      name: "unit",
      title: "Цена считается",
      type: "string",
      initialValue: "metre",
      options: { list: SUPPLY_UNITS.map(({ value, title }) => ({ value, title })), layout: "radio" },
    }),
    defineField({
      name: "myPrice",
      title: "Сколько плачу сейчас, £",
      type: "number",
      description:
        "По желанию. За одну единицу из «Цена считается»: за метр, за штуку или за 1000 м нитки — не за конус. Если в Empress Mills станет на 30% дешевле — придёт сообщение (остальные магазины сайт не читает).",
      validation: (Rule) => Rule.min(0),
    }),
    defineField({
      name: "offers",
      title: "Где брать",
      type: "array",
      of: [
        {
          type: "object",
          name: "supplyOffer",
          title: "Магазин",
          fields: [
            defineField({ name: "shop", title: "Магазин", type: "string", validation: (Rule) => Rule.required() }),
            defineField({
              name: "url",
              title: "Ссылка",
              type: "url",
              components: { input: OpenLinkInput as never },
              validation: (Rule) => Rule.required().uri({ scheme: ["https"] }),
            }),
            defineField({
              name: "pack",
              title: "Сколько единиц в покупке",
              type: "number",
              description: "25 — рулон 25 м, 1000 — коробка крючков, 5 — конус 5000 м нитки.",
              validation: (Rule) => Rule.required().positive(),
            }),
            defineField({ name: "price", title: "Цена покупки, £ с VAT", type: "number", validation: (Rule) => Rule.required().positive() }),
            defineField({ name: "note", title: "Заметка", type: "text", rows: 2, description: "Доставка, минимум, что за товар." }),
            // Written by the Monday run, for Empress Mills only
            defineField({ name: "seenTiers", title: "Цены магазина", type: "string", readOnly: true, description: "Как их показал сайт магазина при последней проверке, с VAT." }),
            defineField({ name: "seenAt", title: "Проверено", type: "datetime", readOnly: true }),
            defineField({ name: "seenUnitPrice", title: "Цена за единицу при проверке, £", type: "number", readOnly: true, hidden: ({ value }) => value === undefined }),
            defineField({ name: "seenPack", title: "Для покупки в", type: "number", readOnly: true, hidden: true }),
            defineField({ name: "seenFrom", title: "Какая страница и варианты", type: "string", readOnly: true, hidden: true }),
            defineField({ name: "seenYours", title: "Её цена при проверке", type: "number", readOnly: true, hidden: true }),
          ],
          preview: {
            select: { shop: "shop", pack: "pack", price: "price", note: "note" },
            prepare({ shop, pack, price, note }: { shop?: string; pack?: number; price?: number; note?: string }) {
              const each = typeof pack === "number" && typeof price === "number" ? unitPrice({ pack, price }) : null;
              return {
                title: `${shop ?? "Магазин"}${typeof price === "number" ? ` — £${price.toFixed(2)} за покупку` : ""}`,
                subtitle: [
                  typeof pack === "number" ? `в покупке ${pack} ед.` : null,
                  each !== null ? `${each < 0.1 ? `${(each * 100).toFixed(1)}p` : `£${each.toFixed(2)}`} за ед.` : null,
                  note,
                ]
                  .filter(Boolean)
                  .join(" · "),
              };
            },
          },
        },
      ],
    }),
    defineField({ name: "note", title: "Заметка", type: "text", rows: 3 }),
  ],
  orderings: [{ title: "По разделам", name: "groupName", by: [{ field: "group", direction: "asc" }, { field: "name", direction: "asc" }] }],
  preview: {
    select: { name: "name", unit: "unit", offers: "offers", group: "group" },
    prepare({ name, unit, offers, group }: { name?: string; unit?: SupplyUnit; offers?: { pack: number; price: number; shop: string }[]; group?: string }) {
      const best = bestOffer({ offers: (offers ?? []).map((o, k) => ({ ...o, _key: String(k), url: "" })) });
      const each = best ? unitPrice(best) : null;
      const where = SUPPLY_GROUPS.find((g) => g.value === group)?.title;
      return {
        title: name ?? "Без названия",
        subtitle: [where, best && each !== null ? `от ${perUnit(each, unit ?? "metre")} — ${best.shop}` : "магазин не указан"].filter(Boolean).join(" · "),
      };
    },
  },
  initialValue: () => ({ group: "other", unit: "metre" }),
});
