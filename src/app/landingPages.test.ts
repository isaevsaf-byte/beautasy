import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault, type ImageConfigComplete } from "next/dist/shared/lib/image-config";
import nextConfig from "../../next.config";
import { sanityClient } from "../lib/sanity";
import { CAMPAIGN_HOOK, LOCAL_SERVICES } from "../lib/localServices";
import { lowestPrice } from "../lib/siteCopy";
import { BUSINESS, BY_APPOINTMENT } from "../lib/business";
import { bookBarShown } from "../components/StickyBookBar";
import ServicePage, { generateMetadata as serviceMetadata } from "./alterations/[slug]/page";
import AlterationsHub, { metadata as hubMetadata } from "./alterations/page";
import AtelierPage from "./atelier/page";
import { metadata as atelierMetadata } from "./atelier/layout";
import HomePage from "./page";

/**
 * The pages people land on — the home page, /atelier, /alterations and each
 * service page — rendered whole, as a visitor gets them, with Sanity's
 * answers made up here: Kristina's photo or none, and nothing else.
 */

const PORTRAIT = { asset: { _ref: "image-a1b2c3d4e5f6-3024x4032-jpg" }, alt: "Kristina smiling in her workroom" };

/** Sanity as the pages see it: the photo when there is one, and nothing else stocked or written */
function stubSanity(t: TestContext, { photo }: { photo: boolean }) {
  t.mock.method(console, "error", () => {});
  t.mock.method(sanityClient, "fetch", async (query: string) =>
    query.includes("meetKristina") ? (photo ? { photo: PORTRAIT, atWork: null, text: null } : null) : null
  );
}

async function html(page: ReactNode | Promise<ReactNode>): Promise<string> {
  const config = { ...imageConfigDefault, ...nextConfig.images } as ImageConfigComplete;
  const { prelude } = await prerenderToNodeStream(
    createElement(ImageConfigContext.Provider, { value: config }, await page)
  );
  let out = "";
  for await (const chunk of prelude) out += chunk;
  return out;
}

const service = (slug: string) => ServicePage({ params: Promise.resolve({ slug }) });
const pages = () => [
  ["home", HomePage()],
  ["/atelier", AtelierPage()],
  ["/alterations", AlterationsHub()],
  ...LOCAL_SERVICES.map((s) => [`/alterations/${s.slug}`, service(s.slug)] as const),
] as const;

const decode = (text: string) =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
/** What a visitor reads: no scripts, no tags */
const visible = (page: string) =>
  decode(page.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const anchors = (page: string) =>
  [...page.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
    href: decode(/href="([^"]*)"/.exec(attrs)?.[1] ?? ""),
    attrs,
    text: visible(inner).trim(),
  }));

/* ─── Meet Kristina ─── */

test("Meet Kristina is on the home page, /atelier, /alterations and every service page once there is a photo", async (t) => {
  stubSanity(t, { photo: true });
  for (const [name, page] of pages()) {
    const out = await html(page);
    assert.equal(out.match(/<h2 id="meet-kristina"/g)?.length, 1, `${name}: once`);
    assert.match(out, /<img alt="Kristina smiling in her workroom"/, name);
    assert.ok(visible(out).includes("Hi, I'm Kristina."), `${name}: the default words`);
  }
});

test("each page asks for her photo at the width its column really draws it", async (t) => {
  stubSanity(t, { photo: true });
  // Tailwind's max-w-4xl and max-w-6xl; px-6 inside, and gap-14 between the photo and the words
  const COLUMN = { "4xl": 896, "6xl": 1152 } as const;
  for (const [name, page] of pages()) {
    const out = await html(page);
    const open = /<section aria-labelledby="meet-kristina"[^>]*>/.exec(out);
    assert.ok(open, name);
    const column = [...out.slice(0, open.index + open[0].length).matchAll(/max-w-(4xl|6xl)/g)].pop()?.[1] as keyof typeof COLUMN;
    assert.ok(column, `${name}: the block sits in a column`);
    const drawn = (COLUMN[column] - 48 - 56) / 2;
    const sizes = /<img alt="Kristina smiling in her workroom"[^>]*sizes="([^"]+)"/.exec(out)?.[1] ?? "";
    assert.ok(sizes.startsWith(`(min-width: ${COLUMN[column]}px) ${drawn}px,`), `${name}: "${sizes}" in a ${column} column`);
  }
});

