import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TermsNote, { PRIVACY_HREF, TERMS_HREF } from "./TermsNote";
import GiftCardPurchase from "../app/gift-cards/GiftCardPurchase";

/**
 * The small line under every button that books or pays — "By paying you agree
 * to our Terms & Conditions." — rendered as the browser gets it: the words,
 * the pages it links, a grey that can be read, and the button pointing at it.
 * The booking form's own check is in ./bookingForm.test.ts, the footer's in
 * ./navigation.test.ts and the sitemap's in src/app/addresses.test.ts.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const decode = (text: string) => text.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
/** What a reader sees: no tags */
const visible = (html: string) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const links = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
    href: /href="([^"]*)"/.exec(attrs)?.[1] ?? "",
    classes: (/class="([^"]*)"/.exec(attrs)?.[1] ?? "").split(/\s+/),
    text: visible(inner),
  }));

test("the line says what pressing the button agrees to, with each page one tap away", () => {
  assert.equal(TERMS_HREF, "/pages/terms");
  assert.equal(PRIVACY_HREF, "/pages/privacy-policy");

  const booking = renderToStaticMarkup(createElement(TermsNote, { doing: "booking", privacy: true, id: "terms-1" }));
  assert.equal(visible(booking), "By booking you agree to our Terms & Conditions. Our Privacy Policy explains how we use your details.");
  assert.deepEqual(
    links(booking).map(({ href, text }) => [href, text]),
    [[TERMS_HREF, "Terms & Conditions"], [PRIVACY_HREF, "Privacy Policy"]],
  );
  assert.match(booking, /^<p id="terms-1" /, "the id the button's aria-describedby names");

  const paying = renderToStaticMarkup(createElement(TermsNote, { doing: "paying" }));
  assert.equal(visible(paying), "By paying you agree to our Terms & Conditions.");
  assert.deepEqual(links(paying).map(({ href }) => href), [TERMS_HREF], "the privacy policy only where it is asked for");

  // Found by its underline, not only by a colour; opened in the same tab
  for (const link of [...links(booking), ...links(paying)]) {
    assert.ok(link.classes.includes("underline"), link.text);
  }
  assert.doesNotMatch(booking + paying, /target="_blank"/);
});

/** WCAG's contrast ratio between two "#rrggbb" colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channel = (i: number) => {
      const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test("the line's grey reads at 4.5:1 or better on every background it sits on", () => {
  const css = read("src/app/globals.css");
  const colour = (name: string) => {
    const value = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    assert.ok(value, `--color-${name} moved out of globals.css`);
    return value;
  };
  const grey = colour("charcoal-light");
  // White (the /atelier form card), cream (the page and the bag) and the
  // lavender wash a service page's form sits on
  for (const background of ["#FFFFFF", colour("cream"), colour("lavender-bg")]) {
    const ratio = contrast(grey, background);
    assert.ok(ratio >= 4.5, `${grey} on ${background} is ${ratio.toFixed(2)}:1`);
  }

  const html = renderToStaticMarkup(createElement(TermsNote, { doing: "paying", className: "text-center" }));
  const classes = html.match(/^<p class="([^"]*)"/)?.[1].split(" ") ?? [];
  assert.ok(classes.includes("text-charcoal-light"), classes.join(" "));
  assert.ok(classes.includes("text-center"), "the caller's own classes are kept");
  assert.doesNotMatch(html, /text-charcoal-light\/\d+/, "a faded grey falls under 3:1");
});

test("the gift card's pay button carries the line, and names it as its description", () => {
  const html = renderToStaticMarkup(createElement(GiftCardPurchase));
  const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
  assert.ok(button, "the pay button is rendered");
  const id = button.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(id, "the button names the line");

  const start = html.indexOf(`<p id="${id}"`);
  assert.ok(start > html.indexOf(button), "the line is there, after the button");
  const line = html.slice(start, html.indexOf("</p>", start) + 4);
  // A gift card carries someone else's name, email and a message, so the privacy policy is pointed to as well
  assert.equal(visible(line), "By paying you agree to our Terms & Conditions. Our Privacy Policy explains how we use your details.");
  assert.deepEqual(links(line).map(({ href }) => href), [TERMS_HREF, PRIVACY_HREF]);
});

test("the bag's Checkout carries the same line, and names it as its description", () => {
  // The drawer only exists once the page has run its scripts (it is portaled
  // to <body>), so a server render has nothing to show: the source is read
  const cart = read("src/components/Cart.tsx");
  assert.match(cart, /const termsId = useId\(\);/);
  const button = cart.slice(cart.indexOf("onClick={handleCheckout}"), cart.indexOf("</button>", cart.indexOf("onClick={handleCheckout}")));
  assert.match(button, /aria-describedby=\{termsId\}/);
  const after = cart.slice(cart.indexOf("onClick={handleCheckout}"), cart.indexOf("Clear bag"));
  // Right under the button and unconditional: a `{false && ...}` or an `items.length === 0 &&` in front of it would still match a looser pattern
  assert.match(after, /<\/button>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)?<TermsNote id=\{termsId\} doing="paying"[^>]*\/>/, "right under Checkout, unconditionally");
});

test("the privacy policy is pointed to, never agreed to", () => {
  // A privacy notice informs; bookings are handled under the contract, not consent
  const booking = renderToStaticMarkup(createElement(TermsNote, { doing: "booking", privacy: true }));
  assert.doesNotMatch(visible(booking), /agree to[^.]*Privacy/);
});

test("on a short phone Checkout and Clear bag can be reached, without a scroller inside a scroller", () => {
  // The drawer used to scroll as one column with the list scrolling inside
  // it, so a swipe moved one or the other. Now the drawer clips, the list is
  // the scroller, and the footer scrolls on its own only past 70% of the
  // drawer — on a 320x460 screen that still reaches Clear bag.
  const cart = read("src/components/Cart.tsx");
  assert.match(cart, /fixed top-0 right-0 bottom-0 w-full max-w-md[^"]*flex flex-col overflow-hidden"/);
  assert.match(cart, /flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-4/);
  const footer = cart.match(/className="(border-t border-lavender-soft\/40 px-6 pt-5[^"]*)"/)?.[1] ?? "";
  for (const name of ["shrink-0", "max-h-[70%]", "overflow-y-auto", "pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"]) {
    assert.ok(footer.split(" ").includes(name), `the footer has ${name}`);
  }
});
