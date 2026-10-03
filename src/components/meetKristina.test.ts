import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evaluate, parse } from "groq-js";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault, type ImageConfigComplete } from "next/dist/shared/lib/image-config";
import nextConfig from "../../next.config";
import MeetKristina from "./MeetKristina";
import { sanityClient } from "../lib/sanity";
import { meetKristina } from "../lib/siteSettings";
import {
  MEET_KRISTINA_DEFAULT_TEXT,
  MEET_KRISTINA_MIN_SIDE,
  MEET_KRISTINA_QUERY,
  MEET_KRISTINA_TEXT_MAX,
  imageSizeFromRef,
  meetKristinaFrom,
  paragraphsOf,
  photoSizeProblem,
  type MeetKristinaContent,
} from "../lib/meetKristina";
import { siteSettings } from "../sanity/schemaTypes/siteSettings";
import { BUSINESS } from "../lib/business";

/**
 * «Знакомьтесь, Кристина»: Kristina's photo and a few words on the pages people
 * land on — and nothing at all until she has uploaded the photo. Where the
 * block sits on each page is tested with the pages, in src/app/landingPages.test.ts.
 */

const PORTRAIT_REF = "image-a1b2c3d4e5f6-3024x4032-jpg";
const AT_WORK_REF = "image-f6e5d4c3b2a1-4032x3024-jpg";
const LQIP = "data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODww=";

/** The site's real image rules, so a photo next.config would refuse fails here too */
function withImageConfig(node: ReactNode): ReactNode {
  const config = { ...imageConfigDefault, ...nextConfig.images } as ImageConfigComplete;
  return createElement(ImageConfigContext.Provider, { value: config }, node);
}

const render = (node: ReactNode) => renderToStaticMarkup(withImageConfig(node));
const textOf = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const shown = (overrides: Partial<MeetKristinaContent> = {}): MeetKristinaContent => ({
  photo: {
    src: `https://cdn.sanity.io/images/5uun6fw6/production/a1b2c3d4e5f6-3024x4032.jpg?rect=0,0,3024,3780&w=1080&h=1350&fit=crop&q=80&auto=format`,
    alt: "Kristina in her Southampton workroom",
    width: 1080,
    height: 1350,
    lqip: null,
  },
  atWork: null,
  paragraphs: [MEET_KRISTINA_DEFAULT_TEXT],
  ...overrides,
});

/* ─── What the Studio holds ─── */

test("no portrait, no block — whatever else has been filled in", () => {
  assert.equal(meetKristinaFrom(null), null);
  assert.equal(meetKristinaFrom({}), null);
  assert.equal(meetKristinaFrom({ text: "Hello there" }), null, "words alone");
  assert.equal(meetKristinaFrom({ photo: { alt: "Kristina" } }), null, "a description with no picture in it");
  assert.equal(
    meetKristinaFrom({ atWork: { asset: { _ref: AT_WORK_REF }, alt: "At the machine" } }),
    null,
    "the photo at work alone would leave the block without a face"
  );
});

test("a portrait with no words gets the default text, which claims nothing new", () => {
  const source = meetKristinaFrom({ photo: { asset: { _ref: PORTRAIT_REF }, alt: "  Kristina smiling  " }, text: "   " });
  assert.ok(source);
  assert.equal(source.photo.alt, "Kristina smiling");
  assert.deepEqual(source.paragraphs, [MEET_KRISTINA_DEFAULT_TEXT]);
  assert.equal(source.atWork, null);
  // The default may only say what the site already says
  assert.doesNotMatch(MEET_KRISTINA_DEFAULT_TEXT, /\d|years?|qualif|award|certif|trained|free/i);
  assert.ok(MEET_KRISTINA_DEFAULT_TEXT.length <= MEET_KRISTINA_TEXT_MAX);
});

test("Kristina's own words replace the default, a blank line starting a new paragraph", () => {
  assert.deepEqual(paragraphsOf("I sew.\nEvery day.\n\n  Come and see.  "), ["I sew. Every day.", "Come and see."]);
  assert.deepEqual(paragraphsOf(null), [MEET_KRISTINA_DEFAULT_TEXT]);
});

