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

/**
 * Every `error` goes straight into a Studio dialog, so it is written in
 * Russian, as the rest of the Studio is, and names lists as the sidebar does.
 * What reaches the customer — the email and its invite — stays English.
 */
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
  if (!fromThisSite(req)) return answer(403, "Это может делать только Studio.");

  const limited = rateLimit(`studio-diary:${clientIp(req)}`, 120, 60 * 60 * 1000);
  if (!limited.ok) return answer(429, "Слишком много запросов — попробуйте через несколько минут.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return answer(400, "Не удалось прочитать запрос.");
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!(await isProjectMember(token))) {
    return answer(401, "Не удалось проверить вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз.");
  }
  if (!process.env.SANITY_API_WRITE_TOKEN || !secretsConfigured()) {
    return answer(503, "Сейчас в дневник записей ничего нельзя записать — на сайте не хватает ключей.");
  }

  let days: Awaited<ReturnType<typeof getAvailableSlots>>["days"];
  let schedule: Awaited<ReturnType<typeof getAvailableSlots>>["schedule"];
  try {
    ({ days, schedule } = await getAvailableSlots({ fresh: true, strict: true, leadTimeHours: 0 }));
  } catch (error) {
    console.error("The Studio could not read the diary:", error);
    return answer(503, "Не удалось прочитать дневник записей. Попробуйте через минуту.");
  }

  if (body.action === "slots") {
    return NextResponse.json({ enabled: schedule.enabled, days });
  }

  const slot = typeof body.slot === "string" && SLOT_SHAPE.test(body.slot) ? body.slot : null;
  if (!slot) return answer(400, "Сначала выберите время.");
  if (!slotIsOffered(days, slot)) {
    return answer(409, "Это время уже занято — выберите другое.", { slotTaken: true });
  }

  const now = new Date().toISOString();
  const store = sanityDiaryStore(sanityWriteClient);

  if (body.action === "book") {
    const name = text(body.name, 80);
    if (!name || name.length < 2) return answer(400, "Добавьте имя клиента.");
    const email = text(body.email, 200);
    if (email && !EMAIL_RE.test(email)) {
      return answer(400, "Эл. почта выглядит неправильно. Если её нет, оставьте поле пустым.");
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
      return answer(409, "Это время только что заняли — выберите другое.", { slotTaken: true });
    }
    if (claim === "failed") return answer(500, "Не удалось сохранить, поэтому запись не создана. Попробуйте через минуту.");
    if (claim === "unsure") {
      return answer(
        500,
        "Дневник записей перестал отвечать во время сохранения. Прежде чем пробовать снова, загляните в «Записи в ателье»: если запись там есть, она сохранилась — сообщите клиенту время сами."
      );
    }

    const emailed = email ? await tellCustomer(doc, schedule.slotMinutes) : false;
    // `slot` is what the Studio words the time from, in Russian; `label` is
    // the site's English wording of the same time.
    return NextResponse.json({ ok: true, id: doc._id, slot, label: slotLabel(slot), emailed });
  }

  if (body.action === "move") {
    const id = typeof body.id === "string" ? body.id.replace(/^drafts\./, "") : "";
    if (!id) return answer(400, "Какую запись перенести?");

    let from: DiaryDoc | null;
    try {
      from = await store.read(id);
    } catch (error) {
      console.error(`Could not read booking ${id} to move it:`, error);
      return answer(503, "Не удалось прочитать запись. Попробуйте через минуту.");
    }
    if (!from || from._type !== "atelierBooking") return answer(404, "Этой записи больше нет.");
    if (!canMove(from.status)) return answer(400, "У записи со статусом «Выполнена» время не меняется.");
    // The booking that holds this very time: moving it onto itself would hand
    // its own time back. One that gave it back only needs its status again.
    if (from._id === slotDocumentId(slot)) {
      return answer(
        400,
        releasesItsTime(from.status)
          ? "Это время можно просто вернуть: вместо переноса поставьте статус «Подтверждена»."
          : "Запись уже стоит на это время."
      );
    }

    const to = movedCopy(from, slot, now);
    const moved = await moveBooking(store, { from, to, now });
    if (moved === "taken") {
      return answer(409, "Это время только что заняли — выберите другое.", { slotTaken: true });
    }
    if (moved === "changed") {
      return answer(409, "Пока вы переносили запись, её изменили. Откройте её заново и попробуйте ещё раз.");
    }
    if (moved === "failed") return answer(500, "Не удалось перенести, поэтому ничего не изменилось. Попробуйте через минуту.");
    if (moved === "unsure") {
      return answer(
        500,
        "Дневник записей перестал отвечать на полпути. Загляните в «Записи в ателье»: запись может стоять на старом времени, на новом или на обоих. Оставьте нужную, остальные удалите и сообщите клиенту время сами."
      );
    }

    const emailed = await tellCustomer(to, schedule.slotMinutes);
    return NextResponse.json({
      ok: true,
      id: to._id,
      slot,
      label: slotLabel(slot),
      emailed,
      hadEmail: typeof from.emailSealed === "string",
    });
  }

  return answer(400, "Неизвестное действие.");
}
