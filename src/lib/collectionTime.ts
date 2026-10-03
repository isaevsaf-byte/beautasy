import { COLLECTION_TRIP_MINUTES } from "@/lib/collection";
import { canMove, heldBy, movedCopy, releasesItsTime, type DiaryDoc } from "@/lib/diary";
import { slotDocumentId, spanEnd, spanIsOffered, type SlotDay } from "@/lib/slots";

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
 */

export type CollectionPlan =
  | { ok: false; status: number; error: string; slotTaken?: boolean }
  | { ok: true; end: string; inPlace: true }
  | { ok: true; end: string; inPlace: false; to: DiaryDoc };

export function planCollection(input: {
  from: DiaryDoc | null;
  slot: string;
  minutes: unknown;
  days: SlotDay[];
  slotMinutes: number;
  now: string;
  nowMs: number;
}): CollectionPlan {
  const { from, slot, days, slotMinutes, now, nowMs } = input;
  const minutes = typeof input.minutes === "number" ? input.minutes : Number.NaN;
  if (!(COLLECTION_TRIP_MINUTES as readonly number[]).includes(minutes)) {
    return { ok: false, status: 400, error: "Выберите, сколько займёт поездка." };
  }
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

  const end = spanEnd(slot, minutes, slotMinutes);
  const inPlace = from._id === slotDocumentId(slot);
  if (inPlace && !releasesItsTime(from.status) && from.slotEnd === end) {
    return { ok: false, status: 400, error: "Забор уже стоит на это время и с этой длительностью." };
  }

  // Its own slots are free for it, so it can move half an hour either way, or
  // keep its start and take longer
  if (!spanIsOffered(days, slot, minutes, slotMinutes, heldBy(from, slotMinutes), nowMs)) {
    return {
      ok: false,
      status: 409,
      error: "На это время в дневнике уже кто-то записан — выберите другое.",
      slotTaken: true,
    };
  }

  return inPlace ? { ok: true, end, inPlace: true } : { ok: true, end, inPlace: false, to: movedCopy(from, slot, now, end) };
}
