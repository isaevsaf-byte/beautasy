import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { partnerStatement } from "@/lib/partners";
import { businessCardHtml, cardUnavailableHtml, counterCardHtml, phoneAsSaid, salonSizeClass } from "@/lib/partnerCard";
import {
  PartnerFormView,
  PartnerListView,
  StatementView,
  blankPartnerForm,
  editForm,
  partnerPayload,
  totalsText,
} from "./PartnersPane";
import { AttributionFormView, type AttributionLoad } from "./partnerAction";
import type { PartnerDetails } from "./partnersClient";

/**
 * «Партнёры» in the Studio and on the site: who may reach it, what she sees,
 * what a salon's client lands on, and the card that gets printed. The rules
 * are in src/lib/partners.test.ts, the storage in partnerStore.test.ts, the
 * rewarding in referralSettle.test.ts and the QR in qrSvg.test.ts.
 */

const ROOT = process.cwd();
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), "utf8");
const ROUTE = read("src", "app", "api", "studio", "partners", "route.ts");
const STORE = read("src", "lib", "partnerStore.ts");
const REFERRALS = read("src", "lib", "referrals.ts");
const STRUCTURE = read("src", "sanity", "structure.ts");
const CONFIG = read("sanity.config.ts");
const MANUAL = read("src", "sanity", "ManualBookingPane.tsx");
const LANDING = read("src", "app", "p", "[slug]", "page.tsx");
const CARD_ROUTE = read("src", "app", "p", "[slug]", "card", "route.ts");
const CRON = read("src", "app", "api", "cron", "daily", "route.ts");
const NOTIFY = read("src", "app", "api", "notify", "route.ts");

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

/* ─── Who gets in ─── */

test("only a member of the project reaches partners, before anything is read or written", () => {
  const handler = ROUTE.slice(ROUTE.indexOf("export async function POST"));
  const site = handler.indexOf("if (!fromThisSite(req))");
  const limit = handler.indexOf("rateLimit(");
  const member = handler.indexOf("await isProjectMember(token)");
  const keys = handler.indexOf("secretsConfigured()");
  const firstTouch = Math.min(
    ...["listPartners(", "readPartnerActivity(", "createPartner(", "updatePartner(", "findPartnerById(", "attributeBooking(", "attributionOf("]
      .map((call) => handler.indexOf(call))
      .filter((at) => at !== -1)
  );
  assert.ok(site !== -1 && limit !== -1 && member !== -1 && keys !== -1);
  assert.ok(site < limit && limit < member && member < keys && keys < firstTouch, "site, then limit, then member, then keys, then data");
});

test("a partner's terms reach the Studio opened by the server, never read off the document", () => {
  // They are sealed in the dataset; read straight off it they would be empty
  // and every statement would owe the salon nothing
  assert.match(ROUTE, /const terms = partnerTerms\(doc\);\s*return \{/, "the list and the form");
  assert.match(ROUTE, /commissionPercent: partnerTerms\(p\)\.commissionPercent/, "each month in the list");
  assert.match(ROUTE, /partner: \{ name: doc\.partner\.name, slug: doc\.partner\.slug, \.\.\.terms \}/, "the note for WhatsApp");
  assert.doesNotMatch(ROUTE, /\.partner\.(commissionPercent|contactName)/);
});

test("a partner's link never changes once made: it is printed on cards", () => {
  const update = STORE.slice(STORE.indexOf("export async function updatePartner"), STORE.indexOf("export async function listPartners"));
  assert.equal(update.includes('"partner.slug"'), false, "the update must not touch the link");
  assert.match(STORE, /_id: partnerIdFor\(input\.slug\)/);
  assert.match(STORE, /statusCode === 409\) return \{ outcome: "taken" \}/, "a taken link is refused, not overwritten");
});

