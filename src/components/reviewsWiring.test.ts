import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../../next.config";

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
