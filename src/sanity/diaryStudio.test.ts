import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConcreteRuleClass } from "sanity";
import { atelierBooking } from "./schemaTypes/atelierBooking";
import { atelierSchedule } from "./schemaTypes/atelierSchedule";
import { SlotPicker, shortDay, slotInRussian } from "./SlotPicker";
import { SERVICE_TITLES } from "./ManualBookingPane";
import { ATELIER_SERVICES } from "@/lib/atelierServices";
import type { SlotDay } from "@/lib/slots";

/**
 * The Studio's hand on the diary: "Book by hand" and "Move to another time".
 * The claim and the move themselves are measured in src/lib/diary.test.ts;
 * this holds the glue — who may call the route, which diary it reads, and
 * what it answers when something goes wrong.
 */

const ROOT = process.cwd();
const ROUTE = readFileSync(join(ROOT, "src/app/api/studio/diary/route.ts"), "utf8");
const ACTION = readFileSync(join(ROOT, "src/sanity/moveBookingAction.tsx"), "utf8");
const CONFIG = readFileSync(join(ROOT, "sanity.config.ts"), "utf8");
const STRUCTURE = readFileSync(join(ROOT, "src/sanity/structure.ts"), "utf8");
const SCHEMA = readFileSync(join(ROOT, "src/sanity/schemaTypes/atelierBooking.ts"), "utf8");

const DAYS: SlotDay[] = [
  {
    date: "2026-10-06",
    label: "Tuesday 6 October",
    slots: [
      { start: "2026-10-06T09:00", label: "9:00am" },
      { start: "2026-10-06T14:00", label: "2:00pm" },
    ],
  },
  { date: "2026-10-07", label: "Wednesday 7 October", slots: [{ start: "2026-10-07T10:00", label: "10:00am" }] },
];

test("the picker shows the days and the chosen day's times, with the choice marked", () => {
  const html = renderToStaticMarkup(
    createElement(SlotPicker, { days: DAYS, value: "2026-10-06T14:00", onChange: () => {} })
  );
  assert.match(html, />вт, 6 окт\.</);
  assert.match(html, />ср, 7 окт\.</);
  assert.match(html, /aria-pressed="true"[^>]*>14:00</);
  assert.match(html, /aria-pressed="false"[^>]*>9:00</);
  assert.doesNotMatch(html, />10:00</, "only the chosen day's times");
});

test("with no free times the picker says where to look", () => {
  const html = renderToStaticMarkup(createElement(SlotPicker, { days: [], value: null, onChange: () => {} }));
  assert.match(html, /свободного времени нет/);
  assert.match(html, /«Часы для примерок»/);
});

test("a short day label is the calendar day, whatever the viewer's time zone", () => {
  assert.equal(shortDay("2026-10-25"), "вс, 25 окт.");
  assert.equal(shortDay("2026-03-29"), "вс, 29 мар.");
});

test("a time reads as the atelier's clock says it, in summer and in winter", () => {
  // A slot has no zone in it: its digits are already Southampton time. Worded
  // through Europe/London they would move an hour every summer.
  assert.equal(slotInRussian("2026-07-01T09:30"), "среда, 1 июля, в 9:30");
  assert.equal(slotInRussian("2026-12-01T14:00"), "вторник, 1 декабря, в 14:00");
});

test("every service the site offers has a Russian name in Book by hand", () => {
  for (const service of ATELIER_SERVICES) {
    assert.ok(
      SERVICE_TITLES[service],
      `"${service}" has no Russian title in SERVICE_TITLES (ManualBookingPane.tsx), so Kristina would pick it in English.`
    );
  }
});

test("only a member of the project reaches the diary, before anything is read or written", () => {
  const member = ROUTE.indexOf("isProjectMember(token)");
  assert.ok(member > -1, "the route must ask Sanity who is calling");
  for (const step of ["getAvailableSlots(", "claimSlot(", "moveBooking(", "store.read("]) {
    const at = ROUTE.indexOf(step);
    assert.ok(at > member, `${step} must come after the membership check`);
  }
  assert.match(ROUTE, /if \(!fromThisSite\(req\)\)/);
});

test("the Studio books from the fresh diary, strictly, without the customers' notice period", () => {
  assert.match(ROUTE, /getAvailableSlots\(\{ fresh: true, strict: true, leadTimeHours: 0 \}\)/);
  // Every action but a collection's checks the bare slot; a collection checks its whole trip (planCollection)
  assert.match(ROUTE, /if \(body\.action !== "collect" && !slotIsOffered\(days, slot\)\)/);
});

