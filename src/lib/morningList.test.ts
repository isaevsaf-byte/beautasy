import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, parse } from "groq-js";
import { seal } from "./secrets";
import { sendEmail, type EmailMessage } from "./sendEmail";
import {
  MORNING_LIST_QUERY,
  diaryTimeHolds,
  morningListIdFor,
  morningListSubject,
  sendMorningList,
  visitsFrom,
  type DiaryBooking,
  type MorningListDeps,
} from "./morningList";

/**
 * Kristina's morning list, run whole against stand-ins: the database answers
 * through groq-js — the GROQ engine Sanity runs — over the documents given
 * here, and refuses an id already in use with 409, as Sanity does. Nothing
 * reaches Sanity or Resend.
 */

const hadSecret = process.env.DATA_SECRET;
before(() => {
  process.env.DATA_SECRET = "a passphrase for these tests only";
});
after(() => {
  if (hadSecret === undefined) delete process.env.DATA_SECRET;
  else process.env.DATA_SECRET = hadSecret;
});

/** Saturday 24 October 2026, 10:10am BST: tonight the clocks go back. */
const SATURDAY = new Date("2026-10-24T09:10:00Z");

type Doc = Record<string, unknown> & { _id: string };

function booking(_id: string, fields: Record<string, unknown>): Doc {
  return { _id, _type: "atelierBooking", status: "confirmed", ...fields };
}

function diary(): Doc[] {
  return [
    booking("slot-2026-10-24-1400", {
      displayName: "Anna",
      service: "Alterations",
      slotStart: "2026-10-24T14:00",
      confirmedFor: "Saturday 24 October at 2:00pm",
      phoneSealed: seal("07700 900123"),
    }),
    // Tomorrow is the Sunday the clocks go back
    booking("slot-2026-10-25-1100", {
      displayName: "Bea",
      service: "Repairs",
      slotStart: "2026-10-25T11:00",
      slotEnd: "2026-10-25T12:00",
      confirmedFor: "Sunday 25 October, between 11:00am and 12:00pm",
      collection: { district: "SO17", zone: "Free over £40" },
      phoneSealed: seal("+44 7700 900456"),
    }),
    booking("slot-2026-10-25-1500", { displayName: "<b>Cat</b>", service: "Bridal fitting", slotStart: "2026-10-25T15:00", slotEnd: "2026-10-25T16:00" }),
    // Not today or tomorrow
    booking("slot-2026-10-23-1400", { displayName: "Yesterday", slotStart: "2026-10-23T14:00" }),
    booking("slot-2026-10-26-0900", { displayName: "Monday", slotStart: "2026-10-26T09:00" }),
    // Not a visit
    booking("slot-2026-10-24-1000", { displayName: "Waiting", status: "new", slotStart: "2026-10-24T10:00" }),
    booking("slot-2026-10-24-1100", { displayName: "Cancelled", status: "cancelled", slotStart: "2026-10-24T11:00" }),
    booking("slot-2026-10-24-1200-released-r1", { displayName: "Released", slotStart: "2026-10-24T12:00", releasedAt: "2026-10-20T10:00:00Z" }),
    booking("drafts.slot-2026-10-24-1300", { displayName: "Draft", slotStart: "2026-10-24T13:00" }),
    booking("typed", { displayName: "Typed", confirmedFor: "Saturday 24 October, 7:30pm" }),
    // Moved by typing a new time: its diary time is a time nobody is coming at
    booking("slot-2026-10-24-1600", { displayName: "Moved", slotStart: "2026-10-24T16:00", confirmedFor: "Monday 26 October at 10:00am" }),
  ];
}

function store(docs: Doc[]) {
  const claims = new Map<string, Doc>();
  const sent: EmailMessage[] = [];
  const deps: MorningListDeps & { claims: typeof claims; sent: typeof sent } = {
    claims,
    sent,
    now: SATURDAY,
    fetch: async (query, params) => (await evaluate(parse(query), { dataset: docs, params })).get(),
    claim: async (doc) => {
      if (claims.has(doc._id)) throw Object.assign(new Error("Document already exists"), { statusCode: 409 });
      claims.set(doc._id, doc);
    },
    release: async (id) => {
      claims.delete(id);
    },
    send: async (message) => {
      sent.push(message);
    },
  };
  return deps;
}

