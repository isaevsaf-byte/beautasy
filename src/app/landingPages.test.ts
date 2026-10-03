import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactNode } from "react";
import { prerenderToNodeStream } from "react-dom/static";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault, type ImageConfigComplete } from "next/dist/shared/lib/image-config";
import nextConfig from "../../next.config";
import { sanityClient } from "../lib/sanity";
import { LOCAL_SERVICES } from "../lib/localServices";
import ServicePage from "./alterations/[slug]/page";
import AlterationsHub from "./alterations/page";
import AtelierPage from "./atelier/page";
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
