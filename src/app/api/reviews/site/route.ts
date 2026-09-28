import { NextRequest, NextResponse } from "next/server";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { checkSiteReview } from "@/lib/siteReviews";
import { newReviewEmail } from "@/lib/newReviewEmail";
import { sendEmail } from "@/lib/sendEmail";

export const dynamic = "force-dynamic";

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

/**
 * POST /api/reviews/site — a review written in the form at /reviews.
 *
 * It is saved unapproved: nothing a stranger types reaches the site until
 * Kristina has read it. She is emailed at once, because a review nobody looks
 * at for a week is a client left wondering where their kind words went.
 */
export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Please send your review from the Beautasy site." }, { status: 403 });
  }

  const limited = rateLimit(`review-site:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Thank you, that's plenty for now. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "We couldn't read that. Please try again." }, { status: 400 });
  }

  const check = checkSiteReview(body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  if (check.trap) return NextResponse.json({ ok: true }, { status: 201 });
  const { review } = check;

  if (!process.env.SANITY_API_WRITE_TOKEN) {
    console.error("SANITY_API_WRITE_TOKEN is not configured — a review from the site could not be saved");
    return NextResponse.json({ error: "Reviews are taking a short break. Please try again later." }, { status: 503 });
  }

  let pieceName: string | null = null;
  if (review.productId) {
    try {
      pieceName = await sanityClient.fetch<string | null>(`*[_type == "product" && _id == $id][0].name`, {
        id: review.productId,
      });
    } catch (error) {
      console.error("Could not look up the piece a review is about:", error);
      return NextResponse.json({ error: "We couldn't save your review. Please try again in a minute." }, { status: 503 });
    }
    if (!pieceName) {
      return NextResponse.json(
        { error: "We couldn't find that piece. Please open the review form from its page again." },
        { status: 400 }
      );
    }
  }

  let id: string;
  try {
    const created = await sanityWriteClient.create({
      _type: "review",
      source: "site",
      userName: review.name,
      rating: review.rating,
      comment: review.comment,
      about: review.topic,
      ...(review.productId ? { product: { _type: "reference", _ref: review.productId } } : {}),
      approved: false,
      createdAt: new Date().toISOString(),
    });
    id = created._id;
  } catch (error) {
    console.error("Could not save a review from the site:", error);
    return NextResponse.json({ error: "We couldn't save your review. Please try again in a minute." }, { status: 500 });
  }

  // The review is saved either way, and the Studio's Dashboard counts it, so a
  // refused email is logged rather than turned into an error for the writer.
  try {
    await sendEmail({
      from: FROM_EMAIL,
      to: KRISTINA_EMAIL,
      subject: `New review waiting: ${"★".repeat(review.rating)} from ${review.name}`,
      html: newReviewEmail(review, id, pieceName),
    });
  } catch (error) {
    console.error(`Review ${id} is saved, but the email to Kristina failed:`, error);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
