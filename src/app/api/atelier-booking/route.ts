import { NextRequest, NextResponse } from "next/server";
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
import { localMinuteOf, spanIsOffered, spanLabel, slotLabel, slotDocumentId } from "@/lib/slots";
import { claimSlot, fittingEnd, sanityDiaryStore } from "@/lib/diary";
import { pieceInSentence, serviceInSentence, slotsFor } from "@/lib/atelierServices";
import {
  FUTURE_HOLDS_QUERY,
  MAX_FUTURE_HOLDS,
  REPEAT_REQUEST_QUERY,
  REPEAT_WINDOW_MS,
  TOO_MANY_HOLDS,
  filledHoneypot,
  heldBySameCustomer,
  postcodeFits,
  readBookingFields,
  requestFingerprint,
  requestKeyOf,
  sameAnswerAgain,
  type EarlierBooking,
} from "@/lib/bookingRequest";
import {
  bookingEmailHtml,
  bookingInvite,
  sendConfirmation,
  whatsappNumberOf,
  type NotifiableBooking,
} from "@/lib/bookingEmails";
import { sendEmail } from "@/lib/sendEmail";
import { whatsappLink } from "@/lib/business";
import { judgeCollection, type CollectionRequest } from "@/lib/collection";
import { collectionSettings } from "@/lib/siteSettings";

export const dynamic = "force-dynamic";

const KRISTINA_EMAIL = "hello@beautasy.co.uk";
const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";

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
  /** Collect & return instead of a fitting: their postcode, and when they are usually in */
  collection?: { postcode?: string; when?: string };
}

const SLOT_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Who is asking: the address's fingerprint, and the form's own (see requestFingerprint). */
interface Asker {
  email: string;
  request: string;
}

/**
 * The booking holding this slot, if it is this same form's — read again
 * wherever the route is about to say "that time has just been taken", because
 * the first copy of this request may have landed a moment ago. Nothing found,
 * or a database that cannot be asked, is null: then the time is somebody else's.
 */
async function ownBookingOn(slot: string, asker: Asker): Promise<EarlierBooking | null> {
  const holder = await sanityWriteClient
    .getDocument<EarlierBooking>(slotDocumentId(slot))
    .catch((err) => {
      console.error("Could not read who holds a slot:", err);
      return undefined;
    });
  return holder && heldBySameCustomer(holder, asker.email, asker.request) ? holder : null;
}

/**
 * The booking this request repeats, if it is one: this form's booking holding
 * the very slot picked, or — with no time held — the same form's request with
 * the same words in the last fifteen minutes (see @/lib/bookingRequest). A
 * phone that lost the answer to the first request sends it again, and that
 * customer is owed the first answer, not "that time has just been taken"
 * about their own booking, nor a second booking and a second email. A
 * database that cannot be asked is no reason to turn a customer away: then it
 * is not a repeat.
 */
async function sameRequestBefore(asker: Asker, slot: string | undefined): Promise<EarlierBooking | null> {
  if (slot) {
    const holder = await ownBookingOn(slot, asker);
    if (holder) return holder;
  }
  try {
    const earlier = await sanityWriteClient.fetch<EarlierBooking | null>(REPEAT_REQUEST_QUERY, {
      fingerprint: asker.email,
      request: asker.request,
      since: new Date(Date.now() - REPEAT_WINDOW_MS).toISOString(),
    });
    return earlier ?? null;
  } catch (err) {
    console.error("Could not look for an earlier copy of a booking request:", err);
    return null;
  }
}

/**
 * Whether this request reached nobody at all.
 *
 * A function of its own, and tested as one, because the version that was
 * written inline had nothing standing over it: move `emailed = true` out of
 * the try block it sits in and every test in the project stayed green. That is
 * not a hypothetical mutation, it is the 5 September bug written out — the
 * handler recorded an email the mail service had refused, this guard read the
 * lie, and the customer was told everything was fine.
 *
 * Saved but not emailed is not lost: the row is in the Studio and the watchman
 * chases it. Emailed but not saved is not lost either: it is in her inbox.
 * Only neither is worth telling the customer to go and use WhatsApp.
 */
export function bookingReachedNobody(saved: boolean, emailed: boolean): boolean {
  return !saved && !emailed;
}

