import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  leaveRefundedRecord,
  refundBeforeWriting,
  refundOfCharge,
  refundSoFar,
  refundStops,
  type LineItemReader,
  type PaymentReader,
  type RecordWriter,
  type RefundedRecord,
} from "./paymentRefunds";
import { DUE_QUERY } from "./giftCardEmails";

/**
 * A refund that lands while Stripe is still retrying a "paid" event.
 *
 * The case that cost real money: a £100 gift card fails to issue, the alerts
 * keep coming, Kristina refunds it in Stripe, the cause is fixed — and the next
 * retry issued a spendable £100 code for money already returned, because the
 * event it retries still says "paid" and the refund had found no card to
 * switch off. These run the guard against a stand-in Stripe and Sanity.
 */

const SESSION = "cs_live_giftcard100";
const NOW = new Date("2026-10-03T09:00:00Z");
const PAID_AT = 1790000000; // unix seconds, a day or two earlier

const giftCardSession = {
  id: SESSION,
  amount_total: 10000,
  payment_intent: "pi_card100",
  customer_details: { email: "anna.buyer@example.com", name: "Anna Buyer" },
  metadata: {
    gift_card: "true",
    gift_card_amount: "10000",
    gift_card_recipient: "nina@example.com",
    gift_card_recipient_name: "Nina",
  },
} as const;

const orderSession = {
  id: "cs_live_order48",
  amount_total: 4800,
  payment_intent: "pi_order48",
  customer_details: { email: "anna.buyer@example.com", name: "Anna Buyer" },
  metadata: {},
} as const;

const purchase = { amount: 10000, meta: { ...giftCardSession.metadata } as Record<string, string> };

/** Stripe, answering for one payment with however much has gone back by now. */
function stripeSaying(refunded: number, amount: number, calls: string[] = []): PaymentReader {
  return {
    paymentIntents: {
      async retrieve(id, params) {
        calls.push(`${id} ${params.expand.join(",")}`);
        return { latest_charge: { amount, amount_refunded: refunded, created: PAID_AT } };
      },
    },
  };
}

/** Sanity, as far as ids go: createIfNotExists keeps the first document under an id. */
function store() {
  const docs = new Map<string, RefundedRecord>();
  const writer: RecordWriter = {
    async createIfNotExists(doc) {
      if (!docs.has(doc._id)) docs.set(doc._id, doc);
    },
  };
  /** The webhook's own "is it already there?" lookups, by session */
  const findBySession = (type: string, sessionId: string) =>
    [...docs.values()].find((d) => d._type === type && d.stripeSessionId === sessionId) ?? null;
  return { docs, writer, findBySession };
}

const noLines: LineItemReader = {
  checkout: {
    sessions: {
      async listLineItems() {
        return { data: [] };
      },
    },
  },
};

test("a gift card refunded while its event was being retried is never issued", async () => {
  const sanity = store();
  // Kristina refunded it; the refund's own event could not write anything
  // either (the same broken token), so only Stripe knows
  const before = await refundBeforeWriting(giftCardSession, purchase, {
    stripe: stripeSaying(10000, 10000),
    sanity: sanity.writer,
    now: () => NOW,
  });
  assert.equal(before.stop, true, "a refunded payment must not become a spendable card");
  assert.equal(before.stop && before.recordId, `giftCard-${SESSION}`);

  const card = sanity.docs.get(`giftCard-${SESSION}`);
  assert.ok(card, "something has to be left behind that says the money went back");
  assert.equal(card.active, false);
  assert.equal(card.balance, 0);
  assert.equal(card.initialAmount, 10000);
  assert.equal(card.refundedAmount, 10000);
  assert.equal(card.refundedAt, NOW.toISOString());
  assert.equal(card.createdAt, new Date(PAID_AT * 1000).toISOString(), "the sale stays on the day it was paid");
  // No code means checkout can never find it and the daily job never sends it
  for (const field of ["codeFingerprint", "codeSealed", "codeHint", "recipientEmailSealed", "deliverAt"]) {
    assert.equal(field in card, false, `a refunded card carries no ${field}`);
  }
  assert.match(DUE_QUERY, /defined\(recipientEmailSealed\)/, "the daily job only sends a card with a recipient");
  assert.match(DUE_QUERY, /active != false/);

  // The next retry looks for the card first and finds this one
  assert.ok(sanity.findBySession("giftCard", SESSION));
});

