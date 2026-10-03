import { slotIsOffered, spansOffered, type SlotDay } from "@/lib/slots";

/**
 * What a customer can ask the atelier for — the same list on the booking form
 * and in the Studio's "Book by hand", so a booking reads the same wherever it
 * was made.
 */
export const ATELIER_SERVICES = [
  "Alterations",
  "Bridal fitting",
  "Repairs",
  "Custom Sewing",
  "Home Textiles",
  "Other / Not Sure",
];

/**
 * The services that take two slots in the diary. The owner's decision:
 * «Невесте два слота». Prom and evening dresses stay at one.
 *
 * "Wedding Dress Alterations" is what the wedding landing page sends — its
 * serviceName in @/lib/localServices. It is spelled here rather than imported,
 * so the form and the Studio do not carry every landing page's copy with them;
 * a test holds the two names together.
 */
export const BRIDAL_SERVICES = ["Bridal fitting", "Wedding Dress Alterations"];

/** How many slots of the diary a service takes: two for a bride, one for everything else. */
export function slotsFor(service: string | undefined | null): number {
  return typeof service === "string" && BRIDAL_SERVICES.includes(service) ? 2 : 1;
}

/**
 * The starts a customer may pick for a service: every free slot for a fitting
 * of one, and for a bride only those where both slots in a row are free.
 */
export function startsFor(days: SlotDay[], service: string | undefined | null, slotMinutes: number): SlotDay[] {
  const slots = slotsFor(service);
  return slots > 1 ? spansOffered(days, slots * slotMinutes, slotMinutes) : days;
}

/**
 * The start still chosen once the service changes, if it still fits — a
 * bride needs the slot after it free too. Otherwise nothing is chosen, rather
 * than a time that would be refused on sending.
 */
export function startForService(
  days: SlotDay[],
  service: string | undefined | null,
  slotMinutes: number,
  start: string | null
): string | null {
  return start && slotIsOffered(startsFor(days, service, slotMinutes), start) ? start : null;
}
