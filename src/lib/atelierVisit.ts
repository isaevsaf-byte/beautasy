/**
 * Where a booked customer goes (24.10.2026): the atelier's street address and
 * how to find the door, carried by the confirmation, the day-before reminder
 * and the calendar invite — so Kristina no longer messages every customer the
 * address by hand.
 *
 * 🚨 The atelier is her home. The address lives only in the server's
 * environment — ATELIER_ADDRESS, and ATELIER_DIRECTIONS for the door — set in
 * Vercel, never in the Sanity dataset (it is public: anything stored there is
 * world-readable) and never on a page. It reaches only someone holding a
 * confirmed time, in their own email.
 *
 * Not set, the emails say what they said before: Kristina sends the address.
 *
 * No `import "server-only"` here: the emails are tested in plain Node, where
 * that guard throws. A browser could not read it anyway — Next puts only
 * NEXT_PUBLIC_ variables into what it sends the browser, so called there this
 * answers null.
 */

export interface AtelierVisit {
  /** One line, as it goes on an envelope: "12 Example Road, Southampton SO17 1AB" */
  address: string;
  /** How to find the door — "Side gate on the left, ring the bell" */
  directions?: string;
  /**
   * The route to the door in Google Maps, one tap from the email. A route, not
   * the listing: the listing keeps the address hidden, so it cannot lead anyone
   * to the door
   */
  maps: string;
}

/** A value from the environment as one tidy line: line breaks become commas, spaces are squeezed */
function oneLine(value: string | undefined): string {
  return (value ?? "")
    .split(/\r?\n/)
    // A line that already ends in a comma is not given a second one
    .map((part) => part.trim().replace(/,+$/, ""))
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function atelierVisit(env: Record<string, string | undefined> = process.env): AtelierVisit | null {
  const address = oneLine(env.ATELIER_ADDRESS);
  // Too short to be an address is a setting typed by mistake: better the old wording than a wrong door
  if (address.length < 8) return null;
  const directions = oneLine(env.ATELIER_DIRECTIONS);
  return {
    address,
    ...(directions ? { directions } : {}),
    maps: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
  };
}