test("a gift card with any of its money back is not issued either — a code is money once sent", async () => {
  const sanity = store();
  const before = await refundBeforeWriting(giftCardSession, purchase, {
    stripe: stripeSaying(2500, 10000),
    sanity: sanity.writer,
    now: () => NOW,
  });
  assert.equal(before.stop, true);
  assert.equal(sanity.docs.get(`giftCard-${SESSION}`)?.refundedAmount, 2500);
});

test("a payment with nothing refunded is written as usual, and nothing is left in its place", async () => {
  const sanity = store();
  const calls: string[] = [];
  const before = await refundBeforeWriting(giftCardSession, purchase, {
    stripe: stripeSaying(0, 10000, calls),
    sanity: sanity.writer,
  });
  assert.deepEqual(before, {
    stop: false,
    refund: { refunded: 0, charged: 10000, paidAt: new Date(PAID_AT * 1000).toISOString() },
  });
  assert.equal(sanity.docs.size, 0);
  assert.deepEqual(calls, ["pi_card100 latest_charge"], "one call, with the charge's refunds in it");
});

test("an order refunded in full before it was saved is kept as refunded, not confirmed as paid", async () => {
  const sanity = store();
  const before = await refundBeforeWriting(orderSession, null, {
    stripe: stripeSaying(4800, 4800),
    sanity: sanity.writer,
    now: () => NOW,
  });
  assert.equal(before.stop, true);
  const order = sanity.docs.get("order-cs_live_order48");
  assert.ok(order);
  assert.equal(order.status, "refunded", "\"paid\" puts it on the pile to make and in the status emails");
  assert.equal(order.total, 4800);
  assert.equal(order.refundedAmount, 4800, "«Касса» shows the money going back");
  assert.equal(order.displayName, "Anna");
  assert.equal(order.emailHint, "an…@example.com");
  for (const key of Object.keys(order)) {
    assert.doesNotMatch(key, /Sealed$|Fingerprint$/, "nothing that needs DATA_SECRET — that may be what broke");
  }
  assert.equal(JSON.stringify(order).includes("anna.buyer@example.com"), false, "🚨 the dataset is public");
});

test("an order with part of its money back is still an order: written, with its refund on it", async () => {
  const sanity = store();
  const before = await refundBeforeWriting(orderSession, null, {
    stripe: stripeSaying(500, 4800),
    sanity: sanity.writer,
  });
  assert.equal(before.stop, false);
  assert.equal(before.refund?.refunded, 500, "the webhook stamps this on the order it writes");
  assert.equal(sanity.docs.size, 0);
});

test("an order a gift card paid for in full has nothing at Stripe to ask about", async () => {
  const calls: string[] = [];
  const before = await refundBeforeWriting({ ...orderSession, payment_intent: null }, null, {
    stripe: stripeSaying(0, 0, calls),
    sanity: store().writer,
  });
  assert.deepEqual(before, { stop: false, refund: null });
  assert.deepEqual(calls, []);
});

test("when Stripe cannot be asked, nothing is guessed: it throws for the webhook to retry", async () => {
  const sanity = store();
  const down: PaymentReader = {
    paymentIntents: {
      async retrieve() {
        throw new Error("Stripe is unavailable");
      },
    },
  };
  await assert.rejects(refundBeforeWriting(giftCardSession, purchase, { stripe: down, sanity: sanity.writer }));
  const unexpanded: PaymentReader = {
    paymentIntents: {
      async retrieve() {
        return { latest_charge: "ch_123" };
      },
    },
  };
  await assert.rejects(refundSoFar("pi_1", unexpanded));
  assert.equal(sanity.docs.size, 0);
});

