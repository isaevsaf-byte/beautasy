import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import { WELCOME_VALID_DAYS } from "@/lib/discounts";
import { fingerprint, fingerprintsMatch } from "@/lib/secrets";

/**
 * The newsletter's own emails and its way out.
 *
 * The welcome email said "to unsubscribe, reply to this email", which is a
 * request to Kristina rather than a way out, and the law on marketing email
 * (PECR) wants a simple one in every message. So each subscriber gets a link
 * of their own. It is signed, not secret-in-the-dataset: the signature is a
 * keyed fingerprint of the subscriber's document id (see @/lib/secrets), so
 * it can be checked without storing anything, and nobody can unsubscribe
 * somebody else by changing the id.
 */

/** The signature on one subscriber's unsubscribe link. */
export function unsubscribeSignature(subscriberId: string): string {
  return fingerprint(`newsletter-unsubscribe:${subscriberId}`);
}

/** Whether a link's signature belongs to its id. False rather than throwing on anything odd. */
export function signatureMatches(subscriberId: string | null, signature: string | null): boolean {
  if (!subscriberId || !signature || subscriberId.length > 128 || signature.length > 128) return false;
  try {
    return fingerprintsMatch(unsubscribeSignature(subscriberId), signature);
  } catch {
    // No DATA_SECRET: nothing can be checked, so nothing is accepted
    return false;
  }
}

/** The link that goes in every email to this subscriber. */
export function unsubscribeUrl(subscriberId: string, base: string = SITE_URL): string {
  return `${base}/api/newsletter/unsubscribe?id=${encodeURIComponent(subscriberId)}&sig=${unsubscribeSignature(subscriberId)}`;
}

/** Where a subscriber who unsubscribes by email instead of the link writes to. */
export const UNSUBSCRIBE_MAILTO = "mailto:hello@beautasy.co.uk?subject=unsubscribe";

/**
 * The headers that put the way out next to the sender's name.
 *
 * Gmail and Apple Mail show their own "Unsubscribe" when an email carries
 * List-Unsubscribe. That is an easier way out than "Report spam", and every
 * spam report counts against all mail from beautasy.co.uk — order
 * confirmations and Kristina's booking replies included.
 *
 * Two ways, as the standard allows: the signed link — the very one in the
 * footer — and an email to hello@. With List-Unsubscribe-Post, a mail app
 * unsubscribes in one click by POSTing to the link, which is exactly what the
 * unsubscribe route's POST does; a GET only asks, so a mail scanner opening
 * the link still changes nothing. The mailto: way lands in Kristina's inbox
 * and is done by hand.
 */
export function unsubscribeHeaders(subscriberId: string, base: string = SITE_URL): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(subscriberId, base)}>, <${UNSUBSCRIBE_MAILTO}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function welcomeEmailHtml(code: string | null, unsubscribeLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:36px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy</p>
      <h1 style="margin:0;font-size:26px;font-weight:400;color:#2d2d2d;font-style:italic;">Welcome 💜</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">
        Thank you for joining us. Everything we make is sewn by hand in our Southampton
        atelier — you'll hear from us when a new collection is ready, and not much else.
      </p>
      ${
        code
          ? `<div style="background:#f7f3ff;border-radius:12px;padding:22px;text-align:center;margin:26px 0;">
               <p style="margin:0 0 8px;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">10% off your first order</p>
               <p style="margin:0;font-size:26px;letter-spacing:4px;color:#2d2d2d;font-family:Georgia,serif;">${escapeHtml(code)}</p>
               <p style="margin:10px 0 0;font-size:12px;color:#777;">Enter it at checkout — yours alone, valid for ${WELCOME_VALID_DAYS} days</p>
             </div>`
          : ""
      }
      <p style="text-align:center;margin:28px 0 0;">
        <a href="${SITE_URL}/shop" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Browse the shop</a>
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;line-height:1.7;">
        Made with 💜 in Southampton · you're getting this because you signed up at beautasy.co.uk ·
        <a href="${escapeHtml(unsubscribeLink)}" style="color:#999;">unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

/** The small page the unsubscribe link opens, and the one after the button. */
export function unsubscribePageHtml(
  state: "confirm" | "done" | "invalid" | "error",
  formAction?: string
): string {
  const body =
    state === "confirm"
      ? `<h1>Unsubscribe from Beautasy emails?</h1>
         <p>You won't get news of new collections or offers any more. Orders and bookings still send their own emails.</p>
         <form method="post" action="${escapeHtml(formAction ?? "")}">
           <button type="submit">Unsubscribe</button>
         </form>`
      : state === "done"
      ? `<h1>You're unsubscribed</h1>
         <p>We won't send you newsletter emails again. Changed your mind? Write to hello@beautasy.co.uk and we'll put you back.</p>
         <p><a href="${SITE_URL}">Back to Beautasy</a></p>`
      : state === "error"
      ? `<h1>That didn't work this time</h1>
         <p>Something went wrong on our side. Please try the link again in a minute, or write to hello@beautasy.co.uk and we'll take you off the list by hand.</p>
         <p><a href="${SITE_URL}">Back to Beautasy</a></p>`
      : `<h1>This link doesn't look right</h1>
         <p>It may have been cut short by your email app. Reply to any of our emails, or write to hello@beautasy.co.uk, and we'll take you off the list by hand.</p>
         <p><a href="${SITE_URL}">Back to Beautasy</a></p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Beautasy — newsletter</title>
<style>
  body { margin:0; padding:40px 16px; background:#faf9f7; font-family:Georgia,serif; color:#2d2d2d; }
  main { max-width:480px; margin:0 auto; background:#fff; border-radius:16px; padding:36px 32px; box-shadow:0 2px 20px rgba(0,0,0,0.06); text-align:center; }
  h1 { font-weight:400; font-size:24px; margin:0 0 16px; }
  p { color:#5a5a5a; line-height:1.7; }
  a { color:#7a6d9a; }
  button { margin-top:12px; padding:13px 30px; background:#DCD0FF; color:#2d2d2d; border:0; border-radius:999px; font:inherit; font-size:13px; letter-spacing:1px; text-transform:uppercase; cursor:pointer; }
</style>
</head>
<body><main>
  <p style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;margin:0 0 12px;">Beautasy</p>
  ${body}
</main></body>
</html>`;
}
