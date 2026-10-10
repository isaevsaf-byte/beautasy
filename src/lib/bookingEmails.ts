import { sanityWriteClient } from "@/lib/sanity";
import { escapeHtml } from "@/lib/escapeHtml";
import { SITE_URL } from "@/lib/site";
import { claimThenSend, type ClaimClient, type ClaimOutcome } from "@/lib/claim";
import { open } from "@/lib/pii";
import { sendEmail } from "@/lib/sendEmail";
import { friendsBlockHtml, ownLinkFor, referralSettings, rewardReferral } from "@/lib/referrals";
import type { ReferralSettings } from "@/lib/referralRules";
import { pounds } from "@/lib/friendsLink";
import { googleReviewUrl } from "@/lib/siteSettings";
import { BUSINESS, whatsappLink } from "@/lib/business";
import { DEFAULT_SCHEDULE, durationLabel, instantOf, slotLabel, spanLabel, spanMinutes, timeLabel } from "@/lib/slots";
import { calendarUid, eveningBefore, fittingEvent, googleCalendarLink, icsInvite, type CalendarEvent } from "@/lib/bookingCalendar";
import { whatToBring } from "@/lib/whatToBring";
import type { EmailMessage } from "@/lib/sendEmail";
import { pieceInSentence, serviceInSentence } from "@/lib/atelierServices";

type EmailAttachment = NonNullable<EmailMessage["attachments"]>[number];

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
// "cancelled" is the customer's own cancellation: it frees the time and says
// so kindly, where "declined" says Kristina cannot take it.
const NOTIFIABLE = ["confirmed", "declined", "cancelled", "completed"] as const;
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
  /** "2026-10-06T10:00" — there when the customer picked the time themselves */
  slotStart?: string;
  /** The diary's slot length, when the sender knows it. Not stored on the booking. */
  slotMinutes?: number;
  /** The time it was moved from, when Kristina moved it — see moveBooking in @/lib/diary */
  movedFrom?: string;
  replyNote?: string;
  createdAt?: string;
  /** Where a booking holding more than one slot ends: a collection's trip, or a bride's two slots */
  slotEnd?: string;
  /** Collect & return rather than a visit — see @/lib/collection */
  collection?: { district?: string; zone?: string; terms?: string };
  /** A friend sent them: who, and what to take off when they pay */
  referrer?: { _ref: string };
  referredBy?: string;
  referralDiscount?: number;
}

const SLOT_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * The fitting as a calendar event, when there is an exact time to put in one.
 *
 * Only a time the customer picked from the diary has one. A request Kristina
 * confirms by hand carries whatever she typed in "Confirmed For", which is for
 * reading, not for a calendar.
 */
export function fittingOf(booking: NotifiableBooking): CalendarEvent | null {
  // Collect & return happens at the customer's door: an invite would send
  // them to the atelier for a visit nobody arranged
  if (booking.collection) return null;
  if (!booking.slotStart || !SLOT_SHAPE.test(booking.slotStart)) return null;
  // A booked slot Kristina has since moved by hand — declined with another
  // time offered, then confirmed for it — keeps its old slotStart, which the
  // Studio will not let her edit. The email prints her words; an invite for
  // the old slot would put the customer in the wrong place in their calendar.
  if (booking.confirmedFor && booking.confirmedFor !== slotLabel(booking.slotStart)) return null;
  // What to bring, for the job booked: in the title, which is what the
  // reminders show, and first in the notes
  const bring = whatToBring(booking.service);
  return fittingEvent({
    slotStart: booking.slotStart,
    // A bride's fitting holds two slots, and her calendar holds both
    minutes: spanMinutes(booking.slotStart, booking.slotEnd) ?? booking.slotMinutes ?? DEFAULT_SCHEDULE.slotMinutes,
    bring: bring.title,
    uid: calendarUid(booking.createdAt, booking.slotStart),
    location: `${BUSINESS.atelierName}, ${BUSINESS.address.locality}`,
    description:
      `Bring: ${bring.sentence} ` +
      `Your ${serviceInSentence(booking.service)} with Kristina at ${BUSINESS.atelierName}. ` +
      `She will send you the exact address before your visit. ` +
      `To move it, reply to the confirmation email or WhatsApp ${BUSINESS.telephone}.`,
  });
}

