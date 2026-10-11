import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, parse } from "groq-js";
import { ConcreteRuleClass } from "sanity";
import { atelierBooking } from "@/sanity/schemaTypes/atelierBooking";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DoneDialog, dialogState, doneMessage, lineFrom, type DoneDoc } from "./doneAction";
import { IN_WORK_FILTER, upcomingFittingsParams } from "./upcomingFittings";

/**
 * «✓ Работа готова» and «В работе» in the Studio (11.10.2026): the finished
 * job is found without hunting, the label's line is chosen in Russian with
 * the centimetres as she types them, and the label rides with «Выполнена».
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const ACTION = read("src/sanity/doneAction.tsx");
const DIALOG_PREVIEW = ACTION.slice(ACTION.indexOf("Так клиент увидит бирку в письме"));
const STRUCTURE = read("src/sanity/structure.ts");

test("a line as she fills it in: the centimetres with a comma, an empty line no line, a half-filled one held back", () => {
  assert.deepEqual(lineFrom({ phrase: "hem", a: "4", b: "1,5" }), { line: { phrase: "hem", a: 4, b: 1.5 }, problem: null });
  assert.deepEqual(lineFrom({ phrase: "hem", a: " 4 см", b: "" }), { line: { phrase: "hem", a: 4 }, problem: null });
  assert.deepEqual(lineFrom({ phrase: null, a: "", b: "" }), { line: null, problem: null });
  assert.match(lineFrom({ phrase: "hem", a: "", b: "" }).problem!, /Укажите/);
  assert.match(lineFrom({ phrase: "hem", a: "четыре", b: "" }).problem!, /Впишите число сантиметров/);
  assert.match(lineFrom({ phrase: "hem", a: "4,3", b: "" }).problem!, /шагом 0,5/);
  assert.deepEqual(lineFrom({ phrase: "taper", a: "", b: "" }), { line: { phrase: "taper" }, problem: null });
});

test("what she is told once it is done says whether the customer has heard, and of a label only if one went", () => {
  assert.match(doneMessage({ emailed: true, hadEmail: true }, true), /ушло письмо «спасибо» с биркой/);
  assert.doesNotMatch(doneMessage({ emailed: true, hadEmail: true }, false), /бирк/, "a look with no line went without one");
  assert.match(doneMessage({ emailed: false, hadEmail: true }, true), /отправит его утром, с этой биркой/);
  assert.match(doneMessage({ emailed: false, hadEmail: false }, true), /письма не будет/);
});

/** The dialog as Kristina first sees it, drawn without the Studio */
const drawn = (doc: DoneDoc) =>
  renderToStaticMarkup(createElement(DoneDialog, { id: "b", doc, token: "t", onClose: () => {} })).replace(/<[^>]+>/g, " ");
const confirmed: DoneDoc = { _rev: "r", _type: "atelierBooking", status: "confirmed", displayName: "Anna", service: "Jeans and Trouser Alterations", emailSealed: "x" };

