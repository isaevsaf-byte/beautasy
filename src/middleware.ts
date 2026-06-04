import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isProtectedRoute = createRouteMatcher(["/api/reviews(.*)"]);
const isPublicApiRoute = createRouteMatcher(["/api/webhook(.*)", "/api/meta-feed(.*)"]);

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function noopMiddleware(req: NextRequest) {
  return NextResponse.next();
}

const middleware = clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      // Stripe webhook must bypass auth entirely
      if (isPublicApiRoute(req)) return NextResponse.next();
      if (isProtectedRoute(req) && req.method === "POST") {
        await auth.protect();
      }
    })
  : noopMiddleware;

export default middleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
