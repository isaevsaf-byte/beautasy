import { test } from "node:test";
import assert from "node:assert/strict";
import { claimThenSend, type ClaimClient } from "./claim";

/**
 * A fake write client that records patches, keeps what they wrote so it can
 * be read back, and can refuse a stale revision. `docs` holds any other
 * documents a test puts next to the one claimed.
 */
function fakeClient(opts: { rev: string; id?: string }) {
  const log: string[] = [];
  const id0 = opts.id ?? "order-1";
  const docs = new Map<string, Record<string, unknown>>([[id0, { _id: id0 }]]);
  const client: ClaimClient = {
    patch(id) {
      return {
        ifRevisionId(rev) {
          return {
            set(fields) {
              return {
                async commit() {
                  if (rev !== opts.rev) throw new Error("revision mismatch");
                  log.push(`claim ${id} ${JSON.stringify(fields)}`);
                  opts.rev = `${opts.rev}+1`;
                  Object.assign(docs.get(id)!, fields, { _rev: opts.rev });
                  return { ...docs.get(id) };
                },
              };
            },
          };
        },
        set(fields) {
          return {
            async commit() {
              log.push(`set ${id} ${JSON.stringify(fields)}`);
              Object.assign(docs.get(id) ?? {}, fields);
            },
          };
        },
        unset(fields) {
          return {
            async commit() {
              log.push(`unset ${id} ${JSON.stringify(fields)}`);
              for (const field of fields) delete docs.get(id)?.[field];
            },
          };
        },
      };
    },
    async getDocument(id) {
      const doc = docs.get(id);
      return doc ? { ...doc } : undefined;
    },
  };
  return { client, log, docs };
}

test("the document is claimed before the email is sent", async () => {
  const { client, log } = fakeClient({ rev: "r1" });
  const order: string[] = [];
  const outcome = await claimThenSend(
    client,
    { _id: "order-1", _rev: "r1" },
    { notifiedStatus: "shipped" },
    ["notifiedStatus"],
    async () => {
      order.push("send");
    }
  );
  assert.equal(outcome, "sent");
  assert.deepEqual(log, ['claim order-1 {"notifiedStatus":"shipped"}']);
  assert.deepEqual(order, ["send"]);
});

test("a stale revision loses the race and sends nothing", async () => {
  const { client, log } = fakeClient({ rev: "r2" });
  let sends = 0;
  const outcome = await claimThenSend(
    client,
    { _id: "order-1", _rev: "r1" },
    { notifiedStatus: "shipped" },
    ["notifiedStatus"],
    async () => {
      sends++;
    }
  );
  assert.equal(outcome, "lost");
  assert.equal(sends, 0);
  assert.deepEqual(log, []);
});

test("a failed send hands the claim back so the next run retries", async () => {
  const { client, log } = fakeClient({ rev: "r1" });
  const outcome = await claimThenSend(
    client,
    { _id: "order-1", _rev: "r1" },
    { notifiedStatus: "shipped" },
    { notifiedStatus: "in-production" },
    async () => {
      throw new Error("resend down");
    }
  );
  assert.equal(outcome, "failed");
  assert.deepEqual(log, [
    'claim order-1 {"notifiedStatus":"shipped"}',
    'set order-1 {"notifiedStatus":"in-production"}',
  ]);
});

/**
 * The shape that actually arrives, which the test above cannot produce.
 *
 * `send` throwing is the failure this was written for, and in production it
 * never happened: every caller sends through Resend, and Resend answers a
 * refusal rather than throwing it. So the release branch was dead code with a
 * green test standing over it, and a revoked key or an unverified domain
 * claimed the document, resolved, and left it marked as told — the customer
 * never heard, and no run looked at that document again.
 */
test("a refusal the mail service resolves hands the claim back as well", async () => {
  const { client, log } = fakeClient({ rev: "r1" });
  const outcome = await claimThenSend(
    client,
    { _id: "order-1", _rev: "r1" },
    { notifiedStatus: "shipped" },
    { notifiedStatus: "in-production" },
    // Exactly what resend@6 hands back on a 403 — resolved, not thrown
    async () => ({
      data: null,
      error: {
        statusCode: 403,
        name: "validation_error",
        message: "The beautasy.co.uk domain is not verified",
      },
    })
  );
  assert.equal(outcome, "failed", "An answer saying no is not a send.");
  assert.deepEqual(log, [
    'claim order-1 {"notifiedStatus":"shipped"}',
    'set order-1 {"notifiedStatus":"in-production"}',
  ]);
});

