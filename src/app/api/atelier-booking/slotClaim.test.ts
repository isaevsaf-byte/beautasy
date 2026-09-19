import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bookingReachedNobody, confirmationMark, writeBackAfterEmails } from "./route";

/**
 * Guards the two things that stop one fitting time being sold twice.
 *
 * A slot is checked against the diary and then written. Between those two
 * moments a second customer can do exactly the same thing, so the check alone
 * is not enough: the booking is created with an id derived from the slot, and
 * Sanity refuses a second document with the same id. Drop either half and
 * everything still compiles and every unit test still passes — the failure is
 * two people at the door at the same time, weeks later.
 *
 * The diary also has to be read past the CDN. A cached copy still showing a
 * slot that went a minute ago hands it out again, which is the same stale-read
 * bug that once sent duplicate emails.
 */

const ROUTE = readFileSync(
  join(process.cwd(), "src", "app", "api", "atelier-booking", "route.ts"),
  "utf8"
);

test("a chosen slot is checked against the diary before anything is written", () => {
  const check = ROUTE.indexOf("slotIsOffered(");
  const write = ROUTE.indexOf("sanityWriteClient.create(");
  assert.notEqual(check, -1, "the route no longer checks the slot is on offer");
  assert.notEqual(write, -1, "the route no longer writes the booking");
  assert.ok(check < write, "Check the slot before writing it, or 3am is bookable.");
});

test("the diary is read past the CDN when a booking is being taken", () => {
  assert.match(
    ROUTE,
    /getAvailableSlots\(\{\s*fresh:\s*true\s*\}\)/,
    "A cached diary still shows slots that have just gone. Read fresh here."
  );
});

test("the booking's id is the slot, so the database refuses the second taker", () => {
  assert.match(
    ROUTE,
    /_id:\s*slotDocumentId\(slot\)/,
    "Without a deterministic id, two requests that both pass the check both write a booking."
  );
});

test("a slot that loses the race is reported as taken, not as a generic failure", () => {
  const matches = ROUTE.match(/slotTaken:\s*true/g) ?? [];
  assert.ok(
    matches.length >= 2,
    "Both the check and the failed write must tell the customer to pick again."
  );
});

/* ─── What the request decides, once both emails have been tried ─── */

/**
 * The mark that says "this customer has been told", and when it goes on.
 *
 * This has now been wrong in both directions, and the tests below are the two
 * measurements that settled it.
 *
 * It started at creation: the document was born with
 * notifiedStatus: "confirmed" beside status: "confirmed". That is correct
 * exactly when the confirmation email goes out, and on 5 September it did not.
 * A booking marked as told is invisible to the nightly job — PENDING_QUERY in
 * bookingEmails.ts passes over a booking whose notifiedStatus already matches
 * its status — so somebody was booked into the diary, never told, and nothing
 * would ever tell them.
 *
 * So it was moved to after the send, and that opened the opposite hole. The
 * document is created, then two round trips to Resend happen, and only then is
 * the mark written: for about a second the booking sits in the database
 * looking exactly like one the nightly job is supposed to finish. Sanity fires
 * its webhook on create, that job runs the very query above, and it was
 * measured doing so — one match, on a document in precisely that intermediate
 * state. Two identical "your appointment is confirmed" emails to one customer,
 * a fraction of a second apart.
 *
 * Both are closed by the same discipline the four email queues already use
 * (see @/lib/claim): the mark goes on at birth as a CLAIM, and comes off again
 * when the confirmation is refused. Claimed, nobody else sends it. Released,
 * the nightly job finishes the job this request started.
 */

test("a picked time is claimed at birth, so nothing else can confirm it first", () => {
  assert.match(
    ROUTE,
    /notifiedStatus:\s*slot\s*\?\s*"confirmed"\s*:\s*undefined/,
    "Created unclaimed, the booking is visible to the nightly job for the second it takes to send two emails — and that job sends the same confirmation."
  );
});

test("the claim is handed back when the confirmation is refused", () => {
  // What to write is decided by `writeBackAfterEmails`, and measured as a
  // decision further down. This is the other half: the route has to actually
  // hand that decision to Sanity. A claim that is never released is the
  // 5 September bug — booked, never told, and invisible to everything that
  // would have told them.
  assert.match(ROUTE, /marks\.unset\.length > 0\) write = write\.unset\(marks\.unset\)/);
  assert.match(ROUTE, /marks\.set\) write = write\.set\(marks\.set\)/);
  assert.match(ROUTE, /await write\.commit\(\)/);
});

