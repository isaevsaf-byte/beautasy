import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, parse } from "groq-js";
import {
  COMMENT_MAX,
  LATEST_REVIEW_QUERY,
  PRODUCT_REVIEWS_QUERY,
  PUBLISHED_REVIEWS_QUERY,
  REVIEW_TOPICS,
  atelierReviews,
  featuredReview,
  checkSiteReview,
  isNextdoorUrl,
  reviewsForTopics,
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
  assert.equal(reviewSubject({ about: "shop", product: null, item: "Floral scrunchie" }), "Floral scrunchie", "what an Etsy buyer bought");
  assert.equal(reviewSubject({ about: "home", product: null }), "Curtains & home");
  assert.equal(reviewSubject({ about: null, product: null }), null);
});

test("the summary averages the stars and is zero with nothing to average", () => {
  assert.deepEqual(reviewSummary([]), { count: 0, average: 0, nextdoor: 0, google: 0, etsy: 0 });
  assert.deepEqual(
    reviewSummary([
      { rating: 5, source: "site" },
      { rating: 4, source: "site" },
    ]),
    { count: 2, average: 4.5, nextdoor: 0, google: 0, etsy: 0 }
  );
});

test("Nextdoor recommendations are counted apart, and never pull the stars down", () => {
  assert.deepEqual(
    reviewSummary([
      { rating: 5, source: "site" },
      { rating: null, source: "nextdoor" },
      { rating: 4, source: "site" },
      { rating: null, source: "nextdoor" },
    ]),
    { count: 2, average: 4.5, nextdoor: 2, google: 0, etsy: 0 }
  );
  assert.deepEqual(reviewSummary([{ rating: null, source: "nextdoor" }]), { count: 0, average: 0, nextdoor: 1, google: 0, etsy: 0 });
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
  // Saved before reviews had a source: they are the site's
  assert.deepEqual(
    reviews.map((review: { source: string }) => review.source),
    ["site", "site"]
  );

  const latest = await (await evaluate(parse(LATEST_REVIEW_QUERY), { dataset })).get();
  assert.equal(latest, "2026-09-25T10:00:00Z");
  const none = await (await evaluate(parse(LATEST_REVIEW_QUERY), { dataset: dataset.slice(3) })).get();
  assert.equal(none, null, "no approved review means no date — the sitemap leaves /reviews out");
});

test("a Nextdoor recommendation reaches the page with its area and without stars", async () => {
  const dataset = [
    { _id: "s1", _type: "review", source: "site", approved: true, userName: "Anna", rating: 5, comment: "Lovely work.", createdAt: "2026-09-20T10:00:00Z" },
    // Stars left over on a recommendation are not Nextdoor's, so they don't show
    { _id: "n1", _type: "review", source: "nextdoor", approved: true, userName: "Sarah M.", neighbourhood: "Shirley", rating: 5, comment: "Hemmed three curtains perfectly.", createdAt: "2026-09-19T10:00:00Z", about: "home" },
    { _id: "n2", _type: "review", source: "nextdoor", approved: false, userName: "Held back", comment: "Not yet.", createdAt: "2026-09-21T10:00:00Z" },
  ];
  const reviews = await (await evaluate(parse(PUBLISHED_REVIEWS_QUERY), { dataset })).get();
  assert.deepEqual(
    reviews.map((review: { _id: string }) => review._id),
    ["s1", "n1"],
    "approved ones only, newest first, whichever the source"
  );
  assert.equal(reviews[0].rating, 5);
  assert.equal(reviews[1].source, "nextdoor");
  assert.equal(reviews[1].neighbourhood, "Shirley");
  assert.equal(reviews[1].rating, null);
  assert.deepEqual(reviewSummary(reviews), { count: 1, average: 5, nextdoor: 1, google: 0, etsy: 0 });
});

test("a piece's page, and its stars in Google, only ever count reviews written on this site", async () => {
  const dataset = [
    { _id: "p1", _type: "product", name: "Silk scrunchie", slug: { current: "silk-scrunchie" } },
    { _id: "old", _type: "review", approved: true, userName: "Lia", rating: 4, comment: "So soft.", createdAt: "2026-09-25T10:00:00Z", product: { _type: "reference", _ref: "p1" } },
    { _id: "new", _type: "review", source: "site", approved: true, userName: "Anna", rating: 5, comment: "Lovely.", createdAt: "2026-09-26T10:00:00Z", product: { _type: "reference", _ref: "p1" } },
    { _id: "nd", _type: "review", source: "nextdoor", approved: true, userName: "Sarah M.", comment: "Great.", createdAt: "2026-09-27T10:00:00Z", product: { _type: "reference", _ref: "p1" } },
    { _id: "wait", _type: "review", source: "site", approved: false, userName: "Spam", rating: 1, comment: "Buy.", createdAt: "2026-09-28T10:00:00Z", product: { _type: "reference", _ref: "p1" } },
  ];
  const reviews = await (await evaluate(parse(PRODUCT_REVIEWS_QUERY), { dataset, params: { id: "p1" } })).get();
  assert.deepEqual(
    reviews.map((review: { _id: string }) => review._id),
    ["new", "old"]
  );
});