test("the dialog says what it can know: a time still ahead, a time only in words, a picked line still missing its numbers", () => {
  // A time still ahead
  assert.match(drawn({ ...confirmed, slotStart: "2099-01-05T10:00" }), /Время ещё впереди/);
  // A time only in words: the site cannot tell whether the visit has been
  assert.match(drawn({ ...confirmed, confirmedFor: "Monday 19 October, 7:30pm" }), /Время записано словами: «Monday 19 October, 7:30pm»/);
  assert.match(drawn(confirmed), /Время визита не записано/);
  assert.doesNotMatch(drawn({ ...confirmed, slotStart: "2026-10-01T10:00" }), /Время ещё впереди|словами|не записано/);
  // A line picked whose numbers are not in: the preview says what is missing, never "no line"
  const now = Date.UTC(2026, 9, 11, 10);
  const halfway = dialogState([{ phrase: "hem", a: "", b: "" }], confirmed, now);
  assert.deepEqual([halfway.pending, halfway.unfinished, halfway.lines], ["Укажите: на сколько укоротили.", true, []]);
  assert.match(DIALOG_PREVIEW, /\{pending \|\| twice \? \([\s\S]*?`\$\{pending\} Тогда здесь появится бирка — так, как её увидит клиент\.`/);
  // The same line twice is held back; the same phrase with other numbers is two pieces
  assert.equal(dialogState([{ phrase: "hem", a: "4", b: "" }, { phrase: "hem", a: "4", b: "" }], confirmed, now).twice, true);
  assert.equal(dialogState([{ phrase: "hem", a: "4", b: "" }, { phrase: "hem", a: "6", b: "" }], confirmed, now).unfinished, false);
  // Nothing picked: the service's own line, which the preview shows
  assert.deepEqual(dialogState([{ phrase: null, a: "", b: "" }], confirmed, now).label?.lines, ["Made to fit"]);
  // Collect & return: Kristina takes the piece back, so nobody «забрал» it
  assert.match(drawn(confirmed), /когда вещь снова у клиента — забрал сам или вы отвезли/);
});

test("the dialog writes through the site, against the version she saw, and only over no unpublished changes", () => {
  assert.match(ACTION, /disabled: Boolean\(props\.draft\)/);
  assert.match(ACTION, /askSite\("\/api\/studio\/done", token, \{\s*id,\s*rev: doc\._rev,\s*lines,\s*clearNote: Boolean\(doc\.replyNote\) && clearNote,\s*\}\)/);
  // Offered exactly where the server would accept it
  assert.match(ACTION, /if \(!doc \|\| whyNotDone\(\{ \.\.\.doc, _rev: doc\._rev \?\? "" \}\)\) return null;/);
  // A half-filled line is never sent as no line
  assert.match(ACTION, /disabled=\{busy \|\| unfinished\}/);
  // The preview is the email's own label, drawn from the same function and colours
  assert.match(ACTION, /careLabelOf\(\{ displayName: doc\.displayName, service: doc\.service, careLabel: lines \}, new Date\(now\)\)/);
  assert.match(ACTION, /const \{ lines, pending, twice, unfinished, label \} = dialogState\(typed, doc, openedAt\);/);
  assert.match(ACTION, /const \{ band, stitch, small, ink, line \} = LABEL_COLOURS;/);
});

test("«В работе»: confirmed visits whose time has come, latest first, until they are done", async () => {
  const booking = (_id: string, fields: object) => ({ _id, _type: "atelierBooking", ...fields });
  const dataset = [
    booking("yesterday", { status: "confirmed", slotStart: "2026-10-10T11:00" }),
    booking("last-week", { status: "confirmed", slotStart: "2026-10-03T09:30" }),
    booking("this-morning", { status: "confirmed", slotStart: "2026-10-11T09:00" }),
    booking("typed", { status: "confirmed", confirmedFor: "Tuesday 13 October, 2pm" }),
    booking("tomorrow", { status: "confirmed", slotStart: "2026-10-12T10:00" }),
    booking("done", { status: "completed", slotStart: "2026-10-09T10:00" }),
    booking("asked", { status: "new", slotStart: "2026-10-09T10:00" }),
    booking("released", { status: "confirmed", slotStart: "2026-10-08T10:00", releasedAt: "2026-10-01T10:00:00Z" }),
    { _id: "order", _type: "order", status: "confirmed", slotStart: "2026-10-08T10:00" },
  ];
  // 10:30 BST on Sunday 11 October
  const params = upcomingFittingsParams(new Date("2026-10-11T09:30:00Z"));
  const ids = await (await evaluate(parse(`*[${IN_WORK_FILTER}] | order(slotStart desc)._id`), { dataset, params })).get();
  // A time only typed in has no slot to sort by: Sanity puts it first, where she will see it
  assert.deepEqual(ids, ["typed", "this-morning", "yesterday", "last-week"]);
  // Opened fresh each time, as «Ближайшие примерки» is
  assert.match(STRUCTURE, /function inWork\(S: StructureBuilder\) \{[\s\S]*?return \(\) =>\s*S\.documentList\(\)/);
  assert.match(STRUCTURE, /\.filter\(IN_WORK_FILTER\)\s*\.params\(upcomingFittingsParams\(\)\)\s*\.defaultOrdering\(\[\{ field: "slotStart", direction: "desc" \}\]\)/);
});

interface FieldDef {
  name: string;
  readOnly?: unknown;
  validation?: (rule: never) => unknown;
  hidden?: (context: { document?: Record<string, unknown> }) => boolean;
}
const careLabel = (atelierBooking as unknown as { fields: FieldDef[] }).fields.find((f) => f.name === "careLabel")!;

async function says(rule: unknown, value: unknown): Promise<string[]> {
  const rules = (Array.isArray(rule) ? rule : [rule]) as {
    validate: (value: unknown, context: never) => Promise<{ level: string; message: string }[]>;
  }[];
  const context = { i18n: { t: (key: string) => key }, path: [] } as never;
  return (await Promise.all(rules.map((r) => r.validate(value, context)))).flat().map((m) => `${m.level}: ${m.message}`);
}

test("on the booking the label is shown, never typed, and a broken line cannot be published", async () => {
  assert.equal(careLabel.readOnly, true, "set by the button only");
  assert.equal(careLabel.hidden!({ document: {} }), true, "nothing to show before there is a label");
  assert.equal(careLabel.hidden!({ document: { careLabel: [{ phrase: "taper" }] } }), false);
  const rule = careLabel.validation!(ConcreteRuleClass.array() as never);
  assert.deepEqual(await says(rule, [{ phrase: "hem", a: 4 }]), []);
  assert.deepEqual(await says(rule, undefined), []);
  // A line retired later is a warning, never a lock on a field she cannot edit
  assert.match((await says(rule, [{ phrase: "hem" }])).join(), /^warning: Одной из этих строк больше нет/);
  assert.match((await says(rule, [{ phrase: "taper" }, { phrase: "darts" }, { phrase: "bustle" }])).join(), /^error:/, "but never three lines");
  const fields = (atelierBooking as unknown as { fields: FieldDef[] }).fields.map((f) => f.name);
  assert.equal(fields.indexOf("careLabel"), fields.indexOf("status") + 1, "under the status it goes with");
  assert.match(read("src/sanity/schemaTypes/atelierBooking.ts"), /кнопкой «✓ Работа готова» внизу/);
});
