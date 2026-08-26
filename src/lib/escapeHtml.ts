/**
 * Escapes text before it is interpolated into an HTML email.
 *
 * Everything we put in an email comes from outside: names and notes typed into
 * the booking form, addresses and product titles coming back from Stripe. Left
 * raw, any of it can inject markup — a fake "confirm your payment" button in the
 * message Kristina reads, for instance. Escaping keeps the text as text.
 */
export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
