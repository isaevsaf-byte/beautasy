import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import nextConfig from "../../next.config";
import ReviewCard from "./reviews/ReviewCard";
import ReviewStrip from "./reviews/ReviewStrip";
import ReviewWall from "../app/reviews/ReviewWall";
import { isNextdoorUrl, type PublishedReview } from "../lib/siteReviews";
import { BUSINESS } from "../lib/business";

/**
 * The review form is open to anyone, so its safety sits in the wiring as much
 * as in @/lib/siteReviews: who may post, how often, that nothing shows before
 * Kristina says so, and that the ways in — the short link, the footer, a
 * piece's own page — all lead to it. The rules of the form itself are tested
 * in @/lib/siteReviews.
 */

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const route = () => read("src/app/api/reviews/site/route.ts");

test("the review route turns away other sites, limits each visitor and saves the review unapproved", () => {
  const source = route();
  const guard = source.indexOf("if (!fromThisSite(req))");
  const limit = source.indexOf("rateLimit(`review-site:${clientIp(req)}`");
  const save = source.indexOf("sanityWriteClient.create(");
  assert.ok(guard > -1 && limit > guard && save > limit, "origin check, then the limit, then the write");
  assert.match(source, /checkSiteReview\(body\)/);
  assert.match(source, /if \(check\.trap\) return NextResponse\.json\(\{ ok: true \}, \{ status: 201 \}\);/);
  // Unapproved, whatever the body said: the value is written here, never taken from the request
  assert.match(source, /approved: false,/);
  assert.match(source, /source: "site",/, "marked as written here, so it lands in «Отзывы» and never among Nextdoor's");
  assert.doesNotMatch(source, /approved: (?:body|review|input)/);
  assert.doesNotMatch(source, /\.\.\.body|\.\.\.review\b/, "only the checked fields reach the document");
});

