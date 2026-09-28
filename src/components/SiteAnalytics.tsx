"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { countsVisit } from "@/lib/visitCounts";

/**
 * Vercel's visitor counter, with the Studio left out (see countsVisit). The
 * layout is a server component and cannot hand a function to this one, so
 * the filter is attached here.
 */
function dropStudio(event: BeforeSendEvent): BeforeSendEvent | null {
  return countsVisit(event.url) ? event : null;
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={dropStudio} />;
}