test("a photo without its description is still described, and a thumbnail is only ever a picture", () => {
  const source = meetKristinaFrom({
    photo: { asset: { _ref: PORTRAIT_REF }, lqip: "javascript:alert(1)" },
    atWork: { asset: { _ref: AT_WORK_REF }, alt: "", lqip: LQIP },
  });
  assert.ok(source?.atWork);
  assert.match(source.photo.alt, /Kristina/);
  assert.match(source.atWork.alt, /Kristina/);
  assert.equal(source.photo.lqip, null);
  assert.equal(source.atWork.lqip, LQIP);
});

test("the site's query finds both photos, their descriptions and thumbnails in the document the Studio edits", async () => {
  const dataset = [
    {
      _id: "siteSettings",
      _type: "siteSettings",
      meetKristina: {
        photo: { _type: "image", asset: { _type: "reference", _ref: PORTRAIT_REF }, hotspot: { x: 0.5, y: 0.3, width: 0.4, height: 0.4 }, alt: "Kristina smiling" },
        atWork: { _type: "image", asset: { _type: "reference", _ref: AT_WORK_REF }, alt: "Kristina pinning a hem" },
        text: "Hello from the workroom.",
      },
    },
    { _id: PORTRAIT_REF, _type: "sanity.imageAsset", metadata: { lqip: LQIP } },
    { _id: AT_WORK_REF, _type: "sanity.imageAsset", metadata: { lqip: LQIP } },
  ];
  const raw = await (await evaluate(parse(MEET_KRISTINA_QUERY), { dataset })).get();
  const source = meetKristinaFrom(raw);
  assert.ok(source?.atWork);
  assert.equal(source.photo.image.asset._ref, PORTRAIT_REF);
  assert.deepEqual(source.photo.image.hotspot, { x: 0.5, y: 0.3, width: 0.4, height: 0.4 });
  assert.equal(source.photo.alt, "Kristina smiling");
  assert.equal(source.photo.lqip, LQIP);
  assert.equal(source.atWork.alt, "Kristina pinning a hem");
  assert.deepEqual(source.paragraphs, ["Hello from the workroom."]);

  // And before anything is uploaded, the block stays away
  const empty = await (await evaluate(parse(MEET_KRISTINA_QUERY), { dataset: [{ _id: "siteSettings", _type: "siteSettings" }] })).get();
  assert.equal(meetKristinaFrom(empty), null);
});

test("the page gets the portrait cut upright around her focus point, from this project's pictures", async (t) => {
  t.mock.method(sanityClient, "fetch", async () => ({
    photo: { asset: { _ref: PORTRAIT_REF }, hotspot: { x: 0.5, y: 0.25, width: 0.3, height: 0.3 }, alt: "Kristina smiling", lqip: LQIP },
    atWork: null,
    text: "",
  }));
  const content = await meetKristina();
  assert.ok(content);
  const url = new URL(content.photo.src);
  assert.equal(url.host, "cdn.sanity.io");
  assert.match(url.pathname, /^\/images\/5uun6fw6\/[^/]+\/a1b2c3d4e5f6-3024x4032\.jpg$/);
  assert.equal(url.searchParams.get("w"), "1080");
  assert.equal(url.searchParams.get("h"), "1350");
  assert.equal(url.searchParams.get("fit"), "crop");
  // The crop that keeps her face: the top of a tall photo, not the middle
  const [left, top, width, height] = (url.searchParams.get("rect") ?? "").split(",").map(Number);
  assert.equal(width, 3024);
  assert.equal(height, 3780);
  assert.equal(left, 0);
  assert.ok(top < (4032 - 3780) / 2, `the crop starts at ${top}, nearer the top than the middle`);
  assert.deepEqual([content.photo.width, content.photo.height], [1080, 1350]);
  assert.equal(content.photo.lqip, LQIP);
  assert.deepEqual(content.paragraphs, [MEET_KRISTINA_DEFAULT_TEXT]);
});

test("when the Studio can't be read the pages carry on without the block", async (t) => {
  t.mock.method(sanityClient, "fetch", async () => {
    throw new Error("Sanity is down");
  });
  assert.equal(await meetKristina(), null);
});

/* ─── What the page shows ─── */

test("without a photo the block renders nothing at all — no frame, no heading", () => {
  assert.equal(render(createElement(MeetKristina, { content: null })), "");
});

