import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, leadIdFor, nearHer, plainText, telegramMessage, type LeadCandidate } from "./leadScout";
import { keepers, leadDocument, leadEmailHtml, leadEmailSubject, runLeadSearch } from "./leadRun";
import type { SourceResult } from "./leadSources";

/**
 * The morning search's judgement, read the way Kristina would get it. The
 * first case is the post that started it — the Romsey workroom in "UK
 * Freelance Seamstresses", 11 October 2026 — word for word.
 */

const ROMSEY: LeadCandidate = {
  source: "adzuna",
  url: "https://example.org/romsey",
  title: "UK Freelance Seamstresses",
  text:
    "Hi everyone, I'm currently looking for someone to help with my soft furnishings business. Ideally it would be somebody experienced in making interlined, hand made curtains.\n\n" +
    "I'm based in Romsey, Hampshire. I have a workroom, but I usually use people who work from home.\n\n" +
    "Please get in contact if you have the capacity to take on work and have knowledge of soft furnishings 😊",
};

function post(title: string, text: string, extra: Partial<LeadCandidate> = {}): LeadCandidate {
  return { source: "adzuna", url: `https://example.org/${encodeURIComponent(title)}`, title, text, ...extra };
}

test("the Romsey post is kept, high, and says why in Russian", () => {
  const verdict = judge(ROMSEY);
  assert.equal(verdict.keep, true);
  assert.ok(verdict.score >= 12, `score ${verdict.score}`);
  assert.ok(verdict.why.includes("шторы на прокладке"));
  assert.ok(verdict.why.includes("можно из дома"));
  assert.ok(verdict.why.includes("рядом: Romsey"));
});

test("offers, sales and classes are not kept, however close to her craft", () => {
  for (const [title, text] of [
    ["Seamstress available", "I am a seamstress offering alterations and curtains in Southampton, DM me for prices"],
    ["Sewing machine for sale", "Janome sewing machine for sale, £80, Eastleigh. Great for curtains."],
    ["Curtain making course", "Learn interlined curtain making at our Winchester workshop. Classes every Saturday, looking for new students."],
  ]) {
    assert.equal(judge(post(title, text)).keep, false, title);
  }
});

test("a seamstress in a post that asks nobody for anything is not kept", () => {
  assert.equal(judge(post("My first curtains", "Finished my first pair of interlined curtains in Romsey today, so proud!")).keep, false);
});

test("a building tender's 'alterations' and 'blinds' are not her craft", () => {
  const tender = post("Alterations to Radford House", "Internal refurbishment, change of use, new windows and blinds. Hampshire.", {
    source: "contractsFinder",
    askingByNature: true,
  });
  assert.equal(judge(tender).keep, false);
});

test("a council tender for curtains near her is kept", () => {
  const tender = post("Curtains, Blinds and Other Associated Products and Services", "Supply, making up and fitting of curtains for council properties.", {
    source: "contractsFinder",
    place: "South East, SO50",
    askingByNature: true,
  });
  // SO50 is not a town name; Hampshire is not said, so near is not claimed
  const verdict = judge(tender);
  assert.equal(verdict.keep, true);
  assert.equal(nearHer(`${tender.title} ${tender.text} ${tender.place}`), null);
});

test("a full-time factory job loses points; an outwork one does not", () => {
  const factory = judge(post("Sewing machinist", "Full time permanent sewing machinist wanted, night shift, Basingstoke factory."));
  const outwork = judge(post("Sewing machinist", "Freelance sewing machinist wanted for outwork, Basingstoke."));
  assert.ok(outwork.score > factory.score);
  assert.ok(factory.why.includes("похоже на работу по найму"));
});

test("towns are whole words: Walton is not Alton", () => {
  assert.equal(nearHer("Walton-on-Thames"), null);
  assert.equal(nearHer("based in Alton"), "Alton");
  assert.equal(nearHer("we post the work out to you, UK-wide"), "по всей стране");
});

test("one advert is one id, whichever run finds it", () => {
  assert.equal(leadIdFor("adzuna", "https://a/1"), leadIdFor("adzuna", "https://a/1"));
  assert.notEqual(leadIdFor("adzuna", "https://a/1"), leadIdFor("adzuna", "https://a/2"));
  assert.match(leadIdFor("reed", "https://a/1"), /^lead-reed-[0-9a-z]+$/);
});

