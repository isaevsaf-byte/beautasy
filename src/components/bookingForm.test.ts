import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AtelierBookingForm, { NoAnswer } from "./AtelierBookingForm";
import { FIELD_LIMITS, FOUND_US_OPTIONS, HONEYPOT_FIELD, NO_ANSWER } from "../lib/bookingForm";
import { readBookingFields } from "../lib/bookingRequest";
import { PRIVACY_HREF, TERMS_HREF } from "./TermsNote";

/**
 * The booking form as it is first sent to the browser — before the diary is
 * read, so it shows the request form every customer sees for a moment, and
 * every customer sees when there is no diary.
 */

const html = renderToStaticMarkup(createElement(AtelierBookingForm));

/** The opening tag of the element with this id or name. */
function tagOf(attribute: string, value: string): string {
  return html.match(new RegExp(`<(?:input|textarea|select)\\b[^>]*\\b${attribute}="${value}"[^>]*>`))?.[0] ?? "";
}

test("the field only a bot fills in is there, hidden from people, screen readers and the keyboard", () => {
  const trap = tagOf("name", HONEYPOT_FIELD);
  assert.ok(trap, "no hidden field, so the route's honeypot catches nothing");
  assert.match(trap, /class="hidden"/);
  assert.match(trap, /aria-hidden="true"/);
  assert.match(trap, /tabindex="-1"/);
  assert.match(trap, /autoComplete="off"|autocomplete="off"/i);
});

test("nobody can type past what the route accepts", () => {
  assert.match(tagOf("id", "booking-name"), new RegExp(`maxLength="${FIELD_LIMITS.name}"`, "i"));
  assert.match(tagOf("id", "booking-email"), new RegExp(`maxLength="${FIELD_LIMITS.email}"`, "i"));
  assert.match(tagOf("id", "booking-phone"), new RegExp(`maxLength="${FIELD_LIMITS.phone}"`, "i"));
  assert.match(tagOf("id", "booking-notes"), new RegExp(`maxLength="${FIELD_LIMITS.notes}"`, "i"));
});

