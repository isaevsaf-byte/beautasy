import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/schedule";

// The diary changes as people book, so never serve a cached answer
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/atelier/slots — the times a customer can pick.
 *
 * `bookable: false` is a normal answer, not an error: until Kristina has
 * filled in her hours the form asks for a preferred date instead, exactly as
 * it always did. Nothing here is private — these are opening hours.
 */
export async function GET() {
  const { schedule, days } = await getAvailableSlots();

  return NextResponse.json(
    {
      bookable: schedule.enabled && days.length > 0,
      slotMinutes: schedule.slotMinutes,
      days,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