test("today's and tomorrow's confirmed visits, in time order, and nothing else", async () => {
  const result = await evaluate(parse(MORNING_LIST_QUERY), {
    dataset: diary(),
    params: { from: "2026-10-24", until: "2026-10-26" },
  });
  const bookings = (await result.get()) as DiaryBooking[];
  const visits = visitsFrom(bookings, { today: "2026-10-24", tomorrow: "2026-10-25" });
  assert.deepEqual(
    visits.map((visit) => [visit.day, visit.time, visit.name]),
    [
      ["today", "2:00pm", "Anna"],
      ["tomorrow", "11:00am–12:00pm", "Bea"],
      ["tomorrow", "3:00pm", "<b>Cat</b>"],
    ]
  );
  const [anna, bea, cat] = visits;
  assert.equal(anna.collectFrom, null);
  assert.equal(bea.collectFrom, "SO17 · Free over £40", "the district and zone — the site keeps no more");
  // WhatsApp with the client's number and a first line; none without a number
  assert.equal(
    anna.whatsapp,
    `https://wa.me/447700900123?text=${encodeURIComponent("Hi Anna, it's Kristina from Beautasy, about your fitting today at 2:00pm: ")}`
  );
  assert.match(bea.whatsapp ?? "", /^https:\/\/wa\.me\/447700900456\?text=.*collecting%20your%20repairs%20tomorrow/);
  assert.equal(cat.whatsapp, null);
});

test("the diary's time is used only when it is the time the client was told", () => {
  assert.equal(diaryTimeHolds({ slotStart: "2026-10-24T14:00" }), true);
  assert.equal(diaryTimeHolds({ slotStart: "2026-10-24T14:00", confirmedFor: "Saturday 24 October at 2:00pm" }), true);
  const trip = { slotStart: "2026-10-25T11:00", slotEnd: "2026-10-25T12:00" };
  assert.equal(diaryTimeHolds({ ...trip, confirmedFor: "Sunday 25 October, between 11:00am and 12:00pm" }), true);
  assert.equal(diaryTimeHolds({ slotStart: "2026-10-24T16:00", confirmedFor: "Monday 26 October at 10:00am" }), false);
  assert.equal(diaryTimeHolds({ confirmedFor: "Saturday 24 October, 7:30pm" }), false);
  assert.equal(diaryTimeHolds({ slotStart: "tomorrow" }), false);
});

