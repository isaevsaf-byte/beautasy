import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { atelierBooking } from "@/sanity/schemaTypes/atelierBooking";
import { ReviewAskDialog, askOutcome, askedOn, reviewAskLabel, type AskOutcome } from "./reviewAskAction";

/**
 * «🙏 Попросить отзыв» in the Studio (12.10.2026): the button says whether she
 * has asked already, WhatsApp opens in the tab the tap made, and when it
 * cannot, the window gives her the link or the words to copy.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const ACTION = read("src/sanity/reviewAskAction.tsx");
const CONFIG = read("sanity.config.ts");

test("the button says whether she has asked already, and when, by Southampton's calendar", () => {
  assert.equal(reviewAskLabel(undefined), "🙏 Попросить отзыв");
  assert.equal(reviewAskLabel("2026-10-12T09:30:00.000Z"), "🙏 Попросить ещё раз (просили 12 окт)");
  // Half past eleven at night in October is already the next day in London
  assert.equal(askedOn("2026-10-12T23:30:00.000Z"), "13 окт");
  assert.equal(askedOn("2026-05-03T10:00:00.000Z"), "3 мая");
  assert.equal(reviewAskLabel("not a date"), "🙏 Попросить отзыв");
});

test("the tab the tap opened goes to WhatsApp; only a refusal or a blocked tab opens the window", () => {
  const made = { ok: true, status: 200, data: { url: "https://wa.me/447700900123?text=Hi", text: "Hi" } };
  assert.equal(askOutcome(made, true), null);

  const blocked = askOutcome(made, false)!;
  assert.equal(blocked.url, "https://wa.me/447700900123?text=Hi");
  assert.equal(blocked.text, "Hi");
  assert.match(blocked.message, /Открыть WhatsApp/);

  const noPhone = askOutcome({ ok: true, status: 200, data: { text: "Hi Anna!", error: "В заявке нет телефона…" } }, true)!;
  assert.deepEqual(noPhone, { message: "В заявке нет телефона…", url: null, text: "Hi Anna!" });

  const refused = askOutcome({ ok: false, status: 409, data: { error: "Отзыв просят, когда работа готова" } }, true)!;
  assert.deepEqual(refused, { message: "Отзыв просят, когда работа готова", url: null, text: null });
  assert.match(askOutcome({ ok: false, status: 0, data: {} }, true)!.message, /Не удалось/);
});

const drawn = (outcome: AskOutcome) => renderToStaticMarkup(createElement(ReviewAskDialog, { outcome }));

test("the window offers what there is: the link to open, the words to copy, or just the reason", () => {
  const both = drawn({ message: "Браузер не дал", url: "https://wa.me/447700900123?text=Hi", text: "Hi Anna!" });
  assert.match(both, /href="https:\/\/wa\.me\/447700900123\?text=Hi"/);
  assert.match(both, /rel="noopener noreferrer"/);
  assert.match(both, /Скопировать текст/);
  assert.match(both, /Hi Anna!/);

  const words = drawn({ message: "В заявке нет телефона", url: null, text: "Hi Anna!" });
  assert.doesNotMatch(words, /Открыть WhatsApp/);
  assert.match(words, /Скопировать текст/);

  const reason = drawn({ message: "Слишком много запросов", url: null, text: null });
  assert.doesNotMatch(reason, /Скопировать|Открыть/);
});

test("the tab is opened inside the tap, before the site answers, so the browser does not block it", () => {
  const handler = ACTION.slice(ACTION.indexOf("onHandle: () => {"));
  const opened = handler.indexOf('window.open("", "_blank")');
  const asked = handler.indexOf('askSite("/api/studio/review-ask"');
  assert.ok(opened > 0 && asked > opened, "window.open must come before the request, not in its answer");
  assert.match(handler, /tab\.opener = null/);
});

test("the button sits on bookings, and the stamp is a field she can read and cannot type into", () => {
  assert.match(CONFIG, /doneAction,\s*reviewAskAction,/);
  const field = atelierBooking.fields.find((f) => f.name === "reviewAskedAt") as
    | { title?: string; type?: string; readOnly?: unknown }
    | undefined;
  assert.ok(field);
  assert.equal(field.title, "Попросили отзыв");
  assert.equal(field.type, "datetime");
  assert.equal(field.readOnly, true);
});