/** What to do with the "the customer has been told" mark once the emails are done. */
export type ConfirmationMark = "keep" | "release" | "none";

/**
 * Whether a booked slot keeps the mark it was born with, or hands it back.
 *
 * The document is created with `notifiedStatus: "confirmed"` already on it,
 * and that is a claim rather than a record — the same claim-then-release the
 * four email queues make (see @/lib/claim), made here by hand because there is
 * no document to claim until this request writes one.
 *
 * It has to be the claim and not a later stamp. Between `create` and the
 * confirmation email are two round trips to Resend, about a second, and a
 * Sanity webhook fires on create: for that second the booking is visible to
 * PENDING_QUERY in bookingEmails.ts, which would claim it and send the very
 * same "your appointment is confirmed" email a fraction of a second before
 * this handler sends its own. Measured through the real query, not reasoned
 * about — two identical confirmations to one customer.
 *
 * So the mark goes on at birth and comes off when the confirmation is refused,
 * which leaves the booking exactly where the nightly job can finish the job
 * this request started. Marked and never told was the 5 September shape and it
 * is the one thing this must not do.
 *
 * "none" for a request with no chosen time: it is born "new", nobody has been
 * confirmed anything, and there is no claim to hand back.
 */
export function confirmationMark(input: {
  slot: boolean;
  saved: boolean;
  confirmed: boolean;
}): ConfirmationMark {
  if (!input.slot || !input.saved) return "none";
  return input.confirmed ? "keep" : "release";
}

/** What the booking is left carrying, once both emails have had their turn. */
export interface BookingWriteBack {
  /** When Kristina was told, or null when she was not */
  set: { kristinaNotifiedAt: string } | null;
  /** Marks handed back, because the email they stood for was refused */
  unset: string[];
}

/**
 * The one write that settles both marks, worked out on its own so it can be
 * measured on its own.
 *
 * `kristinaNotifiedAt` is the only thing in the shop that says the atelier
 * knows a booking exists, and it is what the watchman reads (see HEALTH_QUERY
 * in @/lib/siteHealth). So it may go on for one reason and one reason only:
 * her email was taken. Stamping it regardless is 5 September again in a new
 * field — the booking looks known about, the morning check stays quiet, and
 * somebody turns up to a locked door.
 *
 * Null when there is nothing to write, so an ordinary request with no chosen
 * time and a working mail service costs no round trip at all.
 */
export function writeBackAfterEmails(input: {
  emailed: boolean;
  mark: ConfirmationMark;
  at: string;
}): BookingWriteBack | null {
  const set = input.emailed ? { kristinaNotifiedAt: input.at } : null;
  const unset = input.mark === "release" ? ["notifiedStatus"] : [];
  if (set === null && unset.length === 0) return null;
  return { set, unset };
}

/**
 * The line at the foot of Kristina's email that gets the customer an answer.
 *
 * A booked time is confirmed to the customer at once, and their confirmation
 * says Kristina will send the address, because the atelier's address is not
 * published. So her email says so too, with the customer's WhatsApp one tap
 * away and the first line already written. Without a number she can read,
 * replying to the email reaches them as well.
 */
export function replyToCustomerHtml(input: {
  name: string;
  phone?: string;
  slot?: string;
  service: string;
  /** Collect & return: the first message asks for their address, not tells them hers */
  collection?: boolean;
}): string {
  const first = firstNameOf(input.name) ?? "there";
  const number = whatsappNumberOf(input.phone);
  const opening = input.slot
    ? `Hi ${first}, it's Kristina from Beautasy. Looking forward to seeing you on ${slotLabel(input.slot)}. Here's how to find me: `
    : input.collection
    ? `Hi ${first}, it's Kristina from Beautasy, about collecting your ${pieceInSentence(input.service)}. What's the address? `
    : `Hi ${first}, it's Kristina from Beautasy, about your ${serviceInSentence(input.service)} request: `;
  const whatsapp = number
    ? `<a href="${escapeHtml(`https://wa.me/${number}?text=${encodeURIComponent(opening)}`)}" style="color:#5e4b9a;font-weight:bold;">WhatsApp ${escapeHtml(first)}</a> or reply to this email.`
    : "Reply to this email to reach them.";
  if (input.slot) {
    return `<p style="padding:12px 16px;background:#fff6e0;border-radius:10px;color:#5c4400;line-height:1.6;">📍 <strong>Send ${escapeHtml(first)} the address</strong> and how to find the door. Their confirmation says you will, before the visit.<br/>${whatsapp}</p>`;
  }
  return input.collection
    ? `<p style="color:#3d3d3d;line-height:1.7;">${whatsapp}<br/>🚗 Give it a time in the Studio: open the request → «🚗 Назначить забор». The time is taken from your diary for the whole trip, and they are emailed it. Ask for their address — nobody comes to your door, so there is no address of yours to send.</p>`
    : `<p style="color:#3d3d3d;line-height:1.7;">${whatsapp}<br/>📍 When you confirm a time in the Studio, their email says you'll send the address before the visit.</p>`;
}

