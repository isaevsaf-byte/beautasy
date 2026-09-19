import { test } from "node:test";
import assert from "node:assert/strict";
// Sanity's own GROQ parser and evaluator, already here as one of `sanity`'s
// dependencies. It is what lets these run the real queries rather than read
// them — the same trick siteHealth.test.ts uses on HEALTH_QUERY.
import { evaluate, parse } from "groq-js";
import { PENDING_QUERY as PENDING_ORDERS, claimStatusEmail } from "./orderStatusEmails";
import { PENDING_QUERY as PENDING_BOOKINGS, claimBookingEmail } from "./bookingEmails";
import { PENDING_QUERY as PENDING_REVIEWS, claimReviewRequest } from "./reviewRequests";
import { PENDING_ALERTS_QUERY, claimStockAlert } from "./stockAlerts";
import type { ClaimClient } from "./claim";
import { DUE_QUERY, deliverGiftCard } from "./giftCardEmails";

/**
 * An email the mail service would not take has to go out on the next run.
 *
 * Throwing on a refusal (see @/lib/sendEmail) and handing the claim back (see
 * @/lib/claim) are both only half the fix. The other half is these queries:
 * each one is what a later run uses to find the people still owed an email,
 * and every one of them selects on the very field the send marks. So the
 * question each test below asks is the one that decides whether an email is
 * late or gone — is this document still in the queue?
 *
 * Both directions are asserted every time. The second half of each test is the
 * bug as it stood: a mark left standing after a refusal, and the document
 * invisible to every run for ever afterwards. Without that half, a query that
 * matched everything would pass.
 */

async function ask(
  query: string,
  documents: Record<string, unknown>[],
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  // Sanity's API takes `[0...$limit]`; groq-js refuses to parse a slice that
  // is not two literal numbers. The cap is the one thing here that is not
  // under test — every case below has a single document in it — so the number
  // is written into the text and everything else is the query as it ships.
  const { limit, ...rest } = params;
  const text = limit === undefined ? query : query.replace("$limit", String(limit));
  const answer = await evaluate(parse(text), { dataset: documents, params: rest });
  return (await answer.get()) as Record<string, unknown>[];
}

function idsOf(rows: Record<string, unknown>[]): string[] {
  return rows.map((row) => row._id as string);
}

/* ─── The customer whose parcel has gone out ─── */

function order(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "order-1",
    _rev: "r1",
    _type: "order",
    status: "shipped",
    customerEmailSealed: "sealed:…",
    displayName: "A",
    createdAt: "2026-09-10T09:00:00Z",
    items: [{ name: "Silk slip", quantity: 1 }],
    ...over,
  };
}

test("an order status email that was refused is picked up again by the next run", async () => {
  // The claim was handed back, so the order carries the status it was last
  // told about — here, nothing at all.
  const released = await ask(PENDING_ORDERS, [order()], { limit: 50 });
  assert.deepEqual(idsOf(released), ["order-1"], "Still owed an email, so still in the queue.");

  const stillClaimed = await ask(PENDING_ORDERS, [order({ notifiedStatus: "shipped" })], {
    limit: 50,
  });
  assert.deepEqual(
    idsOf(stillClaimed),
    [],
    "And this is what a refusal used to leave behind: the parcel went, nobody was told, and no run ever looks at it again."
  );
});

/* ─── The customer whose fitting is confirmed ─── */

function booking(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: "booking-1",
    _rev: "r1",
    _type: "atelierBooking",
    status: "confirmed",
    emailSealed: "sealed:…",
    displayName: "A",
    service: "Alterations",
    confirmedFor: "Tuesday 22 September, 2pm",
    createdAt: "2026-09-18T09:00:00Z",
    ...over,
  };
}

test("a booking confirmation that was refused is picked up again by the next run", async () => {
  const released = await ask(PENDING_BOOKINGS, [booking()], { limit: 25 });
  assert.deepEqual(idsOf(released), ["booking-1"]);

  const stillClaimed = await ask(PENDING_BOOKINGS, [booking({ notifiedStatus: "confirmed" })], {
    limit: 25,
  });
  assert.deepEqual(idsOf(stillClaimed), []);
});

