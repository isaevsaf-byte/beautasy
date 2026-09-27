import { getSiteSettings } from "@/lib/siteSettings";
import { getShelves } from "@/lib/getShelves";
import { NextResponse } from "next/server";

// Revalidate every 5 minutes (matches getSiteSettings cache)
export const revalidate = 300;

/**
 * The settings every page's header and footer need, plus which shelves of the
 * shop are stocked — see @/lib/shelves. Pages rendered in the browser fetch
 * this once per visit and keep it in sessionStorage.
 */
export async function GET() {
  try {
    const [settings, shelves] = await Promise.all([getSiteSettings(), getShelves()]);
    return NextResponse.json({ ...settings, shelves });
  } catch {
    return NextResponse.json({});
  }
}