/**
 * What a customer typed about when they're in goes first in their sealed notes,
 * and their own notes after it: never one instead of the other.
 */
export function sealedNotesText(when: string | undefined, notes: string | undefined): string | undefined {
  const own = notes?.trim() || undefined;
  if (!when) return own;
  return [`Best time to collect: ${when}`, own].filter(Boolean).join("\n\n");
}

/**
 * The customer's acknowledgement of a collection request. Everything they
 * typed is escaped: anyone can put someone else's address in the form, and
 * this goes out from orders@beautasy.co.uk.
 */
export function collectionReceivedHtml(
  service: string,
  collection: { request: CollectionRequest; when?: string }
): string {
  return `<p style="color:#3d3d3d;line-height:1.8;">
            We've received your request to collect your <strong>${escapeHtml(pieceInSentence(service))}</strong>.
            Kristina will email you the time she'll come and ask for your address. Nothing is collected until you've agreed it together.
          </p>${
            collection.when
              ? `
          <p style="color:#3d3d3d;line-height:1.8;">You told us: &ldquo;${escapeHtml(collection.when)}&rdquo;.</p>`
              : ""
          }
          <p style="color:#3d3d3d;line-height:1.8;">
            Collection &amp; return: <strong>${escapeHtml(collection.request.terms)}</strong>. The price of the work itself is confirmed before Kristina starts.
          </p>`;
}

/**
 * The one line in a customer's "we've got your request" email that gets them
 * a price before anything is booked: a photo on WhatsApp, with the first
 * message already written. Nothing here about what a fitting costs or how it
 * is paid — that is Kristina's to say.
 */
export function priceFirstHtml(name: string, service: string): string {
  const first = firstNameOf(name);
  const link = whatsappLink(
    `Hi Kristina, it's ${first ?? "me"}. I've just sent a booking request (${service}). Here's a photo for a price, and the label inside: `
  );
  return `<p style="color:#3d3d3d;line-height:1.8;">Want a price first? <a href="${escapeHtml(link)}" style="color:#5e4b9a;font-weight:bold;">Send Kristina a photo on WhatsApp</a> — and one of the label inside.</p>`;
}

/**
 * The collection, in Kristina's email: everything she needs to plan the
 * drive. The full postcode is here and nowhere else — the booking keeps only
 * the district (see @/lib/collection), and the street is agreed in a message.
 */