test("…and nowhere at all before there is one", async (t) => {
  stubSanity(t, { photo: false });
  for (const [name, page] of pages()) {
    const out = await html(page);
    assert.doesNotMatch(out, /meet-kristina|Meet Kristina|Hi, I'm Kristina/, name);
  }
});

test("each page puts her where she belongs: after the atelier, and before the booking form", async (t) => {
  stubSanity(t, { photo: true });
  const at = (out: string, marker: string) => {
    const index = out.indexOf(marker);
    assert.ok(index > -1, `"${marker}" is on the page`);
    return index;
  };

  const home = await html(HomePage());
  assert.ok(at(home, "Local Services") < at(home, 'id="meet-kristina"'), "home: after the atelier section");
  assert.ok(at(home, 'id="meet-kristina"') < at(home, "Browse the Shelves"), "home: before the shop");

  const atelier = await html(AtelierPage());
  assert.ok(at(atelier, "How It Works") < at(atelier, 'id="meet-kristina"'));
  assert.ok(at(atelier, 'id="meet-kristina"') < at(atelier, 'id="book"'));

  for (const s of LOCAL_SERVICES) {
    const out = await html(service(s.slug));
    assert.ok(at(out, "Questions people ask") < at(out, 'id="meet-kristina"'), s.slug);
    assert.ok(at(out, 'id="meet-kristina"') < at(out, 'id="book"'), `${s.slug}: just before the form`);
    // Its button goes to the form on the same page, which knows the job
    const block = out.slice(at(out, 'id="meet-kristina"'), at(out, 'id="book"'));
    assert.ok(anchors(block).some((a) => a.href === "#book" && a.text === "Choose a time"), s.slug);
  }
});

/* ─── NAV-2: on a phone, the price and the button straight under the heading ─── */

test("on every service page the price and 'Choose a time' come straight after the heading", async (t) => {
  stubSanity(t, { photo: false });
  for (const s of LOCAL_SERVICES) {
    const out = await html(service(s.slug));
    const afterHeading = out.slice(out.indexOf("</h1>"));
    const button = afterHeading.indexOf('id="service-hero-book"');
    assert.ok(button > -1, `${s.slug}: the hero's booking button`);
    // Between the heading and the button: the price line and nothing else
    assert.equal(
      visible(afterHeading.slice(0, afterHeading.lastIndexOf("<a", button))).trim(),
      `From ${lowestPrice(s.prices)} · see every price`,
      s.slug
    );
    const hero = anchors(afterHeading).find((a) => a.attrs.includes('id="service-hero-book"'));
    assert.deepEqual([hero?.href, hero?.text], ["#book", "Choose a time"], s.slug);
    // The intro, the banner and the campaign box all come after it
    assert.ok(afterHeading.indexOf(s.intro[0].slice(0, 30)) > button, `${s.slug}: the intro is below`);
    assert.match(out, /<section id="prices"/, "the price line's link has somewhere to land");
  }
});

test("the 'from' price on a service page is the cheapest line of its own list", () => {
  for (const s of LOCAL_SERVICES) {
    const from = lowestPrice(s.prices);
    assert.ok(from, s.slug);
    assert.ok(s.prices.some((line) => line.price.includes(from)), `${s.slug}: ${from} is on its list`);
  }
});

test("every service page keeps a booking bar on the phone, as /atelier does", async (t) => {
  stubSanity(t, { photo: false });
  const bars: [string, string][] = [["/atelier", await html(AtelierPage())]];
  for (const s of LOCAL_SERVICES) bars.push([s.slug, await html(service(s.slug))]);
  for (const [name, out] of bars) {
    const bar = /<div inert="" class="md:hidden fixed bottom-0[^"]*translate-y-full"[^>]*>([\s\S]*?)<\/div>/.exec(out);
    assert.ok(bar, `${name}: the bar is there, hidden until the first button scrolls away`);
    const links = anchors(bar[1]);
    assert.deepEqual([links[0]?.href, links[0]?.text], ["#book", "Choose a time"], name);
    assert.ok(links[1]?.href.startsWith(`https://wa.me/${BUSINESS.whatsappNumber}`), `${name}: and WhatsApp`);
    assert.match(links[1]?.attrs ?? "", /aria-label="Send Kristina a photo on WhatsApp"/);
  }
  // The bar watches the button that is really there
  for (const file of ["src/app/atelier/AtelierContent.tsx", "src/app/alterations/[slug]/page.tsx"]) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    assert.match(source, /id=\{HERO_BOOK_ID\}/, file);
    assert.match(source, /<StickyBookBar heroId=\{HERO_BOOK_ID\}/, file);
  }
});

