import { COLLECTION_TRIP_MINUTES } from "@/lib/collection";
import {
  canMove,
  changeInPlace,
  heldBy,
  moveBooking,
  movedCopy,
  outsideCopy,
  outsideMark,
  reheldMark,
  releasesItsTime,
  sameWords,
  withChange,
  type DiaryDoc,
  type DiaryStore,
  type InPlace,
  type Move,
} from "@/lib/diary";
import { instantOf, slotDocumentId, spanEnd, spanIsOffered, type SlotDay } from "@/lib/slots";

/**
 * Whether a Collect & return request can be given the time Kristina drives
 * out ("🚗 Назначить забор"), and how.
 *
 * A pure decision, so every rule the Studio relies on is tested rather than
 * read off the route: the trip is one of the lengths she can pick, the request
 * is a collection that can still take a time, and every slot of the trip is
 * free — counting the slots it already holds as its own. Then either it moves
 * to the new start (a copy under that slot's id, see moveBooking), or, when
 * the start is its own slot's, it is changed in place (see reholdBooking).
 *
 * Each plan carries the booking exactly as it will be written, and that same
 * document is what the customer is emailed: the diary and the email cannot
 * tell two different times.
 */

/** What a plan does once it is decided: change the booking where it is, or move it under a new id. */
export type Carried = { inPlace: true; change: InPlace; to: DiaryDoc } | { inPlace: false; to: DiaryDoc };

type Refused = { ok: false; status: number; error: string; slotTaken?: boolean };

export type CollectionPlan = Refused | ({ ok: true; end: string } & Carried);

/** The request, if it is a collection that can still be given a time — or why not. */
function collectionOf(from: DiaryDoc | null): { ok: true; request: DiaryDoc } | Refused {
  if (!from || from._type !== "atelierBooking") return { ok: false, status: 404, error: "Этой заявки больше нет." };
  if (!from.collection) {
    return {
      ok: false,
      status: 400,
      error: "Это не заявка на забор. Для примерки в ателье есть кнопка «Назначить время».",
    };
  }
  if (!canMove(from.status)) {
    return { ok: false, status: 400, error: "У заявки со статусом «Выполнена» время не меняется." };
  }
  return { ok: true, request: from };
}

export function planCollection(input: {
  from: DiaryDoc | null;
  slot: string;
  minutes: unknown;
  days: SlotDay[];
  slotMinutes: number;
  now: string;
  nowMs: number;
}): CollectionPlan {
  const { slot, days, slotMinutes, now, nowMs } = input;
  const minutes = typeof input.minutes === "number" ? input.minutes : Number.NaN;
  if (!(COLLECTION_TRIP_MINUTES as readonly number[]).includes(minutes)) {
    return { ok: false, status: 400, error: "Выберите, сколько займёт поездка." };
  }
  const found = collectionOf(input.from);
  if (!found.ok) return found;
  const from = found.request;

  const end = spanEnd(slot, minutes, slotMinutes);
  const inPlace = from._id === slotDocumentId(slot);
  if (inPlace && !releasesItsTime(from.status) && from.slotEnd === end) {
    return { ok: false, status: 400, error: "Забор уже стоит на это время и с этой длительностью." };
  }

  // The dialog was open while the clock moved on — most often past the
  // collection's own start, which nobody else holds, so "somebody is booked
  // here" would send her looking for a booking that does not exist
  if (!(instantOf(slot).getTime() > nowMs)) {
    return { ok: false, status: 409, error: "Это время уже прошло — выберите другое.", slotTaken: true };
  }

  // Its own slots are free for it, so it can move half an hour either way, or
  // keep its start and take longer.
  // Accepted race: only the first slot's id is guarded, so a site booking inside the trip in the same second slips past.
  if (!spanIsOffered(days, slot, minutes, slotMinutes, heldBy(from, slotMinutes), nowMs)) {
    return {
      ok: false,
      status: 409,
      error: "На это время в дневнике уже кто-то записан — выберите другое.",
      slotTaken: true,
    };
  }

  if (!inPlace) return { ok: true, end, inPlace: false, to: movedCopy(from, slot, now, end) };
  const change = reheldMark(from, slot, now, end);
  return { ok: true, end, inPlace: true, change, to: withChange(from, change) };
}

/** The longest out-of-hours time Kristina can type: one line of the customer's email. */
export const OUTSIDE_MAX = 80;

/**
 * Kristina's words for a time outside the diary, as they will reach the
 * customer: one line, nothing invisible in it, and in English. Used by the
 * dialog to say what is wrong before she presses anything, and by the server,
 * which never trusts the dialog.
 */
export function outsideWords(value: unknown): { ok: true; told: string } | { ok: false; error: string } {
  const told =
    typeof value === "string"
      ? value
          // Zero-width and direction marks: invisible in the Studio, and in the email
          .replace(/\p{Cf}/gu, "")
          // A line break or a tab typed in is a space in one line
          .replace(/[\p{Cc}\s]+/gu, " ")
          .trim()
      : "";
  if (!told) return { ok: false, error: "Впишите время забора — например, «Tuesday 6 October, 7:30pm»." };
  if (told.length > OUTSIDE_MAX) {
    return { ok: false, error: `Слишком длинно: не больше ${OUTSIDE_MAX} знаков — это одна строка в письме клиенту.` };
  }
  if (/\p{Script=Cyrillic}/u.test(told)) {
    return { ok: false, error: "Напишите время по-английски — клиент прочитает его в письме так, как оно написано." };
  }
  return { ok: true, told };
}

export type OutsidePlan = Refused | ({ ok: true; told: string } & Carried);

/**
 * A collection given a time outside the diary's hours (see outsideMark).
 *
 * A request with no time is changed where it is. One that holds a slot — or
 * sits on a slot's id — moves to `freshId`, an id of its own, and lets go of
 * the slot, so the trip it held is free for customers again.
 */
export function planOutside(input: { from: DiaryDoc | null; told: unknown; now: string; freshId: string }): OutsidePlan {
  const { now, freshId } = input;
  const words = outsideWords(input.told);
  if (!words.ok) return { ok: false, status: 400, error: words.error };
  const { told } = words;
  const found = collectionOf(input.from);
  if (!found.ok) return found;
  const from = found.request;

  if (from.slotStart || from._id.startsWith("slot-")) {
    return { ok: true, told, inPlace: false, to: outsideCopy(from, told, now, freshId) };
  }
  const already =
    from.status === "confirmed" &&
    from.notifiedStatus === "confirmed" &&
    typeof from.confirmedFor === "string" &&
    sameWords(from.confirmedFor, told);
  if (already) return { ok: false, status: 400, error: "Клиенту уже сообщили это время." };
  const change = outsideMark(from, told, now);
  return { ok: true, told, inPlace: true, change, to: withChange(from, change) };
}

/**
 * A plan carried out: the booking changed where it is, or moved under its new
 * id. `to` is the booking as written, and what the customer is emailed.
 */
export async function carryOut(
  store: DiaryStore,
  input: { from: DiaryDoc; plan: Carried; now: string }
): Promise<{ moved: Move; to: DiaryDoc }> {
  const { from, plan, now } = input;
  const moved = plan.inPlace
    ? await changeInPlace(store, { from, ...plan.change })
    : await moveBooking(store, { from, to: plan.to, now });
  return { moved, to: plan.to };
}
