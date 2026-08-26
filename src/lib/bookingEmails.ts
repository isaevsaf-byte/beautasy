import { Resend } from "resend";
import { sanityClient, sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";

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

const NOTIFIABLE = ["confirmed", "declined"] as const;
type NotifiableStatus = (typeof NOTIFIABLE)[number];

export interface NotifiableBooking {
  _id: string;
  status: string;
  notifiedStatus?: string;
  name?: string;
  email?: string;
  service?: string;
  preferredDate?: string;
  confirmedFor?: string;
  replyNote?: string;
}

function bookingEmailHtml(booking: NotifiableBooking, status: NotifiableStatus): string {
  const firstName = escapeHtml(booking.name?.split(" ")[0] ?? "there");
  const service = escapeHtml(booking.service ?? "your appointment");
  const when = escapeHtml(booking.confirmedFor ?? booking.preferredDate ?? "");

  const heading = status === "confirmed" ? "You're booked in" : "About your booking";
  const body =
    status === "confirmed"
      ? `Your ${service} is confirmed${when ? ` for <strong>${when}</strong>` : ""}. We're at the atelier in Southampton — reply to this email if you need to move it.`
      : `We're so sorry — we can't take your ${service}${when ? ` on ${when}` : ""} after all.`;

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
      <p style="text-align:center;margin:26px 0 0;">
        <a href="${SITE_URL}/atelier" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${status === "confirmed" ? "About the atelier" : "Ask for another time"}</a>
      </p>
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
  && defined(email)
  && status in ["confirmed", "declined"]
  && (!defined(notifiedStatus) || notifiedStatus != status)
] | order(createdAt desc) [0...$limit] {
  _id, status, notifiedStatus, name, email, service, preferredDate, confirmedFor, replyNote
}`;

/** Emails customers whose booking Kristina has confirmed or declined. */
export async function sendPendingBookingEmails(limit = 25): Promise<{ checked: number; sent: number }> {
  if (!process.env.RESEND_API_KEY || !process.env.SANITY_API_WRITE_TOKEN) {
    return { checked: 0, sent: 0 };
  }

  const bookings: NotifiableBooking[] = await sanityClient.fetch(PENDING_QUERY, { limit });
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;

  for (const booking of bookings) {
    const status = booking.status as NotifiableStatus;
    if (!NOTIFIABLE.includes(status) || !booking.email) continue;

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: booking.email,
        replyTo: KRISTINA_EMAIL,
        subject:
          status === "confirmed"
            ? "Your Beautasy atelier appointment is confirmed 💜"
            : "About your Beautasy atelier booking",
        html: bookingEmailHtml(booking, status),
      });
      await sanityWriteClient.patch(booking._id).set({ notifiedStatus: status }).commit();
      sent++;
    } catch (err) {
      console.error(`Failed to send ${status} email for booking ${booking._id}:`, err);
    }
  }

  return { checked: bookings.length, sent };
}
