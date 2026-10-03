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

/* ─── The same form, sending again ─── */

/**
 * The field that carries the form's own key: made once for each filled-in
 * form, the first time it is sent, and sent again with every retry. It is how
 * the route knows a second copy is this browser trying again — not somebody
 * else who knows the customer's email address and is asking, time by time,
 * which booking is theirs.
 */
export const REQUEST_KEY_FIELD = "requestKey";

/** A key nobody can guess: a random UUID, or 128 random bits where the browser has no randomUUID. */
export function newRequestKey(random: Crypto = globalThis.crypto): string {
  if (typeof random.randomUUID === "function") return random.randomUUID();
  const bytes = random.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * What the form sends, from what is on it. Pulled out of the component so what
 * leaves the browser can be checked without one: the hidden field above all,
 * which catches nothing if its value never goes out.
 */
export function bookingBody(form: {
  name: string;
  email: string;
  phone: string;
  service: string;
  notes: string;
  /** The hidden field's value — empty unless a bot filled it in */
  trap: string;
  requestKey: string;
  /** Collect & return chosen: its postcode and when they are in, and no time */
  collection: { postcode: string; when: string } | null;
  slot: string | null;
  preferredDate: string;
  referralCode: string | null;
}): Record<string, unknown> {
  return {
    name: form.name,
    email: form.email,
    phone: form.phone,
    service: form.service,
    notes: form.notes,
    [HONEYPOT_FIELD]: form.trap,
    [REQUEST_KEY_FIELD]: form.requestKey,
    ...(form.collection
      ? { collection: { postcode: form.collection.postcode, ...(form.collection.when.trim() ? { when: form.collection.when } : {}) } }
      : form.slot
      ? { slot: form.slot }
      : { preferredDate: form.preferredDate }),
    ...(form.referralCode ? { referralCode: form.referralCode } : {}),
  };
}

/* ─── When no answer comes back ─── */

/**
 * What the customer is told when their booking got no answer at all. The
 * browser's own words for it — "Load failed" on an iPhone, "Failed to fetch"
 * in Chrome — tell nobody what happened or what to do next.
 *
 * Trying again is safe in the ordinary case: the route answers the same form
 * sent twice with the first answer (see sameRequestBefore in the booking
 * route). It is not a promise, so it is not worded as one — a database that
 * could not be asked, or a first copy that reached Kristina's inbox and not the
 * Studio, leaves nothing to recognise, and then she gets it twice.
 */
export const NO_ANSWER =
  "We couldn't hear back from the atelier — your connection may have dropped. Please try again (if your first one got through, we'll spot it), or message Kristina on WhatsApp.";

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