test("a refused email to Kristina doesn't lose the review", () => {
  const source = route();
  const save = source.indexOf("sanityWriteClient.create(");
  const email = source.indexOf("await sendEmail(");
  assert.ok(save > -1 && email > save, "the review is saved before the email is tried");
  assert.match(source, /catch \(error\) \{\s*console\.error\(`Review \$\{id\} is saved, but the email to Kristina failed:`/);
});

test("the review route is public, and there is no second way in that skips the checks", () => {
  assert.match(read("src/middleware.ts"), /"\/api\/reviews\/site\(\.\*\)"/);
  assert.ok(!existsSync(join(process.cwd(), "src/components/ReviewForm.tsx")), "the sign-in form is gone");
  assert.ok(!existsSync(join(process.cwd(), "src/app/api/reviews/route.ts")), "and so is the route it posted to");
});

test("beautasy.co.uk/review opens the form, and the buyers' emailed links are untouched", async () => {
  const redirects = await nextConfig.redirects!();
  const short = redirects.find((r) => r.source === "/review");
  assert.ok(short, "a redirect for /review");
  assert.equal(short.destination, "/reviews#write");
  assert.equal(short.permanent, false, "temporary, so the short link can point elsewhere later");
  assert.ok(!redirects.some((r) => r.source.startsWith("/review/")), "/review/<token> is the buyers' form");
  assert.ok(existsSync(join(process.cwd(), "src/app/review/[token]/page.tsx")));
});

test("the page puts Google first, the form beside it, and hides from search until there is a review", () => {
  const page = read("src/app/reviews/page.tsx");
  assert.match(page, /id="write"/);
  assert.ok(page.indexOf("Review us on Google") < page.indexOf("<SiteReviewForm"), "Google comes first");
  assert.match(page, /robots: reviews\.length \? undefined : \{ index: false, follow: true \}/);
  // Reviews from anywhere are shown, never marked up: Google does not allow a
  // business to mark up reviews of itself, and reviews from other sites never
  assert.doesNotMatch(page, /ld\+json|jsonLdScript|AggregateRating/);
});

test("a piece's page shows, and marks up for Google, only the reviews written here", () => {
  const page = read("src/app/shop/[param]/page.tsx");
  assert.match(page, /sanityClient\.fetch\(PRODUCT_REVIEWS_QUERY, \{ id: product\._id \}\)/);
  assert.doesNotMatch(page, /_type == "review"/, "one query, in @/lib/siteReviews, where its test can read it");
});

test("a piece's page sends reviews to the form with the piece filled in", () => {
  const detail = read("src/app/shop/[param]/ProductDetail.tsx");
  assert.match(detail, /href=\{`\/reviews\?product=\$\{encodeURIComponent\(product\._id\)\}&piece=\$\{encodeURIComponent\(product\.name\)\}#write`\}/);
  assert.doesNotMatch(detail, /ReviewForm/);
  const form = read("src/app/reviews/SiteReviewForm.tsx");
  assert.match(form, /params\.get\("product"\)/);
  assert.match(form, /productId: topic === "shop" \? piece\?\.id : undefined/);
});

test("the footer leads to the reviews", () => {
  assert.match(read("src/components/Footer.tsx"), /\{ label: "Reviews", href: "\/reviews" \}/);
});

const card = (review: Partial<PublishedReview>, nextdoorUrl: string | null = null) =>
  renderToStaticMarkup(
    createElement(ReviewCard, {
      review: {
        _id: "r1",
        source: "site",
        userName: "Anna",
        rating: 5,
        comment: "Took up my wedding dress beautifully.",
        createdAt: "2026-09-20T10:00:00Z",
        ...review,
      },
      nextdoorUrl,
    })
  );

const PAGE = "https://nextdoor.co.uk/pages/beautasy-atelier-southampton-eng/";

test("a review written here shows its stars and nothing about Nextdoor", () => {
  const html = card({});
  assert.match(html, /lucide-star/);
  assert.match(html, />Anna</);
  assert.doesNotMatch(html, /Nextdoor/);
});

test("a Nextdoor recommendation shows where it was written and the neighbour's area, not stars", () => {
  const html = card(
    { source: "nextdoor", rating: null, userName: "Sarah M.", neighbourhood: "Shirley", verifiedPurchase: true },
    PAGE
  );
  assert.doesNotMatch(html, /lucide-star/, "Nextdoor has no stars, and none are drawn");
  assert.match(html, /Recommended on Nextdoor/);
  assert.match(html, /Sarah M\./);
  assert.match(html, />Shirley</);
  assert.match(html, new RegExp(`<a href="${PAGE}" target="_blank" rel="noopener noreferrer"`));
  assert.doesNotMatch(html, /Verified purchase/, "nothing was bought through the site");

  const noPage = card({ source: "nextdoor", rating: null, userName: "Sarah M." }, null);
  assert.match(noPage, /Recommended on Nextdoor/);
  assert.doesNotMatch(noPage, /<a /, "no link until the page is set in the Studio");
});

test("the reviews page counts Nextdoor apart and offers it only with a real Nextdoor page", () => {
  const page = read("src/app/reviews/page.tsx");
  assert.match(page, /nextdoorPageUrl\(\)/);
  assert.match(page, /\{nextdoorUrl && \(/);
  assert.match(page, /Recommend us on Nextdoor/);
  // The ask opens Nextdoor's recommendation form; the marks on the reviews
  // lead to the page itself, where the recommendations are read
  assert.match(page, /href=\{nextdoorRecommendUrl\(nextdoorUrl\)\}[^]*?Recommend us on Nextdoor/);
  assert.doesNotMatch(page, /href=\{nextdoorUrl\}[^<]*<Heart[^]*?Recommend us on Nextdoor/);
  assert.match(page, /<ReviewWall reviews=\{wall\} nextdoorUrl=\{nextdoorUrl\} \/>/);
  assert.match(read("src/app/reviews/ReviewWall.tsx"), /review=\{review\}\s*nextdoorUrl=\{nextdoorUrl\}/);
  // Only a Nextdoor address gets through, whatever was typed in the Studio;
  // with none there, the page the site knows
  const settings = read("src/lib/siteSettings.ts");
  assert.match(settings, /if \(isNextdoorUrl\(url\)\) return url;/);
  assert.match(settings, /return isNextdoorUrl\(BUSINESS\.nextdoorUrl\) \? BUSINESS\.nextdoorUrl : null;/);
  assert.equal(isNextdoorUrl(BUSINESS.nextdoorUrl), true, "the page the site knows is a Nextdoor page");
});

/* ─── Reviews beside other things: home, /atelier, the service pages ─── */

const strip = (reviews: Partial<PublishedReview>[]) =>
  renderToStaticMarkup(
    createElement(ReviewStrip, {
      reviews: reviews.map((review, i) => ({
        _id: `r${i}`,
        source: "site" as const,
        userName: `Client ${i}`,
        rating: 5,
        comment: "Lovely work, thank you.",
        createdAt: "2026-09-20T10:00:00Z",
        ...review,
      })),
      nextdoorUrl: null,
    })
  );

test("with no reviews there is no section at all, not a heading over nothing", () => {
  assert.equal(strip([]), "");
});

test("a row of reviews leads to /reviews and keeps long ones to six lines", () => {
  const html = strip([{}, { source: "nextdoor", rating: null }]);
  assert.equal(html.match(/<li /g)?.length, 2);
  assert.match(html, /href="\/reviews"/);
  assert.match(html, /Read or write a review/);
  assert.match(html, /line-clamp-6/);
  assert.match(html, /md:grid-cols-2/, "two reviews, two columns");
  assert.match(strip([{}]), /max-w-xl/, "one review doesn't sit beside two gaps");
  assert.match(strip([{}, {}, {}]), /md:grid-cols-3/);
});

test("the home page, /atelier and every service page show reviews, and none of them marks them up", () => {
  const home = read("src/app/page.tsx");
  assert.match(home, /const kindWords = reviews\.slice\(0, 3\);/);
  assert.match(home, /reviews=\{kindWords\.length > 0 \? <ReviewStrip reviews=\{kindWords\} nextdoorUrl=\{nextdoorUrl\} \/> : null\}/);
  assert.match(read("src/app/HomeContent.tsx"), /\{reviews && \(/);

  const atelier = read("src/app/atelier/page.tsx");
  assert.match(atelier, /const kindWords = atelierReviews\(reviews\)\.slice\(0, 3\);/);
  assert.match(read("src/app/atelier/AtelierContent.tsx"), /\{reviews && \(/);

  const service = read("src/app/alterations/[slug]/page.tsx");
  assert.match(service, /const kindWords = reviewsForTopics\(reviews, service\.reviewTopics, 3\);/);
  assert.match(service, /<ReviewStrip reviews=\{kindWords\} nextdoorUrl=\{nextdoorUrl\}/);

  for (const [name, source] of [["home", home], ["atelier", atelier], ["service", service]]) {
    // A review of the business in its own markup is what Google penalises,
    // and a Nextdoor recommendation is another site's review
    assert.doesNotMatch(source, /aggregateRating|reviewBody|"@type": "Review"/i, name);
  }
  // A page that shows reviews beside something else never fails over them
  assert.match(read("src/lib/getReviews.ts"), /catch \(error\) \{\s*console\.error\("Could not read the reviews:", error\);\s*return \[\];/);
});

test("a review from Google or Etsy shows its stars and leads to where it was written", () => {
  const google = card({ source: "google", rating: 5, userName: "Maria" });
  assert.match(google, /lucide-star/);
  assert.match(google, /<a href="https:\/\/maps\.google\.com\/\?cid=5155324499486741351" target="_blank" rel="noopener noreferrer"[^>]*>Google review<\/a>/);
  assert.doesNotMatch(google, /Nextdoor|Verified purchase/);

  const etsy = card({ source: "etsy", rating: 5, userName: "Shannon", item: "Quilted cosmetic bag", about: "shop" });
  assert.match(etsy, /lucide-star/);
  assert.match(etsy, /<a href="https:\/\/www\.etsy\.com\/shop\/Beautasy#reviews"[^>]*>Etsy review<\/a>/);
  assert.match(etsy, />Quilted cosmetic bag</, "what the buyer bought, under the review");

  // "Verified purchase" is only ever for a purchase made on this site
  assert.doesNotMatch(card({ source: "etsy", rating: 5, verifiedPurchase: true }), /Verified purchase/);
  assert.match(card({ source: "site", rating: 5, verifiedPurchase: true }), /Verified purchase/);
});

test("the reviews page counts Google's and Etsy's reviews without averaging their stars", () => {
  const page = read("src/app/reviews/page.tsx");
  assert.match(page, /const \{ count, average, nextdoor, google, etsy \} = reviewSummary\(reviews\);/);
  assert.match(page, /`\$\{google\} \$\{google === 1 \? "review" : "reviews"\} from Google`/);
  assert.match(page, /`\$\{etsy\} \$\{etsy === 1 \? "review" : "reviews"\} from Etsy`/);
  // The average is only ever of the stars written here
  assert.match(page, /`\$\{average\.toFixed\(1\)\} from \$\{count\} \$\{count === 1 \? "review" : "reviews"\} here`/);
});

const wallOf = (reviews: Partial<PublishedReview>[]) =>
  renderToStaticMarkup(
    createElement(ReviewWall, {
      reviews: reviews.map((review, i) => ({
        _id: `w${i}`,
        source: "site" as const,
        userName: `Client ${i}`,
        rating: 5,
        comment: "Lovely work, thank you.",
        createdAt: "2026-09-20T10:00:00Z",
        ...review,
      })),
      nextdoorUrl: null,
    })
  );

test("the wall opens on every review, and offers the atelier's or the shop's when there are both", () => {
  const both = wallOf([
    { source: "nextdoor", rating: null },
    { source: "google" },
    { source: "etsy", about: "shop", item: "Floral scrunchie" },
  ]);
  assert.equal(both.match(/<li /g)?.length, 3, "all of them in the page as it arrives");
  assert.match(both, /aria-pressed="true"[^>]*>All<span[^>]*>3</);
  assert.match(both, />Alterations &amp; sewing<span[^>]*>2</);
  assert.match(both, />Handmade pieces<span[^>]*>1</);

  const shopOnly = wallOf([{ source: "etsy", about: "shop" }, { source: "etsy", about: "shop" }]);
  assert.doesNotMatch(shopOnly, /aria-pressed/, "no choice to make with one kind only");
  assert.equal(shopOnly.match(/<li /g)?.length, 2);
});

test("the page leads with one review, and doesn't show it twice", () => {
  const page = read("src/app/reviews/page.tsx");
  assert.match(page, /const featured = featuredReview\(reviews\);/);
  assert.match(page, /const wall = featured \? reviews\.filter\(\(review\) => review\._id !== featured\._id\) : reviews;/);
  assert.match(page, /<blockquote[^>]*>\s*\{featured\.comment\}/);
});
