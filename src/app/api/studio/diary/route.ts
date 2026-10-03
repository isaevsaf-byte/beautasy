import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { isProjectMember } from "@/lib/studioMember";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { secretsConfigured } from "@/lib/secrets";
import { emailFingerprint, firstNameOf, maskEmail, open, sealOptional } from "@/lib/pii";
import { getAvailableSlots } from "@/lib/schedule";
import { DEFAULT_SCHEDULE, slotDocumentId, slotIsOffered, slotLabel, spanIsOffered } from "@/lib/slots";
import { slotsFor } from "@/lib/atelierServices";
import { carryOut, planCollection, planOutside } from "@/lib/collectionTime";
import {
  canMove,
  claimSlot,
  fittingEnd,
  fittingMinutes,
  heldBy,
  moveBooking,
  movedCopy,
  releasesItsTime,
  reheldDoc,
  reholdBooking,
  sanityDiaryStore,
  startsToMoveTo,
  type DiaryDoc,
  type Move,
} from "@/lib/diary";
import {
  bookingEmailHtml,
  bookingEmailSubject,
  bookingInvite,
  notifiableFromDiary,
  sendConfirmation,
} from "@/lib/bookingEmails";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/diary — Kristina's hand on the diary, from the Studio.
 *
 *   { token, action: "slots" }                         → the free times
 *   { token, action: "book", slot, name, ... }         → a booking agreed elsewhere
 *   { token, action: "move", id, slot }                → a booking given a (new) time
 *   { token, action: "collect", id, slot, minutes }    → a collection given the time Kristina drives out
 *   { token, action: "collectOutside", id, told }      → a collection given a time outside the diary's hours
 *
 * Why it exists: the diary only knew about bookings made on the site. A time
 * agreed on WhatsApp or Nextdoor stayed on offer online, and moving a booking
 * meant typing words into "Confirmed For", which held nothing. Both went
 * straight to two people at the door. Both now go through the same claim as a
 * booking on the site — see @/lib/diary.
 *
 * A collection is Kristina at the customer's door, so the time she drives out
 * is taken from the diary for the whole trip: nobody can book a fitting in the
 * atelier while she is away. It holds its start the way every booking does,
 * by its id, and the rest of its span through `slotEnd` (see @/lib/schedule).
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