/** The options of one select, by its id, with "&amp;" read back as "&" */
function optionsOf(id: string): string[] {
  const select = html.match(new RegExp(`<select\\b[^>]*\\bid="${id}"[\\s\\S]*?</select>`))?.[0] ?? "";
  return [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

test("every service the form offers is one the route takes", () => {
  // Read from the service select alone: "How did you find us?" has options too
  const offered = optionsOf("booking-service");
  assert.ok(offered.includes("Bridal fitting"));
  assert.ok(offered.includes("Not sure — free 10-minute look"));
  for (const service of offered) {
    const read = readBookingFields({ name: "Anna", email: "anna@example.com", service });
    assert.ok(read.ok, `the form offers "${service}" and the route refuses it`);
  }
});

test("the wedding page's form arrives with its own service chosen, and the route takes it", () => {
  // The landing page's own props, as it hands them over
  const Form = AtelierBookingForm as FC<{ defaultService?: string }>;
  const wedding = renderToStaticMarkup(createElement(Form, { defaultService: "Wedding Dress Alterations" }));
  assert.match(wedding, /<option value="Wedding Dress Alterations" selected="">/);
  assert.ok(readBookingFields({ name: "Anna", email: "anna@example.com", service: "Wedding Dress Alterations" }).ok);
});

test("no answer at all is said plainly, with Kristina's WhatsApp one tap away", () => {
  const link = "https://wa.me/447729741116?text=Hi%20Kristina";
  const block = renderToStaticMarkup(createElement(NoAnswer, { whatsapp: link }));
  assert.match(block, /role="alert"/);
  assert.ok(block.includes(NO_ANSWER.replace(/'/g, "&#x27;")), "the line is not the one tested in src/lib/bookingForm.test.ts");
  assert.match(block, /<a href="https:\/\/wa\.me\/447729741116\?text=Hi%20Kristina" target="_blank" rel="noopener noreferrer"/);
  assert.match(block, /WhatsApp Kristina/);
});

const source = readFileSync(join(process.cwd(), "src", "components", "AtelierBookingForm.tsx"), "utf8");

test("the form shows that block, not the browser's words, when no answer comes back", () => {
  assert.match(source, /const reply = await sendBooking\(/);
  assert.match(source, /if \(!reply\.reached\) \{\s*setUnanswered\(true\);/);
  assert.match(source, /\{unanswered && <NoAnswer whatsapp=\{whatsappAboutBooking\(\{ name, service, slot, collecting \}\)\} \/>\}/);
  assert.doesNotMatch(source, /await fetch\("\/api\/atelier-booking"/, "the form posts around the helper that knows a dropped connection");
});

/** WCAG's contrast ratio of a "#rrggbb" colour against white. */
function contrastOnWhite(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  return 1.05 / (luminance + 0.05);
}

test("'(optional)' is as readable as the label it sits in", () => {
  // At 70% the grey read 2.85:1 on white; the full colour clears the 4.5:1 small text needs
  const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
  const grey = css.match(/--color-charcoal-light:\s*(#[0-9a-fA-F]{6})/)?.[1];
  assert.ok(grey, "the colour moved out of globals.css");
  assert.ok(contrastOnWhite(grey) >= 4.5, `${grey} is ${contrastOnWhite(grey).toFixed(2)}:1`);

  const optional = [...html.matchAll(/<span class="([^"]*)">\(optional\)<\/span>/g)].map((m) => m[1]);
  assert.equal(optional.length, 4, "phone, preferred date, notes and how they found us");
  for (const classes of optional) {
    assert.ok(classes.split(" ").includes("text-charcoal-light"), classes);
    assert.doesNotMatch(classes, /text-charcoal-light\/\d+/, "faded again");
  }
});

test("what the form sends is built by bookingBody, with the hidden field's value and the form's key in it", () => {
  // bookingBody itself is tested in src/lib/bookingForm.test.ts; this is the form handing it the real values
  const sent = source.slice(source.indexOf("const reply = await sendBooking("), source.indexOf("if (!reply.reached)"));
  assert.match(sent, /bookingBody\(\{/);
  assert.match(sent, /\btrap,/, "the hidden field never leaves the browser, so a bot filling the page is never caught");
  assert.match(sent, /requestKey: requestKey\.current,/);
  assert.match(sent, /slot,/);
  // One key for the form, made on the first send and kept for every retry
  assert.match(source, /requestKey\.current \?\?= newRequestKey\(\);/);
  assert.doesNotMatch(source, /requestKey\.current = /, "a new key on a retry would make it somebody else's request");
});

test("a message about what to fix is never hidden behind 'we couldn't hear back'", () => {
  const submit = source.slice(source.indexOf("async function handleSubmit("), source.indexOf("setStatus(\"loading\");"));
  const cleared = submit.indexOf("setUnanswered(false);");
  assert.ok(cleared > 0, "a send that failed once hides every message after it");
  assert.ok(cleared < submit.indexOf("setError("), "cleared only after 'Please choose a time.' has been hidden");
  // Choosing again — a service, a time, a fitting or a collection — starts over too
  const chooseService = source.slice(source.indexOf("function chooseService("), source.indexOf("async function handleSubmit("));
  assert.match(chooseService, /setUnanswered\(false\);/);
  assert.match(source, /setPicked\(s\.start\);\s*setError\(null\);\s*setUnanswered\(false\);/);
  assert.match(source, /setMode\(option\.value\);\s*setError\(null\);\s*setUnanswered\(false\);/);
  assert.match(source, /setMode\("fitting"\);\s*setError\(null\);\s*setUnanswered\(false\);/);
});

test("the time sent is one the chosen service still fits, and the postcode stops where the route does", () => {
  // A bride's start whose second slot has gone is sent as no time, not as a time the route refuses
  assert.match(source, /const slot = days \? startForService\(days, service, slotMinutes, picked\) : null;/);
  // The postcode only shows in collect mode, which a first render never reaches
  assert.match(source, /name="postcode"[\s\S]{0,200}maxLength=\{FIELD_LIMITS\.postcode\}/);
});

test("under the booking button: what booking agrees to, both pages linked, and the button names the line", () => {
  const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? "";
  assert.ok(button, "the submit button is rendered");
  const id = button.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(id, "a screen reader hears the terms with the button");

  const start = html.indexOf(`<p id="${id}"`);
  assert.ok(start > html.indexOf(button), "the line comes after the button");
  const line = html.slice(start, html.indexOf("</p>", start) + 4);
  const text = line.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
  assert.equal(text, "By booking you agree to our Terms & Conditions. Our Privacy Policy explains how we use your details.");
  const hrefs = [...line.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, [TERMS_HREF, PRIVACY_HREF]);
  // Across both columns of the form, in the readable grey
  const classes = line.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];
  assert.ok(classes.includes("sm:col-span-2"), classes.join(" "));
  assert.ok(classes.includes("text-charcoal-light"), classes.join(" "));
});

test("'How did you find us?' starts with nothing chosen, offers the agreed list, and every answer reaches the booking", () => {
  assert.deepEqual(optionsOf("booking-found-us"), ["", ...FOUND_US_OPTIONS], "an empty first choice, then the list as agreed");
  const select = html.match(/<select\b[^>]*\bid="booking-found-us"[\s\S]*?<\/select>/)?.[0] ?? "";
  assert.doesNotMatch(select, /\brequired\b/, "a booking does not depend on it");
  assert.equal((select.match(/selected=""/g) ?? []).length, 1, "only the empty choice is selected");
  assert.match(select, /<option value="" selected="">/);
  for (const answer of FOUND_US_OPTIONS) {
    const read = readBookingFields({ name: "Anna", email: "anna@example.com", service: "Alterations", foundUs: answer });
    assert.ok(read.ok && read.fields.foundUs === answer, `the form offers "${answer}" and the route drops it`);
  }
  // And it goes out with the rest of the form
  const sent = source.slice(source.indexOf("const reply = await sendBooking("), source.indexOf("if (!reply.reached)"));
  assert.match(sent, /\bfoundUs,/);
});
