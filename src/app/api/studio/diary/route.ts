import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { isProjectMember } from "@/lib/studioMember";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { secretsConfigured } from "@/lib/secrets";
import { emailFingerprint, firstNameOf, maskEmail, open, sealOptional } from "@/lib/pii";
import { getAvailableSlots } from "@/lib/schedule";
import { slotDocumentId, slotIsOffered, slotLabel } from "@/lib/slots";
import {
  canMove,
  claimSlot,
  moveBooking,
  movedCopy,
  releasesItsTime,
  sanityDiaryStore,
  type DiaryDoc,
} from "@/lib/diary";
import {
  bookingEmailHtml,
  bookingEmailSubject,
  bookingInvite,
  sendConfirmation,
  type NotifiableBooking,
} from "@/lib/bookingEmails";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/diary — Kristina's hand on the diary, from the Studio.
 *
 *   { token, action: "slots" }                         → the free times
 *   { token, action: "book", slot, name, ... }         → a booking agreed elsewhere
 *   { token, action: "move", id, slot }                → a booking given a (new) time
 *
 * Why it exists: the diary only knew about bookings made on the site. A time
 * agreed on WhatsApp or Nextdoor stayed on offer online, and moving a booking
 * meant typing words into "Confirmed For", which held nothing. Both went
 * straight to two people at the door. Both now go through the same claim as a
 * booking on the site — see @/lib/diary.
 *
 * The notice customers must give does not apply here: Kristina books times
 * she has just agreed with the person. Contact details are sealed on the way
 * in, which is why this is a server route and not a Studio write — the Studio
 * has no key (see @/lib/pii).
 *
 * Guarded the way /api/studio/reveal is: the Studio's own session token,
 * spent on asking Sanity whether the caller is a member of the project.
 */

const SLOT_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

