import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    stripe: !!process.env.STRIPE_SECRET_KEY,
    sanityProjectId: !!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  });
}