test("a booking made by hand goes through the same claim as one made on the site", () => {
  assert.match(ROUTE, /const claim = await claimSlot\(store, doc, now\);/);
  assert.match(ROUTE, /_id: slotDocumentId\(slot\),/);
  assert.match(ROUTE, /if \(claim === "failed"\) return answer\(500/, "an outage is not a taken time");
});

test("a move takes the new time before letting go of the old one, and only for a live booking", () => {
  assert.match(ROUTE, /if \(!canMove\(from\.status\)\)/);
  assert.match(ROUTE, /: await moveBooking\(store, \{ from, to, now \}\);/);
  assert.match(ROUTE, /if \(moved === "failed"\) return answer\(500/);
});

test("the move is not offered over unpublished changes, and it asks the diary route", () => {
  assert.match(ACTION, /disabled: Boolean\(props\.draft\)/);
  assert.match(ACTION, /askDiary\(token, \{ action: "move", id, slot \}\)/);
  assert.match(
    CONFIG,
    /return \[\s*\.\.\.prev,\s*moveBookingAction,\s*collectionTimeAction,\s*recordPaymentAction,\s*partnerAttributionAction,\s*notifyCustomerAction,\s*revealContactAction,\s*\];/
  );
  assert.match(STRUCTURE, /\.title\("Записать вручную"\)/);
});

test("a booked time cannot be changed by typing — Confirmed For is read-only once there is a slot", () => {
  assert.match(SCHEMA, /name: "confirmedFor",[\s\S]*?readOnly: \(\{ document \}\) => Boolean\(document\?\.slotStart\)/);
  assert.match(SCHEMA, /\{ title: "Клиент отменил — время освободится", value: "cancelled" \}/);
});

interface StatusField {
  readOnly: (context: { document?: Record<string, unknown> }) => boolean;
  validation: (rule: never) => unknown;
}
const STATUS = (atelierBooking as unknown as { fields: (StatusField & { name: string })[] }).fields.find(
  (f) => f.name === "status"
)!;

/**
 * What the Studio says when Kristina publishes `value`, through Sanity's own
 * rule engine — with `published` as the version Sanity holds, or an Error
 * when it cannot be read.
 */
async function statusSays(
  value: string,
  document: Record<string, unknown>,
  published: Record<string, unknown> | null | Error
): Promise<{ said: string[]; asked: string[] }> {
  const asked: string[] = [];
  const context = {
    i18n: { t: (key: string) => key },
    path: ["status"],
    document,
    getClient: () => ({
      async getDocument(id: string) {
        asked.push(id);
        if (published instanceof Error) throw published;
        return published;
      },
    }),
  } as never;
  const rule = STATUS.validation(ConcreteRuleClass.string() as never);
  const rules = (Array.isArray(rule) ? rule : [rule]) as {
    validate: (value: unknown, context: never) => Promise<{ level: string; message: string }[]>;
  }[];
  const markers = (await Promise.all(rules.map((r) => r.validate(value, context)))).flat();
  return { said: markers.map((marker) => `${marker.level}: ${marker.message}`), asked };
}

test("a booking that gave its time back cannot take it back by its status — only booked again", async () => {
  const draft = { _id: "drafts.slot-2026-10-06-1400", slotStart: "2026-10-06T14:00" };
  for (const gaveBack of ["declined", "cancelled"]) {
    for (const value of ["new", "confirmed"]) {
      const { said, asked } = await statusSays(value, { ...draft, status: value }, { _id: "slot-2026-10-06-1400", status: gaveBack });
      assert.equal(said.length, 1, `${gaveBack} → ${value} went through: two people on one time`);
      assert.match(said[0], /^error: Время уже освобождено — его мог занять другой клиент\. Чтобы вернуть запись, нажмите «Записать снова»/);
      assert.deepEqual(asked, ["slot-2026-10-06-1400"], "the draft was asked, and it already carries the new status");
    }
  }
});

test("a booking that gave its time back can still be finished, or given back another way", async () => {
  const draft = { _id: "drafts.slot-2026-10-06-1400", slotStart: "2026-10-06T14:00" };
  const cancelled = { _id: "slot-2026-10-06-1400", status: "cancelled" };
  // The customer cancelled, then came anyway: the thank-you and the friend's reward hang on this
  const past = { _id: "drafts.slot-2020-01-07-1400", slotStart: "2020-01-07T14:00" };
  assert.deepEqual((await statusSays("completed", past, cancelled)).said, []);
  assert.deepEqual((await statusSays("declined", draft, cancelled)).said, []);
  // A booking holding its time, or one with no time at all, is never asked about
  assert.deepEqual((await statusSays("confirmed", draft, { ...cancelled, status: "confirmed" })).said, []);
  const untimed = await statusSays("confirmed", { _id: "drafts.req1" }, cancelled);
  assert.deepEqual(untimed, { said: [], asked: [] });
  // Never published: there is nothing to take back
  assert.deepEqual((await statusSays("confirmed", draft, null)).said, []);
  // Unreadable: only this one flip waits, and it says why
  const offline = await statusSays("confirmed", draft, new Error("offline"));
  assert.equal(offline.said.length, 1);
  assert.match(offline.said[0], /^error: Не удалось проверить/);
});

test("a cancelled visit still ahead cannot be finished early — that would hold its time again unchecked", async () => {
  const ahead = { _id: "drafts.slot-2099-01-06-1400", slotStart: "2099-01-06T14:00" };
  const { said } = await statusSays("completed", ahead, { _id: "slot-2099-01-06-1400", status: "cancelled" });
  assert.equal(said.length, 1);
  assert.match(said[0], /^error: Визит ещё впереди, а его время уже освобождено/);
  // Still holding its time: finishing it early takes nothing back
  assert.deepEqual((await statusSays("completed", ahead, { _id: "slot-2099-01-06-1400", status: "confirmed" })).said, []);
});

test("a booking whose time went to another customer keeps its status locked", () => {
  assert.equal(STATUS.readOnly({ document: { releasedAt: "2026-10-01T09:00:00.000Z", status: "cancelled" } }), true);
  // Gave its time back, nobody took it yet: open, so it can still be finished
  assert.equal(STATUS.readOnly({ document: { slotStart: "2026-10-06T14:00", status: "cancelled" } }), false);
  assert.match(SCHEMA, /name: "releasedAt",[\s\S]*?hidden: \(\{ document \}\) => !document\?\.releasedAt/);
  assert.match(ACTION, /const label = again \? "Записать снова"/);
});

test("the booking that holds a time is not moved onto it, whatever its status", () => {
  assert.match(ROUTE, /const sameSlot = from\._id === slotDocumentId\(slot\);/);
  assert.match(ROUTE, /if \(sameSlot && !releasesItsTime\(from\.status\)\) return answer\(400, "Запись уже стоит на это время\."\);/);
  // One that gave its time back is booked again in place, after the diary said the time is free
  assert.match(ROUTE, /\? await reholdBooking\(store, \{ from, slot, now \}\)/);
  assert.doesNotMatch(ROUTE, /from\.slotStart === slot/, "a record the diary kept has the time but not the id");
});

test("an answer lost halfway is reported as such, not as nothing done", () => {
  // Either way the booking was written already marked as told, so no email
  // will follow on its own: she is asked to tell them herself
  const book = ROUTE.slice(ROUTE.indexOf('if (claim === "unsure")'));
  assert.match(book.slice(0, 400), /сообщите клиенту время сами/);
  const move = ROUTE.slice(ROUTE.indexOf('if (moved === "unsure")'));
  assert.match(move.slice(0, 400), /или на обоих\. Оставьте нужную, остальные удалите и сообщите клиенту время сами/);
});

test("a finished move opens the new booking and says how it went, even with the old one gone", () => {
  const success = ACTION.slice(ACTION.indexOf("if (reply.ok) {"), ACTION.indexOf("const message ="));
  assert.match(success, /onClose\(\);/);
  assert.match(success, /router\.navigateIntent\("edit", \{ id: String\(reply\.data\.id\), type: "atelierBooking" \}\)/);
  assert.match(success, /window\.alert\(doneMessage\(reply\.data\)\)/);
  assert.match(ACTION, /if \(!shown\.current\) \{\s*window\.alert\(message\);/);
});

test("the schedule has the bank-holiday switch, off unless Kristina turns it on, explained in Russian", () => {
  const fields = (atelierSchedule as unknown as { fields: { name: string; title?: string; type: string; initialValue?: unknown; description?: string }[] }).fields;
  const field = fields.find((f) => f.name === "workBankHolidays");
  assert.ok(field, "no switch for bank holidays in «Часы для примерок»");
  assert.equal(field.title, "Работать в банковские выходные");
  assert.equal(field.type, "boolean");
  assert.equal(field.initialValue, false, "a new schedule would open bank holidays");
  assert.match(field.description ?? "", /25 и 26 декабря закрыты в любом случае/);
  assert.doesNotMatch(field.description ?? "", /[A-Za-z]{4,}/, "the description slipped into English");
});