test("a partner plays by the Friends rules, with a business's allowance, and is greeted by its owner's name", () => {
  assert.match(REFERRALS, /settings: settingsForReferrer\(args\.settings, args\.referrer\),/);
  // The owner's name is sealed on the document, so it is opened to greet her
  assert.match(REFERRALS, /referrerName: partnerContactName\(referrer\.partner\) \?\? referrer\.displayName,/);
  assert.match(REFERRALS, /return open\(partner\.contactNameSealed\) \?\? partner\.contactName \?\? undefined;/);
  assert.match(REFERRALS, /REFERRER_FIELDS = `[^`]*, source, partner`/);
});

test("putting a client down to a partner refuses what would pay twice", () => {
  const attribute = STORE.slice(STORE.indexOf("export async function attributeBooking"));
  const decided = attribute.indexOf("await rewardDecided(booking)");
  const friend = attribute.indexOf("current && !isPartner(current)");
  const write = attribute.indexOf("sanityWriteClient\n      .patch(booking._id)");
  assert.ok(decided !== -1 && friend !== -1 && write !== -1);
  assert.ok(decided < write && friend < write, "both refusals come before any write");
  assert.equal(
    (attribute.match(/\.ifRevisionId\(booking\._rev \?\? ""\)/g) ?? []).length,
    2,
    "a booking changed meanwhile is not written over — neither when a partner is set nor when one is taken off"
  );
  assert.match(attribute, /partner\.active === false/, "a paused partner is not given clients");
  const refusal = attribute.indexOf('if (verdict !== "ok") {');
  const setWrite = attribute.indexOf("let patch = sanityWriteClient");
  assert.ok(refusal !== -1 && setWrite !== -1 && refusal < setWrite, "a client the rules turn away is not written onto the booking at all");
});

test("a salon is credited by its own link in the email, and is not counted as a friend on the Dashboard", () => {
  assert.match(REFERRALS, /args\.partnerSlug \? partnerBlockHtml\(args\.partnerSlug, args\.settings\) : friendsBlockHtml\(args\.code, args\.settings\)/);
  assert.match(REFERRALS, /partnerSlug: referrer\.partner\?\.slug,/);
  assert.match(read("src", "lib", "studioStats.ts"), /_type == "referrer" && !\(_id in path\("drafts\.\*\*"\)\) && active == true && !defined\(partner\)/);
});

test("finished work credits whoever sent the client every morning and on the Studio's button", () => {
  const settled = CRON.slice(CRON.indexOf("Promise.allSettled(["), CRON.indexOf("]);", CRON.indexOf("Promise.allSettled([")));
  assert.match(settled, /settleReferredBookings\(\),/);
  assert.equal((CRON.match(/settleReferredBookings\(/g) ?? []).length, 1, "called once, inside allSettled");
  assert.match(CRON, /ledgerExport,\n\s+referrals,\n\s+\] = results\.map/, "read back in its own place");
  assert.match(NOTIFY, /const referrals = await settleReferredBookings\(10\)\.catch/);
  assert.ok(NOTIFY.indexOf("settleReferredBookings(10)") > NOTIFY.indexOf("sendPendingBookingEmails(10)"), "after the thank-you emails");
});

/* ─── The Studio ─── */

test("«Партнёры» is in the sidebar, and a partner's link is kept out of the friends' list", () => {
  assert.match(STRUCTURE, /\.id\("partners"\)\s*\.title\("Партнёры"\)\s*\.child\(S\.component\(PartnersPane\)/);
  assert.match(STRUCTURE, /\.filter\('_type == "referrer" && !defined\(partner\)'\)/);
  assert.match(CONFIG, /recordPaymentAction,\s*partnerAttributionAction,/);
});

test("the form fills in the link and the percentage until she takes them over", () => {
  let form = editForm(blankPartnerForm(), { name: "Onyx Bridal" });
  assert.equal(form.slug, "onyx-bridal");
  form = editForm(form, { kind: "bridal" });
  assert.equal(form.commission, "10", "a bridal salon starts at ten per cent");
  form = editForm(form, { slug: "onyx", slugTouched: true });
  form = editForm(form, { name: "Onyx Bridal Southampton" });
  assert.equal(form.slug, "onyx", "a link she typed is not rewritten");
  form = editForm(form, { commission: "12", commissionTouched: true });
  form = editForm(form, { kind: "salon" });
  assert.equal(form.commission, "12", "a percentage she typed is not reset");
  assert.deepEqual(partnerPayload(form), {
    name: "Onyx Bridal Southampton",
    slug: "onyx",
    kind: "salon",
    commissionPercent: "12",
    contactName: "",
    email: "",
    phone: "",
    active: true,
  });
});

test("a new partner's form shows the link it will print, and will not save what the server would refuse", () => {
  const noop = () => undefined;
  const good = html(
    createElement(PartnerFormView, {
      form: editForm(blankPartnerForm(), { name: "The Hair Lounge" }),
      busy: false,
      error: null,
      onChange: noop,
      onSave: noop,
      onCancel: noop,
    })
  );
  assert.match(good, /Будет: <strong>beautasy\.co\.uk\/p\/the-hair-lounge<\/strong>/);
  assert.match(good, /<button type="button"[^>]*>Создать партнёра<\/button>/);
  assert.equal(/disabled=""[^>]*>Создать партнёра/.test(good), false);

  const bad = html(
    createElement(PartnerFormView, {
      form: { ...editForm(blankPartnerForm(), { name: "The Hair Lounge" }), email: "emma@" },
      busy: false,
      error: null,
      onChange: noop,
      onSave: noop,
      onCancel: noop,
    })
  );
  assert.match(bad, /Эл\. почта выглядит неправильно/);
  assert.match(bad, /disabled=""[^>]*>Создать партнёра/);
});

const STATEMENT = partnerStatement({
  month: "2026-10",
  commissionPercent: 10,
  bookings: [
    { id: "b1", name: "Sarah", service: "Wedding Dress Alterations", status: "completed", createdAt: "2026-10-03T10:00:00Z", payments: [{ date: "2026-10-06", kind: "income", amount: 12000, method: "card" }] },
    { id: "b2", name: "Mia", service: "Alterations", status: "confirmed", createdAt: "2026-10-09T10:00:00Z", payments: [] },
  ],
  orders: [],
  rewards: [{ bookingId: "b1", outcome: "rewarded", reward: 500, createdAt: "2026-10-06T18:00:00Z" }],
});

function details(over: Partial<PartnerDetails["partner"]> = {}): PartnerDetails {
  return {
    month: "2026-10",
    thisMonth: "2026-10",
    partner: {
      id: "referrer-partner-onyx-bridal",
      name: "Onyx Bridal",
      slug: "onyx-bridal",
      kind: "bridal",
      commissionPercent: 10,
      contactName: "Emma",
      active: true,
      link: "https://www.beautasy.co.uk/p/onyx-bridal",
      email: "emma@onyx.co.uk",
      phone: "07700 900123",
      ...over,
    },
    statement: STATEMENT,
    credit: { balance: 500, expiresAt: "2027-10-06T18:00:00.000Z", code: "BEAU-TY12-3456" },
    report: "Hi Emma! 💜 …",
  };
}

test("a partner's month reads as a statement: who, what, paid, and the credit", () => {
  const out = html(createElement(StatementView, { details: details(), onMonth: () => undefined, onEdit: () => undefined }));
  assert.match(out, /Новых клиенток: 2 · Оплатили: £120\.00 · Кредит салону: £5\.00 · Комиссия 10%: £12\.00/);
  assert.match(out, /Sarah<\/td>/);
  assert.match(out, /✓ начислен/);
  assert.match(out, /после «Выполнена»/, "Mia's credit waits for her work to be done");
  assert.match(out, /href="\/p\/onyx-bridal\/card"/);
  assert.match(out, /href="\/p\/onyx-bridal\/card\?size=a6"/);
  assert.match(out, /href="https:\/\/wa\.me\/447700900123\?text=/);
  assert.equal(out.includes("BEAU-TY12-3456"), false, "the credit code waits behind «Показать код»");
  assert.match(out, /Показать код/);
  assert.match(out, /aria-label="Следующий месяц" disabled=""/, "no months from the future");

  const noPhone = html(createElement(StatementView, { details: details({ phone: null }), onMonth: () => undefined, onEdit: () => undefined }));
  assert.equal(noPhone.includes("wa.me"), false, "no WhatsApp button without a number");
});

test("the list opens on what a partner is, when there are none yet", () => {
  const out = html(
    createElement(PartnerListView, {
      rows: [],
      offer: { enabled: true, discount: 700, credit: 300 },
      month: "2026-10",
      thisMonth: "2026-10",
      onMonth: () => undefined,
      onOpen: () => undefined,
      onNew: () => undefined,
    })
  );
  assert.match(out, /Партнёров пока нет/);
  assert.match(out, /клиентке — £7 на первую подгонку, салону —\s*£3 кредита/, "the amounts are the settings', not a printed £5");
  const off = html(
    createElement(PartnerListView, {
      rows: [],
      offer: { enabled: false, discount: 500, credit: 500 },
      month: "2026-10",
      thisMonth: "2026-10",
      onMonth: () => undefined,
      onOpen: () => undefined,
      onNew: () => undefined,
    })
  );
  assert.match(off, /«Beautasy Friends» выключена/);
  assert.match(out, /\+ Новый партнёр/);
  assert.equal(totalsText(STATEMENT.totals, 0).includes("Комиссия"), false, "no commission line for a partner without one");
});

test("«Кто прислал» says why it cannot, when it cannot", () => {
  const view = (load: AttributionLoad, choice = "") =>
    html(
      createElement(AttributionFormView, {
        load,
        choice,
        busy: false,
        error: null,
        onChoice: () => undefined,
        onSave: () => undefined,
        onClose: () => undefined,
      })
    );
  const base = { partnerId: null, referredBy: null, friendLink: false, decided: false, status: "confirmed" };
  const offer = { enabled: true, discount: 500, credit: 500 };
  const options = [
    { id: "referrer-partner-onyx-bridal", name: "Onyx Bridal", kind: "bridal", active: true },
    { id: "referrer-partner-old", name: "Old Salon", kind: "salon", active: false },
  ];
  assert.match(view({ state: "ready", attribution: { ...base, friendLink: true, referredBy: "Anna" }, options, offer }), /по ссылке друга \(Anna\)/);
  assert.match(view({ state: "ready", attribution: { ...base, decided: true }, options, offer }), /уже решён/);
  assert.match(view({ state: "ready", attribution: base, options: [], offer }), /Партнёров пока нет/);
  const picker = view({ state: "ready", attribution: base, options, offer }, "referrer-partner-onyx-bridal");
  assert.match(picker, /Засчитывается только новая клиентка/);
  assert.match(view({ state: "ready", attribution: base, options, offer: { ...offer, enabled: false } }), /сейчас клиентку салону не засчитать/);
  assert.match(picker, /<option value="referrer-partner-onyx-bridal"[^>]*>Onyx Bridal<\/option>/);
  assert.match(picker, /<option value="referrer-partner-old" disabled="">Old Salon \(на паузе\)<\/option>/);
  assert.match(view({ state: "ready", attribution: base, options, offer }, ""), /disabled=""[^>]*>Сохранить/, "nothing chosen, nothing to save");
});

test("a booking made by hand can be put down to a partner on the spot, and a failure says what to do", () => {
  const book = MANUAL.slice(MANUAL.indexOf("async function book()"), MANUAL.indexOf("function startAgain()"));
  assert.match(book, /askPartners\(token, \{ action: "attribute", bookingId: String\(reply\.data\.id\), partnerId \}\)/);
  assert.ok(book.indexOf('action: "attribute"') > book.indexOf('askDiary(token, { action: "book"'), "the booking is made first");
  assert.match(book, /Запись создана — откройте её и нажмите «🤝 Кто прислал»/);
  // The button comes back only after both steps, or a second click books the held time again
  const busyOff = [...book.matchAll(/setBusy\(false\);/g)].map((m) => m.index ?? -1);
  assert.equal(busyOff.length, 2, "the button comes back in two places only: a failed booking, and the end");
  assert.ok(book.indexOf("if (!reply.ok) {") < busyOff[0] && busyOff[0] < book.indexOf("let partnerNote"), "early only when the booking failed");
  assert.ok(busyOff[1] > book.indexOf('action: "attribute"'), "otherwise busy until the salon is put down");
});

/* ─── On the site ─── */

test("a salon's page is not indexed, and sets the £5 only when the link is live", () => {
  assert.match(LANDING, /robots: \{ index: false, follow: true \}/);
  assert.match(LANDING, /const partnerFor = cache\(/, "one lookup per view, shared by the page and its metadata");
  assert.match(LANDING, /\{live && code && <RememberReferral code=\{code\} \/>\}/);
  assert.match(LANDING, /const live = settings\.enabled && !!partner && partner\.active !== false && !!code;/);
  assert.match(LANDING, /whatsappLink\(live \? partnerWhatsappText\(name\) : "Hi Kristina! I'd love to ask about an alteration\."\)/, "a dead link names no salon");
});

test("the card page is kept out of search, and a paused partner's card is not printed", () => {
  assert.match(CARD_ROUTE, /"x-robots-tag": "noindex, nofollow"/);
  assert.match(CARD_ROUTE, /if \(partner\.active === false\)/);
});

test("the card prints at its real size, with the salon's name as text and its link in the code", () => {
  const offer = { discount: "£5", collection: "Free collection & return in Southampton from £40" };
  const card = businessCardHtml({ salon: 'Rose & Thorn <b>"Bridal"</b>', slug: "rose-and-thorn", url: "https://www.beautasy.co.uk/p/rose-and-thorn", offer, toolbar: true });
  assert.match(card, /@page\{size:91mm 61mm;margin:0\}/);
  assert.match(card, /Rose &amp; Thorn &lt;b&gt;&quot;Bridal&quot;&lt;\/b&gt;/);
  assert.equal(card.includes("<b>\"Bridal\"</b>"), false, "a name is text, never markup");
  assert.match(card, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+" width="29mm"/);
  assert.match(card, /@media print\{\.toolbar\{display:none\}\}/);
  assert.match(card, /print-color-adjust:exact/, "the lavender prints without ticking «Фон»");
  assert.match(card, /WhatsApp<br>07729 741116 and say who sent you/);

  const a6 = counterCardHtml({ salon: "Onyx Bridal", slug: "onyx-bridal", url: "https://www.beautasy.co.uk/p/onyx-bridal", offer });
  assert.match(a6, /@page\{size:111mm 154mm;margin:0\}/);
  assert.equal(a6.includes('class="toolbar"'), false);
  assert.equal(phoneAsSaid("+44 7729 741116"), "07729 741116");
  // A long name gets smaller type, not a third line over the stitching
  assert.equal(salonSizeClass("Onyx Bridal"), "");
  assert.equal(salonSizeClass("Rose & Thorn Bridal Boutique Shirley"), " salon-sm");
  assert.equal(salonSizeClass("x".repeat(60)), " salon-xs");
  assert.match(businessCardHtml({ salon: "x".repeat(60), slug: "x", url: "https://www.beautasy.co.uk/p/x", offer }), /class="serif salon salon-xs"/);
  // The offer is the settings': a card printed after a change promises the new one, and no collection when it is off
  const changed = businessCardHtml({ salon: "Onyx", slug: "onyx", url: "https://www.beautasy.co.uk/p/onyx", offer: { discount: "£7.50", collection: null } });
  assert.match(changed, /<p class="serif offer">£7\.50 off<\/p>/);
  assert.equal(changed.includes("collection"), false);
  assert.match(CARD_ROUTE, /friendAtelierDiscount <= 0/);
  assert.match(CARD_ROUTE, /if \(!settings\.enabled\)/);
  assert.match(cardUnavailableHtml("<script>"), /&lt;script&gt;/);
});
