import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import { seal, unseal } from "./secrets";
import { sendEmail, type EmailMessage } from "./sendEmail";
import type { ClaimClient } from "./claim";
import { bookingEmailHtml, reminderEmailHtml } from "./bookingEmails";
import { whatToBring } from "./whatToBring";
import { FRESH_CONFIRMATION_MS, REMINDER_QUERY, owedReminder, sendFittingReminders, type ReminderDeps } from "./bookingReminders";

/**
 * The day-before reminder, run whole against stand-ins: the database answers
 * queries through groq-js and keeps revisions, so the real claim
 * (`claimThenSend`) can win, lose and hand back exactly as it would on Sanity.
 * Nothing reaches Sanity or Resend.
 */

const hadSecret = process.env.DATA_SECRET;
before(() => {
  process.env.DATA_SECRET = "a passphrase for these tests only";
});
after(() => {
  if (hadSecret === undefined) delete process.env.DATA_SECRET;
  else process.env.DATA_SECRET = hadSecret;
});

/** Saturday 24 October 2026, 10:10am BST — tonight the clocks go back, and tomorrow is Sunday the 25th. */
const SATURDAY = new Date("2026-10-24T09:10:00Z");
/** Booked a week before */
const LAST_WEEK = "2026-10-17T10:00:00.000Z";

type Doc = Record<string, unknown> & { _id: string; _rev: string };

let revs = 0;
function booking(_id: string, fields: Record<string, unknown>): Doc {
  return {
    _id,
    _rev: `r${++revs}`,
    _type: "atelierBooking",
    status: "confirmed",
    emailSealed: seal(`${_id}@example.com`),
    createdAt: LAST_WEEK,
    ...fields,
  };
}

function diary(): Doc[] {
  return [
    booking("slot-2026-10-25-1400", { displayName: "Anna", service: "Alterations", slotStart: "2026-10-25T14:00" }),
    booking("slot-2026-10-25-1100", {
      displayName: "Bea",
      service: "Bridal fitting",
      slotStart: "2026-10-25T11:00",
      slotEnd: "2026-10-25T12:00",
      confirmedFor: "Sunday 25 October at 11:00am",
    }),
    // Reminded for the time it had before it was moved: owed one for this time
    booking("slot-2026-10-25-1600", { displayName: "Moved", slotStart: "2026-10-25T16:00", reminderSentFor: "2026-10-22T10:00" }),
    // Not owed one
    booking("slot-2026-10-25-0930", { displayName: "Told", slotStart: "2026-10-25T09:30", reminderSentFor: "2026-10-25T09:30" }),
    booking("slot-2026-10-25-1000", { displayName: "Collect", slotStart: "2026-10-25T10:00", slotEnd: "2026-10-25T11:00", collection: { district: "SO17" } }),
    booking("slot-2026-10-25-1200", { displayName: "Waiting", status: "new", slotStart: "2026-10-25T12:00" }),
    booking("slot-2026-10-25-1230", { displayName: "Cancelled", status: "cancelled", slotStart: "2026-10-25T12:30" }),
    booking("slot-2026-10-25-1300-released-r1", { displayName: "Released", slotStart: "2026-10-25T13:00", releasedAt: "2026-10-20T10:00:00Z" }),
    booking("drafts.slot-2026-10-25-1330", { displayName: "Draft", slotStart: "2026-10-25T13:30" }),
    booking("slot-2026-10-25-1500", { displayName: "NoEmail", slotStart: "2026-10-25T15:00", emailSealed: undefined }),
    booking("slot-2026-10-24-1500", { displayName: "Today", slotStart: "2026-10-24T15:00" }),
    booking("slot-2026-10-26-0900", { displayName: "Monday", slotStart: "2026-10-26T09:00" }),
    booking("typed", { displayName: "Typed", confirmedFor: "Sunday 25 October, 7:30pm" }),
  ];
}

