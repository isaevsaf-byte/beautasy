import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSINESS, whatsappLink } from "./business";
import { whatsappShareUrl } from "./friendsLink";
import {
  PAGE_BUCKETS,
  contactClickFrom,
  contactClickMutations,
  contactClicksId,
  contactMethodOf,
  pageBucketOf,
  sumContactClicks,
} from "./contactClicks";

/**
 * Taps on WhatsApp and the phone number, counted by the day. What is counted,
 * what is accepted from the page, and what reaches the database — which must
 * be a tally and never anything about who tapped.
 */

test("WhatsApp to the atelier and a call to it are counted, in every way the site writes them", () => {
  assert.equal(contactMethodOf(`https://wa.me/${BUSINESS.whatsappNumber}`), "whatsapp");
  assert.equal(contactMethodOf(whatsappLink("Hi Kristina! I'd love to ask about an alteration.")), "whatsapp");
  assert.equal(contactMethodOf("https://wa.me/447729741116/"), "whatsapp");
  assert.equal(contactMethodOf(`https://api.whatsapp.com/send?phone=${BUSINESS.whatsappNumber}`), "whatsapp");
  assert.equal(contactMethodOf(BUSINESS.telephoneHref), "phone");
  assert.equal(contactMethodOf("tel:07729 741116"), "phone");
  assert.equal(contactMethodOf("TEL:+44-7729-741116"), "phone");
});

test("a friend sharing their link, a salon's number and everything else are not a client getting in touch", () => {
  for (const href of [
    whatsappShareUrl("ANNA-K7P2"),
    "https://wa.me/?text=hello",
    "https://wa.me/447700900123",
    "https://wa.me/447729741116999",
    "tel:+447700900123",
    "mailto:hello@beautasy.co.uk",
    "/atelier",
    "https://www.instagram.com/beautasy_lingerie_uk/",
    "javascript:alert(1)",
    "",
    null,
    undefined,
  ]) {
    assert.equal(contactMethodOf(href), null, `${href} was counted`);
  }
});

test("a tap is put down to a kind of page, never to the page's own address", () => {
  assert.equal(pageBucketOf("/"), "home");
  assert.equal(pageBucketOf(""), "home");
  assert.equal(pageBucketOf("/atelier"), "atelier");
  assert.equal(pageBucketOf("/alterations/wedding-dress-southampton?utm_source=fb"), "alterations");
  assert.equal(pageBucketOf("/p/the-hair-lounge"), "partner");
  assert.equal(pageBucketOf("/work#dress-12"), "work");
  assert.equal(pageBucketOf("/contact"), "contact");
  assert.equal(pageBucketOf("/shop/silk-slip"), "shop");
  assert.equal(pageBucketOf("/r/ANNA-K7P2"), "other", "a friend's code stays off the tally");
  assert.equal(pageBucketOf("/constructor"), "other");
  assert.equal(pageBucketOf("/toString"), "other");
});

test("the route accepts exactly a method and a kind of page", () => {
  assert.deepEqual(contactClickFrom({ method: "whatsapp", page: "atelier" }), { method: "whatsapp", page: "atelier" });
  assert.deepEqual(contactClickFrom({ method: "phone", page: "other", extra: "ignored" }), { method: "phone", page: "other" });
  for (const body of [
    null,
    "whatsapp",
    [],
    {},
    { method: "email", page: "home" },
    { method: "whatsapp", page: "/atelier" },
    { method: "whatsapp", page: "__proto__" },
    { method: "whatsapp" },
    { method: ["whatsapp"], page: "home" },
  ]) {
    assert.equal(contactClickFrom(body), null, `${JSON.stringify(body)} was accepted`);
  }
});

test("one document a day, made if missing and added to on the server, with nothing about who", () => {
  const [create, patch] = contactClickMutations("2026-10-03", { method: "whatsapp", page: "atelier" }) as [
    { createIfNotExists: Record<string, unknown> },
    { patch: { id: string; setIfMissing: Record<string, number>; inc: Record<string, number> } },
  ];
  assert.equal(contactClicksId("2026-10-03"), "contactClicks-2026-10-03");
  assert.equal(create.createIfNotExists._id, "contactClicks-2026-10-03", "not a dotted id: the Dashboard reads it without a token");
  assert.equal(create.createIfNotExists._type, "contactClicks");
  assert.deepEqual(Object.keys(create.createIfNotExists).sort(), ["_id", "_type", "date", "pages", "phone", "whatsapp"]);
  assert.deepEqual(Object.keys(create.createIfNotExists.pages as object), [...PAGE_BUCKETS]);
  assert.equal(create.createIfNotExists.whatsapp, 0, "made at nought, so the tap below is not counted twice");

  assert.equal(patch.patch.id, "contactClicks-2026-10-03");
  assert.deepEqual(patch.patch.inc, { whatsapp: 1, "pages.atelier.whatsapp": 1 }, "added by Sanity, so two taps at once both count");
  assert.deepEqual(patch.patch.setIfMissing, { "pages.atelier.whatsapp": 0 });
});

test("days add up to the week, and the pages come out busiest first", () => {
  const week = sumContactClicks([
    { whatsapp: 3, phone: 1, pages: { atelier: { whatsapp: 2, phone: 1 }, home: { whatsapp: 1 } } },
    { whatsapp: 2, phone: 2, pages: { home: { whatsapp: 2, phone: 2 } } },
    { whatsapp: null, phone: -4, pages: null },
  ]);
  assert.equal(week.whatsapp, 5);
  assert.equal(week.phone, 3, "a broken number is not taken off");
  assert.deepEqual(week.pages, [
    { page: "home", taps: 5 },
    { page: "atelier", taps: 3 },
  ]);
  assert.deepEqual(sumContactClicks(undefined), { whatsapp: 0, phone: 0, pages: [] });
});