/**
 * A collection as a calendar event: the window Kristina comes to their door,
 * so they are in. Only a time she gave it from the diary has one — a
 * collection confirmed by typing is for reading, like a fitting's. No location:
 * it is their own door, and the atelier's would send them somewhere.
 */
export function collectionEventOf(booking: NotifiableBooking): CalendarEvent | null {
  if (!booking.collection) return null;
  if (!booking.slotStart || !SLOT_SHAPE.test(booking.slotStart)) return null;
  if (!booking.slotEnd || !SLOT_SHAPE.test(booking.slotEnd)) return null;
  const span = spanLabel(booking.slotStart, booking.slotEnd);
  if (booking.confirmedFor && booking.confirmedFor !== span) return null;
  const start = instantOf(booking.slotStart);
  const end = instantOf(booking.slotEnd);
  if (!(end.getTime() > start.getTime())) return null;
  const piece = pieceInSentence(booking.service);
  return {
    uid: calendarUid(booking.createdAt, booking.slotStart),
    start,
    end,
    // The evening before, as for a fitting: time to have it ready by the door
    eveningBefore: eveningBefore(booking.slotStart),
    title: "Beautasy: Kristina collects your piece",
    description:
      `Kristina from ${BUSINESS.atelierName} collects your ${piece} from your door, ${span}. ` +
      `Have it ready, pinned where you'd like it changed, or with one that fits you well as a guide. ` +
      `To move it, reply to the confirmation email or WhatsApp ${BUSINESS.telephone}.`,
    location: "",
  };
}

/**
 * A booking as the diary's Studio actions hold it, ready for its email: the
 * collection (so it is never written up as a visit), its window, and the note
 * Kristina left for the customer, which was dropped on the way before.
 */
export function notifiableFromDiary(
  doc: { _id: string; [field: string]: unknown },
  slotMinutes: number
): NotifiableBooking {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    _id: doc._id,
    // The calendar event's lasting name — the same through every move (see calendarUid)
    createdAt: text(doc.createdAt),
    _rev: "",
    status: "confirmed",
    displayName: text(doc.displayName),
    service: text(doc.service),
    confirmedFor: text(doc.confirmedFor),
    slotStart: text(doc.slotStart),
    slotEnd: text(doc.slotEnd),
    slotMinutes,
    movedFrom: text(doc.movedFrom),
    replyNote: text(doc.replyNote),
    referredBy: text(doc.referredBy),
    referralDiscount: typeof doc.referralDiscount === "number" ? doc.referralDiscount : undefined,
    collection:
      doc.collection && typeof doc.collection === "object" ? (doc.collection as NotifiableBooking["collection"]) : undefined,
  };
}

/**
 * How long a fitting takes, in the customer's words, when it holds more than
 * one slot — "about an hour" for a bride. A fitting of one slot says nothing,
 * as it always has: a ten-minute look and a pinning are both "a fitting".
 */
export function fittingLength(booking: Pick<NotifiableBooking, "slotStart" | "slotEnd" | "collection">): string | null {
  if (booking.collection || !booking.slotStart) return null;
  const minutes = spanMinutes(booking.slotStart, booking.slotEnd);
  return minutes ? durationLabel(minutes) : null;
}

/** The same event as an .ics file on the confirmation, for Apple Calendar and Outlook. */
export function bookingInvite(booking: NotifiableBooking, now: Date = new Date()): EmailAttachment | null {
  const fitting = fittingOf(booking) ?? collectionEventOf(booking);
  if (!fitting) return null;
  return {
    filename: booking.collection ? "beautasy-collection.ics" : "beautasy-fitting.ics",
    content: Buffer.from(icsInvite(fitting, now), "utf8").toString("base64"),
    // Plain: METHOD:PUBLISH is inside the file, where calendars read it
    contentType: "text/calendar",
  };
}

/**
 * Sends a confirmation with its calendar invite — and again without it, if
 * the mail service will not take the email with the file attached.
 *
 * The invite is the first file this shop has ever attached to an email, and
 * a refusal of the attachment must not become a refusal of the confirmation:
 * that would fail every customer who booked a time, and the nightly retry
 * would send the same refused message again every night. The price is a
 * second copy when the first went through and only its answer was lost,
 * which is the trade made everywhere else here (see @/lib/sendEmail).
 */