/** A database that keeps revisions, as Sanity does, and the emails handed over. */
function store(docs: Doc[]) {
  const byId = new Map(docs.map((doc) => [doc._id, doc]));
  const sent: EmailMessage[] = [];
  const client: ClaimClient = {
    patch(id) {
      const write = (change: (doc: Doc) => void) => ({
        async commit() {
          const doc = byId.get(id);
          if (!doc) throw Object.assign(new Error("not found"), { statusCode: 404 });
          change(doc);
          doc._rev = `r${++revs}`;
          return { ...doc };
        },
      });
      return {
        ifRevisionId(rev) {
          return {
            set(fields) {
              return {
                async commit() {
                  if (byId.get(id)?._rev !== rev) throw Object.assign(new Error("revision mismatch"), { statusCode: 409 });
                  return write((doc) => Object.assign(doc, fields)).commit();
                },
              };
            },
          };
        },
        set: (fields) => write((doc) => Object.assign(doc, fields)),
        unset: (fields) => write((doc) => fields.forEach((field) => delete doc[field])),
      };
    },
    async getDocument(id) {
      const doc = byId.get(id);
      return doc ? { ...doc } : undefined;
    },
  };
  const deps: ReminderDeps & { sent: EmailMessage[]; byId: Map<string, Doc> } = {
    sent,
    byId,
    now: SATURDAY,
    // A copy of each document, as a real query answers: a later write does not change what was read
    fetch: async (query, params) =>
      (await evaluate(parse(query), { dataset: [...byId.values()].map((doc) => ({ ...doc })), params })).get(),
    client,
    send: async (message) => {
      sent.push(message);
    },
  };
  return deps;
}

test("tomorrow's confirmed fittings with an email, not reminded for this time yet — nothing else", async () => {
  const docs = diary();
  const result = await evaluate(parse(REMINDER_QUERY), {
    dataset: docs,
    params: { day: "2026-10-25", nextDay: "2026-10-26" },
  });
  const found = (await result.get()) as { displayName: string }[];
  assert.deepEqual(
    found.map((doc) => doc.displayName),
    ["Bea", "Anna", "Moved"]
  );
});

test("Saturday before the clocks go back reminds Sunday's fittings; Sunday reminds Monday's", async () => {
  const deps = store(diary());
  const saturday = await sendFittingReminders(deps);
  assert.deepEqual(saturday, { day: "2026-10-25", checked: 3, sent: 3, skipped: 0 });
  assert.deepEqual(
    deps.sent.map((email) => email.to).sort(),
    ["slot-2026-10-25-1100@example.com", "slot-2026-10-25-1400@example.com", "slot-2026-10-25-1600@example.com"]
  );
  // Sunday, now in GMT: Monday's fitting, and nobody twice
  const sunday = await sendFittingReminders({ ...deps, now: new Date("2026-10-25T09:10:00Z") });
  assert.equal(sunday.day, "2026-10-26");
  assert.equal(sunday.sent, 1);
  assert.equal(deps.sent.at(-1)?.to, "slot-2026-10-26-0900@example.com");
});

test("run by hand just after midnight on the night the clocks go back, 'tomorrow' is still the next calendar day", async () => {
  // 11:30pm UTC on Saturday is 12:30am on Sunday in Southampton, so tomorrow
  // is Monday. Twenty-four hours on from now is 11:30pm GMT — still Sunday —
  // and a job that counted in hours would remind Sunday's fittings again.
  const deps = store(diary());
  const result = await sendFittingReminders({ ...deps, now: new Date("2026-10-24T23:30:00Z") });
  assert.equal(result.day, "2026-10-26");
  assert.deepEqual(deps.sent.map((email) => email.to), ["slot-2026-10-26-0900@example.com"]);
});

