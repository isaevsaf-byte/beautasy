import { escapeHtml } from "./escapeHtml";
import { BUSINESS } from "./business";
import { pounds } from "./friendsLink";
import { collectionOffered, type CollectionSettings } from "./collection";
import { GOLD, LAVENDER, PLUM, qrSvg } from "./qrSvg";
import { partnerCardPath, partnerLinkShown, type CardSize } from "./partners";

/**
 * A partner's cards, ready to print: a business card (85 × 55 mm, face and
 * back) and an A6 card for the counter, both with 3 mm of bleed.
 *
 * The same layout as build.py in ~/Documents/Beautasy-Partner-Cards, moved
 * into the site so Kristina gets a new salon's card from the Studio with one
 * button: the page opens at its real size, and ⌘P → "Save as PDF" gives the
 * file a printer takes (Chrome uses the @page size below). On screen a strip
 * at the top says how; it is not printed.
 *
 * The code on the card is the partner's /p/ link, drawn by @/lib/qrSvg — the
 * drawing that is painted and scanned in qrSvg.test.ts.
 */

const CREAM = "#FDFBF7";
const INK = "#4A4A4A";

/** Served from /public: the atelier's logo with its background taken out. */
export const CARD_LOGO = "/partner-card-logo.png";

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&' +
  'family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,500&display=block" rel="stylesheet">';

const SCISSORS =
  `<svg viewBox="0 0 24 24" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linecap="round">` +
  '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>' +
  '<path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/></svg>';

/** "+44 7729 741116" → "07729 741116", the way it is said in the UK. */
export function phoneAsSaid(international: string = BUSINESS.telephone): string {
  return international.replace(/^\+44\s?/, "0");
}

/**
 * The collection line, as the settings have it now: "Free collection &
 * return in Southampton from £40" — or nothing, when collection is switched
 * off, so a card never promises what the booking form would not offer.
 */
export function collectionLine(settings: CollectionSettings): string | null {
  if (!collectionOffered(settings)) return null;
  const zone = settings.zones[0];
  return zone.freeFrom > 0
    ? `Free collection & return in ${zone.name} from ${pounds(zone.freeFrom)}`
    : `Collection & return in ${zone.name}, ${pounds(zone.fee)}`;
}

/** What a card offers, read from the settings when it is printed. */
export interface CardOffer {
  /** The client's discount on a first alteration, as printed: "£5" */
  discount: string;
  collection: string | null;
}