export function collectionForKristinaHtml(collection: {
  request: CollectionRequest;
  postcode: string;
  when?: string;
}): string {
  const { request, postcode, when } = collection;
  return `<p style="padding:12px 16px;background:#eaf2fb;border-radius:10px;color:#1f3a5c;line-height:1.7;">🚗 <strong>Collect &amp; return</strong><br/>
            Postcode: <strong>${escapeHtml(postcode)}</strong> · ${escapeHtml(request.zone)}<br/>
            ${when ? `When they're usually in: <strong>${escapeHtml(when)}</strong><br/>` : ""}
            They were told: ${escapeHtml(request.terms)}. The work itself is priced as usual, before you start.</p>`;
}

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

    // The field only a bot fills in. Answered as if all went well — a bot told
    // it failed tries again — and nothing is saved, nothing is sent.
    if (filledHoneypot(body)) {
      return NextResponse.json({ ok: true, emailed: true }, { status: 201 });
    }

    // Only what the form itself can send: a service from its lists, and fields
    // no longer than a person types. See @/lib/bookingRequest.
    const read = readBookingFields(body);
    if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });
    const { name, email, phone, service, preferredDate, notes } = read.fields;

    // Collect & return is a request, never a fitting: it holds no time in the
    // diary, so a slot sent beside it is not taken
    const wantsCollection = body.collection !== undefined && body.collection !== null;
    const slot =
      !wantsCollection && typeof body.slot === "string" && SLOT_SHAPE.test(body.slot) ? body.slot : undefined;
    if (wantsCollection && !postcodeFits(body.collection)) {
      return NextResponse.json({ error: "Please enter your postcode, like SO17 1AB." }, { status: 400 });
    }

    // Keyed and one-way: how the same customer is recognised without their address in the database
    const fingerprint =
      process.env.SANITY_API_WRITE_TOKEN && secretsConfigured() ? emailFingerprint(email) : null;
    // And the same form: only a request carrying the key its first copy
    // carried is answered as that first copy — see requestFingerprint
    const requestKey = requestKeyOf(body);
    const asker: Asker | null =
      fingerprint && requestKey
        ? {
            email: fingerprint,
            request: requestFingerprint({ key: requestKey, slot, fields: read.fields, collection: body.collection }),
          }
        : null;

    if (asker) {
      const earlier = await sameRequestBefore(asker, slot);
      if (earlier) return NextResponse.json(sameAnswerAgain(earlier), { status: 201 });
    }

    // Somebody holding the diary's future under one address — a real customer
    // with two fittings ahead is asked to message for a third
    if (slot && fingerprint) {
      let holds = 0;
      try {
        holds = (await sanityWriteClient.fetch<number>(FUTURE_HOLDS_QUERY, { fingerprint, now: localMinuteOf(new Date()) })) ?? 0;
      } catch (err) {
        // The diary itself is read strictly below; this check is not worth a refused booking
        console.error("Could not count a customer's booked times:", err);
      }
      if (holds >= MAX_FUTURE_HOLDS) {
        return NextResponse.json({ error: TOO_MANY_HOLDS }, { status: 409 });
      }
    }

    // Decided here, from the settings as they are this minute. The form showed
    // the customer the same answer while they typed, but a page left open all
    // day, or a request written by hand, must not book a drive to a district
    // nobody covers at a time nobody offered. See @/lib/collection.
    let collection: { request: CollectionRequest; postcode: string; when?: string } | null = null;
    if (wantsCollection) {
      const verdict = judgeCollection(await collectionSettings({ fresh: true }), body.collection);
      if (!verdict.ok) {
        return NextResponse.json({ error: verdict.error }, { status: 400 });
      }
      collection = { request: verdict.request, postcode: verdict.postcode, ...(verdict.when ? { when: verdict.when } : {}) };
    }

    // A friend's link: the discount is noted on the booking and taken off by
    // hand when they pay, and whoever sent them is credited once the fitting
    // is marked done. Judged now, so the customer hears straight away if it
    // does not apply — a returning customer is welcome, just not as a first visit.
    let friend: { referrer: Referrer; discount: number } | null = null;
    let referralNote: string | null = null;
    const referralCode = read.fields.referralCode;
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
    /** The diary's slot length, so the calendar invite is as long as the fitting */
    let slotMinutes: number | undefined;
    /** Where the fitting ends when it holds more than one slot — a bride's two (see slotsFor) */
    let slotEnd: string | undefined;
    if (slot) {
      // Read strictly: a diary that cannot be read used to look empty, and
      // every customer was told their time had gone while the database was
      // simply not answering.
      let offered: boolean;
      try {
        const { days, schedule } = await getAvailableSlots({ fresh: true, strict: true });
        slotMinutes = schedule.slotMinutes;
        // How long it is comes from the service, never from the form: a bride
        // takes two slots in a row, everyone else one, and both have to be free
        const minutes = slotsFor(service) * schedule.slotMinutes;
        offered = spanIsOffered(days, slot, minutes, schedule.slotMinutes);
        slotEnd = fittingEnd(slot, minutes, schedule.slotMinutes);
      } catch (err) {
        console.error("Could not read the diary to take a booking:", err);
        return NextResponse.json(
          { error: "Booking is temporarily unavailable — please WhatsApp or email us instead." },
          { status: 503 }
        );
      }
      if (!offered) {
        // The diary may not offer it because this very form holds it: its
        // first copy landed after the check above. That customer has the time.
        const own = asker ? await ownBookingOn(slot, asker) : null;
        if (own) return NextResponse.json(sameAnswerAgain(own), { status: 201 });
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
    /** The document, once it exists — the write-back below settles its marks */
    let bookingId: string | null = null;
    /**
     * Whether the customer now holds the time they picked. Not the same as
     * `saved`: when the database refuses the booked time for any reason other
     * than somebody holding it, the request is still kept, as a request.
     */
    let held = false;
    // The booking's moment, to the millisecond: stored on it, and the name of
    // its calendar event in every invite it is ever sent (see calendarUid)
    const createdAt = new Date().toISOString();
    if (process.env.SANITY_API_WRITE_TOKEN && secretsConfigured()) {
      // Who they are and what they want — the same on a booked time and on a request
      const person = {
        _type: "atelierBooking",
        // Readable: enough to recognise the row in the Studio
        displayName: firstNameOf(name),
        emailHint: maskEmail(email),
        // Sealed: the details themselves. See @/lib/pii.
        nameSealed: sealOptional(name),
        emailSealed: sealOptional(email),
        phoneSealed: sealOptional(phone),
        // When they're in is their own words, so it is sealed with the notes
        notesSealed: sealOptional(sealedNotesText(collection?.when, notes)),
        // Keyed and one-way: what "first visit?" is asked of next time, and
        // how many times one address holds
        emailFingerprint: emailFingerprint(email),
        // What recognises this form's request when it is sent again
        ...(asker ? { requestFingerprint: asker.request } : {}),
        service,
        // The district and the terms they saw: never the street
        ...(collection ? { collection: collection.request } : {}),
        ...(friend
          ? {
              referrer: { _type: "reference", _ref: friend.referrer._id, _weak: true },
              referredBy,
              referralDiscount: friend.discount,
            }
          : {}),
        createdAt,
      };

      if (slot) {
        // A slot's id is the slot itself, so the second person to reach for
        // the same time is refused by the database rather than by a check
        // that another request could have slipped past. A booking that gave
        // its time back is moved aside for this one — see @/lib/diary.
        const claim = await claimSlot(
          sanityDiaryStore(sanityWriteClient),
          {
            ...person,
            _id: slotDocumentId(slot),
            slotStart: slot,
            // The second slot of a bride's fitting is held through this, the
            // way a collection holds its trip (see TAKEN_QUERY in @/lib/schedule).
            // Accepted race, as for a collection: only the first slot's id is
            // guarded, so a booking of the second slot in the same second slips past.
            ...(slotEnd ? { slotEnd } : {}),
            // A moment, not a window: she is expected at the start
            confirmedFor: slotLabel(slot),
            status: "confirmed",
            // A picked time is marked as told at birth, and that mark is a claim
            // rather than a record — see `confirmationMark` above for why it
            // cannot wait until the confirmation below has gone, and for what is
            // done when that confirmation is refused.
            notifiedStatus: "confirmed",
          },
          createdAt
        );
        if (claim === "taken") {
          // Taken by this same request, sent twice at once: the first one got
          // there, so this one gets its answer
          const own = asker ? await ownBookingOn(slot, asker) : null;
          if (own) return NextResponse.json(sameAnswerAgain(own), { status: 201 });
          return NextResponse.json(
            {
              error: "Sorry — that time has just been taken. Please pick another.",
              slotTaken: true,
            },
            { status: 409 }
          );
        }
        if (claim === "claimed") {
          saved = true;
          held = true;
          bookingId = slotDocumentId(slot);
        }
        // "failed" or "unsure" is the database not answering. That is not the
        // customer's problem and it is not a taken time, so it is not answered
        // as one: the booking is kept below as a request for that time,
        // Kristina is told it is not held, and the customer hears that she
        // will confirm.
      }

      if (!held) {
        try {
          const created = await sanityWriteClient.create({
            ...person,
            preferredDate: slot ? slotLabel(slot) : collection ? undefined : preferredDate || undefined, // a collection's time comes from Kristina's diary
            status: "new",
          });
          saved = true;
          bookingId = created._id;
        } catch (err) {
          console.error("Failed to save atelier booking:", err);
        }
      }
    } else if (!secretsConfigured()) {
      console.error("DATA_SECRET is not set — a booking cannot be stored without sealing the contact details");
    }

    /** The whole time, for Kristina: a bride's two slots are both hers to keep free */
    const askedFor = slot ? (slotEnd ? spanLabel(slot, slotEnd) : slotLabel(slot)) : undefined;

    // The request is already safe in the Studio, so a mail outage is not the
    // customer's problem. Each email is best-effort on its own: a failed
    // notification must not turn into an error the customer answers by
    // submitting again, which is how one fitting became three bookings.
    let emailed = false;
    /** Whether the customer's own email went out — a booked slot is told once */
    let confirmed = false;
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set — booking saved without email");
    } else {
      try {
        // The one email this whole change is about. On 5 September this was
        // refused, `emailed` was set to true regardless, and the guard at the
        // end of the handler — the one that answers "please WhatsApp us
        // instead" when a request has reached neither the Studio nor
        // Kristina's inbox — was switched off by the lie. The customer was
        // told everything was fine and waited a fortnight.
        await sendEmail({
      from: FROM_EMAIL,
      to: KRISTINA_EMAIL,
      replyTo: email,
      // A subject line is plain text, not HTML — escaping it shows "&#39;" in the inbox
      subject: `${friend ? `${pounds(friend.discount)} REF · ` : ""}${
        held && slot
          ? `Booked — ${name.trim()}, ${slotLabel(slot)}`
          : slot
          ? `⚠️ Not held — ${name.trim()} asked for ${slotLabel(slot)}`
          : collection
          ? `🚗 Collection request — ${name.trim()}, ${collection.request.district}`
          : `New atelier booking request — ${name.trim()}`
      }`,
      html: `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;">
          <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9b7fd4;">Atelier Booking</p>
          <h1 style="font-size:22px;font-weight:400;">${escapeHtml(name)}</h1>
          <p style="color:#3d3d3d;line-height:1.8;">
            <strong>Service:</strong> ${escapeHtml(service)}<br/>
            ${held && askedFor ? `<strong>Booked for:</strong> ${escapeHtml(askedFor)}<br/>` : ""}
            ${!held && askedFor ? `<strong>Asked for:</strong> ${escapeHtml(askedFor)}<br/>` : ""}
            ${!slot && preferredDate ? `<strong>Preferred date:</strong> ${escapeHtml(preferredDate)}<br/>` : ""}
            <strong>Email:</strong> ${escapeHtml(email)}<br/>
            ${phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}<br/>` : ""}
          </p>
          ${
            friend
              ? `<p style="padding:12px 16px;background:#f7f3ff;border-radius:10px;color:#5e4b9a;line-height:1.6;">💜 Sent by <strong>${escapeHtml(referredBy)}</strong> — take <strong>${pounds(friend.discount)} off</strong> when they pay. Marking the booking Done credits ${escapeHtml(referredBy)} automatically.</p>`
              : ""
          }
          ${collection ? collectionForKristinaHtml(collection) : ""}
          ${notes ? `<p style="color:#3d3d3d;line-height:1.7;"><strong>Notes:</strong><br/>${escapeHtml(notes)}</p>` : ""}
          ${
            slot && !held
              ? `<p style="padding:12px 16px;background:#fde8e4;border-radius:10px;color:#7a2a1a;line-height:1.6;">⚠️ <strong>This time is not held.</strong> The site could not write it into the diary, so somebody else could still book ${escapeHtml(askedFor ?? slotLabel(slot))}. ${saved ? "It is in the Studio as a request: open it and use <strong>Назначить время</strong> to hold the time — they get the confirmation, and everything on the request goes with it." : "It is not in the Studio either: confirm with them, then use <strong>Записать вручную</strong> in the Studio to hold the time."}</p>`
              : ""
          }
          ${replyToCustomerHtml({ name, phone, slot: held ? slot : undefined, service, collection: !!collection })}
        </div>`,
        });
        emailed = true;
      } catch (err) {
        console.error("Failed to email Kristina about a booking:", err);
      }

      // A picked time is already an appointment, so it gets the confirmation
      // itself — with where to go and a calendar invite — rather than a
      // promise that one is coming
      const confirmation: NotifiableBooking | null = held && slot
        ? {
            _id: "pending",
            _rev: "pending",
            status: "confirmed",
            displayName: firstNameOf(name),
            service,
            confirmedFor: slotLabel(slot),
            slotStart: slot,
            slotEnd,
            slotMinutes,
            referredBy,
            referralDiscount: friend?.discount,
            createdAt,
          }
        : null;
      const invite = confirmation ? bookingInvite(confirmation) : null;

      try {
        await sendConfirmation({
      from: FROM_EMAIL,
      to: email,
      replyTo: KRISTINA_EMAIL,
      subject: confirmation
        ? "Your Beautasy atelier appointment is confirmed 💜"
        : collection
        ? "We've received your Beautasy collection request 💜"
        : "We've received your Beautasy atelier booking request 💜",
      html: confirmation
        ? bookingEmailHtml(confirmation, "confirmed")
        : `
        <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;">
          <p style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#9b7fd4;">Beautasy Atelier</p>
          <h1 style="font-size:22px;font-weight:400;">Thanks, ${escapeHtml(name.split(" ")[0])}!</h1>
          ${
            collection
              ? collectionReceivedHtml(service, collection)
              : `<p style="color:#3d3d3d;line-height:1.8;">
            We've received your request for <strong>${escapeHtml(service)}</strong>${
              slot ? ` on ${escapeHtml(slotLabel(slot))}` : preferredDate ? ` on ${escapeHtml(preferredDate)}` : ""
            }.
            Kristina will confirm your time by email shortly — you'll get a message either way, so nothing is left hanging.
          </p>`
          }
          ${priceFirstHtml(name, service)}
          ${
            friend
              ? `<p style="color:#3d3d3d;line-height:1.8;">Your <strong>${pounds(friend.discount)} off</strong> from ${escapeHtml(referredBy)} is noted — it comes off when you pay${collection ? "" : " at the atelier"}.</p>`
              : ""
          }
        </div>`,
        }, invite);
        confirmed = true;
      } catch (err) {
        console.error("Failed to send booking acknowledgement:", err);
      }
    }

    // What the two answers above mean for the document, in one write. Outside
    // the RESEND_API_KEY branch on purpose: a shop with no mail key at all
    // sends neither email, and a slot booking left holding its claim in that
    // state would never be confirmed by anything, even after the key came back.
    //
    // `kristinaNotifiedAt` goes on only when her own email was taken, and it is
    // the only thing that says the atelier knows this booking exists. `status`
    // cannot say it: a picked time is born "confirmed" because the site has
    // just confirmed it to the customer, which is a fact about the customer and
    // not about Kristina. The watchman reads this field, so a booking she was
    // never told about is chased whatever its status — see HEALTH_QUERY in
    // @/lib/siteHealth.
    //
    // The claim on the confirmation comes off here when that email was refused,
    // which puts the booking back in front of the nightly job. See
    // `confirmationMark`.
    //
    // Two risks swapped in rather than removed, named so they are not
    // rediscovered. If her email went and this write is what fails, the watchman
    // chases a booking she already knows about — a false alarm she can close in
    // the Studio in one click. And if the confirmation was refused AND this
    // write fails, the claim stands and nothing sends that customer a
    // confirmation; that needs two failures in a row, and the first of them
    // already has a line in the morning email.
    const marks = writeBackAfterEmails({
      emailed,
      mark: confirmationMark({ slot: held, saved, confirmed }),
      at: new Date().toISOString(),
    });
    if (bookingId && marks) {
      try {
        let write = sanityWriteClient.patch(bookingId);
        if (marks.set) write = write.set(marks.set);
        if (marks.unset.length > 0) write = write.unset(marks.unset);
        await write.commit();
      } catch (err) {
        console.error("Could not write back what happened to booking", bookingId, err);
      }
    }

    // Lost only if neither the Studio nor Kristina's inbox has it
    if (bookingReachedNobody(saved, emailed)) {
      return NextResponse.json(
        { error: "Booking is temporarily unavailable — please WhatsApp or email us instead." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        emailed,
        ...(held && slot ? { confirmedFor: slotLabel(slot) } : {}),
        ...(collection
          ? { collection: { terms: collection.request.terms, when: collection.when ?? null } }
          : {}),
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
