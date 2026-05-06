import { getSiteSettings } from "@/lib/siteSettings";
import { NextResponse } from "next/server";

// Revalidate every 5 minutes (matches getSiteSettings cache)
export const revalidate = 300;

export async function GET() {
  try {
    const settings = await getSiteSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({});
  }
}
