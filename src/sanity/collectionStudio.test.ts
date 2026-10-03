import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ConcreteRuleClass } from "sanity";
import { siteSettings } from "@/sanity/schemaTypes/siteSettings";
import { atelierBooking } from "@/sanity/schemaTypes/atelierBooking";
import { poundsTypedAsPence } from "@/sanity/schemaTypes/product";
import { outsideDoneMessage, pickerDays, stillFits } from "@/sanity/collectionAction";
import { timeLabel, type SlotDay } from "@/lib/slots";

/**
 * Collect & return in the Studio: the prices Kristina types, and the diary's
 * buttons. A collection happens at the customer's door, so it never takes a
 * fitting's button or sends an invite to the atelier. Since 3 October 2026
 * Kristina drives, so it has a button of its own, «🚗 Назначить забор»: the
 * time of the whole trip is taken from the diary.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const ROUTE = read("src/app/api/studio/diary/route.ts");
const ACTION = read("src/sanity/moveBookingAction.tsx");
const COLLECT = read("src/sanity/collectionAction.tsx");
const DIARY_CLIENT = read("src/sanity/diaryClient.ts");
const FORM = read("src/components/AtelierBookingForm.tsx");

interface FieldDef {
  name: string;
  validation?: (rule: never) => unknown;
  fields?: FieldDef[];
  of?: { fields?: FieldDef[] }[];
}

function field(parent: { fields?: unknown }, name: string): FieldDef {
  const found = ((parent.fields ?? []) as FieldDef[]).find((f) => f.name === name);
  assert.ok(found, `no field "${name}"`);
  return found;
}

const zones = field(field(siteSettings, "collection"), "zones");

function zoneField(name: string): FieldDef {
  const found = zones.of?.[0]?.fields?.find((f) => f.name === name);
  assert.ok(found, `no field "zones[].${name}"`);
  return found;
}

/** What the Studio would say about a value, through Sanity's own rule engine */
async function says(rule: unknown, value: unknown): Promise<string[]> {
  const rules = (Array.isArray(rule) ? rule : [rule]) as {
    validate: (value: unknown, context: never) => Promise<{ level: string; message: string }[]>;
  }[];
  const context = { i18n: { t: (key: string) => key }, path: [] } as never;
  const markers = (await Promise.all(rules.map((r) => r.validate(value, context)))).flat();
  return markers.map((marker) => `${marker.level}: ${marker.message}`);
}

test("a collection price typed in pounds is questioned, with the number to type instead", async () => {
  for (const name of ["fee", "freeFrom"]) {
    const rule = zoneField(name).validation!(ConcreteRuleClass.number() as never);
    assert.deepEqual(await says(rule, 8), [`warning: ${poundsTypedAsPence(8)}`], `${name}: 8 would show £0.08`);
    assert.deepEqual(await says(rule, 800), [], name);
    assert.deepEqual(await says(rule, 0), [], `${name}: 0 is a real answer — always free, or no threshold`);
  }
});

test("a district in two zones is refused: it would quietly take the first zone's price", async () => {
  const rule = zones.validation!(ConcreteRuleClass.array() as never);
  const southampton = { name: "Southampton", districts: ["SO14", "SO17"], fee: 800 };
  assert.deepEqual(await says(rule, [southampton, { name: "Hedge End", districts: ["SO30", "SO53"], fee: 1200 }]), []);

  const twice = await says(rule, [southampton, { name: "Hedge End", districts: ["so17 ", "SO30"], fee: 1200 }]);
  assert.equal(twice.length, 1, twice.join("; "));
  assert.match(twice[0], /^error: .*SO17/);

  assert.deepEqual(await says(rule, [{ ...southampton, districts: ["SO17", "SO17"] }]), [], "twice in one zone is still one price");
  assert.deepEqual(await says(rule, undefined), []);
});

test("the Studio offers no diary time to a collection", () => {
  assert.match(
    ACTION,
    /if \(!doc \|\| !canMove\(doc\.status\) \|\| doc\.collection\) return null;/,
    "«Назначить время» on a collection books a fitting nobody is coming to"
  );
});

test("the diary refuses a collection before moving anything, even from a Studio opened before the rule", () => {
  const move = ROUTE.slice(ROUTE.indexOf('if (body.action === "move")'));
  const refused = move.indexOf("if (from.collection)");
  assert.notEqual(refused, -1, "the diary route gives a collection a fitting's time");
  assert.ok(refused < move.indexOf("moveBooking("), "Refuse a collection before anything is moved.");
});

