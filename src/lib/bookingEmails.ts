import { Resend } from "resend";
import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import { claimThenSend } from "@/lib/claim";
import { open } from "@/lib/pii";
import { friendsBlockHtml, ownLinkFor, referralSettings, rewardReferral } from "@/lib/referrals";
import type { ReferralSettings } from "@/lib/referralRules";
import { pounds } from "@/lib/friendsLink";
import { googleReviewUrl } from "@/lib/siteSettings";

/**
 * Confirming atelier bookings.
 *
 * A booking request used to be an email in Kristina's inbox and nothing else:
 * the customer got "we've received it" and then waited, with no way to know
 * whether their fitting was actually booked. Now each request is a document she
 * can confirm or decline in the Studio, and the customer hears back either way.
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

// "completed" is the thank-you after collection — and the one moment a
// customer is glad enough to say so in public, if they are asked.
const NOTIFIABLE = ["confirmed", "declined", "completed"] as const;
export type NotifiableStatus = (typeof NOTIFIABLE)[number];

export interface NotifiableBooking {
  _id: string;
  /** Revision the booking was read at — the claim is conditional on it */
  _rev: string;
  status: string;
  notifiedStatus?: string;
  /** First name, readable, for the Studio and the greeting */
  displayName?: string;
  /** Sealed contact details — see @/lib/pii */
  nameSealed?: string;
  emailSealed?: string;
  service?: string;
  preferredDate?: string;
  confirmedFor?: string;
  replyNote?: string;
  createdAt?: string;
  /** A friend sent them: who, and what to take off when they pay */
  referrer?: { _ref: string };
  referredBy?: string;
  referralDiscount?: number;
}