test("the reminder: their time and job, what to bring, the confirmation's own words on where and how to move it", async () => {
  const deps = store(diary());
  await sendFittingReminders(deps);
  const bea = deps.sent.find((email) => email.to.startsWith("slot-2026-10-25-1100"))!;
  assert.equal(bea.subject, "See you tomorrow at 11:00am 💜");
  assert.equal(bea.replyTo, "hello@beautasy.co.uk", "'reply to this email' reaches Kristina");
  assert.equal(bea.attachments, undefined, "no second calendar file");
  assert.match(bea.html, /Bea, a little reminder: your appointment for bridal fitting is tomorrow, <strong>Sunday 25 October at 11:00am<\/strong>\. It takes about an hour\./);
  assert.ok(bea.html.includes(whatToBring("Bridal fitting").sentence.replace(/'/g, "&#39;")), "what to bring for a bride");

  // The same "Where / Bring / Need to move it?" block the confirmation carries, word for word
  const confirmation = bookingEmailHtml(
    { _id: "x", _rev: "x", status: "confirmed", displayName: "Bea", service: "Bridal fitting", slotStart: "2026-10-25T11:00" },
    "confirmed"
  );
  const block = (html: string) => html.slice(html.indexOf(">Where<"), html.indexOf("</div>", html.indexOf(">Where<")));
  assert.ok(block(bea.html).length > 100);
  assert.equal(block(bea.html), block(confirmation));
  assert.match(bea.html, /Kristina will send you the exact address and how to find the door before your visit\./);
  assert.match(bea.html, /Reply to this email, or WhatsApp Kristina on \+44 7729 741116\./);
  assert.match(bea.html, /href="https:\/\/wa\.me\/447729741116\?text=/);
  // The atelier is a home: no street, no postcode
  assert.doesNotMatch(bea.html, /Westwood|Albany|SO17 1LA|Flat 41/);

  const anna = deps.sent.find((email) => email.to.startsWith("slot-2026-10-25-1400"))!;
  assert.match(anna.html, /your appointment for alterations is tomorrow, <strong>Sunday 25 October at 2:00pm<\/strong>\.<\/p>/, "one slot says nothing about length");
});

test("the HTML is escaped: a name typed into the form cannot write the email", () => {
  const html = reminderEmailHtml({ displayName: "<img src=x>", service: "Alterations", slotStart: "2026-10-25T14:00" });
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt;, a little reminder/);
});

test("once per booking and time: the claim is written before the email, and a second run sends nothing", async () => {
  const deps = store(diary());
  await sendFittingReminders(deps);
  const anna = deps.byId.get("slot-2026-10-25-1400")!;
  assert.equal(anna.reminderSentFor, "2026-10-25T14:00");
  assert.equal(anna.reminderSentAt, SATURDAY.toISOString());
  const again = await sendFittingReminders({ ...deps, now: new Date("2026-10-24T09:50:00Z") });
  assert.equal(again.sent, 0);
  assert.equal(deps.sent.length, 3);
});

test("two runs at the same moment send each reminder once", async () => {
  const deps = store(diary());
  const [one, two] = await Promise.all([sendFittingReminders(deps), sendFittingReminders(deps)]);
  assert.equal(one.sent + two.sent, 3);
  assert.equal(deps.sent.length, 3);
});

test("an email Resend refuses hands the mark back, and the next run sends it", async () => {
  const deps = store(diary());
  // The real sender, with Resend answering a refusal the way it does: resolved, with an error
  const refusing = { ...deps, send: (message: EmailMessage) => sendEmail(message, async () => ({ data: null, error: { name: "validation_error", message: "Domain not verified" } })) };
  const failed = await sendFittingReminders(refusing);
  assert.equal(failed.sent, 0);
  assert.equal(deps.byId.get("slot-2026-10-25-1400")!.reminderSentFor, undefined, "marked as reminded, and never reminded");
  const retried = await sendFittingReminders(deps);
  assert.equal(retried.sent, 3);
});

test("a fitting booked or moved in the last twelve hours is not reminded — its confirmation just said it all", () => {
  const base = { _id: "b", _rev: "r", slotStart: "2026-10-25T14:00" };
  const ago = (ms: number) => new Date(SATURDAY.getTime() - ms).toISOString();
  assert.equal(owedReminder({ ...base, createdAt: ago(2 * 3600_000) }, SATURDAY), false);
  assert.equal(owedReminder({ ...base, createdAt: LAST_WEEK, movedAt: ago(3 * 3600_000) }, SATURDAY), false);
  assert.equal(owedReminder({ ...base, createdAt: ago(FRESH_CONFIRMATION_MS - 1) }, SATURDAY), false);
  assert.equal(owedReminder({ ...base, createdAt: ago(FRESH_CONFIRMATION_MS) }, SATURDAY), true);
  assert.equal(owedReminder({ ...base }, SATURDAY), true, "an old booking with no createdAt is still reminded");
  // A time typed over the diary's: the diary's time is not theirs
  assert.equal(owedReminder({ ...base, confirmedFor: "Monday 26 October at 10:00am", createdAt: LAST_WEEK }, SATURDAY), false);
});

test("the address is opened only to send, and the booking keeps it sealed", async () => {
  const deps = store(diary());
  await sendFittingReminders(deps);
  const anna = deps.byId.get("slot-2026-10-25-1400")!;
  assert.match(String(anna.emailSealed), /^v1\./);
  assert.equal(unseal(String(anna.emailSealed)), "slot-2026-10-25-1400@example.com");
  assert.equal(Object.values(anna).some((value) => value === "slot-2026-10-25-1400@example.com"), false);
});
