import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { escapeHtml } from "@/lib/escapeHtml";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { sanityWriteClient } from "@/lib/sanity";
import { sealOptional, maskEmail, firstNameOf, emailFingerprint } from "@/lib/pii";
import { secretsConfigured } from "@/lib/secrets";
import {
  findReferrerByCode,
  judgeFriendFor,
  referralSettings,
  referralsConfigured,
  type Referrer,
} from "@/lib/referrals";
import { verdictMessage } from "@/lib/referralRules";
import { pounds } from "@/lib/friendsLink";
import { getAvailableSlots } from "@/lib/schedule";
import { slotIsOffered, slotLabel, slotDocumentId } from "@/lib/slots";
import { bookingEmailHtml } from "@/lib/bookingEmails";

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
  /** "2026-09-10T14:30" — a time the customer picked for themselves */
  slot?: string;
  preferredDate?: string;
  notes?: string;
  /** A friend's link code, left on this device by /r/CODE */
  referralCode?: string;
}

const SLOT_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

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
    const slot = typeof body.slot === "string" && SLOT_SHAPE.test(body.slot) ? body.slot : undefined;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
    }
    if (!service || typeof service !== "string") {
      return NextResponse.json({ error: "Please select a service" }, { status: 400 });
    }

    // A friend's link: the discount is noted on the booking and taken off by
    // hand when they pay, and whoever sent them is credited once the fitting
    // is marked done. Judged now, so the customer hears straight away if it
    // does not apply — a returning customer is welcome, just not as a first visit.
    let friend: { referrer: Referrer; discount: number } | null = null;
    let referralNote: string | null = null;
    const referralCode =
      typeof body.referralCode === "string" && body.referralCode.trim() ? body.referralCode : undefined;
    if (referralCode && referralsConfigured()) {
      try {
        const settings = await referralSettings();
        const referrer = await findReferrerByCode(referralCode);
        if (!referrer) {
          referralNote = "That friend code isn't valid.";
        } else {
          const verdict = await judgeFriendFor({ referrer, friendEmail: email, kind: "booking", settings });
          if (verdict === "ok" && settings.friendAtelierDiscount > 0) {
            friend = { referrer, discount: settings.friendAtelierDiscount };
          } else {
            referralNote = verdictMessage(verdict === "ok" ? "disabled" : verdict, "booking");
          }
        }
      } catch (err) {
        // The booking matters more than the discount: carry on without it
        console.error("Could not judge a friend code on a booking:", err);
      }
    }
    const referredBy = friend ? friend.referrer.displayName ?? "a friend" : undefined;

    // A booked time is only real if it is written down, so a chosen slot may
    // not fall back to "we will email you" the way a request can.
    if (slot && (!process.env.SANITY_API_WRITE_TOKEN || !secretsConfigured())) {
      console.error("Cannot take a booked slot without a write token and DATA_SECRET");
      return NextResponse.json(
        { error: "Booking is temporarily unavailable — please WhatsApp or email us instead." },
        { status: 503 }
      );
    }

    // A slot has to be one the diary is actually offering right now. Read past
    // the CDN: a cached diary still showing a slot somebody took a minute ago
    // is exactly how two people end up at the door at the same time.
    if (slot) {
      const { days } = await getAvailableSlots({ fresh: true });
      if (!slotIsOffered(days, slot)) {
        return NextResponse.json(
          {
            error: "Sorry — that time has just been taken. Please pick another.",
            slotTaken: true,
          },
          { status: 409 }
        );
      }
    }

    // Save the request before anything else. An email Kristina has to remember
    // to answer is how a fitting quietly goes unbooked — and if the mail
    // service is down or misconfigured, the request must still survive.
    let saved = false;
    if (process.env.SANITY_API_WRITE_TOKEN && secretsConfigured()) {
      try {
        await sanityWriteClient.create({
          // A slot's id is the slot itself, so the second person to reach for
          // the same time is refused by the database rather than by a check
          // that another request could have slipped past.
          ...(slot ? { _id: slotDocumentId(slot) } : {}),
          _type: "atelierBooking",
          // Readable: enough to recognise the row in the Studio
          displayName: firstNameOf(name),
          emailHint: maskEmail(email),
          // Sealed: the details themselves. See @/lib/pii.
          nameSealed: sealOptional(name),
          emailSealed: sealOptional(email),
          phoneSealed: sealOptional(phone),
          notesSealed: sealOptional(notes),
          // Keyed and one-way: what "first visit?" is asked of next time
          emailFingerprint: emailFingerprint(email),
          service,
          ...(friend
            ? {
                referrer: { _type: "reference", _ref: friend.referrer._id, _weak: true },
                referredBy,
                referralDiscount: friend.discount,
              }
            : {}),
          // One shape either way; Sanity drops the fields left undefined
          slotStart: slot,
          confirmedFor: slot ? slotLabel(slot) : undefined,
          preferredDate: slot ? undefined : preferredDate || undefined,
          status: slot ? "confirmed" : "new",
          // A picked time is confirmed and the customer told in the same
          // breath, so the nightly job sends no second confirmation.
          notifiedStatus: slot ? "confirmed" : undefined,
          createdAt: new Date().toISOString(),
        });
        saved = true;
      } catch (err) {
        if (slot) {
          // The id was taken between the check above and this write
          console.error("Slot was claimed by someone else:", slot, err);
          return NextResponse.json(
            {
              error: "Sorry — that time has just been taken. Please pick another.",
              slotTaken: true,
            },
            { status: 409 }
          );
        }
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
      subject: `${friend ? `${pounds(friend.discount)} REF · ` : ""}${
        slot
          ? `Booked — ${name.trim()}, ${slotLabel(slot)}`
          : `New atelier booking request — ${name.trim()}`
      }`,
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;">
          <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9b7fd4;">Atelier Booking</p>
          <h1 style="font-size:22px;font-weight:400;">${escapeHtml(name)}</h1>
          <p style="color:#3d3d3d;line-height:1.8;">
            <strong>Service:</strong> ${escapeHtml(service)}<br/>
            ${slot ? `<strong>Booked for:</strong> ${escapeHtml(slotLabel(slot))}<br/>` : ""}
            ${!slot && preferredDate ? `<strong>Preferred date:</strong> ${escapeHtml(preferredDate)}<br/>` : ""}
            <strong>Email:</strong> ${escapeHtml(email)}<br/>
            ${phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}<br/>` : ""}
          </p>
          ${
            friend
              ? `<p style="padding:12px 16px;background:#f7f3ff;border-radius:10px;color:#5e4b9a;line-height:1.6;">💜 Sent by <strong>${escapeHtml(referredBy)}</strong> — take <strong>${pounds(friend.discount)} off</strong> when they pay. Marking the booking Done credits ${escapeHtml(referredBy)} automatically.</p>`
              : ""
          }
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
      subject: slot
        ? "Your Beautasy atelier appointment is confirmed 💜"
        : "We've received your Beautasy atelier booking request 💜",
      // A picked time is already an appointment, so it gets the confirmation
      // email itself rather than a promise that one is coming.
      html: slot
        ? bookingEmailHtml(
            {
              _id: "pending",
              _rev: "pending",
              status: "confirmed",
              displayName: firstNameOf(name),
              service,
              confirmedFor: slotLabel(slot),
              referredBy,
              referralDiscount: friend?.discount,
            },
            "confirmed"
          )
        : `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;">
          <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9b7fd4;">Beautasy Atelier</p>
          <h1 style="font-size:22px;font-weight:400;">Thanks, ${escapeHtml(name.split(" ")[0])}!</h1>
          <p style="color:#3d3d3d;line-height:1.8;">
            We've received your request for <strong>${escapeHtml(service)}</strong>${preferredDate ? ` on ${escapeHtml(preferredDate)}` : ""}.
            Kristina will confirm your time by email shortly — you'll get a message either way, so nothing is left hanging.
          </p>
          ${
            friend
              ? `<p style="color:#3d3d3d;line-height:1.8;">Your <strong>${pounds(friend.discount)} off</strong> from ${escapeHtml(referredBy)} is noted — it comes off when you pay at the atelier.</p>`
              : ""
          }
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

    return NextResponse.json(
      {
        ok: true,
        emailed,
        ...(slot ? { confirmedFor: slotLabel(slot) } : {}),
        ...(friend
          ? { referral: { applied: true, discount: friend.discount, referredBy } }
          : referralCode
          ? { referral: { applied: false, reason: referralNote } }
          : {}),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error handling atelier booking:", error);
    return NextResponse.json(
      { error: "Failed to send booking request. Please try WhatsApp instead." },
      { status: 500 }
    );
  }
}
