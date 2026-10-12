import { whatsappNumberOf } from "@/lib/bookingEmails";
import { greetingName } from "@/lib/careLabel";
import { BRIDAL_SERVICES } from "@/lib/atelierServices";

/**
 * «🙏 Попросить отзыв» (12.10.2026): a WhatsApp from Kristina herself, asking
 * a finished client for a Google review.
 *
 * The thank-you email already asks, and it is the cheapest ask there is — but
 * an email from a site is read as a site's email. Three Google reviews
 * against the 28 to 241 that the tailors around her have is the gap that
 * decides who comes up for "tailor near me", and a message from the person
 * who just let your hem down is the one people answer.
 *
 * Pure: the route opens the number and finds the link, this writes the words.
 */

/**
 * The job as she would name it in a message: "your wedding dress", "your
 * repairs". The form's own labels read badly here — "working on your bridal
 * fitting", "your custom sewing" — so anything not named below is "your piece",
 * the word the rest of the site already uses for whatever a client brought.
 */
export function pieceForReview(service: string | null | undefined): string {
  if (typeof service !== "string") return "piece";
  if (BRIDAL_SERVICES.includes(service)) return "wedding dress";
  if (service === "Alterations") return "alterations";
  if (service === "Repairs") return "repairs";
  return "piece";
}

/**
 * The message, in Kristina's voice: first person, warm, one emoji, her name
 * at the end. "Happy with the result" rather than "with it", because repairs
 * and alterations are plural.
 */
export function reviewAskText(
  booking: { displayName?: string | null; service?: string | null },
  reviewUrl: string
): string {
  return [
    `Hi ${greetingName(booking.displayName)}! It was lovely working on your ${pieceForReview(booking.service)} 😊`,
    "If you're happy with the result, would you leave me a quick Google review? It really helps people in Southampton find me:",
    reviewUrl,
    "",
    "Thank you!",
    "Kristina",
  ].join("\n");
}

/**
 * wa.me with the client's number and the message already typed, or null when
 * the number is not one WhatsApp can take (see whatsappNumberOf): a chat
 * opened with a stranger is worse than none.
 */
export function reviewAskLink(phone: string | null | undefined, text: string): string | null {
  const number = whatsappNumberOf(phone ?? undefined);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