test("with a photo: the photo and its description, the default words, and both ways to start", () => {
  const html = render(createElement(MeetKristina, { content: shown() }));
  const text = textOf(html);

  const img = html.match(/<img[^>]*>/g) ?? [];
  assert.equal(img.length, 1, "one photo");
  assert.match(img[0], /alt="Kristina in her Southampton workroom"/);
  assert.match(img[0], /loading="lazy"/, "below the fold: it waits for the scroll");
  assert.match(img[0], /sizes="[^"]+"/, "a phone gets a phone-sized picture");
  assert.match(img[0], /src="\/_next\/image\?url=https%3A%2F%2Fcdn\.sanity\.io%2Fimages%2F5uun6fw6%2F/);

  assert.match(html, /<h2 id="meet-kristina"[^>]*>\s*Meet Kristina\s*<\/h2>/);
  assert.match(html, /aria-labelledby="meet-kristina"/);
  assert.ok(text.includes(MEET_KRISTINA_DEFAULT_TEXT), "the default words");

  assert.match(html, /<a[^>]*href="\/atelier#book"[^>]*>\s*Choose a time/);
  const whatsapp = html.match(/<a[^>]*href="(https:\/\/wa\.me\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(whatsapp, "a WhatsApp button");
  assert.ok(whatsapp[1].startsWith(`https://wa.me/${BUSINESS.whatsappNumber}?text=`));
  assert.match(textOf(whatsapp[2]), /Send a photo on WhatsApp/);
  assert.match(whatsapp[0], /target="_blank" rel="noopener noreferrer"/);
});

test("her own words, the photo at work beside the portrait, and the form on the same page when there is one", () => {
  const html = render(
    createElement(MeetKristina, {
      content: shown({
        paragraphs: ["I learned to sew at my grandmother's table.", "Bring me the thing you never wear."],
        atWork: { ...shown().photo, alt: "Kristina at her sewing machine", lqip: LQIP },
      }),
      bookHref: "#book",
    })
  );
  const imgs = html.match(/<img[^>]*>/g) ?? [];
  assert.equal(imgs.length, 2);
  assert.match(imgs[0], /alt="Kristina in her Southampton workroom"/, "the portrait first");
  assert.match(imgs[1], /alt="Kristina at her sewing machine"/);
  // The blurred thumbnail painted under it while it loads
  assert.match(imgs[1], /background-image:url\(/);
  assert.ok(imgs[1].includes(LQIP.slice("data:image/jpeg;".length)), "Sanity's own thumbnail of the photo");
  assert.doesNotMatch(imgs[0], /background-image/, "a photo with no thumbnail gets no blur");
  assert.equal((html.match(/<p class="text-charcoal-light leading-relaxed">/g) ?? []).length, 2);
  assert.doesNotMatch(textOf(html), new RegExp(MEET_KRISTINA_DEFAULT_TEXT.slice(0, 20)));
  assert.match(html, /<a[^>]*href="#book"[^>]*>\s*Choose a time/);
});

test("in the narrower column of /alterations and the service pages the photos are fetched narrower too", () => {
  const sizesOf = (html: string) => [...html.matchAll(/<img[^>]*sizes="([^"]+)"/g)].map(([, sizes]) => sizes);
  const pair = { ...shown(), atWork: { ...shown().photo, alt: "Kristina at her sewing machine" } };

  // max-w-6xl (home, /atelier): 1152 less px-6 and gap-14, halved — the pair shares it 3:2 after sm:gap-4
  assert.deepEqual(sizesOf(render(createElement(MeetKristina, { content: shown() }))).map((s) => s.split(",")[0]), ["(min-width: 1152px) 524px"]);
  assert.deepEqual(
    sizesOf(render(createElement(MeetKristina, { content: pair }))).map((s) => s.split(",")[0]),
    ["(min-width: 1152px) 305px", "(min-width: 1152px) 203px"]
  );
  // max-w-4xl: a laptop draws the portrait about 396px wide, not 540
  assert.deepEqual(sizesOf(render(createElement(MeetKristina, { content: shown(), narrow: true }))).map((s) => s.split(",")[0]), ["(min-width: 896px) 396px"]);
  assert.deepEqual(
    sizesOf(render(createElement(MeetKristina, { content: pair, narrow: true }))).map((s) => s.split(",")[0]),
    ["(min-width: 896px) 228px", "(min-width: 896px) 152px"]
  );
  // On a phone the single photo stops at max-w-sm, 384px, once the screen has room for it and px-6
  assert.match(sizesOf(render(createElement(MeetKristina, { content: shown(), narrow: true })))[0], /\(min-width: 432px\) 384px, 92vw$/);
});

/* ─── The Studio ─── */

type Field = {
  name: string;
  title?: string;
  type: string;
  description?: string;
  options?: { hotspot?: boolean };
  fields?: Field[];
  validation?: unknown;
};

test("Site Settings has «Знакомьтесь, Кристина»: a portrait, a photo at work and a few words, in Russian", () => {
  const group = (siteSettings.fields as Field[]).find((f) => f.name === "meetKristina");
  assert.ok(group, "the group is in Site Settings");
  assert.equal(group.title, "Знакомьтесь, Кристина");
  assert.equal(group.type, "object");
  const fields = Object.fromEntries((group.fields ?? []).map((f) => [f.name, f]));
  assert.deepEqual(Object.keys(fields), ["photo", "atWork", "text"]);

  for (const name of ["photo", "atWork"]) {
    const photo = fields[name];
    assert.equal(photo.type, "image", name);
    assert.equal(photo.options?.hotspot, true, `${name}: Kristina sets the focus point`);
    const alt = photo.fields?.find((f) => f.name === "alt");
    assert.ok(alt, `${name}: has a description`);
    assert.match(alt.title ?? "", /по-английски/);
    assert.ok(alt.validation, `${name}: the description is required`);
    assert.ok(photo.description?.includes(String(MEET_KRISTINA_MIN_SIDE)), `${name}: says how big`);
  }
  assert.match(fields.photo.description ?? "", /дневном свете/, "what to upload: a natural-light portrait");
  assert.match(fields.atWork.description ?? "", /швейной машинкой/, "and a photo at the sewing machine");
  assert.equal(fields.text.type, "text");
  assert.ok(fields.text.description?.includes(MEET_KRISTINA_DEFAULT_TEXT), "she can see what shows when it is empty");
  // Every Russian word: the Studio is in Russian, the site in English
  for (const field of [group, ...Object.values(fields)]) {
    assert.match(`${field.title} ${field.description ?? ""}`, /[а-яё]/i, `${field.name} is described in Russian`);
  }
});

test("a photo too small to stay sharp gets a warning, and a big one none", () => {
  assert.deepEqual(imageSizeFromRef(PORTRAIT_REF), { width: 3024, height: 4032 });
  assert.equal(imageSizeFromRef("file-abc-pdf"), null);
  assert.equal(imageSizeFromRef(undefined), null);
  assert.equal(photoSizeProblem({ asset: { _ref: PORTRAIT_REF } }), true);
  assert.equal(photoSizeProblem({ asset: { _ref: "image-abc-1200x1500-jpg" } }), true, "1200 exactly is enough");
  assert.match(String(photoSizeProblem({ asset: { _ref: "image-abc-1080x1350-jpg" } })), /1080×1350.*1200/);
  assert.equal(photoSizeProblem(undefined), true, "nothing uploaded is not a size problem");
});

test("before she uploads, the Studio says how to send a photo without where it was taken — never to use the phone's original", () => {
  const group = (siteSettings.fields as Field[]).find((f) => f.name === "meetKristina");
  const fields = Object.fromEntries((group?.fields ?? []).map((f) => [f.name, f]));
  for (const name of ["photo", "atWork"]) {
    const description = fields[name].description ?? "";
    // The original off the phone is the file that carries the home's address
    assert.doesNotMatch(description, /оригинал/i, name);
    assert.match(description, /«Поделиться» → «Параметры».*«Геопозиция»/, `${name}: how to leave the place out`);
  }
  assert.doesNotMatch(String(photoSizeProblem({ asset: { _ref: "image-abc-1080x1350-jpg" } })), /оригинал/i);
});

test("the Studio names the button Kristina will really find, and asks for no client in the photo at work", () => {
  const group = (siteSettings.fields as Field[]).find((f) => f.name === "meetKristina");
  const fields = Object.fromEntries((group?.fields ?? []).map((f) => [f.name, f]));
  // The Russian Studio's tooltip on the crop button; the circle is only inside it
  assert.match(fields.photo.description ?? "", /значок обрезки \(подсказка «Обрезать изображение»\).*кружок на лицо/);
  assert.doesNotMatch(fields.photo.description ?? "", /значок с кружком/);
  // Anyone else in it would be on nine public pages
  assert.match(fields.atWork.description ?? "", /на манекене.*без клиентов в кадре/);
  assert.doesNotMatch(fields.atWork.description ?? "", /на примерке/);
});