export async function sendConfirmation(
  message: EmailMessage,
  invite: EmailAttachment | null,
  send: (message: EmailMessage) => Promise<void> = (m) => sendEmail(m)
): Promise<void> {
  if (!invite) return send(message);
  try {
    await send({ ...message, attachments: [invite] });
  } catch (err) {
    console.error("A confirmation was refused with its calendar invite; sending it without:", err);
    await send(message);
  }
}

/**
 * The international number wa.me wants, from a phone number as a customer
 * typed it: "07700 900123", "+44 (0)7700 900123" and "0044 7700 900123" are all
 * 447700900123. A number with no country and no leading zero could be from
 * anywhere, so it gets no link rather than a wrong one.
 */
export function whatsappNumberOf(phone: string | undefined): string | null {
  if (!phone) return null;
  // "(0)" is the national zero written after a country code: +44 (0)7700…
  const typed = phone.trim().replace(/\(0\)/g, "");
  let digits = typed.replace(/\D/g, "");
  if (typed.startsWith("+") || digits.startsWith("44")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `44${digits.slice(1)}`;
  } else {
    return null;
  }
  // "+44 07700…" keeps the national zero after the country code
  if (digits.startsWith("440")) digits = `44${digits.slice(3)}`;
  // A UK mobile is 44 and ten digits. Any other length is a number typed
  // wrongly — an Irish 087…, a trailing extension — and a link that opens a
  // chat with a stranger is worse than no link.
  if (digits.startsWith("44")) return digits.length === 12 ? digits : null;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

const LABEL_STYLE =
  "margin:0 0 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;";
const LINE_STYLE = "margin:0;color:#3d3d3d;line-height:1.6;";

/**
 * What a confirmed customer needs to actually arrive: where, what to bring,
 * and how to move it. The confirmation used to say the time and "we're at the
 * atelier in Southampton", and the atelier's address is not published — so a
 * customer who booked themselves online had a time and no idea where to go.
 *
 * The street address is deliberately not in here either. It is a home
 * atelier, and anything this email says goes to whoever fills in the form, so
 * Kristina sends it herself; her own email about the booking reminds her to.
 */
function arrivalHtml(service: string | undefined): string {
  return `
      <div style="background:#f7f3ff;border-radius:12px;padding:20px 24px;margin:22px 0 0;">
        <p style="${LABEL_STYLE}">Where</p>
        <p style="${LINE_STYLE}margin-bottom:16px;">${BUSINESS.atelierName}, ${BUSINESS.address.locality}. Kristina will send you the exact address and how to find the door before your visit.</p>
        <p style="${LABEL_STYLE}">Bring</p>
        <p style="${LINE_STYLE}margin-bottom:16px;">${escapeHtml(whatToBring(service).sentence)}</p>
        <p style="${LABEL_STYLE}">Need to move it?</p>
        <p style="${LINE_STYLE}">Reply to this email, or WhatsApp Kristina on ${BUSINESS.telephone}.</p>
      </div>`;
}

/**
 * What a customer whose things are being collected needs instead: nobody is
 * coming to the atelier, so "where" is their own door, and "bring your shoes"
 * would be nonsense. A confirmation that sent them looking for an address
 * they were never going to need is the mistake this replaces.
 */
function collectionArrivalHtml(collection: NonNullable<NotifiableBooking["collection"]>): string {
  return `
      <div style="background:#f7f3ff;border-radius:12px;padding:20px 24px;margin:22px 0 0;">
        <p style="${LABEL_STYLE}">Where</p>
        <p style="${LINE_STYLE}margin-bottom:16px;">From your door. If Kristina doesn't have your address yet, she'll ask for it before the collection.</p>
        <p style="${LABEL_STYLE}">Have ready</p>
        <p style="${LINE_STYLE}margin-bottom:16px;">The piece, pinned where you'd like it changed, or one that fits you well as a guide.</p>${
          collection.terms
            ? `
        <p style="${LABEL_STYLE}">Collection &amp; return</p>
        <p style="${LINE_STYLE}margin-bottom:16px;">${escapeHtml(collection.terms)}. The work itself is priced before Kristina starts.</p>`
            : ""
        }
        <p style="${LABEL_STYLE}">Need to move it?</p>
        <p style="${LINE_STYLE}">Reply to this email, or WhatsApp Kristina on ${BUSINESS.telephone}.</p>
      </div>`;
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
  // Collect & return: nobody visits, so the calendar holds the window Kristina
  // comes to their door, when she gave it one from the diary
  const collection = booking.collection ?? null;
  // Read mid-sentence ("your appointment for alterations"), so lower case: it
  // is a label from the form, and "Anna, Your Alterations is confirmed" was
  // what the first line of every confirmation said. A collection is of a
  // piece, a visit is for a look (see serviceInSentence).
  const service = escapeHtml(collection ? pieceInSentence(booking.service) : serviceInSentence(booking.service));
  const when = escapeHtml(booking.confirmedFor ?? booking.preferredDate ?? "");

  const reviewUrl = reviewLink || undefined;
  const visit = collection ? "collection" : "appointment";
  const fitting = status === "confirmed" ? (collection ? collectionEventOf(booking) : fittingOf(booking)) : null;
  const whatsappKristina = whatsappLink(
    `Hi Kristina, it's ${booking.displayName ?? ""}, about my ${visit}${
      booking.confirmedFor ? ` on ${booking.confirmedFor}` : ""
    }: `
  );

  const moved = status === "confirmed" && booking.movedFrom ? escapeHtml(booking.movedFrom) : null;
  // A booking with an exact time went into her calendar with alarms, one of
  // them the evening before; called off, it is taken out by hand — a file
  // that cancels is read differently by every calendar, and could put back an
  // event she has already deleted
  const inCalendar = Boolean(booking.slotStart && SLOT_SHAPE.test(booking.slotStart));
  const outOfCalendar = inCalendar ? " If it's in your calendar, delete it there too, so its reminders don't go off." : "";
  // " It takes about an hour." — said only of a fitting that holds more than one slot
  const length = status === "confirmed" ? fittingLength(booking) : null;
  const takes = length ? ` It takes ${length}.` : "";

  const heading =
    status === "confirmed"
      ? collection
        ? moved
          ? "Your collection has moved"
          : "Your collection is arranged"
        : moved
        ? "Your fitting has moved"
        : "You're booked in"
      : status === "completed"
      ? "Thank you"
      : status === "cancelled"
      ? `Your ${visit} is cancelled`
      : "About your booking";
  const body =
    status === "confirmed"
      ? collection
        ? moved
          ? `we'll now collect your ${service} on <strong>${when}</strong> (it was ${moved}). If the old time is in your calendar, you can delete it.`
          : `we'll collect your ${service}${when ? ` on <strong>${when}</strong>` : ""} and bring it back when it's done.`
        : moved
        ? `your appointment for ${service} has moved to <strong>${when}</strong> (it was ${moved}).${takes} If the old time is in your calendar, you can delete it.`
        : `your appointment for ${service} is confirmed${when ? ` for <strong>${when}</strong>` : ""}.${takes}`
      : status === "completed"
      ? `thank you for trusting us with your ${service}. If it fits the way you hoped, a sentence about it${reviewUrl ? " on Google" : ""} helps the next person in Southampton find a small atelier — and means a great deal to the one pair of hands that did the work.`
      : status === "cancelled"
      ? collection
        ? `your collection${when ? ` on <strong>${when}</strong>` : ""} is cancelled, as you asked.${outOfCalendar} Whenever you're ready, ask for a new collection and Kristina will email you a time.`
        : `your ${visit}${when ? ` on <strong>${when}</strong>` : ""} is cancelled, as you asked.${outOfCalendar} Whenever you're ready, choosing a new time takes a minute.`
      : `we're so sorry — we can't take your ${service}${when ? ` on ${when}` : ""} after all.${outOfCalendar}`;
  const button =
    status === "completed"
      ? reviewUrl
        ? { href: reviewUrl, label: "Leave a Google review" }
        : { href: `${SITE_URL}/alterations`, label: "Bring the next thing" }
      : status === "confirmed"
      ? fitting
        ? { href: googleCalendarLink(fitting), label: "Add to Google Calendar" }
        : { href: whatsappKristina, label: "WhatsApp Kristina" }
      : status === "cancelled"
      ? { href: `${SITE_URL}/atelier#book`, label: collection ? "Ask for a collection" : "Book another time" }
      : { href: `${SITE_URL}/atelier#book`, label: "Ask for another time" };

  // Under the button on a confirmation: the invite for everyone not on Google,
  // and the two ways to reach Kristina without hunting for them
  const afterButton =
    status === "confirmed"
      ? `
      ${
        fitting
          ? `<p style="text-align:center;margin:10px 0 0;font-size:12px;color:#8a8494;">On an iPhone or using Outlook? Open the invite attached to this email.</p>`
          : ""
      }
      <p style="text-align:center;margin:18px 0 0;font-size:13px;">
        ${
          fitting
            ? `<a href="${escapeHtml(whatsappKristina)}" style="color:#6c5a96;">WhatsApp Kristina</a>&nbsp;&nbsp;·&nbsp;&nbsp;`
            : ""
        }<a href="${BUSINESS.telephoneHref}" style="color:#6c5a96;">Call ${BUSINESS.telephone}</a>
      </p>`
      : "";

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
          ? `<p style="color:#3d3d3d;line-height:1.7;margin:0;">Your <strong>${pounds(booking.referralDiscount)} off</strong>${booking.referredBy ? ` from ${escapeHtml(booking.referredBy)}` : ""} is noted — it comes off when you pay${collection ? "" : " at the atelier"}.</p>`
          : ""
      }
      ${status === "confirmed" ? (collection ? collectionArrivalHtml(collection) : arrivalHtml(booking.service)) : ""}
      <p style="text-align:center;margin:26px 0 0;">
        <a href="${escapeHtml(button.href)}" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${button.label}</a>
      </p>
      ${afterButton}
      ${status === "completed" && friends ? friendsBlockHtml(friends.code, friends.settings) : ""}
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Made with 💜 in Southampton</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * The day-before reminder of a fitting: the time, the job, and the same
 * three things the confirmation said under it — where (Southampton; the
 * address comes from Kristina, as the confirmation promised), what to bring
 * for this job, and how to move it. The words are `arrivalHtml`'s own, so the
 * two emails can never tell a customer different things.
 *
 * No calendar file: the confirmation carried one, and a second copy of the
 * same event is a second event in Outlook (see bookingCalendar). Fittings
 * only — a collection is at the customer's own door, and its confirmation
 * already set an alarm the evening before.
 */
export function reminderEmailHtml(
  booking: Pick<NotifiableBooking, "displayName" | "service" | "slotStart" | "slotEnd" | "collection">
): string {
  const firstName = escapeHtml(booking.displayName ?? "there");
  const when = booking.slotStart ? escapeHtml(slotLabel(booking.slotStart)) : "tomorrow";
  const length = fittingLength(booking);
  const whatsappKristina = whatsappLink(
    `Hi Kristina, it's ${booking.displayName ?? ""}, about my appointment tomorrow${
      booking.slotStart ? ` (${slotLabel(booking.slotStart)})` : ""
    }: `
  );
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#faf9f7;font-family:Georgia,serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.06);">
    <div style="background:#e8dff5;padding:34px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#7a6d9a;">Beautasy Atelier</p>
      <h1 style="margin:0;font-size:25px;font-weight:400;color:#2d2d2d;font-style:italic;">See you tomorrow</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#3d3d3d;line-height:1.7;margin-top:0;">${firstName}, a little reminder: your appointment for ${escapeHtml(
        serviceInSentence(booking.service)
      )} is tomorrow, <strong>${when}</strong>.${length ? ` It takes ${escapeHtml(length)}.` : ""}</p>
      ${arrivalHtml(booking.service)}
      <p style="text-align:center;margin:26px 0 0;">
        <a href="${escapeHtml(whatsappKristina)}" style="display:inline-block;padding:13px 30px;background:#DCD0FF;color:#2d2d2d;border-radius:999px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">WhatsApp Kristina</a>
      </p>
      <p style="text-align:center;margin:18px 0 0;font-size:13px;">
        <a href="${BUSINESS.telephoneHref}" style="color:#6c5a96;">Call ${BUSINESS.telephone}</a>
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #f0eaf8;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">Made with 💜 in Southampton</p>
    </div>
  </div>