test("one email to the atelier: the two days, the visits, escaped, and the phone only inside its link", async () => {
  const deps = store(diary());
  const result = await sendMorningList(deps);
  assert.deepEqual(result, { day: "2026-10-24", visits: 3, outcome: "sent" });
  assert.equal(deps.sent.length, 1);
  const [email] = deps.sent;
  assert.equal(email.to, "hello@beautasy.co.uk");
  assert.equal(email.subject, "☀️ Your atelier: 1 today · 2 tomorrow");
  assert.match(email.html, /Today — Saturday 24 October/);
  assert.match(email.html, /Tomorrow — Sunday 25 October/);
  assert.match(email.html, /<strong>2:00pm<\/strong> · Anna — Alterations/);
  assert.match(email.html, /🚗 collect &amp; return, SO17/);
  assert.match(email.html, /&lt;b&gt;Cat&lt;\/b&gt;/);
  assert.doesNotMatch(email.html, /<b>Cat<\/b>/);
  assert.doesNotMatch(email.html.replace(/href="[^"]*"/g, ""), /7700|900 ?123/, "the number appears only inside the wa.me link");
  for (const name of ["Yesterday", "Monday", "Waiting", "Cancelled", "Released", "Draft", "Typed", "Moved"]) {
    assert.doesNotMatch(email.html, new RegExp(`· ${name} —`), name);
  }
  // The claim carries counts, never a name
  assert.deepEqual(Object.keys(deps.claims.get(morningListIdFor("2026-10-24"))!).sort(), ["_id", "_type", "claimedAt", "day", "visits"]);
});

test("a second run the same morning sends nothing — the day is claimed", async () => {
  const deps = store(diary());
  await sendMorningList(deps);
  const again = await sendMorningList({ ...deps, now: new Date("2026-10-24T09:40:00Z") });
  assert.equal(again.outcome, "already");
  assert.equal(deps.sent.length, 1);
  // The next morning is a new day
  const sunday = await sendMorningList({ ...deps, now: new Date("2026-10-25T09:10:00Z") });
  assert.equal(sunday.outcome, "sent");
  assert.equal(deps.sent.length, 2);
});

test("nothing today or tomorrow: no email, and no claim, so a later booking still gets this morning's list", async () => {
  const deps = store(diary().filter((doc) => !["Anna", "Bea", "<b>Cat</b>"].includes(String(doc.displayName))));
  assert.deepEqual(await sendMorningList(deps), { day: "2026-10-24", visits: 0, outcome: "nothing" });
  assert.equal(deps.sent.length, 0);
  assert.equal(deps.claims.size, 0);
});

test("an email Resend refuses hands the day back, and the next run sends it", async () => {
  const deps = store(diary());
  // The real sender, with Resend answering a refusal the way it does: resolved, with an error
  const refusing = { ...deps, send: (message: EmailMessage) => sendEmail(message, async () => ({ data: null, error: { name: "validation_error", message: "Domain not verified" } })) };
  assert.equal((await sendMorningList(refusing)).outcome, "failed");
  assert.equal(deps.claims.size, 0, "the day was kept, so nothing would try again");
  assert.equal((await sendMorningList(deps)).outcome, "sent");
  assert.equal(deps.sent.length, 1);
});

test("a claim refused for any reason but 'already claimed' still sends — the list does not go quiet over a bad token", async () => {
  const deps = store(diary());
  const unwritable = {
    ...deps,
    claim: async () => {
      throw Object.assign(new Error("Insufficient permissions"), { statusCode: 403 });
    },
  };
  assert.equal((await sendMorningList(unwritable)).outcome, "sent");
  assert.equal(deps.sent.length, 1);
});

test("the morning cron runs the list and the clean-up once each, inside allSettled, read back in place — and not the client reminder", () => {
  const cron = readFileSync(join(process.cwd(), "src", "app", "api", "cron", "daily", "route.ts"), "utf8");
  const settled = cron.slice(cron.indexOf("Promise.allSettled(["), cron.indexOf("]);", cron.indexOf("Promise.allSettled([")));
  for (const job of ["sendMorningList", "runRetentionCleanup"]) {
    assert.match(settled, new RegExp(`\\n\\s{4}${job}\\(\\),`), `${job} is not in allSettled`);
    assert.equal((cron.match(new RegExp(`${job}\\(`, "g")) ?? []).length, 1, `${job} runs once`);
  }
  // Safar, 08.10: no reminder email to clients for now (see the cron's comment)
  assert.doesNotMatch(cron, /sendFittingReminders\(/);
  // Positional: the answers are read back in the order the jobs were listed
  const jobs = settled.match(/^\s{4}(\w+)\(/gm)?.map((line) => line.trim().replace("(", "")) ?? [];
  const at = jobs.indexOf("sendMorningList");
  assert.deepEqual(jobs.slice(at - 1, at + 2), ["sendPendingBookingEmails", "sendMorningList", "runRetentionCleanup"]);
  assert.match(cron, /bookings,\n\s+morningList,\n\s+retention,\n\s+socialDrafts,\n[\s\w,]*\] = results\.map/);
});

test("the subject says how the two days look", () => {
  const visit = (day: "today" | "tomorrow") => ({ day, time: "", name: "", what: "", collectFrom: null, whatsapp: null });
  assert.equal(morningListSubject([visit("today"), visit("today")]), "☀️ Your atelier: 2 today · nothing tomorrow");
  assert.equal(morningListSubject([visit("tomorrow")]), "☀️ Your atelier: nothing today · 1 tomorrow");
});
