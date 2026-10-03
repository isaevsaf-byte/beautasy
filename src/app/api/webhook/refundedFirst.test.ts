import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

/**
 * The webhook itself, with Stripe, Sanity and Resend stood in for: a payment
 * refunded while Stripe was still retrying its "paid" event.
 *
 * The case that cost real money: a £100 gift card fails to issue, the alerts
 * keep coming, Kristina refunds the payment in Stripe as the alert told her to,
 * Safar fixes the cause — and Stripe's next retry made a spendable £100 card
 * and emailed its code, because the event it retries still says "paid" and the
 * refund's own event had found no card to switch off. An order went the same
 * way: written as paid, confirmed to the customer, for money already returned.
 *
 * Nothing here reaches a real service. The keys are stand-ins, every Stripe and
 * Sanity call the route makes is answered from memory, and fetch — which is
 * all Resend uses — is answered here too, so the emails can be read.
 */

process.env.STRIPE_SECRET_KEY = "stand-in-stripe-key";
process.env.STRIPE_WEBHOOK_SECRET = "stand-in-webhook-secret";
process.env.RESEND_API_KEY = "stand-in-resend-key";
process.env.DATA_SECRET = "test-secret-for-the-refund-suite";
delete process.env.SANITY_API_WRITE_TOKEN;

type Doc = { _id: string; _type: string; [field: string]: unknown };

const docs = new Map<string, Doc>();
/** Documents made with create(): the real card or order, never a refunded record */
const created: Doc[] = [];
const emails: { to: string; subject: string }[] = [];
let refundedAtStripe = 0;
let paymentIntentReads = 0;
let event: unknown = null;

const PAID_AT = 1790000000;

const cardSession = {
  id: "cs_test_card100",
  object: "checkout.session",
  amount_total: 10000,
  payment_intent: "pi_card100",
  payment_status: "paid",
  customer_details: { email: "anna@example.com", name: "Anna Buyer" },
  metadata: {
    gift_card: "true",
    gift_card_amount: "10000",
    gift_card_recipient: "nina@example.com",
    gift_card_recipient_name: "Nina",
  },
};

const orderSession = {
  id: "cs_test_order48",
  object: "checkout.session",
  amount_total: 4800,
  payment_intent: "pi_order48",
  payment_status: "paid",
  customer_details: { email: "anna@example.com", name: "Anna Buyer" },
  metadata: {},
};

let sessionAtStripe: typeof cardSession | typeof orderSession = cardSession;

function answer(query: string, params: Record<string, unknown>): unknown {
  const all = [...docs.values()];
  if (query.includes('_type in ["order", "giftCard"]')) {
    return all.filter((d) => (d._type === "order" || d._type === "giftCard") && d.stripeSessionId === params.sessionId).map((d) => d._id);
  }
  const one = query.match(/_type == "(order|giftCard)" && stripeSessionId == \$id\]\[0\]\._id/);
  if (one) return all.find((d) => d._type === one[1] && d.stripeSessionId === params.id)?._id ?? null;
  return null;
}

function patchOf(id: string) {
  const fields: Record<string, unknown> = {};
  const chain = {
    set(values: Record<string, unknown>) {
      Object.assign(fields, values);
      return chain;
    },
    ifRevisionId: () => chain,
    unset: () => chain,
    dec: () => chain,
    inc: () => chain,
    async commit() {
      const doc = docs.get(id);
      if (doc) Object.assign(doc, fields);
      return doc;
    },
  };
  return chain;
}

let loaded: Promise<typeof import("./route")> | null = null;