/** What Kristina is told when a collection's time did not go through — nothing when it did. */
function collectionNotGiven(moved: Move): NextResponse | null {
  if (moved === "taken") return answer(409, "Это время только что заняли — выберите другое.", { slotTaken: true });
  if (moved === "changed") {
    return answer(409, "Пока вы назначали забор, заявку изменили. Откройте её заново и попробуйте ещё раз.");
  }
  if (moved === "failed") return answer(500, "Не удалось сохранить, поэтому ничего не изменилось. Попробуйте через минуту.");
  if (moved === "unsure") {
    return answer(
      500,
      "Дневник записей перестал отвечать на полпути. Загляните в «Записи в ателье»: заявка может стоять на старом времени, на новом или на обоих. Оставьте нужную, остальные удалите и сообщите клиенту время сами."
    );
  }
  return null;
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

  // The collection, the window and any note Kristina left travel with it — see notifiableFromDiary
  const booking = notifiableFromDiary(doc, slotMinutes);

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

  const now = new Date().toISOString();
  const store = sanityDiaryStore(sanityWriteClient);

  // Outside the diary's hours a collection holds nothing in it, so this one
  // neither reads the diary nor waits for it
  if (body.action === "collectOutside") {
    const id = typeof body.id === "string" ? body.id.replace(/^drafts\./, "") : "";
    if (!id) return answer(400, "Какую заявку на забор назначить?");

    let from: DiaryDoc | null;
    try {
      from = await store.read(id);
    } catch (error) {
      console.error(`Could not read collection ${id} to give it a time:`, error);
      return answer(503, "Не удалось прочитать заявку. Попробуйте через минуту.");
    }

    // A timed one moves to an id of its own and lets go of its slot (see planOutside)
    const plan = planOutside({ from, told: body.told, now, freshId: `collection-${crypto.randomUUID()}` });
    if (!plan.ok) return answer(plan.status, plan.error);
    const request = from as DiaryDoc;

    const { moved, to } = await carryOut(store, { from: request, plan, now });
    const notGiven = collectionNotGiven(moved);
    if (notGiven) return notGiven;

    // No slot, so no invite and no length: the slot length is never read
    const emailed = await tellCustomer(to, DEFAULT_SCHEDULE.slotMinutes);
    return NextResponse.json({
      ok: true,
      id: to._id,
      label: to.confirmedFor,
      emailed,
      hadEmail: typeof request.emailSealed === "string",
      // The trip it held is free in the diary again
      freed: heldBy(request, DEFAULT_SCHEDULE.slotMinutes).length > 0,
    });
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
    return NextResponse.json({ enabled: schedule.enabled, days, slotMinutes: schedule.slotMinutes });
  }

  const slot = typeof body.slot === "string" && SLOT_SHAPE.test(body.slot) ? body.slot : null;
  if (!slot) return answer(400, "Сначала выберите время.");
  // Each action checks the whole time it would hold: a booking by hand as long
  // as its service takes, a move as long as the booking already is, a
  // collection its whole trip — the last two counting their own slots as their own.

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

    // A bride takes two slots in a row (see slotsFor), and both have to be free
    const minutes = slotsFor(service) * schedule.slotMinutes;
    if (!spanIsOffered(days, slot, minutes, schedule.slotMinutes)) {
      return answer(
        409,
        minutes > schedule.slotMinutes
          ? "С этого времени нет двух свободных слотов подряд — выберите другое."
          : "Это время уже занято — выберите другое.",
        { slotTaken: true }
      );
    }
    const end = fittingEnd(slot, minutes, schedule.slotMinutes);

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
      // A bride's second slot is held through this, as a collection's trip is
      ...(end ? { slotEnd: end } : {}),
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
    return NextResponse.json({ ok: true, id: doc._id, slot, ...(end ? { end } : {}), label: slotLabel(slot), emailed });
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
    // A collection is given its time with the length of the trip, and its
    // email talks about a collection at their door, never a visit
    if (from.collection) {
      return answer(400, "Это заявка на забор — время для неё назначает кнопка «🚗 Назначить забор» в меню внизу.");
    }
    // The booking that holds this very time: moving it onto itself would hand
    // its own time back. One that gave it back is booked again in place — once
    // the diary below has said the time is free, which a status set back by
    // hand never asked (a collection may hold that time without its id).
    const sameSlot = from._id === slotDocumentId(slot);
    if (sameSlot && !releasesItsTime(from.status)) return answer(400, "Запись уже стоит на это время.");

    // It keeps its own length — a bride's two slots stay two — and its own
    // slots count as free for it, so it can move half an hour either way
    const minutes = fittingMinutes(from, schedule.slotMinutes);
    if (!slotIsOffered(startsToMoveTo(days, from, schedule.slotMinutes, Date.now()), slot)) {
      return answer(
        409,
        minutes > schedule.slotMinutes
          ? "С этого времени не хватает свободного времени на всю запись — выберите другое."
          : "Это время уже занято — выберите другое.",
        { slotTaken: true }
      );
    }
    const end = fittingEnd(slot, minutes, schedule.slotMinutes);

    const to = sameSlot ? reheldDoc(from, slot, now, end) : movedCopy(from, slot, now, end);
    const moved: Move = sameSlot
      ? await reholdBooking(store, { from, slot, now, end })
      : await moveBooking(store, { from, to, now });
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
      ...(end ? { end } : {}),
      label: slotLabel(slot),
      emailed,
      hadEmail: typeof from.emailSealed === "string",
    });
  }

  if (body.action === "collect") {
    const id = typeof body.id === "string" ? body.id.replace(/^drafts\./, "") : "";
    if (!id) return answer(400, "Какую заявку на забор назначить?");

    let from: DiaryDoc | null;
    try {
      from = await store.read(id);
    } catch (error) {
      console.error(`Could not read collection ${id} to give it a time:`, error);
      return answer(503, "Не удалось прочитать заявку. Попробуйте через минуту.");
    }

    const plan = planCollection({
      from,
      slot,
      minutes: body.minutes,
      days,
      slotMinutes: schedule.slotMinutes,
      now,
      nowMs: Date.now(),
    });
    if (!plan.ok) return answer(plan.status, plan.error, plan.slotTaken ? { slotTaken: true } : {});
    // planCollection has looked: there is a request to change
    const request = from as DiaryDoc;

    // The booking as the plan wrote it is the one stored and the one emailed (see carryOut)
    const { moved, to } = await carryOut(store, { from: request, plan, now });
    const notGiven = collectionNotGiven(moved);
    if (notGiven) return notGiven;

    const emailed = await tellCustomer(to, schedule.slotMinutes);
    return NextResponse.json({
      ok: true,
      id: to._id,
      slot,
      end: plan.end,
      label: to.confirmedFor,
      emailed,
      hadEmail: typeof request.emailSealed === "string",
    });
  }

  return answer(400, "Неизвестное действие.");
}
