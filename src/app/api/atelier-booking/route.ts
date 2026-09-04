import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/escapeHtml";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { sanityWriteClient } from "@/lib/sanity";
import { sealOptional, maskEmail, firstNameOf } from "@/lib/pii";
import { secretsConfigured } from "@/lib/secrets";

export const dynamic = "force-dynamic";

const KRISTINA_EMAIL = "hello@beautasy.co.uk";
const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  return new Resend(process.env.RESEND_API_KEY);
}

interface BookingBody {
  name: string;
  email: string;
  phone?: string;
  service: string;
  preferredDate?: string;
  notes?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Two emails go out per booking, one of them to an address the caller types in
  const limited = rateLimit(`atelier:${clientIp(req)}`, 5, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many booking requests. Please try again later, or WhatsApp us." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    const body: BookingBody = await req.json();
    const { name, email, phone, service, preferredDate, notes } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
    }
    if (!service || typeof service !== "string") {
      return NextResponse.json({ error: "Please select a service" }, { status: 400 });
    }

    // Save the request before anything else. An email Kristina has to remember
    // to answer is how a fitting quietly goes unbooked — and if the mail
    // service is down or misconfigured, the request must still survive.
    let saved = false;
    if (process.env.SANITY_API_WRITE_TOKEN && secretsConfigured()) {
      try {
        await sanityWriteClient.create({
          _type: "atelierBooking",
          // Readable: enough to recognise the row in the Studio
          displayName: firstNameOf(name),
          emailHint: maskEmail(email),
          // Sealed: the details themselves. See @/lib/pii.
          nameSealed: sealOptional(name),
          emailSealed: sealOptional(email),
          phoneSealed: sealOptional(phone),
          notesSealed: sealOptional(notes),
          service,
          preferredDate: preferredDate || undefined,
          status: "new",
          createdAt: new Date().toISOString(),
        });
        saved = true;
      } catch (err) {
        console.error("Failed to save atelier booking:", err);
      }
    } else if (!secretsConfigured()) {
      console.error("DATA_SECRET is not set — a booking cannot be stored without sealing the contact details");
    }

    // The request is already safe in the Studio, so a mail outage is not the
    // customer's problem. Each email is best-effort on its own: a failed
    // notification must not turn into an error the customer answers by
    // submitting again, which is how one fitting became three bookings.
    let emailed = false;
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set — booking saved without email");
    } else {
      const resend = getResend();

      try {
        await resend.emails.send({
      from: FROM_EMAIL,
      to: KRISTINA_EMAIL,
      replyTo: email,
      // A subject line is plain text, not HTML — escaping it shows "&#39;" in the inbox
      subject: `New atelier booking request — ${name.trim()}`,
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;">
          <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9b7fd4;">Atelier Booking</p>
          <h1 style="font-size:22px;font-weight:400;">${escapeHtml(name)}</h1>
          <p style="color:#3d3d3d;line-height:1.8;">
            <strong>Service:</strong> ${escapeHtml(service)}<br/>
            ${preferredDate ? `<strong>Preferred date:</strong> ${escapeHtml(preferredDate)}<br/>` : ""}
            <strong>Email:</strong> ${escapeHtml(email)}<br/>
            ${phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}<br/>` : ""}
          </p>
          ${notes ? `<p style="color:#3d3d3d;line-height:1.7;"><strong>Notes:</strong><br/>${escapeHtml(notes)}</p>` : ""}
        </div>`,
        });
        emailed = true;
      } catch (err) {
        console.error("Failed to email Kristina about a booking:", err);
      }

      try {
        await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: KRISTINA_EMAIL,
      subject: "We've received your Beautasy atelier booking request 💜",
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;">
          <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9b7fd4;">Beautasy Atelier</p>
          <h1 style="font-size:22px;font-weight:400;">Thanks, ${escapeHtml(name.split(" ")[0])}!</h1>
          <p style="color:#3d3d3d;line-height:1.8;">
            We've received your request for <strong>${escapeHtml(service)}</strong>${preferredDate ? ` on ${escapeHtml(preferredDate)}` : ""}.
            Kristina will confirm your time by email shortly — you'll get a message either way, so nothing is left hanging.
          </p>
        </div>`,
        });
      } catch (err) {
        console.error("Failed to send booking acknowledgement:", err);
      }
    }

    // Lost only if neither the Studio nor Kristina's inbox has it
    if (!saved && !emailed) {
      return NextResponse.json(
        { error: "Booking is temporarily unavailable — please WhatsApp or email us instead." },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, emailed }, { status: 201 });
  } catch (error) {
    console.error("Error handling atelier booking:", error);
    return NextResponse.json(
      { error: "Failed to send booking request. Please try WhatsApp instead." },
      { status: 500 }
    );
  }
}