test("an email from the Studio's diary keeps the collection it is about", () => {
  const tell = ROUTE.slice(ROUTE.indexOf("async function tellCustomer"), ROUTE.indexOf("export async function POST"));
  assert.match(tell, /notifiableFromDiary\(doc, slotMinutes\)/, "without it, a collection is emailed as an appointment at the atelier");
});

test("a collection is given its time by its own button, with the length of the trip", () => {
  assert.match(COLLECT, /if \(!doc \|\| !doc\.collection \|\| !canMove\(doc\.status\)\) return null;/, "the button showed on a fitting");
  assert.match(COLLECT, /disabled: Boolean\(props\.draft\)/, "the button works over unpublished changes, which the move would throw away");
  assert.match(COLLECT, /askDiary\(token, \{ action: "collect", id, slot: chosen, minutes \}\)/);
  assert.match(
    COLLECT,
    /pickerDays\(times\.days, minutes, slotMinutes, own, nowMs\)/,
    "the picker offered times the trip does not fit in"
  );
  assert.match(COLLECT, /heldBy\(\{ slotStart: doc\.slotStart, slotEnd: doc\.slotEnd, status: doc\.status \}, slotMinutes\)/);
  assert.match(COLLECT, /const chosen = stillFits\(days, slot\);/);
  assert.match(read("sanity.config.ts"), /moveBookingAction,\s*collectionTimeAction,/);
});

test("the diary's collect action decides with planCollection and only then changes anything", () => {
  const collect = ROUTE.slice(ROUTE.indexOf('if (body.action === "collect")'));
  const plan = collect.indexOf("planCollection(");
  const refused = collect.indexOf("if (!plan.ok) return answer(plan.status, plan.error");
  const writing = collect.indexOf("await carryOut(store, { from: request, plan, now })");
  assert.ok(plan !== -1 && refused !== -1 && writing !== -1);
  assert.ok(plan < refused && refused < writing, "the collection is written before it is judged");
  assert.match(collect, /minutes: body\.minutes,/);
  assert.match(collect, /nowMs: Date\.now\(\),/);
  // What carryOut wrote is what the customer is told (it is run against a store in diary.test.ts)
  assert.match(collect, /const emailed = await tellCustomer\(to, schedule\.slotMinutes\);/);
});

test("an out-of-hours collection is decided with planOutside, moves off any slot's id, and is emailed as written", () => {
  const outside = ROUTE.slice(ROUTE.indexOf('if (body.action === "collectOutside")'), ROUTE.indexOf("let days:"));
  const plan = outside.indexOf("planOutside(");
  const refused = outside.indexOf("if (!plan.ok) return answer(plan.status, plan.error);");
  const writing = outside.indexOf("await carryOut(store, { from: request, plan, now })");
  const telling = outside.indexOf("await tellCustomer(to,");
  assert.ok(plan !== -1 && refused !== -1 && writing !== -1 && telling !== -1, "the out-of-hours action is missing a step");
  assert.ok(plan < refused && refused < writing && writing < telling);
  assert.match(outside, /told: body\.told/);
  // An id of its own, never a slot's: the slot it leaves must be free for customers
  assert.match(outside, /freshId: `collection-\$\{crypto\.randomUUID\(\)\}`/);
  // Before the diary is read: it holds nothing in it, and an unreadable diary must not stop it
  assert.ok(ROUTE.indexOf('if (body.action === "collectOutside")') < ROUTE.indexOf("getAvailableSlots("));
  assert.ok(ROUTE.indexOf("isProjectMember(token)") < ROUTE.indexOf('if (body.action === "collectOutside")'));
});

test("the dialog offers a time outside the diary's hours, rather than typing into a field that is locked", () => {
  assert.match(COLLECT, /askDiary\(token, \{ action: "collectOutside", id, told: outside\.told \}\)/);
  assert.match(COLLECT, /Время вне часов дневника/);
  assert.match(COLLECT, /maxLength=\{OUTSIDE_MAX\}/);
  assert.doesNotMatch(COLLECT, /в «Подтверждено на»/, "the dialog still sends her to «Подтверждено на», read-only on a timed collection");
  const description = String((atelierBooking as { description?: string }).description);
  assert.match(description, /«Время вне часов дневника»/);
  assert.doesNotMatch(description, /забор вне часов дневника или онлайн-запись выключена/);
  const confirmedFor = ((atelierBooking as { fields?: { name: string; description?: string }[] }).fields ?? []).find(
    (f) => f.name === "confirmedFor"
  );
  assert.match(String(confirmedFor?.description), /«Время вне часов дневника»/);
  assert.match(String((field(siteSettings, "collection") as { description?: string }).description), /«Время вне часов дневника»/);
});