/**
 * The booking the incident was about, taken from the other end.
 *
 * A customer who picks their own time is confirmed by the route itself, in the
 * same request, and the document is born with notifiedStatus: "confirmed" on
 * it — which is correct only if that email goes. It is a claim, not a record:
 * when the mail service refuses the confirmation the route unsets it again,
 * and this query is what has to pick the booking up afterwards. See
 * `confirmationMark` in the route, and slotClaim.test.ts.
 */
test("a slot booking whose confirmation never went is still in the queue", async () => {
  const justTaken = booking({ _id: "atelierBooking-2026-09-22T14:00", slotStart: "2026-09-22T14:00" });
  const found = await ask(PENDING_BOOKINGS, [justTaken], { limit: 25 });
  assert.deepEqual(
    idsOf(found),
    ["atelierBooking-2026-09-22T14:00"],
    "Booked, not told: the nightly job has to be able to finish the job the request started."
  );
});

/* ─── The person waiting for a piece to come back ─── */

test("a back-in-stock email that was refused is picked up again by the next run", async () => {
  const product = { _id: "product-1", _type: "product", name: "Silk slip", slug: { current: "silk-slip" }, stock: 2 };
  const alert = (over: Record<string, unknown> = {}) => ({
    _id: "alert-1",
    _rev: "r1",
    _type: "stockAlert",
    notified: false,
    emailSealed: "sealed:…",
    product: { _type: "reference", _ref: "product-1" },
    ...over,
  });

  const released = await ask(PENDING_ALERTS_QUERY, [alert(), product]);
  assert.deepEqual(idsOf(released), ["alert-1"]);

  const stillClaimed = await ask(PENDING_ALERTS_QUERY, [alert({ notified: true }), product]);
  assert.deepEqual(
    idsOf(stillClaimed),
    [],
    "Marked notified on a refusal, the one person who asked to be told never is."
  );
});

/* ─── The customer who was going to be asked for a review ─── */

test("a review request that was refused is asked for again on the next run", async () => {
  const CUTOFF = "2026-09-05T09:00:00Z";
  const reviewOrder = (over: Record<string, unknown> = {}) => ({
    _id: "order-2",
    _rev: "r1",
    _type: "order",
    status: "delivered",
    customerEmailSealed: "sealed:…",
    displayName: "A",
    createdAt: "2026-08-20T09:00:00Z",
    items: [{ productId: "product-1", name: "Silk slip" }],
    ...over,
  });

  // The claim is both fields together, and both come back off on a refusal:
  // the next run mints a fresh token, so a fingerprint left behind would
  // belong to a link that reached nobody.
  const released = await ask(PENDING_REVIEWS, [reviewOrder()], { cutoff: CUTOFF, limit: 25 });
  assert.deepEqual(idsOf(released), ["order-2"]);

  const stillClaimed = await ask(
    PENDING_REVIEWS,
    [
      reviewOrder({
        reviewRequestSentAt: "2026-09-19T09:00:00Z",
        reviewTokenFingerprint: "abc",
      }),
    ],
    { cutoff: CUTOFF, limit: 25 }
  );
  assert.deepEqual(
    idsOf(stillClaimed),
    [],
    "The stamp went on before the send and was never taken off, so this customer was never asked."
  );
});

/* ─── The present somebody has already paid for ─── */

test("a gift card the mail service refused is still due on the next run", async () => {
  const card = (over: Record<string, unknown> = {}) => ({
    _id: "card-1",
    _type: "giftCard",
    initialAmount: 5000,
    codeSealed: "sealed:…",
    recipientEmailSealed: "sealed:…",
    source: "purchase",
    ...over,
  });

  const due = await ask(DUE_QUERY, [card()], { now: "2026-09-19T09:00:00Z" });
  assert.deepEqual(idsOf(due), ["card-1"]);

  const stamped = await ask(DUE_QUERY, [card({ sentAt: "2026-09-19T09:00:00Z" })], {
    now: "2026-09-19T09:00:00Z",
  });
  assert.deepEqual(
    idsOf(stamped),
    [],
    "A stamp written after a refusal is a paid-for present that no run will ever send."
  );
});