test("a key that may not read payments skips the check instead of holding up every order", async () => {
  const realError = console.error;
  console.error = () => undefined;
  try {
    for (const type of ["StripePermissionError", "StripeAuthenticationError"]) {
      const refused: PaymentReader = {
        paymentIntents: {
          async retrieve() {
            throw Object.assign(new Error("The provided key does not have the required permissions"), { type });
          },
        },
      };
      const sanity = store();
      const before = await refundBeforeWriting(giftCardSession, purchase, { stripe: refused, sanity: sanity.writer });
      assert.equal(before.stop, false, `${type}: three days of retries would stall the shop`);
      assert.equal(sanity.docs.size, 0);
    }
    // A hiccup is still tried again
    const flaky: PaymentReader = {
      paymentIntents: {
        async retrieve() {
          throw Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
        },
      },
    };
    await assert.rejects(refundSoFar("pi_1", flaky));
  } finally {
    console.error = realError;
  }
});

test("only a gift card stops on part of a refund; an order stops only on all of it", () => {
  assert.equal(refundStops("giftCard", null), false);
  assert.equal(refundStops("giftCard", { refunded: 0, charged: 100 }), false);
  assert.equal(refundStops("giftCard", { refunded: 1, charged: 100 }), true);
  assert.equal(refundStops("order", { refunded: 99, charged: 100 }), false);
  assert.equal(refundStops("order", { refunded: 100, charged: 100 }), true);
});

test("a full refund that finds nothing written leaves the record the retry will find", async () => {
  const sanity = store();
  const charge = refundOfCharge({ amount: 10000, amount_refunded: 10000, created: PAID_AT });
  const id = await leaveRefundedRecord(giftCardSession, charge, { stripe: noLines, sanity: sanity.writer, now: () => NOW });
  assert.equal(id, `giftCard-${SESSION}`);
  assert.equal(sanity.docs.get(id)?.active, false);

  // Then Safar fixes the token and Stripe's next retry comes in: the card's
  // own lookup finds this one and stops — whatever Stripe still says
  assert.ok(sanity.findBySession("giftCard", SESSION), "issueGiftCard's existing-card lookup has to find it");

  // A second refund event (or the retry's own guard) cannot replace it
  await leaveRefundedRecord(giftCardSession, charge, { stripe: noLines, sanity: sanity.writer });
  assert.equal(sanity.docs.size, 1);
});

test("a reopened checkout without its metadata is still known as a gift card by its line", async () => {
  const sanity = store();
  const lines: LineItemReader = {
    checkout: {
      sessions: {
        async listLineItems(id, params) {
          assert.equal(id, SESSION);
          assert.deepEqual(params.expand, ["data.price.product"]);
          return {
            data: [{ price: { product: { metadata: { gift_card: "true", gift_card_amount: "5000" } } } } as never],
          };
        },
      },
    },
  };
  const id = await leaveRefundedRecord(
    { ...giftCardSession, metadata: {} },
    { refunded: 5000, charged: 5000 },
    { stripe: lines, sanity: sanity.writer }
  );
  assert.equal(id, `giftCard-${SESSION}`, "an order record here would leave the card's retry unguarded");
  assert.equal(sanity.docs.get(id)?.initialAmount, 5000);
});

test("an order refunded before it was written leaves a refunded order under the order's id", async () => {
  const sanity = store();
  const id = await leaveRefundedRecord(orderSession, { refunded: 4800, charged: 4800 }, {
    stripe: noLines,
    sanity: sanity.writer,
    now: () => NOW,
  });
  assert.equal(id, "order-cs_live_order48");
  assert.equal(sanity.docs.get(id)?.status, "refunded");
  assert.ok(sanity.findBySession("order", "cs_live_order48"), "the webhook's duplicate check has to find it");
});

test("the records use the very ids the webhook writes a card and an order under", () => {
  const webhook = readFileSync(join(process.cwd(), "src", "app", "api", "webhook", "route.ts"), "utf8");
  assert.match(webhook, /_id: `giftCard-\$\{session\.id\}`/);
  assert.match(webhook, /_id: `order-\$\{session\.id\}`/);
});