test("only a booked slot that was really confirmed keeps the claim", () => {
  // All four combinations, because the version of this condition that was
  // written inline had nothing standing over it: drop the `confirmed &&` and
  // every test in the project stayed green while a refused confirmation left
  // somebody holding a slot they did not know they had.
  assert.equal(confirmationMark({ slot: true, saved: true, confirmed: true }), "keep");
  assert.equal(
    confirmationMark({ slot: true, saved: true, confirmed: false }),
    "release",
    "The email was refused, so the claim goes back and the nightly job sends it."
  );
  assert.equal(
    confirmationMark({ slot: false, saved: true, confirmed: true }),
    "none",
    "A request with no chosen time is born 'new' — there is no claim on it to keep or release."
  );
  assert.equal(confirmationMark({ slot: false, saved: true, confirmed: false }), "none");
  assert.equal(
    confirmationMark({ slot: true, saved: false, confirmed: false }),
    "none",
    "Nothing was written down, so there is nothing to release."
  );
  assert.equal(confirmationMark({ slot: true, saved: false, confirmed: true }), "none");
});

/**
 * The guard that answers "please WhatsApp us instead".
 *
 * Its own function, and measured on all four inputs, because this is the exact
 * line 5 September switched off. `emailed` was set to true outside the try
 * block that sent the email, so a refusal read as a delivery, this guard saw
 * one of the two had worked, and the customer got a cheerful 201 for a booking
 * that existed nowhere at all. That mutation — moving one assignment one line
 * down — passed every test in the project.
 */
test("a booking is only called lost when it reached neither the Studio nor the inbox", () => {
  assert.equal(bookingReachedNobody(false, false), true, "Nowhere at all: tell them to use WhatsApp.");
  assert.equal(
    bookingReachedNobody(true, false),
    false,
    "Saved but not emailed is a row in the Studio, and the watchman chases it."
  );
  assert.equal(
    bookingReachedNobody(false, true),
    false,
    "Emailed but not saved is a request sitting in her inbox."
  );
  assert.equal(bookingReachedNobody(true, true), false);
});

/**
 * And the assignment itself, which is where 5 September actually happened.
 *
 * `bookingReachedNobody` can only be as truthful as what it is handed, and the
 * bug was in the handing: `emailed = true` sat outside the try block, so a
 * refusal set it just as a delivery did. Moving that one line back out again
 * is a mutation nothing else here can see, because from the function's side
 * the inputs still look honest.
 */
test("an email is only counted as sent where a refusal can still be caught", () => {
  for (const flag of ["emailed", "confirmed"]) {
    assert.match(
      ROUTE,
      new RegExp(`${flag} = true;\\s*\\} catch`),
      `${flag} must be the last thing inside the try, or a refused email counts as a sent one.`
    );
  }
});

/**
 * 🚨 And the stamp that says the atelier knows this booking exists.
 *
 * `kristinaNotifiedAt` is the only field anywhere that answers that question —
 * `status` cannot, because a picked time is written down as "confirmed" by the
 * site itself. The watchman reads it, so a stamp put on regardless of what the
 * mail service said is 5 September again in a new field: the booking looks
 * known about, the morning check stays quiet, and somebody turns up to a
 * locked door. Measured as a mutation: drop the `emailed` condition and every
 * other test in the project stayed green.
 */
test("Kristina is only marked as told when her own email was really taken", () => {
  const at = "2026-09-19T10:00:00.000Z";
  assert.deepEqual(
    writeBackAfterEmails({ emailed: true, mark: "keep", at }),
    { set: { kristinaNotifiedAt: at }, unset: [] },
    "Both emails went: she is told, and the customer's claim stands."
  );
  assert.deepEqual(
    writeBackAfterEmails({ emailed: false, mark: "keep", at }),
    null,
    "Her email was refused, so nothing may say she was told — the watchman is the only thing left that can catch this."
  );
  assert.deepEqual(
    writeBackAfterEmails({ emailed: false, mark: "release", at }),
    { set: null, unset: ["notifiedStatus"] },
    "Neither email went: nobody is told, and the claim goes back for the nightly job."
  );
  assert.deepEqual(
    writeBackAfterEmails({ emailed: true, mark: "release", at }),
    { set: { kristinaNotifiedAt: at }, unset: ["notifiedStatus"] },
    "She knows, the customer does not, and both facts are written in one go."
  );
  assert.equal(
    writeBackAfterEmails({ emailed: false, mark: "none", at }),
    null,
    "Nothing happened worth a round trip."
  );
});