/** A seam line: dashed, rounded, a few millimetres in from the trim. */
function stitch(w: number, h: number, inset: number, radius: number): string {
  return (
    `<svg class="stitch" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">` +
    `<rect x="${inset}" y="${inset}" width="${w - 2 * inset}" height="${h - 2 * inset}" rx="${radius}" ` +
    `fill="none" stroke="${PLUM}" stroke-opacity=".45" stroke-width=".28" stroke-dasharray="1.5 1.1"/></svg>`
  );
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{background:#fff}
.page{position:relative;overflow:hidden;page-break-after:always;break-after:page}
.trim{position:absolute;left:3mm;top:3mm}
.stitch{position:absolute;left:0;top:0}
.serif{font-family:'Playfair Display',Georgia,serif}
.sans{font-family:Inter,system-ui,sans-serif}
p{color:${INK}}
.toolbar{position:fixed;left:0;right:0;top:0;z-index:10;background:${PLUM};color:#fff;font:14px/1.5 Inter,system-ui,sans-serif;padding:12px 18px}
.toolbar a,.toolbar button{color:#fff;font:inherit}
.toolbar button{background:#fff;color:${PLUM};border:0;border-radius:999px;padding:4px 14px;margin-right:12px;cursor:pointer;font-weight:600}
@media screen{
  body{background:#ece6f5;padding:110px 16px 40px}
  .page{margin:0 auto 28px;box-shadow:0 4px 24px rgba(90,45,92,.18);zoom:1.6}
}
@media screen and (max-width:640px){.page{zoom:1}}
@media print{.toolbar{display:none}}
`;

function toolbar(salon: string, slug: string, size: CardSize): string {
  const other = size === "card" ? "a6" : "card";
  const what =
    size === "card"
      ? `Визитка «${escapeHtml(salon)}»: страница 1 — сторона с QR салона, страница 2 — общая сторона с ценами.`
      : `Табличка A6 на стойку «${escapeHtml(salon)}».`;
  return `<div class="toolbar">
  <button type="button" onclick="window.print()">Печать или PDF</button>
  ${what} Размер уже выставлен, с вылетами 3 мм. Лучше в Chrome: ⌘P → «Сохранить как PDF».
  Код ведёт на ${escapeHtml(partnerLinkShown(slug))}.
  <a href="${escapeHtml(partnerCardPath(slug, other))}">${other === "a6" ? "Табличка A6 →" : "Визитка →"}</a>
</div>`;
}

function document(title: string, css: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(title)}</title>${FONTS}<style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;
}

/**
 * A long name gets smaller type rather than a third line: the card is 55 mm
 * tall and everything under the name has to stay inside the stitched line.
 */
export function salonSizeClass(salon: string): string {
  return salon.length > 44 ? " salon-xs" : salon.length > 30 ? " salon-sm" : "";
}

export function businessCardHtml(args: { salon: string; slug: string; url: string; offer: CardOffer; toolbar?: boolean }): string {
  const salon = escapeHtml(args.salon);
  const phone = phoneAsSaid();
  const css = `
@page{size:91mm 61mm;margin:0}
.page{width:91mm;height:61mm}
.trim{width:85mm;height:55mm}
.front{background:${LAVENDER}}
.back{background:${CREAM}}
.qr{position:absolute;left:6.2mm;top:13mm;width:29mm;height:29mm;filter:drop-shadow(0 .3mm .6mm rgba(90,45,92,.12))}
.copy{position:absolute;left:39.5mm;top:8.6mm;right:5.6mm}
.kicker{font-size:5.2pt;letter-spacing:.22em;text-transform:uppercase;color:#7a6d8a}
.salon{font-size:10.5pt;color:${PLUM};margin-top:.8mm;line-height:1.15}
.salon-sm{font-size:9pt}
.salon-xs{font-size:7.6pt}
.rule{width:9mm;height:.3mm;background:${GOLD};margin:2.2mm 0 1.6mm}
.offer{font-style:italic;font-size:21pt;color:${PLUM};line-height:1}
.offer-sub{font-size:6.7pt;line-height:1.35;margin-top:1.2mm}
.how{font-size:5.6pt;line-height:1.4;color:#6b6b6b;margin-top:3mm}
.cut{position:absolute;width:3.4mm;height:3.4mm;left:7mm;bottom:2.05mm;background:${LAVENDER};padding:.3mm}
.logo{position:absolute;left:50%;top:5.6mm;width:25mm;transform:translateX(-50%)}
.backcopy{position:absolute;left:5mm;right:5mm;top:27.4mm;text-align:center}
.line{font-size:6.6pt;letter-spacing:.14em;text-transform:uppercase;color:${PLUM}}
.prices{font-size:6.3pt;line-height:1.5;margin-top:1.4mm}
.pill{display:inline-block;margin-top:1.7mm;padding:.75mm 2.6mm;border-radius:9mm;background:${LAVENDER};color:${PLUM};font-size:5.9pt;font-weight:500}
.foot{font-size:6.1pt;margin-top:1.8mm;color:${INK};letter-spacing:.02em}
`;
  const body = `${args.toolbar ? toolbar(args.salon, args.slug, "card") : ""}
<div class="page front"><div class="trim">
  ${stitch(85, 55, 2.6, 2.4)}
  <div class="qr">${qrSvg(args.url, 29)}</div>
  <div class="copy">
    <p class="sans kicker">Recommended by</p>
    <p class="serif salon${salonSizeClass(args.salon)}">${salon}</p>
    <div class="rule"></div>
    <p class="serif offer">${escapeHtml(args.offer.discount)} off</p>
    <p class="sans offer-sub">your first alteration<br>at Beautasy Atelier</p>
    <p class="sans how">Scan to book — or WhatsApp<br>${phone} and say who sent you.</p>
  </div>
  <div class="cut">${SCISSORS}</div>
</div></div>
<div class="page back"><div class="trim">
  ${stitch(85, 55, 2.6, 2.4)}
  <img class="logo" src="${CARD_LOGO}" alt="Beautasy Atelier">
  <div class="backcopy">
    <p class="sans line">Alterations &amp; repairs · Southampton</p>
    <p class="sans prices">Jeans hem £15.50 · Dresses from £15 · Zips from £14<br>Curtains from £20 a panel · Wedding &amp; prom</p>
    ${args.offer.collection ? `<span class="sans pill">${escapeHtml(args.offer.collection)}</span>` : ""}
    <p class="sans foot">beautasy.co.uk/atelier · ${phone}</p>
  </div>
</div></div>`;
  return document(`Визитка — ${args.salon}`, css, body);
}

export function counterCardHtml(args: { salon: string; slug: string; url: string; offer: CardOffer; toolbar?: boolean }): string {
  const salon = escapeHtml(args.salon);
  const phone = phoneAsSaid();
  const css = `
@page{size:111mm 154mm;margin:0}
.page{width:111mm;height:154mm;background:${LAVENDER}}
.trim{width:105mm;height:148mm}
.logo{position:absolute;left:50%;top:7.5mm;width:33mm;transform:translateX(-50%)}
.head{position:absolute;left:8mm;right:8mm;top:36.5mm;text-align:center}
.h1{font-style:italic;font-size:18pt;line-height:1.14;color:${PLUM}}
.sub{font-size:8.2pt;line-height:1.45;margin-top:2.2mm}
.box{position:absolute;left:11mm;right:11mm;top:66mm;height:58mm;background:#fff;border-radius:5mm;box-shadow:0 .5mm 2mm rgba(90,45,92,.10)}
.box .kicker{position:absolute;left:0;right:0;top:4.4mm;text-align:center;font-size:6.4pt;letter-spacing:.22em;text-transform:uppercase;color:#7a6d8a}
.box .salon{position:absolute;left:3mm;right:3mm;top:8.2mm;text-align:center;font-size:12pt;line-height:1.12;color:${PLUM}}
.box .salon-sm{font-size:10pt}
.box .salon-xs{font-size:8.5pt}
.box .qr{position:absolute;left:4mm;top:17.5mm;width:37mm;height:37mm}
.box .offer{position:absolute;left:44.5mm;right:3mm;top:22mm}
.offer .big{font-style:italic;font-size:24pt;color:${PLUM};line-height:1}
.offer .small{font-size:8pt;line-height:1.4;margin-top:1.6mm}
.offer .scan{font-size:7.4pt;font-weight:600;color:${PLUM};margin-top:4mm;letter-spacing:.06em;text-transform:uppercase}
.foot{position:absolute;left:7mm;right:7mm;top:128.5mm;text-align:center;font-size:7.4pt;line-height:1.6}
.foot b{color:${PLUM};font-weight:600}
`;
  const body = `${args.toolbar ? toolbar(args.salon, args.slug, "a6") : ""}
<div class="page"><div class="trim">
  ${stitch(105, 148, 3.4, 4)}
  <img class="logo" src="${CARD_LOGO}" alt="Beautasy Atelier">
  <div class="head">
    <p class="serif h1">Too long, too loose,<br>or a broken zip?</p>
    <p class="sans sub">Clothes and curtains, altered and repaired by Kristina<br>in Southampton. Pinned on you, priced before she starts.</p>
  </div>
  <div class="box">
    <p class="sans kicker">Recommended by</p>
    <p class="serif salon${salonSizeClass(args.salon)}">${salon}</p>
    <div class="qr">${qrSvg(args.url, 37)}</div>
    <div class="offer">
      <p class="serif big">${escapeHtml(args.offer.discount)} off</p>
      <p class="sans small">your first alteration<br>at Beautasy Atelier</p>
      <p class="sans scan">Scan to book →</p>
    </div>
  </div>
  <p class="sans foot">${args.offer.collection ? `<b>${escapeHtml(args.offer.collection)}</b><br>` : ""}Jeans hem £15.50 · Dresses from £15 · Zips from £14<br>WhatsApp ${phone} · beautasy.co.uk/atelier</p>
</div></div>`;
  return document(`Табличка A6 — ${args.salon}`, css, body);
}

export function partnerCardHtml(args: {
  salon: string;
  slug: string;
  url: string;
  size: CardSize;
  offer: CardOffer;
  toolbar?: boolean;
}): string {
  return args.size === "a6" ? counterCardHtml(args) : businessCardHtml(args);
}

/** What the card page shows for a link that is paused or gone — in Kristina's words, she is the one opening it. */
export function cardUnavailableHtml(message: string): string {
  return document(
    "Карточка недоступна",
    "html,body{background:#ece6f5}body{font:16px/1.6 Inter,system-ui,sans-serif;color:#4A4A4A;padding:48px 24px;max-width:560px;margin:0 auto}",
    `<p>${escapeHtml(message)}</p>`
  );
}
