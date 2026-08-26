import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/geo — best guess at where the shopper is, so the bag can preselect
 * the right delivery region. Only ever a default: the customer can change it,
 * and the choice they make is what checkout uses.
 */
export async function GET(req: NextRequest) {
  const country = req.headers.get("x-vercel-ip-country") ?? null;
  return NextResponse.json({
    country,
    region: country === "GB" ? "uk" : country ? "international" : null,
  });
}