function answer(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** A trimmed string, cut to length, or nothing. */
function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * Tell the customer about their booked or moved time, with the calendar
 * invite. The booking was created marked as told — a claim, as on the site —
 * so a refused email hands the claim back and the morning job tries again.
 * A booking made by hand without an email has nobody to tell.
 */
async function tellCustomer(doc: DiaryDoc, slotMinutes: number): Promise<boolean> {
  const email = open(typeof doc.emailSealed === "string" ? doc.emailSealed : undefined);
  if (!email) return false;

  const booking: NotifiableBooking = {
    _id: doc._id,
    _rev: "",
    status: "confirmed",
    displayName: typeof doc.displayName === "string" ? doc.displayName : undefined,
    service: typeof doc.service === "string" ? doc.service : undefined,
    confirmedFor: doc.confirmedFor,
    slotStart: doc.slotStart,
    slotMinutes,
    movedFrom: typeof doc.movedFrom === "string" ? doc.movedFrom : undefined,
    referredBy: typeof doc.referredBy === "string" ? doc.referredBy : undefined,
    referralDiscount: typeof doc.referralDiscount === "number" ? doc.referralDiscount : undefined,
  };

  try {
    await sendConfirmation(
      {
        from: FROM_EMAIL,
        to: email,
        replyTo: KRISTINA_EMAIL,
        subject: bookingEmailSubject(booking, "confirmed"),
        html: bookingEmailHtml(booking, "confirmed"),
      },
      bookingInvite(booking)
    );
    return true;
  } catch (error) {
    console.error(`Could not email the customer about ${doc._id}:`, error);
    try {
      await sanityWriteClient.patch(doc._id).unset(["notifiedStatus"]).commit();
    } catch (release) {
      console.error(`Could not hand back the claim on ${doc._id}; the morning job will not retry it:`, release);
    }
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) return answer(403, "Only the Studio can call this");

  const limited = rateLimit(`studio-diary:${clientIp(req)}`, 120, 60 * 60 * 1000);
  if (!limited.ok) return answer(429, "Too many requests — try again in a few minutes.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return answer(400, "The request could not be read.");
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!(await isProjectMember(token))) {
    return answer(401, "Your Studio session could not be checked. Sign out and back in to the Studio, then try again.");
  }
  if (!process.env.SANITY_API_WRITE_TOKEN || !secretsConfigured()) {
    return answer(503, "The diary cannot be written to right now — the site is missing its keys.");
  }

  let days: Awaited<ReturnType<typeof getAvailableSlots>>["days"];
  let schedule: Awaited<ReturnType<typeof getAvailableSlots>>["schedule"];
  try {
    ({ days, schedule } = await getAvailableSlots({ fresh: true, strict: true, leadTimeHours: 0 }));
  } catch (error) {
    console.error("The Studio could not read the diary:", error);
    return answer(503, "Could not read the diary. Try again in a minute.");
  }

  if (body.action === "slots") {
    return NextResponse.json({ enabled: schedule.enabled, days });
  }

  const slot = typeof body.slot === "string" && SLOT_SHAPE.test(body.slot) ? body.slot : null;
  if (!slot) return answer(400, "Choose a time first.");
  if (!slotIsOffered(days, slot)) {
    return answer(409, "That time is not free any more — choose another.", { slotTaken: true });
  }

  const now = new Date().toISOString();
  const store = sanityDiaryStore(sanityWriteClient);

  if (body.action === "book") {
    const name = text(body.name, 80);
    if (!name || name.length < 2) return answer(400, "Add their name.");
    const email = text(body.email, 200);
    if (email && !EMAIL_RE.test(email)) {
      return answer(400, "That email does not look right. Leave it empty if you do not have one.");
    }
    const phone = text(body.phone, 40);
    const notes = text(body.notes, 2000);
    const service = text(body.service, 60) ?? "Alterations";

    const doc: DiaryDoc = {
      _id: slotDocumentId(slot),
      _type: "atelierBooking",
      displayName: firstNameOf(name),
      nameSealed: sealOptional(name),
      phoneSealed: sealOptional(phone),
      notesSealed: sealOptional(notes),
      ...(email
        ? { emailHint: maskEmail(email), emailSealed: sealOptional(email), emailFingerprint: emailFingerprint(email) }
        : {}),
      service,
      slotStart: slot,
      confirmedFor: slotLabel(slot),
      status: "confirmed",
      // Marked as told at birth — a claim, handed back if the email is refused
      notifiedStatus: "confirmed",
      bookedBy: "studio",
      createdAt: now,
      // She is the one booking it, so the morning check has nobody to chase
      kristinaNotifiedAt: now,
    };

    const claim = await claimSlot(store, doc, now);
    if (claim === "taken") {
      return answer(409, "Somebody has just booked that time — choose another.", { slotTaken: true });
    }
    if (claim === "failed") return answer(500, "Could not save it, so nothing was booked. Try again in a minute.");
    if (claim === "unsure") {
      return answer(
        500,
        "The diary stopped answering while saving. Look in Atelier Bookings before trying again: if the booking is there, it saved — tell them the time yourself."
      );
    }

    const emailed = email ? await tellCustomer(doc, schedule.slotMinutes) : false;
    return NextResponse.json({ ok: true, id: doc._id, label: slotLabel(slot), emailed });
  }

  if (body.action === "move") {
    const id = typeof body.id === "string" ? body.id.replace(/^drafts\./, "") : "";
    if (!id) return answer(400, "Which booking?");

    let from: DiaryDoc | null;
    try {
      from = await store.read(id);
    } catch (error) {
      console.error(`Could not read booking ${id} to move it:`, error);
      return answer(503, "Could not read the booking. Try again in a minute.");
    }
    if (!from || from._type !== "atelierBooking") return answer(404, "That booking is not there any more.");
    if (!canMove(from.status)) return answer(400, "A booking marked Done keeps its time.");
    // The booking that holds this very time: moving it onto itself would hand
    // its own time back. One that gave it back only needs its status again.
    if (from._id === slotDocumentId(slot)) {
      return answer(
        400,
        releasesItsTime(from.status)
          ? "They can have this time back as it is: set the status to Confirmed instead."
          : "It is already at that time."
      );
    }

    const to = movedCopy(from, slot, now);
    const moved = await moveBooking(store, { from, to, now });
    if (moved === "taken") {
      return answer(409, "Somebody has just booked that time — choose another.", { slotTaken: true });
    }
    if (moved === "changed") {
      return answer(409, "The booking was changed while you were moving it. Open it again and try once more.");
    }
    if (moved === "failed") return answer(500, "Could not move it, so nothing changed. Try again in a minute.");
    if (moved === "unsure") {
      return answer(
        500,
        "The diary stopped answering halfway. Look in Atelier Bookings: the booking may be at the old time, the new one, or both. Keep the one you want, delete any other, and tell them the time yourself."
      );
    }

    const emailed = await tellCustomer(to, schedule.slotMinutes);
    return NextResponse.json({
      ok: true,
      id: to._id,
      label: slotLabel(slot),
      emailed,
      hadEmail: typeof from.emailSealed === "string",
    });
  }

  return answer(400, "Unknown action.");
}
