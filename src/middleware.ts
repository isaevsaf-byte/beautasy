import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clerkEnabled } from "@/lib/clerk";
import { gluedLinkTarget } from "@/lib/gluedLinks";
import { shortLinkTarget } from "@/lib/shortLinks";
import { movedStudioPath } from "@/lib/studioMoves";

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

const auth = clerkEnabled
  ? clerkMiddleware(async (auth, req) => {
      // Stripe webhook must bypass auth entirely
      if (isPublicApiRoute(req)) return NextResponse.next();
    })
  : noopMiddleware;

/**
 * A link glued to the next word (/atelierFeel) goes to the page it meant,
 * before anything else looks at it — see @/lib/gluedLinks. Temporary: the
 * word is not an address.
 */
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  // A short link from a group post (/g/prom/k3x) — see @/lib/shortLinks.
  // Temporary too: the words may point somewhere else one day.
  const short = shortLinkTarget(req.nextUrl.pathname, req.nextUrl.search);
  if (short) return NextResponse.redirect(new URL(short, req.nextUrl.origin), 307);

  // An old address of a Studio list that now lives in a folder — see @/lib/studioMoves
  const moved = movedStudioPath(req.nextUrl.pathname);
  if (moved) {
    const url = req.nextUrl.clone();
    url.pathname = moved;
    return NextResponse.redirect(url, 307);
  }

  const meant = gluedLinkTarget(req.nextUrl.pathname);
  if (meant) {
    const url = req.nextUrl.clone();
    url.pathname = meant;
    return NextResponse.redirect(url, 307);
  }
  return auth(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