test("the booking bar shows only between the first button and the form", () => {
  const screen = 800;
  assert.equal(bookBarShown({ heroBottom: 300, bookTop: 4000, viewportHeight: screen }), false, "the button is still on screen");
  assert.equal(bookBarShown({ heroBottom: -10, bookTop: 4000, viewportHeight: screen }), true, "scrolled past it, form far below");
  assert.equal(bookBarShown({ heroBottom: -3000, bookTop: 600, viewportHeight: screen }), false, "the form is on screen");
  assert.equal(bookBarShown({ heroBottom: -5000, bookTop: -900, viewportHeight: screen }), false, "past the form, at the footer");
});

test("/alterations has a WhatsApp button beside 'Choose a time'", async (t) => {
  stubSanity(t, { photo: false });
  const out = await html(AlterationsHub());
  const hero = anchors(out.slice(out.indexOf("</h1>"), out.indexOf("What we alter")));
  assert.deepEqual(
    hero.map((a) => a.text),
    ["Choose a time", "Send a photo on WhatsApp", BUSINESS.telephone]
  );
  assert.ok(hero[1].href.startsWith(`https://wa.me/${BUSINESS.whatsappNumber}?text=`));
  assert.match(hero[1].attrs, /target="_blank" rel="noopener noreferrer"/);
});

/* ─── NAV-3: no page invites anyone to drop in ─── */