/** The route, with every service it talks to answered from here. */
function route() {
  loaded ??= (async () => {
    const { getStripeInstance } = await import("@/lib/stripe");
    const { sanityClient, sanityWriteClient } = await import("@/lib/sanity");

    const stripe = getStripeInstance() as unknown as Record<string, Record<string, unknown>> & {
      checkout: { sessions: Record<string, unknown> };
    };
    stripe.webhooks.constructEvent = () => event;
    stripe.paymentIntents.retrieve = async () => {
      paymentIntentReads += 1;
      return { latest_charge: { amount: sessionAtStripe.amount_total, amount_refunded: refundedAtStripe, created: PAID_AT } };
    };
    stripe.checkout.sessions.listLineItems = async () => ({ data: [] });
    stripe.checkout.sessions.list = async () => ({ data: [sessionAtStripe] });

    const write = sanityWriteClient as unknown as Record<string, unknown>;
    write.fetch = async (query: string, params: Record<string, unknown> = {}) => answer(query, params);
    write.create = async (doc: Doc) => {
      if (docs.has(doc._id)) throw Object.assign(new Error(`Document ${doc._id} already exists`), { statusCode: 409 });
      docs.set(doc._id, { ...doc });
      created.push({ ...doc });
      return doc;
    };
    write.createIfNotExists = async (doc: Doc) => {
      if (!docs.has(doc._id)) docs.set(doc._id, { ...doc });
      return docs.get(doc._id);
    };
    write.patch = (id: string) => patchOf(id);
    (sanityClient as unknown as Record<string, unknown>).fetch = async () => null;

    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}");
      emails.push({ to: String(body.to), subject: String(body.subject) });
      return new Response(JSON.stringify({ id: `em_${emails.length}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    return import("./route");
  })();
  return loaded;
}

function reset(session: typeof cardSession | typeof orderSession, refunded: number) {
  docs.clear();
  created.length = 0;
  emails.length = 0;
  paymentIntentReads = 0;
  sessionAtStripe = session;
  refundedAtStripe = refunded;
}

async function deliver(type: string, object: unknown): Promise<Response> {
  const { POST } = await route();
  event = { id: `evt_${type}`, type, data: { object } };
  return POST(
    new NextRequest("https://beautasy.co.uk/api/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=stand-in" },
    })
  );
}

const refundOf = (session: typeof cardSession | typeof orderSession) => ({
  id: "ch_1",
  object: "charge",
  amount: session.amount_total,
  amount_refunded: session.amount_total,
  payment_intent: session.payment_intent,
  created: PAID_AT,
});

test("a gift card refunded while its event was being retried is never made, and no code is sent", async () => {
  reset(cardSession, 10000);
  // The refund's own event could not write anything either (the same broken
  // token), so only Stripe knows. Then the cause is fixed and Stripe retries.
  const res = await deliver("checkout.session.completed", cardSession);

  assert.equal(res.status, 200);
  assert.deepEqual(created, [], "a spendable card was made for money already returned");
  const card = docs.get("giftCard-cs_test_card100");
  assert.equal(card?.active, false);
  assert.equal(card?.codeFingerprint, undefined);
  assert.equal(emails.some((e) => e.to === "nina@example.com"), false, "the code went to the recipient");
  assert.ok(emails.some((e) => e.to === "hello@beautasy.co.uk" && /Refunded before it was saved/.test(e.subject)));
});

test("a refund that lands first leaves a card behind, and the retry stops at it", async () => {
  reset(cardSession, 10000);
  assert.equal((await deliver("charge.refunded", refundOf(cardSession))).status, 200);
  assert.equal(docs.get("giftCard-cs_test_card100")?.active, false, "the refund found no card and left nothing to say so");
  assert.equal(docs.get("giftCard-cs_test_card100")?.refundedAmount, 10000, "«Касса» has to hear about it");

  emails.length = 0;
  paymentIntentReads = 0;
  const retry = await deliver("checkout.session.completed", cardSession);
  assert.equal(retry.status, 200);
  assert.deepEqual(created, []);
  assert.equal(paymentIntentReads, 0, "the card's own lookup finds it before Stripe needs asking");
  assert.deepEqual(emails, [], "nothing more to say about it");
});

test("an order refunded in full before it was saved is kept as refunded, not confirmed", async () => {
  reset(orderSession, 4800);
  const res = await deliver("checkout.session.completed", orderSession);

  assert.equal(res.status, 200);
  assert.deepEqual(created, [], "a paid order was written for money already returned");
  assert.equal(docs.get("order-cs_test_order48")?.status, "refunded");
  assert.equal(emails.some((e) => e.to === "anna@example.com"), false, "\"Your order is confirmed\" went out");
  assert.ok(emails.some((e) => e.to === "hello@beautasy.co.uk" && /Refunded before it was saved/.test(e.subject)));

  // And the other way round: the refund first, then the retry
  reset(orderSession, 4800);
  await deliver("charge.refunded", refundOf(orderSession));
  assert.equal(docs.get("order-cs_test_order48")?.status, "refunded");
  emails.length = 0;
  await deliver("checkout.session.completed", orderSession);
  assert.deepEqual(created, []);
  assert.deepEqual(emails, []);
});

test("an order with part of its money back is written as paid, with the refund on it", async () => {
  reset(orderSession, 500);
  const res = await deliver("checkout.session.completed", orderSession);
  assert.equal(res.status, 200);
  assert.equal(created.length, 1);
  assert.equal(created[0].status, "paid");
  assert.equal(created[0].refundedAmount, 500, "the refund's own event found no order to note it on");
});

test("a payment nobody refunded is made as before", async () => {
  reset(cardSession, 0);
  const res = await deliver("checkout.session.completed", cardSession);
  assert.equal(res.status, 200);
  assert.equal(created.length, 1);
  assert.equal(created[0]._id, "giftCard-cs_test_card100");
  assert.equal(created[0].active, true);
  assert.ok(emails.some((e) => e.to === "nina@example.com"));
});

test("when Stripe cannot say whether it was refunded, the order waits for the next try", async () => {
  reset(orderSession, 0);
  const { getStripeInstance } = await import("@/lib/stripe");
  await route();
  const intents = (getStripeInstance() as unknown as { paymentIntents: Record<string, unknown> }).paymentIntents;
  const answering = intents.retrieve;
  intents.retrieve = async () => {
    throw new Error("Stripe is unavailable");
  };
  try {
    const res = await deliver("checkout.session.completed", orderSession);
    assert.equal(res.status, 500, "a 500 is what makes Stripe try again");
    assert.deepEqual(created, []);
    assert.ok(emails.some((e) => /Paid order not saved/.test(e.subject)));
  } finally {
    intents.retrieve = answering;
  }
});