/**
 * And the stamp itself, watched rather than inferred.
 *
 * This is the one kind with no claim to hand back: `sentAt` goes on straight
 * after the send, so everything depends on the send having actually said yes.
 * From the outside a refused card and a refused-and-stamped card both answer
 * `false`, and only the second is money the recipient never sees — so both
 * seams are stood in for and the stamp is counted.
 */
test("a refused gift card is not stamped as sent", async () => {
  const hadKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  const stamps: string[] = [];
  try {
    const delivered = await deliverGiftCard(
      { _id: "card-1", code: "BEAU-1234", initialAmount: 5000, recipientEmail: "someone@example.com" },
      {
        deliver: async () => ({
          data: null,
          error: { statusCode: 403, name: "validation_error", message: "The beautasy.co.uk domain is not verified" },
        }),
        stamp: async (id) => stamps.push(id),
      }
    );
    assert.equal(delivered, false, "A refusal is not a delivery, and the cron's count must not say it was.");
    assert.deepEqual(stamps, [], "Nothing is written down, so tomorrow's run finds the card again.");
  } finally {
    if (hadKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = hadKey;
  }
});

test("a gift card Resend does take is stamped exactly once", async () => {
  const hadKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  const stamps: string[] = [];
  try {
    const delivered = await deliverGiftCard(
      { _id: "card-1", code: "BEAU-1234", initialAmount: 5000, recipientEmail: "someone@example.com" },
      {
        deliver: async () => ({ data: { id: "sent" }, error: null }),
        stamp: async (id) => stamps.push(id),
      }
    );
    assert.equal(delivered, true);
    assert.deepEqual(stamps, ["card-1"], "The other direction: a delivered card must not be sent twice.");
  } finally {
    if (hadKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = hadKey;
  }
});

/* ─── The other half: what the code actually writes back ─── */

/**
 * Every test above asks the queries what they would find. None of them asks
 * what the code puts there, and that gap is exactly where the bug lives.
 *
 * Measured, before these were written: the release argument at all four call
 * sites could be inverted — `{ notified: false }` turned into
 * `{ notified: true }`, a `notifiedStatus` release turned back into the claim,
 * the review request's two field names replaced by an empty list — and all 373
 * tests stayed green. Each of those mutations is an email lost for good, which
 * is the one thing this whole change exists to prevent.
 *
 * So these run the real claim-and-release, with a client that keeps what was
 * written, and then hand that document to the real query. Two halves held
 * together by one test instead of two separate assumptions.
 */

/** A stand-in for Sanity that keeps the document, so a test can read it back. */
function holding(doc: Record<string, unknown>) {
  const held: Record<string, unknown> = { ...doc };
  const commit = async () => ({ ...held });
  const client: ClaimClient = {
    patch(id: string) {
      assert.equal(id, held._id, "The code patched a document it was not given.");
      const set = (fields: Record<string, unknown>) => {
        Object.assign(held, fields);
        return { commit };
      };
      const unset = (names: string[]) => {
        for (const name of names) delete held[name];
        return { commit };
      };
      return {
        ifRevisionId(rev: string) {
          assert.equal(rev, held._rev, "A claim made without the revision it read is not a claim.");
          return { set };
        },
        set,
        unset,
      };
    },
  };
  return { held, client };
}

/**
 * A refusal in the shape the callers really meet it in.
 *
 * `sendEmail` throws on a refusal (see @/lib/sendEmail), so that is what these
 * hand back — and it snapshots the document mid-flight on the way, because the
 * claim has to be measured as well as the release. A pair that never claims
 * anything releases correctly and protects nothing.
 */
function refusedMidFlight(held: Record<string, unknown>) {
  const seen: { whileSending: Record<string, unknown> | null } = { whileSending: null };
  return {
    seen,
    send: async () => {
      seen.whileSending = { ...held };
      throw new Error("The beautasy.co.uk domain is not verified");
    },
  };
}

test("a refused stock alert is written back into the very queue that finds it", async () => {
  const product = {
    _id: "product-1",
    _type: "product",
    name: "Silk slip",
    slug: { current: "silk-slip" },
    stock: 2,
  };
  const { held, client } = holding({
    _id: "alert-1",
    _rev: "r1",
    _type: "stockAlert",
    notified: false,
    emailSealed: "sealed:…",
    product: { _type: "reference", _ref: "product-1" },
  });
  const { seen, send } = refusedMidFlight(held);

  assert.equal(await claimStockAlert(client, { _id: "alert-1", _rev: "r1" }, send), "failed");

  assert.deepEqual(
    idsOf(await ask(PENDING_ALERTS_QUERY, [seen.whileSending!, product])),
    [],
    "While the email is in flight the alert is out of the queue — that is the whole of what the claim buys."
  );
  assert.deepEqual(
    idsOf(await ask(PENDING_ALERTS_QUERY, [held, product])),
    ["alert-1"],
    "And once the mail service says no it is back, or the one person who asked to be told never is."
  );
});

test("a refused order status email is written back into the very queue that finds it", async () => {
  const { held, client } = holding(order({ status: "shipped" }));
  const { seen, send } = refusedMidFlight(held);

  assert.equal(
    await claimStatusEmail(client, { _id: "order-1", _rev: "r1" }, "shipped", send),
    "failed"
  );

  assert.deepEqual(idsOf(await ask(PENDING_ORDERS, [seen.whileSending!], { limit: 50 })), []);
  assert.deepEqual(
    idsOf(await ask(PENDING_ORDERS, [held], { limit: 50 })),
    ["order-1"],
    "The parcel went out; a mark left standing here is a customer nobody ever tells."
  );
  assert.equal(held.notifiedStatus, undefined, "There was nothing to go back to, so nothing is left behind.");
});

test("a refused email about the second status hands the order back to the first", async () => {
  // Told about "shipped" already, and now being told about "delivered". The
  // release has to put "shipped" back rather than clear the field: cleared, the
  // next run would find the order owed BOTH emails and send the shipping one
  // again.
  const { held, client } = holding(order({ status: "delivered", notifiedStatus: "shipped" }));
  const { send } = refusedMidFlight(held);

  await claimStatusEmail(
    client,
    { _id: "order-1", _rev: "r1", notifiedStatus: "shipped" },
    "delivered",
    send
  );

  assert.equal(held.notifiedStatus, "shipped");
  assert.deepEqual(idsOf(await ask(PENDING_ORDERS, [held], { limit: 50 })), ["order-1"]);
});

test("a refused booking confirmation is written back into the very queue that finds it", async () => {
  const { held, client } = holding(booking());
  const { seen, send } = refusedMidFlight(held);

  assert.equal(
    await claimBookingEmail(client, { _id: "booking-1", _rev: "r1" }, "confirmed", send),
    "failed"
  );

  assert.deepEqual(idsOf(await ask(PENDING_BOOKINGS, [seen.whileSending!], { limit: 25 })), []);
  assert.deepEqual(
    idsOf(await ask(PENDING_BOOKINGS, [held], { limit: 25 })),
    ["booking-1"],
    "A fitting confirmed to nobody has to come back round, or the customer never hears."
  );
});

test("a refused review request is written back into the very queue that finds it", async () => {
  const CUTOFF = "2026-09-05T09:00:00Z";
  // The claim keys a fingerprint of the token, and keying needs the secret —
  // the review link is stored one-way for the same reason every address is.
  const hadSecret = process.env.DATA_SECRET;
  process.env.DATA_SECRET = "test-secret-for-the-suite";
  const { held, client } = holding({
    _id: "order-2",
    _rev: "r1",
    _type: "order",
    status: "delivered",
    customerEmailSealed: "sealed:…",
    displayName: "A",
    createdAt: "2026-08-20T09:00:00Z",
    items: [{ productId: "product-1", name: "Silk slip" }],
  });
  const { seen, send } = refusedMidFlight(held);

  assert.equal(
    await claimReviewRequest(client, { _id: "order-2", _rev: "r1" }, "a-token", send),
    "failed"
  );

  assert.deepEqual(
    idsOf(await ask(PENDING_REVIEWS, [seen.whileSending!], { cutoff: CUTOFF, limit: 25 })),
    [],
    "Claimed, so a second run overlapping this one cannot ask the same customer."
  );
  assert.deepEqual(
    idsOf(await ask(PENDING_REVIEWS, [held], { cutoff: CUTOFF, limit: 25 })),
    ["order-2"],
    "Both fields come off together — the stamp used to go on before the send and never come off."
  );
  assert.equal(held.reviewTokenFingerprint, undefined);
  assert.equal(held.reviewRequestSentAt, undefined);
  if (hadSecret === undefined) delete process.env.DATA_SECRET;
  else process.env.DATA_SECRET = hadSecret;
});

test("a claim somebody else already took is left alone, and nothing is sent", async () => {
  // The other outcome, and the reason the claim is conditional on the revision:
  // of two overlapping runs exactly one wins, and the loser must not send.
  const { held, client } = holding(order({ status: "shipped", _rev: "somebody-else-wrote" }));
  let sends = 0;
  const outcome = await claimStatusEmail(
    client,
    { _id: "order-1", _rev: "r1" },
    "shipped",
    async () => {
      sends += 1;
      return { data: { id: "sent" }, error: null };
    }
  );
  assert.equal(outcome, "lost");
  assert.equal(sends, 0, "The run that loses the race must not send the email as well.");
  assert.equal(held.notifiedStatus, undefined, "And it must not write anything either.");
});

/**
 * The gift card's other side: the email went and the stamp did not.
 *
 * This is the one kind with no claim to hand back, so everything rests on the
 * order of two writes — and the direction that was covered was "refused, so
 * not stamped". The opposite corner had nothing on it at all, and from the
 * caller's side the two are indistinguishable: both answer `false`.
 */
test("a gift card that was sent but could not be stamped is tried again before giving up", async () => {
  const hadKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  try {
    let attempts = 0;
    const delivered = await deliverGiftCard(
      { _id: "card-1", code: "BEAU-1234", initialAmount: 5000, recipientEmail: "someone@example.com" },
      {
        deliver: async () => ({ data: { id: "sent" }, error: null }),
        stamp: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("Sanity was busy");
          return undefined;
        },
      }
    );
    assert.equal(attempts, 2, "A moment of the database being busy must not cost a second present.");
    assert.equal(delivered, true);
  } finally {
    if (hadKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = hadKey;
  }
});

test("a gift card whose stamp will not go on at all comes round again tomorrow", async () => {
  const hadKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  try {
    const delivered = await deliverGiftCard(
      { _id: "card-1", code: "BEAU-1234", initialAmount: 5000, recipientEmail: "someone@example.com" },
      {
        deliver: async () => ({ data: { id: "sent" }, error: null }),
        stamp: async () => {
          throw new Error("the write token was revoked");
        },
      }
    );
    assert.equal(
      delivered,
      false,
      "The cron's count must not claim a card it cannot prove it will stop sending."
    );
    const unstamped = { _id: "card-1", _type: "giftCard", initialAmount: 5000, codeSealed: "sealed:…", recipientEmailSealed: "sealed:…", source: "purchase" };
    assert.deepEqual(
      idsOf(await ask(DUE_QUERY, [unstamped], { now: "2026-09-19T09:00:00Z" })),
      ["card-1"],
      "Which is the deliberate trade: the same present twice beats a paid-for present nobody receives."
    );
  } finally {
    if (hadKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = hadKey;
  }
});