test("only an https link to Nextdoor itself counts as Nextdoor", () => {
  for (const good of [
    "https://nextdoor.co.uk/pages/beautasy-atelier-southampton-eng/",
    "https://www.nextdoor.co.uk/pages/beautasy-atelier/?init_source=copy_link_share",
    "https://nextdoor.com/pages/beautasy/",
  ]) {
    assert.equal(isNextdoorUrl(good), true, good);
  }
  for (const bad of [
    "http://nextdoor.co.uk/pages/beautasy/",
    "https://nextdoor.co.uk.example.com/pages/beautasy/",
    "https://evilnextdoor.co.uk/pages/beautasy/",
    "https://example.com/?next=https://nextdoor.co.uk/",
    "https://user:pass@nextdoor.co.uk/pages/beautasy/",
    "javascript:alert(1)//nextdoor.co.uk",
    "nextdoor.co.uk/pages/beautasy",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(isNextdoorUrl(bad), false, String(bad));
  }
});

test("Google's and Etsy's reviews keep their stars, and are counted apart from the ones written here", async () => {
  const dataset = [
    { _id: "s1", _type: "review", source: "site", approved: true, userName: "Anna", rating: 4, comment: "Lovely work.", createdAt: "2026-09-20T10:00:00Z" },
    { _id: "g1", _type: "review", source: "google", approved: true, userName: "Maria", rating: 5, comment: "Lovely service.", createdAt: "2026-09-07T10:00:00Z" },
    { _id: "e1", _type: "review", source: "etsy", approved: true, userName: "Shannon", rating: 5, comment: "Wonderful pouch.", item: "Quilted cosmetic bag", about: "shop", createdAt: "2025-08-25T10:00:00Z" },
  ];
  const reviews = await (await evaluate(parse(PUBLISHED_REVIEWS_QUERY), { dataset })).get();
  assert.deepEqual(
    reviews.map((review: { _id: string; rating: number }) => [review._id, review.rating]),
    [["s1", 4], ["g1", 5], ["e1", 5]]
  );
  assert.equal(reviews[2].item, "Quilted cosmetic bag");
  // 4.0 is the site's own; Google's and Etsy's fives are theirs to average
  assert.deepEqual(reviewSummary(reviews), { count: 1, average: 4, nextdoor: 0, google: 1, etsy: 1 });
});

/* ─── Which reviews a page shows ─── */

const PIECE = { name: "Silk scrunchie", slug: "silk-scrunchie" };
const newestFirst = [
  { id: "shop", about: "shop", product: PIECE },
  { id: "curtains", about: "home", product: null },
  { id: "nextdoor", about: null, product: null },
  { id: "hem", about: "alterations", product: null },
  { id: "buyer", about: null, product: PIECE },
  { id: "zip", about: "repairs", product: null },
  // "A piece from the shop" chosen on the form itself, with no piece attached
  { id: "shop-words", about: "shop", product: null },
  { id: "blind", about: "home", product: null },
];
const ids = (reviews: { id: string }[]) => reviews.map((review) => review.id);

test("the atelier shows reviews of its own work, never a piece from the shop", () => {
  assert.deepEqual(ids(atelierReviews(newestFirst)), ["curtains", "nextdoor", "hem", "zip", "blind"]);
  // Every Etsy review is about a piece from the shop, whatever its topic says
  const etsy = { id: "etsy", about: null, product: null, source: "etsy" as const };
  assert.deepEqual(ids(atelierReviews([etsy, ...newestFirst])), ["curtains", "nextdoor", "hem", "zip", "blind"]);
});

test("a service page shows reviews about its job first, then the atelier's others", () => {
  assert.deepEqual(ids(reviewsForTopics(newestFirst, ["home"], 3)), ["curtains", "blind", "nextdoor"]);
  assert.deepEqual(ids(reviewsForTopics(newestFirst, ["alterations", "repairs"], 3)), ["hem", "zip", "curtains"]);
  assert.deepEqual(ids(reviewsForTopics(newestFirst, ["made"], 2)), ["curtains", "nextdoor"], "none on topic: the newest of the atelier's");
  assert.deepEqual(ids(reviewsForTopics(newestFirst, ["home"], 10)).length, 5, "each review once, and no shop ones");
  assert.deepEqual(reviewsForTopics([], ["home"], 3), []);
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

test("the review at the top is the fullest five-star word about the atelier", () => {
  const long = (words: number) => Array.from({ length: words }, () => "lovely").join(" ");
  const reviews = [
    { _id: "shop", source: "etsy" as const, about: "shop", product: null, rating: 5, comment: long(60) },
    { _id: "four", source: "google" as const, about: null, product: null, rating: 4, comment: long(50) },
    { _id: "short", source: "site" as const, about: "alterations", product: null, rating: 5, comment: "Lovely." },
    { _id: "nextdoor", source: "nextdoor" as const, about: null, product: null, rating: null, comment: long(25) },
    { _id: "google", source: "google" as const, about: null, product: null, rating: 5, comment: long(40) },
  ];
  assert.equal(featuredReview(reviews)?._id, "google", "Etsy's is the shop's, and four stars don't lead the page");
  assert.equal(featuredReview(reviews.filter((review) => review._id !== "google"))?._id, "nextdoor", "a recommendation counts as full marks");
  assert.equal(featuredReview(reviews.slice(0, 3)), null, "nothing long enough about the atelier: no quote at the top");
});
