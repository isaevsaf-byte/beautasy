import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { clerkEnabled } from "@/lib/clerk";

// Auth lives inside the review routes themselves rather than here: a customer
// following a review-request link has no account, and blanket-protecting
// /api/reviews(.*) sent them to a sign-in page instead of the API. The form at
// /reviews needs no account at all. Each route decides for itself.
const isPublicApiRoute = createRouteMatcher([
  "/api/webhook(.*)",
  "/api/meta-feed(.*)",
  "/api/reviews/by-token(.*)",
  "/api/reviews/site(.*)",
]);


function noopMiddleware() {
  return NextResponse.next();
}

const middleware = clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      // Stripe webhook must bypass auth entirely
      if (isPublicApiRoute(req)) return NextResponse.next();
    })
  : noopMiddleware;

export default middleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
