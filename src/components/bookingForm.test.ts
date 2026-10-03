import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AtelierBookingForm from "./AtelierBookingForm";
import { FIELD_LIMITS, HONEYPOT_FIELD } from "../lib/bookingForm";
import { readBookingFields } from "../lib/bookingRequest";

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

test("every service the form offers is one the route takes", () => {
  const offered = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
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
