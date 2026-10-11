import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK,
  GROUPS,
  MAX_LINES,
  PHRASES,
  careLabelHtml,
  careLabelOf,
  careLineProblem,
  groupsFor,
  labelMonth,
  lineText,
  nameOnLabel,
  ownGroups,
  parseCm,
  type CareLine,
} from "./careLabel";
import { ATELIER_SERVICES, LEGACY_SERVICES } from "./atelierServices";
import { LOCAL_SERVICES } from "./localServices";

/**
 * The care label in the thank-you (11.10.2026): what Kristina did, picked in
 * Russian and written in English, on a woven label drawn from type and one
 * gold stitch. Every line is a claim in a customer's inbox, so these hold
 * the words to what a British alterations shop would write, and the label
 * to what the email clients can draw.
 */

const OCT = new Date(Date.UTC(2026, 9, 11, 10));
const largest = (line: CareLine): CareLine => {
  const phrase = PHRASES.find((p) => p.key === line.phrase)!;
  return { phrase: line.phrase, ...(phrase.a ? { a: phrase.a.max - 0.5 } : {}), ...(phrase.b ? { b: phrase.b.max - 0.5 } : {}) };
};

test("every service a booking can arrive with has its own line, or none for a look", () => {
  const names = [...ATELIER_SERVICES, ...LEGACY_SERVICES, ...LOCAL_SERVICES.map((service) => service.serviceName)];
  assert.deepEqual(Object.keys(FALLBACK).sort(), [...new Set(names)].sort(), "the lists held together");
  assert.equal(FALLBACK["Not sure — free 10-minute look"], null);
  assert.equal(FALLBACK["Other / Not Sure"], null);
  for (const [name, fallback] of Object.entries(FALLBACK)) {
    if (!fallback) continue;
    assert.ok(fallback.line.length <= 40, `${name}: «${fallback.line}» fits a line`);
    assert.doesNotMatch(fallback.line, /\bby hand\b|\bmade by\b/i, `${name}: the top line says who`);
    assert.doesNotMatch(fallback.line, new RegExp(`\\b${fallback.verb}\\b`, "i"), `${name}: the top line already says ${fallback.verb}`);
  }
  // A repair may be a bag or a cushion: nothing says it is worn
  assert.doesNotMatch(FALLBACK.Repairs!.line, /wear/);
  // The wedding page takes bridesmaids and the bride's mother too
  assert.doesNotMatch(FALLBACK["Wedding Dress Alterations"]!.line, /dress/i);
  // Curtains are altered and cushions made: the home line claims neither
  assert.equal(FALLBACK["Home Textiles"]!.verb, "Finished");
  assert.equal(FALLBACK["Curtain Alterations and Home Textiles"]!.verb, "Finished");
  // Each service's own jobs come first; every group is there once
  for (const name of names) {
    const order = groupsFor(name);
    assert.deepEqual([...order].sort(), GROUPS.map((group) => group.key).sort(), name);
    assert.deepEqual(order.slice(0, ownGroups(name).length), ownGroups(name), name);
  }
  assert.deepEqual(ownGroups("Not sure — free 10-minute look"), []);
  assert.equal(groupsFor("School Uniform Alterations")[0], "uniform");
  assert.equal(groupsFor("Curtain Alterations and Home Textiles")[0], "home");
});