export function bookingEmailHtml(
  booking: NotifiableBooking,
  status: NotifiableStatus,
  /** The customer's own "Give £5, get £5" link, for the thank-you */
  friends: { code: string; settings: ReferralSettings } | null = null,
  /**
   * Where to send someone who is pleased. Passed in rather than read here so
   * the link can live in the Studio, where Kristina can change it, instead of
   * behind a redeploy.
   */
  reviewLink: string | null = process.env.GOOGLE_REVIEW_URL ?? null
): string {
  const firstName = escapeHtml(booking.displayName ?? "there");
  const service = escapeHtml(booking.service ?? "your appointment");
  const when = escapeHtml(booking.confirmedFor ?? booking.preferredDate ?? "");

  const reviewUrl = reviewLink || undefined;

  const heading =
    status === "confirmed"
      ? "You're booked in"
      : status === "completed"
      ? "Thank you"
      : "About your booking";
  const body =
    status === "confirmed"
      ? `Your ${service} is confirmed${when ? ` for <strong>${when}</strong>` : ""}. We're at the atelier in Southampton — reply to this email if you need to move it.`
      : status === "completed"
      ? `Thank you for trusting us with your ${service}. If it fits the way you hoped, a sentence about it${reviewUrl ? " on Google" : ""} helps the next person in Southampton find a small atelier — and means a great deal to the one pair of hands that did the work.`
      : `We're so sorry — we can't take your ${service}${when ? ` on ${when}` : ""} after all.`;
  const button =
    status === "completed"
      ? reviewUrl
        ? { href: reviewUrl, label: "Leave a Google review" }
        : { href: `${SITE_URL}/alterations`, label: "Bring the next thing" }
      : status === "confirmed"
      ? { href: `${SITE_URL}/atelier`, label: "About the atelier" }
      : { href: `${SITE_URL}/atelier`, label: "Ask for another time" };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:34px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy Atelier</p>
      <h1 style="margin:0;font-size:25px;font-weight:400;color:#2d2d2d;font-style:italic;">${heading}</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">${firstName}, ${body}</p>
      ${
        booking.replyNote
          ? `<div style="background:#f7f3ff;border-radius:12px;padding:18px 22px;margin:20px 0;">
               <p style="margin:0;color:#3d3d3d;line-height:1.7;">${escapeHtml(booking.replyNote)}</p>
             </div>`
          : ""
      }
      ${
        status === "confirmed" && booking.referralDiscount
          ? `<p style="color:#3d3d3d;line-height:1.7;margin:0;">Your <strong>${pounds(booking.referralDiscount)} off</strong>${booking.referredBy ? ` from ${escapeHtml(booking.referredBy)}` : ""} is noted — it comes off when you pay at the atelier.</p>`
          : ""
      }
      <p style="text-align:center;margin:26px 0 0;">
        <a href="${escapeHtml(button.href)}" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${button.label}</a>
      </p>
      ${status === "completed" && friends ? friendsBlockHtml(friends.code, friends.settings) : ""}
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Made with 💜 in Southampton</p>
    </div>
  </div>
</body>
</html>`;
}

const PENDING_QUERY = `*[
  _type == "atelierBooking"
  && defined(emailSealed)
  && status in ["confirmed", "declined", "completed"]
  && (!defined(notifiedStatus) || notifiedStatus != status)
] | order(createdAt desc) [0...$limit] {
  _id, _rev, status, notifiedStatus, displayName, nameSealed, emailSealed,
  service, preferredDate, confirmedFor, replyNote, createdAt,
  referrer, referredBy, referralDiscount
}`;

/**
 * Emails customers whose booking Kristina has confirmed or declined.
 *
 * Claimed before it is sent — see @/lib/claim. Confirming in the Studio fires
 * the Sanity webhook, and the "Email the customer now" button is usually
 * pressed a second later; without the claim that was two confirmations.
 */
export async function sendPendingBookingEmails(limit = 25): Promise<{ checked: number; sent: number }> {
  if (!process.env.RESEND_API_KEY || !process.env.SANITY_API_WRITE_TOKEN) {
    return { checked: 0, sent: 0 };
  }

  const bookings: NotifiableBooking[] = await sanityWriteClient.fetch(PENDING_QUERY, { limit });
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;

  for (const booking of bookings) {
    const status = booking.status as NotifiableStatus;
    if (!NOTIFIABLE.includes(status)) continue;

    // The address is sealed in the document; sending needs the real one
    const email = open(booking.emailSealed);
    if (!email) {
      console.error(`Booking ${booking._id} has no readable email — not notifying`);
      continue;
    }

    // The thank-you after a fitting is the one moment a customer is glad
    // enough to tell someone — so it carries their own Friends link
    let friends: { code: string; settings: ReferralSettings } | null = null;
    // Asking for a review is worth doing once, on the way out, and only of
    // someone who has actually been seen.
    const reviewLink = status === "completed" ? await googleReviewUrl() : null;
    if (status === "completed") {
      const code = await ownLinkFor(open(booking.nameSealed) ?? booking.displayName, email, "booking");
      if (code) friends = { code, settings: await referralSettings() };
    }

    const outcome = await claimThenSend(
      sanityWriteClient,
      booking,
      { notifiedStatus: status },
      booking.notifiedStatus ? { notifiedStatus: booking.notifiedStatus } : ["notifiedStatus"],
      () =>
        resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          replyTo: KRISTINA_EMAIL,
          subject:
            status === "confirmed"
              ? "Your Beautasy atelier appointment is confirmed 💜"
              : status === "completed"
              ? "Thank you from the Beautasy atelier 💜"
              : "About your Beautasy atelier booking",
          html: bookingEmailHtml(booking, status, friends, reviewLink),
        })
    );
    if (outcome === "sent") sent++;

    // Done, and told so: now the friend who sent them is credited. The
    // reward is keyed on the booking, so a second run finds it already paid.
    if (outcome === "sent" && status === "completed" && booking.referrer?._ref) {
      try {
        const result = await rewardReferral({
          kind: "booking",
          referrerId: booking.referrer._ref,
          friend: { name: open(booking.nameSealed) ?? booking.displayName, email },
          sourceId: booking._id,
          createdAt: booking.createdAt,
          discount: booking.referralDiscount ?? 0,
        });
        console.log("Referral reward for booking", booking._id, "→", result);
      } catch (err) {
        console.error(`Failed to reward the referral for booking ${booking._id}:`, err);
      }
    }
  }

  return { checked: bookings.length, sent };
}
