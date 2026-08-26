import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/escapeHtml";
import { rateLimit, clientIp } from "@/lib/rateLimit";

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

    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return NextResponse.json(
        { error: "Booking is temporarily unavailable — please WhatsApp or email us instead." },
        { status: 503 }
      );
    }

    const resend = getResend();

    await resend.emails.send({
      from: FROM_EMAIL,
      to: KRISTINA_EMAIL,
      replyTo: email,
      subject: `New atelier booking request — ${escapeHtml(name)}`,
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
            We'll confirm your appointment by email or WhatsApp shortly.
          </p>
        </div>`,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Error sending atelier booking:", error);
    return NextResponse.json(
      { error: "Failed to send booking request. Please try WhatsApp instead." },
      { status: 500 }
    );
  }
}