test("plain text drops markup and caps length", () => {
  assert.equal(plainText("<p>Hello &amp; <b>welcome</b></p><p>Two</p>"), "Hello & welcome\nTwo");
  assert.equal(plainText("x".repeat(30), 10).length, 10);
});

test("the Telegram message escapes what it quotes and links both ways", () => {
  const verdict = judge(ROMSEY);
  const text = telegramMessage({ ...ROMSEY, title: "<script> & curtains", ...verdict, _id: "lead-adzuna-x" }, "https://studio/x");
  assert.ok(text.includes("&lt;script&gt; &amp; curtains"));
  assert.ok(text.includes('<a href="https://example.org/romsey">Открыть объявление</a>'));
  assert.ok(text.includes('<a href="https://studio/x">В Studio</a>'));
  assert.ok(text.length <= 4000);
});

test("the email subject counts in Russian", () => {
  const one = keepers([{ source: "adzuna", candidates: [ROMSEY] }]);
  assert.equal(leadEmailSubject(one), "🧵 Ищут мастера: 1 новое предложение");
  assert.equal(leadEmailSubject([...one, ...one, ...one]), "🧵 Ищут мастера: 3 новых предложения");
  assert.equal(leadEmailSubject(Array(5).fill(one[0])), "🧵 Ищут мастера: 5 новых предложений");
  assert.equal(leadEmailSubject(Array(11).fill(one[0])), "🧵 Ищут мастера: 11 новых предложений");
  assert.ok(leadEmailHtml(one, { reed: "нет ключа REED_API_KEY" }).includes("Не ответили сегодня"));
});

test("the document keeps only what was given, and starts as new", () => {
  const [lead] = keepers([{ source: "adzuna", candidates: [ROMSEY] }]);
  const doc = leadDocument(lead, new Date("2026-10-12T06:30:00Z"));
  assert.equal(doc._type, "lead");
  assert.equal(doc.status, "new");
  assert.equal("pay" in doc, false);
  assert.equal(doc.foundAt, "2026-10-12T06:30:00.000Z");
});

// ─── The whole run, against stand-ins

function world(existingIds: string[] = []) {
  const saved: Record<string, unknown>[] = [];
  const telegrams: string[] = [];
  const emails: string[] = [];
  const sources = [
    async (): Promise<SourceResult> => ({ source: "adzuna", candidates: [ROMSEY, post("Sewing machine for sale", "for sale £80")] }),
    async (): Promise<SourceResult> => ({ source: "reed", candidates: [], problem: "нет ключа REED_API_KEY" }),
  ];
  return {
    saved,
    telegrams,
    emails,
    deps: {
      now: new Date("2026-10-12T06:30:00Z"), // a Monday
      sources,
      existing: async (ids: string[]) => ids.filter((id) => existingIds.includes(id)),
      save: async (docs: Record<string, unknown>[]) => void saved.push(...docs),
      telegram: async (text: string) => void telegrams.push(text),
      email: async (message: { subject: string }) => void emails.push(message.subject),
    },
  };
}

test("a new find is saved, then told in Telegram and by email; Monday adds Facebook", async () => {
  const w = world();
  const result = await runLeadSearch(w.deps);
  assert.equal(result.fresh, 1);
  assert.equal(w.saved.length, 1);
  assert.equal(w.telegrams.length, 2);
  assert.ok(w.telegrams[1].includes("Facebook"));
  assert.deepEqual(w.emails, ["🧵 Ищут мастера: 1 новое предложение"]);
  assert.equal(result.problems.reed, "нет ключа REED_API_KEY");
});

test("a find already in the Studio is not told again", async () => {
  const id = leadIdFor("adzuna", ROMSEY.url);
  const w = world([id]);
  const result = await runLeadSearch(w.deps);
  assert.equal(result.fresh, 0);
  assert.equal(w.saved.length, 0);
  assert.equal(w.telegrams.length, 0);
  assert.equal(w.emails.length, 0);
});

test("Telegram refusing does not stop the email", async () => {
  const w = world();
  const result = await runLeadSearch({
    ...w.deps,
    telegram: async () => {
      throw new Error("chat not found");
    },
  });
  assert.equal(result.telegram, "failed");
  assert.equal(result.email, "sent");
});

test("the Facebook searches come on Mondays only", async () => {
  const w = world();
  await runLeadSearch({ ...w.deps, now: new Date("2026-10-13T06:30:00Z") }); // Tuesday
  assert.equal(w.telegrams.length, 1);
  assert.ok(!w.telegrams[0].includes("Facebook"));
});