</body>
</html>`;
}

/** The reminder's subject: the day and the time, readable in the inbox without opening it. */
export function reminderEmailSubject(booking: Pick<NotifiableBooking, "slotStart">): string {
  const time = booking.slotStart?.split("T")[1];
  return time ? `See you tomorrow at ${timeLabel(time)} 💜` : "See you tomorrow at the Beautasy atelier 💜";
}

/** The subject line, from the same facts as the email itself. */
export function bookingEmailSubject(
  booking: Pick<NotifiableBooking, "movedFrom" | "collection">,
  status: NotifiableStatus
): string {
  if (status === "confirmed") {
    if (booking.collection) {
      return booking.movedFrom ? "Your Beautasy collection has moved 💜" : "Your Beautasy collection is arranged 💜";
    }
    return booking.movedFrom
      ? "Your Beautasy atelier appointment has moved 💜"
      : "Your Beautasy atelier appointment is confirmed 💜";
  }
  if (status === "completed") return "Thank you from the Beautasy atelier 💜";
  if (status === "cancelled") {
    return booking.collection ? "Your Beautasy collection is cancelled" : "Your Beautasy atelier appointment is cancelled";
  }
  return "About your Beautasy atelier booking";
}

/**
 * Exported so a test can run it rather than read it: it is the only thing that
 * says whether a customer the mail service refused is ever looked at again.
 *
 * `releasedAt` marks the record the diary kept when a booking's time went to
 * someone else (see @/lib/diary). It is owed at most the "sorry" it was
 * already due — never a "you're booked in" for a time another customer holds.
 */
export const PENDING_QUERY = `*[
  _type == "atelierBooking"
  && defined(emailSealed)
  && status in ["confirmed", "declined", "cancelled", "completed"]
  && (!defined(notifiedStatus) || notifiedStatus != status)
  && (!defined(releasedAt) || status in ["declined", "cancelled"])
] | order(createdAt desc) [0...$limit] {
  _id, _rev, status, notifiedStatus, displayName, nameSealed, emailSealed,
  service, preferredDate, confirmedFor, slotStart, slotEnd, movedFrom, replyNote, createdAt,
  referrer, referredBy, referralDiscount, collection
}`;

/**
 * Emails customers whose booking Kristina has confirmed or declined.
 *
 * Claimed before it is sent — see @/lib/claim. Confirming in the Studio fires
 * the Sanity webhook, and the "Email the customer now" button is usually
 * pressed a second later; without the claim that was two confirmations.
 */
/**
 * Claim the booking, send, and hand the claim back if the mail service refuses.
 *
 * Its own function so a test can run the real claim and the real release
 * rather than a copy of them. `notifiedStatus` is what PENDING_QUERY reads to
 * decide who is still owed an email, so a mark left standing after a refusal
 * is the one mistake this queue cannot recover from: nothing looks at that
 * booking again, from any of the three ways in. Better a second confirmation
 * than a fitting nobody was ever told about — and inline, the release could be
 * turned into the claim again without a test noticing.
 *
 * The same route's own confirmation works this way too, by hand, because there
 * is no document to claim until it writes one. See `confirmationMark` in
 * src/app/api/atelier-booking/route.ts.
 */
export function claimBookingEmail(
  client: ClaimClient,
  booking: { _id: string; _rev: string; notifiedStatus?: string },
  status: NotifiableStatus,
  send: () => Promise<unknown>
): Promise<ClaimOutcome> {
  return claimThenSend(
    client,
    booking,
    { notifiedStatus: status },
    booking.notifiedStatus ? { notifiedStatus: booking.notifiedStatus } : ["notifiedStatus"],
    send
  );
}

export async function sendPendingBookingEmails(limit = 25): Promise<{ checked: number; sent: number }> {
  if (!process.env.RESEND_API_KEY || !process.env.SANITY_API_WRITE_TOKEN) {
    return { checked: 0, sent: 0 };
  }

  const bookings: NotifiableBooking[] = await sanityWriteClient.fetch(PENDING_QUERY, { limit });
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

    // A booked time goes out with its calendar invite, as it did the first time
    const invite = status === "confirmed" ? bookingInvite(booking) : null;

    const outcome = await claimBookingEmail(sanityWriteClient, booking, status, () =>
        sendConfirmation({
          from: FROM_EMAIL,
          to: email,
          replyTo: KRISTINA_EMAIL,
          subject: bookingEmailSubject(booking, status),
          html: bookingEmailHtml(booking, status, friends, reviewLink),
        }, invite)
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
