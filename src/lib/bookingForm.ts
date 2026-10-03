import { whatsappLink } from "@/lib/business";
import { slotLabel } from "@/lib/slots";

/**
 * What the booking form and the booking route agree on. Kept apart from
 * @/lib/bookingRequest, which reads every landing page to know their service
 * names: the form runs in the customer's browser, and these few lines are all
 * it needs.
 */

/** The longest each field may be — roomy for a person, nothing a script can fill the Studio with. */
export const FIELD_LIMITS = {
  name: 80,
  // The longest an email address can be at all
  email: 254,
  phone: 30,
  notes: 2000,
  // A date from the picker is ten characters; this is room for a typed one
  preferredDate: 40,
  // "SO17 1AB" with room for stray spaces
  postcode: 16,
} as const;

/**
 * The field only a bot fills in. Hidden from people and from screen readers,
 * skipped by the keyboard. Not called "company", as the newsletter's is: on a
 * form with a name, an email and a phone, a browser offers its saved address
 * card, and a company filled in from that would turn a real customer's
 * booking into silence.
 */
export const HONEYPOT_FIELD = "website";

/* ─── When no answer comes back ─── */

/**
 * What the customer is told when their booking got no answer at all. The
 * browser's own words for it — "Load failed" on an iPhone, "Failed to fetch"
 * in Chrome — tell nobody what happened or what to do next. Trying again is
 * safe: the route answers the same request sent twice with the first answer,
 * and books nothing twice (see sameRequestBefore in the booking route).
 */
export const NO_ANSWER =
  "We couldn't hear back from the atelier — your connection may have dropped. Please try again (you won't be booked twice), or message Kristina on WhatsApp.";

/** What came back from sending a booking: the route's answer, or nothing anyone can read. */
export type BookingReply = { reached: true; ok: boolean; data: Record<string, unknown> } | { reached: false };

/**
 * Sends the booking and says whether it was answered. Nothing throws out of
 * here: a connection that dropped, and a reply that is not the route's own —
 * a gateway's error page in place of its JSON — are both "not reached", which
 * is the one case the form answers with WhatsApp rather than a message.
 */
export async function sendBooking(body: Record<string, unknown>, post: typeof fetch = fetch): Promise<BookingReply> {
  let res: Response;
  try {
    res = await post("/api/atelier-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { reached: false };
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { reached: false };
  }
  if (!data || typeof data !== "object") return { reached: false };
  return { reached: true, ok: res.ok, data: data as Record<string, unknown> };
}

/**
 * The WhatsApp message a customer whose booking got no answer starts with:
 * who they are and what they were booking, so Kristina can answer it without
 * asking twice.
 */
export function whatsappAboutBooking(input: {
  name: string;
  service: string;
  slot: string | null;
  collecting: boolean;
}): string {
  const first = input.name.trim().split(/\s+/)[0];
  const hello = first ? `Hi Kristina, it's ${first}.` : "Hi Kristina.";
  const what = input.collecting
    ? `I tried to ask for a collection on your website (${input.service})`
    : input.slot
    ? `I tried to book on your website (${input.service}, ${slotLabel(input.slot)})`
    : `I tried to send a booking request on your website (${input.service})`;
  return whatsappLink(`${hello} ${what}, but it didn't go through.`);
}
