import { test } from "node:test";
import assert from "node:assert/strict";
import { claimThenSend, type ClaimClient } from "./claim";

/** A fake write client that records patches and can refuse a stale revision. */
function fakeClient(opts: { rev: string }) {
  const log: string[] = [];
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
                },
              };
            },
          };
        },
        set(fields) {
          return {
            async commit() {
              log.push(`set ${id} ${JSON.stringify(fields)}`);
            },
          };
        },
        unset(fields) {
          return {
            async commit() {
              log.push(`unset ${id} ${JSON.stringify(fields)}`);
            },
          };
        },
      };
    },
  };
  return { client, log };
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