/**
 * A booking's id can pass to someone else while its email is out: Kristina
 * declines Anna, the "sorry" is claimed and on its way, and in that second Bea
 * books the freed time online. The diary keeps Anna's booking as a record
 * named after the revision it took over, and gives the id to Bea. A blind
 * hand-back would then land on Bea — her confirmation sent twice — while
 * Anna's "sorry" was never tried again, and Anna came to a time that is Bea's.
 */
test("a claim whose time went to someone else is handed back to the record the diary kept", async () => {
  const id = "slot-2026-10-06-1400";
  const { client, log, docs } = fakeClient({ rev: "r1", id });
  Object.assign(docs.get(id)!, { status: "declined", notifiedStatus: "confirmed", displayName: "Anna" });

  const outcome = await claimThenSend(
    client,
    { _id: id, _rev: "r1" },
    { notifiedStatus: "declined" },
    { notifiedStatus: "confirmed" },
    async () => {
      // Bea takes the freed time while Anna's email is on its way
      const anna = docs.get(id)!;
      docs.set(`${id}-released-${anna._rev}`, { ...anna, _id: `${id}-released-${anna._rev}` });
      docs.set(id, { _id: id, _rev: "b1", status: "confirmed", notifiedStatus: "confirmed", displayName: "Bea" });
      throw new Error("resend down");
    }
  );

  assert.equal(outcome, "failed");
  assert.deepEqual(log, [
    `claim ${id} {"notifiedStatus":"declined"}`,
    `set ${id}-released-r1+1 {"notifiedStatus":"confirmed"}`,
  ]);
  assert.equal(docs.get(id)?.notifiedStatus, "confirmed", "Bea's booking is left alone");
  assert.equal(docs.get(`${id}-released-r1+1`)?.notifiedStatus, "confirmed", "Anna's is owed its email again");
});

test("a claim overtaken by a later one is left to it", async () => {
  const { client, log, docs } = fakeClient({ rev: "r1" });
  const outcome = await claimThenSend(
    client,
    { _id: "order-1", _rev: "r1" },
    { notifiedStatus: "shipped" },
    { notifiedStatus: "in-production" },
    async () => {
      // The order moved on and its own email was claimed meanwhile
      docs.get("order-1")!.notifiedStatus = "delivered";
      throw new Error("resend down");
    }
  );
  assert.equal(outcome, "failed");
  assert.deepEqual(log, ['claim order-1 {"notifiedStatus":"shipped"}'], "handing back would wipe the later claim");
  assert.equal(docs.get("order-1")?.notifiedStatus, "delivered");
});

/**
 * Two bookings can carry the same mark. Anna's confirmation is on its way; in
 * that second she cancels, Olga takes the freed time, and the mail service
 * refuses Anna's email. Olga's booking says "confirmed" too — but it is not
 * the record that was claimed, and handing the claim back to it would send
 * Olga a second confirmation.
 */
test("a claim is not handed back to another record that came to carry the same mark", async () => {
  const id = "slot-2026-10-06-1400";
  const { client, log, docs } = fakeClient({ rev: "r1", id });
  Object.assign(docs.get(id)!, { status: "confirmed", createdAt: "2026-09-20T09:00:00.000Z", displayName: "Anna" });

  const outcome = await claimThenSend(client, { _id: id, _rev: "r1" }, { notifiedStatus: "confirmed" }, ["notifiedStatus"], async () => {
    // Anna cancels (a new revision), then Olga takes the time: Anna's record is named after that revision
    const anna = { ...docs.get(id)!, status: "cancelled", _rev: "anna-cancelled" };
    docs.set(`${id}-released-anna-cancelled`, { ...anna, _id: `${id}-released-anna-cancelled` });
    docs.set(id, {
      _id: id,
      _rev: "o1",
      status: "confirmed",
      notifiedStatus: "confirmed",
      createdAt: "2026-09-27T10:00:00.000Z",
      displayName: "Olga",
    });
    throw new Error("resend down");
  });

  assert.equal(outcome, "failed");
  assert.deepEqual(log, [`claim ${id} {"notifiedStatus":"confirmed"}`], "nothing is handed back to Olga");
  assert.equal(docs.get(id)?.notifiedStatus, "confirmed");
});
