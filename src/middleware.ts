import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Auth lives inside the review routes themselves rather than here: a customer
// following a review-request link has no account, and blanket-protecting
// /api/reviews(.*) sent them to a sign-in page instead of the API. Each route
// decides for itself — signed-in user, valid review token, or 401.
const isPublicApiRoute = createRouteMatcher([
  "/api/webhook(.*)",
  "/api/meta-feed(.*)",
  "/api/reviews/by-token(.*)",
]);

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

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