// "Bring it in" too: with no address on the page it can only mean turning up.
// "Can't bring it in?" stays — it is /atelier offering Collect & return.
const WALK_IN =
  /drop by|drop in|drop-in|drop it off|(?<!can't )bring (?:it|them) (?:in|and)\b|walk[- ]?ins?\b|no appointment|pop in|pop by|without an appointment/i;

test("no landing page, and nothing they tell Google, invites a walk-in", async (t) => {
  stubSanity(t, { photo: true });
  for (const [name, page] of pages()) {
    // The whole page, structured data included: the FAQ answers go to Google
    assert.doesNotMatch(decode(await html(page)), WALK_IN, name);
  }
  for (const s of LOCAL_SERVICES) {
    for (const text of [...s.intro, ...s.steps.flatMap((step) => [step.title, step.text]), ...s.faqs.flatMap((f) => [f.q, f.a])]) {
      assert.doesNotMatch(text, WALK_IN, `${s.slug}: "${text}"`);
    }
  }
  // The campaign's promise is on every service page, /alterations and /work
  assert.doesNotMatch(`${CAMPAIGN_HOOK.title} ${CAMPAIGN_HOOK.body}`, WALK_IN);
});

test("instead they say a visit is by appointment, with the address sent before it", async (t) => {
  stubSanity(t, { photo: false });
  assert.ok(visible(await html(AtelierPage())).includes(BY_APPOINTMENT), "/atelier");
  for (const s of LOCAL_SERVICES) {
    const out = await html(service(s.slug));
    assert.ok(visible(out).includes(BY_APPOINTMENT), s.slug);
  }
  // The question people ask, answered the same way to Google
  const jeans = await html(service("jeans-and-trousers-southampton"));
  const faq = [...jeans.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(([, json]) => JSON.parse(json))
    .find((ld) => ld["@type"] === "FAQPage");
  const answer = faq.mainEntity.find((q: { name: string }) => q.name === "Do I need an appointment?");
  assert.match(answer.acceptedAnswer.text, /^Yes\. By appointment — Kristina sends the address before your visit\./);
});

/* ─── NAV-7 and FUN-2: one name for booking, and a price first for those who want one ─── */

test("every button to the booking form on these pages reads 'Choose a time'", async (t) => {
  stubSanity(t, { photo: true });
  for (const [name, page] of pages()) {
    if (name === "home") continue;
    const toBooking = anchors(await html(page)).filter((a) => /^(\/atelier)?#book$/.test(a.href));
    assert.ok(toBooking.length >= 2, `${name}: has booking buttons`);
    for (const a of toBooking) assert.equal(a.text, "Choose a time", `${name}: "${a.text}"`);
  }
});

test("beside the first 'Choose a time' on /atelier and each service page: a price first, on WhatsApp", async (t) => {
  stubSanity(t, { photo: false });
  const checked: [string, string, string][] = [["/atelier", await html(AtelierPage()), 'id="atelier-hero-book"']];
  for (const s of LOCAL_SERVICES) checked.push([s.slug, await html(service(s.slug)), 'id="service-hero-book"']);
  for (const [name, out, heroButton] of checked) {
    const from = out.indexOf(heroButton);
    assert.ok(from > -1, name);
    const line = /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*Want a price first\?[\s\S]*?<\/p>/.exec(out.slice(from));
    assert.ok(line, `${name}: the line`);
    assert.equal(visible(line[0]).trim(), "Want a price first? Send Kristina a photo on WhatsApp.", name);
    // Right under the button's own row: nothing else to read in between
    assert.match(
      visible(out.slice(from, from + line.index)).replace(/^[^>]*>/, "").trim(),
      /^Choose a time( Call the atelier)?$/,
      name
    );
    const link = anchors(line[0])[0];
    assert.ok(link.href.startsWith(`https://wa.me/${BUSINESS.whatsappNumber}?text=`), name);
    assert.doesNotMatch(line[0], /free|pay|£|cost/i, `${name}: nothing about the fitting's price or paying`);
  }
});

/* ─── T5: the word people search for ─── */

test("'seamstress' is in the words a visitor reads on /atelier and /alterations", async (t) => {
  stubSanity(t, { photo: false });
  for (const page of [AtelierPage(), AlterationsHub()]) {
    assert.match(visible(await html(page)), /\bseamstress\b/);
  }
});

/* ─── SEO-2: titles Google shows whole ─── */

test("each service page's title is at most 60 characters, the job first and Beautasy last", async () => {
  for (const s of LOCAL_SERVICES) {
    const title = s.metaTitle;
    assert.ok(title.length <= 60, `${s.slug}: ${title.length} characters — "${title}"`);
    assert.match(title, /(— |\| )Beautasy( Atelier)?$/, `${s.slug}: the name last`);
    assert.ok(title.indexOf("Southampton") > -1 && title.indexOf("Southampton") < title.indexOf("Beautasy"), s.slug);
    for (const [price] of title.matchAll(/£\d+(?:\.\d\d)?/g)) {
      assert.ok(s.prices.some((line) => line.price.includes(price)), `${s.slug}: ${price} is not on the page's price list`);
    }
    const meta = await serviceMetadata({ params: Promise.resolve({ slug: s.slug }) });
    assert.equal(meta.title, title);
  }
});

test("/atelier's and /alterations' titles fit in 60 characters, the atelier's work before its name", () => {
  for (const [name, title] of [["/atelier", atelierMetadata.title], ["/alterations", hubMetadata.title]] as const) {
    assert.equal(typeof title, "string", name);
    const text = title as string;
    assert.ok(text.length <= 60, `${name}: ${text.length} characters — "${text}"`);
    assert.match(text, /^(Clothing )?Alterations\b/, `${name}: the work first`);
    assert.match(text, /\| Beautasy Atelier$/, `${name}: the name last`);
  }
});
