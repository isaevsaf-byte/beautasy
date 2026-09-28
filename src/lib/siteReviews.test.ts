import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import {
  COMMENT_MAX,
  LATEST_REVIEW_QUERY,
  PUBLISHED_REVIEWS_QUERY,
  REVIEW_TOPICS,
  checkSiteReview,
  reviewSubject,
  reviewSummary,
  topicLabel,
} from "./siteReviews";
import { newReviewEmail } from "./newReviewEmail";
import { REVIEW_TOPIC_TITLES } from "../sanity/schemaTypes/review";

const good = { name: "Anna", topic: "alterations", rating: 5, comment: "Took up my wedding dress beautifully." };

function errorOf(body: unknown): string {
  const result = checkSiteReview(body);
  assert.equal(result.ok, false, `expected a refusal for ${JSON.stringify(body)}`);
  return (result as { error: string }).error;
}

/* ─── What the form may carry ─── */

test("a real review is kept, cleaned", () => {
  const result = checkSiteReview({ ...good, name: "  Anna   Smith ", comment: "  Took up my wedding dress beautifully.  " });
  assert.deepEqual(result, {
    ok: true,
    trap: false,
    review: {
      name: "Anna Smith",
      topic: "alterations",
      productId: undefined,
      rating: 5,
      comment: "Took up my wedding dress beautifully.",
    },
  });
});

test("the honeypot answers a bot with thanks and keeps nothing", () => {
  assert.deepEqual(checkSiteReview({ ...good, company: "Acme Ltd" }), { ok: true, trap: true });
  // Whitespace is what an autofilling browser might leave: a person, not a bot
  assert.equal((checkSiteReview({ ...good, company: "  " }) as { trap: boolean }).trap, false);
});

test("a name is at least two letters and at most forty", () => {
  assert.match(errorOf({ ...good, name: "A" }), /first name/);
  assert.match(errorOf({ ...good, name: "   " }), /first name/);
  assert.match(errorOf({ ...good, name: "x".repeat(41) }), /up to 40/);
  assert.equal(checkSiteReview({ ...good, name: "x".repeat(40) }).ok, true);
});

test("stars are a whole number from one to five, sent as a number", () => {
  for (const rating of [0, 6, 4.5, "5", null, undefined, NaN]) {
    assert.match(errorOf({ ...good, rating }), /one to five stars/, `rating ${String(rating)}`);
  }
  for (const rating of [1, 2, 3, 4, 5]) assert.equal(checkSiteReview({ ...good, rating }).ok, true);
});

test("a review is ten to a thousand characters once trimmed", () => {
  assert.match(errorOf({ ...good, comment: "   Lovely!   " }), /sentence or two/);
  assert.match(errorOf({ ...good, comment: "x".repeat(COMMENT_MAX + 1) }), /1,000 characters/);
  assert.equal(checkSiteReview({ ...good, comment: "x".repeat(COMMENT_MAX) }).ok, true);
});

test("invisible characters go, and blank lines are kept to one", () => {
  const result = checkSiteReview({ ...good, name: "An\u0000na", comment: "Perfect fit.\u0007\n\n\n\nThank you!" });
  assert.equal(result.ok && !result.trap && result.review.name, "Anna");
  assert.equal(result.ok && !result.trap && result.review.comment, "Perfect fit.\n\nThank you!");
});

test("every topic on the form is accepted, and nothing else", () => {
  for (const topic of REVIEW_TOPICS) assert.equal(checkSiteReview({ ...good, topic: topic.value }).ok, true);
  assert.match(errorOf({ ...good, topic: undefined }), /what we made or mended/);
  assert.match(errorOf({ ...good, topic: "Alterations" }), /what we made or mended/);
});

test("a piece can be named only for a review of something from the shop", () => {
  const withPiece = checkSiteReview({ ...good, topic: "shop", productId: "a1b2c3-d4" });
  assert.equal(withPiece.ok && !withPiece.trap && withPiece.review.productId, "a1b2c3-d4");
  assert.match(errorOf({ ...good, topic: "alterations", productId: "a1b2c3-d4" }), /which piece/);
  // A draft, a GROQ fragment and a path are not ids a review can point at
  for (const productId of ["drafts.a1b2", "a1\" || true", "../x", 42]) {
    assert.match(errorOf({ ...good, topic: "shop", productId }), /which piece/, String(productId));
  }
  // An empty value from the form is the same as none
  assert.equal(checkSiteReview({ ...good, topic: "shop", productId: "" }).ok, true);
});