test("each phrase is whole in both languages, at its smallest and largest numbers", () => {
  const keys = PHRASES.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length, "one key, one phrase");
  assert.equal(new Set(PHRASES.map((p) => p.chip)).size, PHRASES.length, "no two chips read alike");
  for (const phrase of PHRASES) {
    assert.ok(GROUPS.some((group) => group.key === phrase.group), phrase.key);
    // A tail is said only with its number; a number in the main line is always asked for
    if (phrase.enTail || phrase.ruTail) {
      assert.ok(phrase.b && phrase.enTail && phrase.ruTail, `${phrase.key}: a tail in both languages, for b`);
      assert.match(phrase.enTail!, /\{b\}/);
      assert.doesNotMatch(phrase.en, /\{b/);
    }
    for (const name of ["a", "b"] as const) {
      const used = new RegExp(`\\{${name}#?\\}`);
      const said = used.test(phrase.en + (phrase.enTail ?? ""));
      assert.equal(said, Boolean(phrase[name]), `${phrase.key}: {${name}} said if and only if asked`);
      assert.equal(used.test(phrase.ru + (phrase.ruTail ?? "")), said, `${phrase.key}: {${name}} in Russian too`);
    }
    for (const line of [
      { phrase: phrase.key, ...(phrase.a ? { a: 0.5 } : {}), ...(phrase.b ? { b: 0.5 } : {}) },
      largest({ phrase: phrase.key }),
    ]) {
      const en = lineText(line, "en")!;
      const ru = lineText(line, "ru")!;
      assert.ok(en && ru, `${phrase.key}: renders`);
      assert.doesNotMatch(en + ru, /[{}]|undefined|NaN|\.0 /, `${phrase.key}: ${en}`);
      // Two lines of a 280px label at most
      assert.ok(en.length <= 64, `${phrase.key}: «${en}» is ${en.length} characters`);
      assert.match(en, /^[A-Z]/, `${phrase.key}: starts a line`);
      assert.doesNotMatch(en, /[.!]$/, `${phrase.key}: a label line, not a sentence`);
      // "a 8 cm tear" and "an 11" cannot happen: no article stands before a number
      assert.doesNotMatch(phrase.en + (phrase.enTail ?? ""), /\ban? \{/, phrase.key);
      // British, and the trade's own words
      assert.doesNotMatch(en, /\b(color|center|cuffs|pants|hemmed up|shortened by)\b/i, `${phrase.key}: ${en}`);
      assert.match(ru, /^[А-ЯЁ]/, `${phrase.key}: Russian for Kristina`);
    }
  }
  // "Taken up", never "taken up by", in the trade's sense (Collins, British)
  assert.equal(lineText({ phrase: "hem", a: 4, b: 2 }, "en"), "Hem taken up 4 cm, 2 cm left in should you want it longer");
  assert.equal(lineText({ phrase: "hem", a: 4 }, "en"), "Hem taken up 4 cm", "the tail goes with its number");
  assert.equal(lineText({ phrase: "hem", a: 1.5, b: 2 }, "ru"), "Низ укорочен на 1,5 см, при желании можно будет удлинить на 2 см");
  assert.equal(lineText({ phrase: "cushion", a: 45, b: 45 }, "en"), "Cushion cover for your 45 × 45 cm pad");
  assert.equal(lineText({ phrase: "blind", a: 80, b: 120 }, "en"), "Roman blind, 80 cm wide by 120 cm drop");
  // Taking in is counted in all, and says so, so "3 cm" is not read as 3 a side
  assert.equal(lineText({ phrase: "in-sides", a: 3 }, "en"), "Taken in 3 cm in all at the sides");
  // Girth, not length: "Низ выпущен" lets a hem down and is asked by how much
  for (const phrase of PHRASES.filter((p) => /ушит|выпущено|расстав/i.test(p.ru) && p.a)) {
    assert.match(phrase.a!.ru, /всего/, `${phrase.key}: she is asked for the total`);
  }
  // Under "Made by hand for", no line says "made" again
  for (const phrase of PHRASES.filter((p) => p.verb === "Made")) assert.doesNotMatch(phrase.en, /\bmade\b/i, phrase.key);
  // "Mended by hand for … Tear mended by hand" would say it twice
  for (const phrase of PHRASES.filter((p) => p.verb === "Mended")) assert.doesNotMatch(phrase.en, /\bmended\b/i, phrase.key);
  // A line that says "by hand" says so for the top line, which then does not
  for (const phrase of PHRASES) assert.equal(/by hand|hand-sewn/.test(phrase.en), Boolean(phrase.byHand), phrase.key);
});

test("a number is a number of centimetres she can tap in: halves, within reason, and asked for when needed", () => {
  assert.equal(careLineProblem({ phrase: "hem", a: 4, b: 2 }), null);
  assert.equal(careLineProblem({ phrase: "hem", a: 4 }), null, "what is left in is optional");
  assert.match(careLineProblem({ phrase: "hem" })!, /^Укажите: на сколько укоротили\.$/);
  assert.match(careLineProblem({ phrase: "growing", a: 5 })!, /^Укажите: сколько оставили на вырост\.$/, "growing room is the point of the line");
  assert.match(careLineProblem({ phrase: "hem", a: 4.3 })!, /шагом 0,5/);
  assert.match(careLineProblem({ phrase: "hem", a: 0 })!, /от 0,5 до 40 см/);
  assert.match(careLineProblem({ phrase: "hem", a: 41 })!, /от 0,5 до 40 см/);
  assert.match(careLineProblem({ phrase: "hem", a: Number.NaN })!, /от 0,5/);
  assert.match(careLineProblem({ phrase: "taper", a: 2 })!, /нет такого числа/);
  assert.match(careLineProblem({ phrase: "no-such-thing" })!, /Такой строки для бирки нет/);
  assert.match(careLineProblem(null)!, /Такой строки/);
  assert.equal(careLineProblem({ phrase: "taper" }), null);

  assert.equal(parseCm("1,5"), 1.5, "a Russian keyboard's comma");
  assert.equal(parseCm(" 4 "), 4);
  assert.equal(parseCm("2.5cm"), 2.5);
  assert.equal(parseCm("3 см"), 3);
  for (const nonsense of ["", "abc", "-2", "1,5,5", "4 inches", "½"]) assert.equal(parseCm(nonsense), null, nonsense);
});

test("the top line says who did it, for whom, in the work's own verb, and never 'for there'", () => {
  const label = careLabelOf({ displayName: "Anna", service: "Alterations", careLabel: [{ phrase: "hem", a: 4, b: 2 }] }, OCT)!;
  assert.deepEqual(label, {
    maker: "Altered by hand for Anna",
    lines: ["Hem taken up 4 cm, 2 cm left in should you want it longer"],
    month: "October 2026",
  });
  const mended = careLabelOf({ displayName: "Anna", service: "Repairs", careLabel: [{ phrase: "zip" }] }, OCT)!;
  assert.equal(mended.maker, "Mended by hand for Anna");
  const both = careLabelOf({ displayName: "Anna", careLabel: [{ phrase: "jeans-original", a: 6 }, { phrase: "zip-slider" }] }, OCT)!;
  assert.equal(both.maker, "Altered & mended by hand for Anna");
  assert.equal(both.lines.length, 2);
  // Never "Made" for what she altered: curtains taken up and a cushion made are both said
  assert.equal(careLabelOf({ displayName: "Anna", careLabel: [{ phrase: "curtains-weights", a: 40 }, { phrase: "cushion", a: 45, b: 45 }] }, OCT)!.maker, "Made & altered by hand for Anna");
  assert.equal(careLabelOf({ displayName: "Anna", careLabel: [{ phrase: "scratch" }, { phrase: "buttons" }] }, OCT)!.maker, "Made & mended by hand for Anna");
  assert.equal(careLabelOf({ displayName: "Anna", careLabel: [{ phrase: "scratch" }] }, OCT)!.maker, "Made by hand for Anna");
  // The line says "by hand", so the top line does not say it again
  assert.equal(careLabelOf({ displayName: "Anna", careLabel: [{ phrase: "tear" }] }, OCT)!.maker, "Mended for Anna");

  // Names as names: written as a name, a title left off, no name left off
  assert.equal(nameOnLabel("anna"), "Anna");
  assert.equal(nameOnLabel("ANNA"), "Anna");
  assert.equal(nameOnLabel("McKenzie"), "McKenzie", "as she wrote it");
  assert.equal(nameOnLabel("AJ"), "AJ", "initials are kept");
  assert.equal(nameOnLabel("anne-marie"), "Anne-Marie");
  assert.equal(nameOnLabel("ANNE-MARIE"), "Anne-Marie");
  assert.equal(nameOnLabel("o'brien"), "O'Brien");
  assert.equal(nameOnLabel("ja'nae"), "Ja'nae", "an apostrophe inside a name is left alone");
  assert.equal(nameOnLabel("Анна"), "Анна");
  assert.equal(nameOnLabel("Mrs Smith"), null);
  assert.equal(nameOnLabel("Dr."), null);
  assert.equal(nameOnLabel("  "), null);
  assert.equal(nameOnLabel(undefined), null);
  assert.equal(nameOnLabel("x".repeat(21)), null);
  assert.equal(careLabelOf({ service: "Alterations", careLabel: [{ phrase: "taper" }] }, OCT)!.maker, "Altered by hand");
  assert.equal(careLabelOf({ displayName: "Mrs", service: "Alterations" }, OCT)!.maker, "Altered by hand");
});

test("no line picked: the service's own line — and for a look, no label at all", () => {
  assert.deepEqual(careLabelOf({ displayName: "Olivia", service: "Wedding Dress Alterations" }, OCT), {
    maker: "Altered by hand for Olivia",
    lines: ["Ready for the wedding"],
    month: "October 2026",
  });
  assert.equal(careLabelOf({ displayName: "Olivia", service: "Custom Sewing" }, OCT)!.maker, "Made by hand for Olivia");
  assert.equal(careLabelOf({ displayName: "Olivia", service: "Home Textiles" }, OCT)!.maker, "Finished by hand for Olivia");
  assert.equal(careLabelOf({ displayName: "Olivia", service: "Repairs" }, OCT)!.lines[0], "Ready to use again");
  assert.equal(careLabelOf({ displayName: "Olivia", service: "Not sure — free 10-minute look" }, OCT), null);
  assert.equal(careLabelOf({ displayName: "Olivia", service: "Other / Not Sure", careLabel: [] }, OCT), null);
  // A look that became a job: the line she picked is the label
  assert.deepEqual(careLabelOf({ displayName: "Olivia", service: "Not sure — free 10-minute look", careLabel: [{ phrase: "zip" }] }, OCT)?.lines, [
    "Zip replaced, matched in colour and weight",
  ]);
  // An unknown name is an alteration; a broken line is dropped, never printed
  assert.equal(careLabelOf({ displayName: "Olivia", service: "Something new" }, OCT)!.lines[0], "Made to fit");
  assert.deepEqual(careLabelOf({ displayName: "Olivia", service: "Repairs", careLabel: [{ phrase: "hem" }] }, OCT)!.lines, [
    "Ready to use again",
  ]);
  assert.equal(
    careLabelOf({ service: "Alterations", careLabel: [{ phrase: "taper" }, { phrase: "darts" }, { phrase: "sleeves", a: 2 }] }, OCT)!.lines.length,
    MAX_LINES
  );
});

test("the month is Southampton's, whatever the server's clock says", () => {
  // 00:30 on 1 October in British Summer Time is still 30 September in UTC
  assert.equal(labelMonth(new Date("2026-09-30T23:30:00Z")), "October 2026");
  // After the clocks go back, midnight is midnight
  assert.equal(labelMonth(new Date("2026-10-31T23:30:00Z")), "October 2026");
  assert.equal(labelMonth(new Date("2026-11-01T00:00:00Z")), "November 2026");
});

test("the label is drawn the way every email client can draw it", () => {
  const html = careLabelHtml(careLabelOf({ displayName: "Anna", careLabel: [{ phrase: "jeans-original", a: 6 }, { phrase: "waist-in", a: 2.5 }] }, OCT)!);
  // The stitch is a dashed border on a table cell — Outlook draws borders reliably only there
  assert.match(html, /<td bgcolor="#F6F0E4" align="center" style="background-color:#F6F0E4;border:1px dashed #B08848;/);
  assert.doesNotMatch(html, /<(div|p)[^>]*border/, "never on a div or a paragraph");
  assert.doesNotMatch(html, /border-radius|box-shadow|background-image|gradient|font-variant|text-transform/);
  // A fixed width for Outlook, a fluid one for every phone
  assert.match(html, /<!--\[if mso\]><table role="presentation" align="center" width="280"/);
  assert.match(html, /max-width:280px/);
  // Typed capitals, a named face on every paragraph, Outlook's line-height rule before the line-height
  assert.match(html, />BEAUTASY &middot; SOUTHAMPTON</);
  assert.match(html, />OCTOBER 2026</);
  const paragraphs = html.match(/<p [^>]*>/g)!;
  assert.equal(paragraphs.length, 5);
  for (const p of paragraphs) assert.match(p, /font-family:Georgia,'Times New Roman',serif;mso-line-height-rule:exactly;/);
  // Numbers keep their units, and a wrapped line never leaves a word alone
  assert.match(html, />Taken up 6&nbsp;cm, original hem sewn back&nbsp;on</);
  assert.match(html, />Waist taken in 2.5&nbsp;cm at the centre&nbsp;back</);
  assert.doesNotMatch(html, /&amp;nbsp;/);
  assert.doesNotMatch(html, /#000000|#FFFFFF|#fff\b/i, "no pure black or white for a dark mode to fight");
});

test("what a customer typed cannot write the label", () => {
  const html = careLabelHtml(careLabelOf({ displayName: "<img src=x onerror=alert(1)>", service: "Alterations" }, OCT)!);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /Altered by hand for &lt;img</);
});