test("Kristina is told what an out-of-hours time did, and what it freed", () => {
  const freed = outsideDoneMessage({ label: "Tuesday 6 October, 7:30pm", emailed: true, freed: true });
  assert.match(freed, /^✓ Забор назначен: «Tuesday 6 October, 7:30pm»\./);
  assert.match(freed, /в дневнике оно не закрыто/);
  assert.match(freed, /в дневнике освободилось/);
  assert.match(freed, /Клиенту ушло письмо с этим временем\./);
  assert.doesNotMatch(freed, /приглашением в календарь/, "an out-of-hours time has no invite");
  const untimed = outsideDoneMessage({ label: "x", emailed: false, hadEmail: true, freed: false });
  assert.doesNotMatch(untimed, /освободилось/);
  assert.match(untimed, /сайт отправит его утром/);
  assert.match(outsideDoneMessage({ label: "x" }), /сообщите клиенту время сами/);
});

const TUESDAY: SlotDay[] = [
  {
    date: "2026-10-06",
    label: "Tuesday 6 October",
    slots: ["13:00", "13:30", "15:00", "16:00"].map((t) => ({ start: `2026-10-06T${t}`, label: timeLabel(t) })),
  },
];
const OWN = ["2026-10-06T14:00", "2026-10-06T14:30"];

test("a start still chosen is kept only while the trip still fits after it", () => {
  assert.equal(stillFits(TUESDAY, "2026-10-06T13:00"), "2026-10-06T13:00");
  assert.equal(stillFits(TUESDAY, "2026-10-06T14:00"), null, "a start that no longer fits stayed chosen");
  assert.equal(stillFits(TUESDAY, null), null);
  assert.equal(stillFits([], "2026-10-06T13:00"), null);
});

test("the picker offers nothing that has begun by the time it is looked at, its own start included", () => {
  const before = Date.parse("2026-10-06T11:55:00Z"); // 12:55pm in Southampton
  const starts = (days: SlotDay[]) => days.flatMap((day) => day.slots.map((slot) => slot.start));
  // An hour fits from 1pm to 2:30, its own 2pm and 2:30 counting as its own
  assert.deepEqual(starts(pickerDays(TUESDAY, 60, 30, OWN, before)), [
    "2026-10-06T13:00",
    "2026-10-06T13:30",
    "2026-10-06T14:00",
    "2026-10-06T14:30",
  ]);
  const later = Date.parse("2026-10-06T13:02:00Z"); // 2:02pm
  assert.deepEqual(
    starts(pickerDays(TUESDAY, 60, 30, OWN, later)),
    ["2026-10-06T14:30"],
    "a start already gone is offered, and the server refuses it"
  );
  assert.deepEqual(pickerDays(TUESDAY, 60, 30, OWN, Date.parse("2026-10-07T09:00:00Z")), [], "a day that is over is left out");
});

test("the picker's clock is read again when the diary is read and when she presses the button", () => {
  assert.match(DIARY_CLIENT, /readAt: Date\.now\(\),/);
  assert.match(COLLECT, /const nowMs = Math\.max\(times\.state === "ready" \? times\.readAt : 0, triedAt\);/);
  const press = COLLECT.slice(COLLECT.indexOf("async function collect()"), COLLECT.indexOf('askDiary(token, { action: "collect"'));
  assert.match(press, /const at = clock\(\);\s*setTriedAt\(at\);/);
  assert.match(press, /stillFits\(pickerDays\(times\.days, minutes, slotMinutes, own, at\), chosen\)/);
  assert.doesNotMatch(COLLECT, /useState\(\(\) => Date\.now\(\)\)/, "a clock set once when the dialog opened");
});

test("the email from the Studio carries the span, so the calendar gets the window", () => {
  assert.match(ROUTE, /return NextResponse\.json\(\{ enabled: schedule\.enabled, days, slotMinutes: schedule\.slotMinutes \}\)/);
});

test("the booking form asks when they're in, and offers no windows", () => {
  assert.doesNotMatch(FORM, /booking-window|collection\.windows/, "the form still offers Safar's windows");
  assert.match(FORM, /id="booking-when"/);
  assert.match(FORM, /maxLength=\{WHEN_MAX\}/);
  assert.doesNotMatch(FORM, /required\s+value=\{collectWhen\}/, "when they're in became compulsory");
});