test("a body that isn't an object is refused, not thrown on", () => {
  for (const body of [null, "text", 5, []]) assert.equal(checkSiteReview(body).ok, false);
});

/* ─── What the site shows ─── */

test("every topic has a label for the site and a Russian title for the Studio", () => {
  for (const topic of REVIEW_TOPICS) {
    assert.ok(topicLabel(topic.value), topic.value);
    assert.ok(REVIEW_TOPIC_TITLES[topic.value], `no Russian title for ${topic.value}`);
    assert.doesNotMatch(topic.label, /[А-Яа-яЁё]/, "the site's own words stay English");
  }
  assert.equal(Object.keys(REVIEW_TOPIC_TITLES).length, REVIEW_TOPICS.length);
  assert.equal(topicLabel("unknown"), null);
});

test("a review of a piece names the piece, otherwise what it was about", () => {
  assert.equal(reviewSubject({ about: "shop", product: { name: "Silk scrunchie", slug: "silk-scrunchie" } }), "Silk scrunchie");
  assert.equal(reviewSubject({ about: "home", product: null }), "Curtains & home");
  assert.equal(reviewSubject({ about: null, product: null }), null);
});

test("the summary averages the stars and is zero with nothing to average", () => {
  assert.deepEqual(reviewSummary([]), { count: 0, average: 0 });
  assert.deepEqual(reviewSummary([{ rating: 5 }, { rating: 4 }]), { count: 2, average: 4.5 });
});

test("only approved, published reviews reach the page, newest first, with the piece they are about", async () => {
  const dataset = [
    { _id: "p1", _type: "product", name: "Silk scrunchie", slug: { current: "silk-scrunchie" } },
    { _id: "r1", _type: "review", approved: true, userName: "Anna", rating: 5, comment: "Lovely work.", createdAt: "2026-09-20T10:00:00Z", about: "alterations" },
    { _id: "r2", _type: "review", approved: true, userName: "Lia", rating: 4, comment: "So soft.", createdAt: "2026-09-25T10:00:00Z", about: "shop", product: { _type: "reference", _ref: "p1" } },
    { _id: "r3", _type: "review", approved: false, userName: "Spam", rating: 1, comment: "Buy my thing.", createdAt: "2026-09-26T10:00:00Z" },
    { _id: "drafts.r1", _type: "review", approved: true, userName: "Anna (edit)", rating: 5, comment: "Unsaved.", createdAt: "2026-09-27T10:00:00Z" },
  ];
  const reviews = await (await evaluate(parse(PUBLISHED_REVIEWS_QUERY), { dataset })).get();
  assert.deepEqual(
    reviews.map((review: { _id: string }) => review._id),
    ["r2", "r1"]
  );
  assert.deepEqual(reviews[0].product, { name: "Silk scrunchie", slug: "silk-scrunchie" });
  assert.equal(reviews[1].product, null);

  const latest = await (await evaluate(parse(LATEST_REVIEW_QUERY), { dataset })).get();
  assert.equal(latest, "2026-09-25T10:00:00Z");
  const none = await (await evaluate(parse(LATEST_REVIEW_QUERY), { dataset: dataset.slice(3) })).get();
  assert.equal(none, null, "no approved review means no date — the sitemap leaves /reviews out");
});

/* ─── Kristina's email ─── */

test("Kristina's email carries the review as written, escaped, with a link that opens it", () => {
  const html = newReviewEmail(
    { name: "<b>Anna</b>", topic: "home", rating: 4, comment: "Curtains <script>x</script>\nperfect" },
    "abc123",
    null
  );
  assert.match(html, /★★★★☆/);
  assert.match(html, /&lt;b&gt;Anna&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /About: Curtains &amp; home/);
  assert.match(html, /\/studio\/intent\/edit\/id=abc123;type=review/);
  assert.match(newReviewEmail({ ...good, topic: "shop" } as never, "x", "Silk scrunchie"), /About: Silk scrunchie/);
});
