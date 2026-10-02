import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { isProjectMember } from "@/lib/studioMember";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { secretsConfigured } from "@/lib/secrets";
import { daysBetween, isDay, judgeEntry, todayInSouthampton, type LedgerEntry } from "@/lib/ledger";
import {
  LEDGER_ID,
  LEDGER_TYPE,
  bookingKeyOf,
  ledgerDocument,
  openLedgerDocument,
  readBookingPayments,
  readLedger,
} from "@/lib/ledgerStore";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/ledger — «Касса», what came in and what went out.
 *
 *   { token, action: "list", from, to }          → the entries and the shop's own, opened
 *   { token, action: "forBooking", bookingId }   → what has been paid for one booking
 *   { token, action: "add", entry }              → a payment or an expense, sealed
 *   { token, action: "update", id, entry }       → the same, corrected
 *   { token, action: "remove", id }              → gone
 *
 * Why it is a route: the dataset is readable by anyone, so an entry's amount,
 * who paid, the booking and the note are sealed, and only the server has the
 * key. The Studio sends the session token it already uses, which is spent on
 * asking Sanity whether the caller is a member of the project — the same door
 * as /api/studio/reveal and /api/studio/diary — before anything is read or
 * written.
 *
 * 🚨 What comes back is opened: amounts, names, notes. It goes to the Studio
 * and nowhere else, and nothing here logs it.
 */

/** A tax year and a little more; anything longer is not a screen anyone reads. */
const MAX_SPAN_DAYS = 400;

/**
 * Every `error` is shown to Kristina as it is, in the Studio, so it is
 * Russian and says what to do.
 */
function answer(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const BOOKING_ID = /^[A-Za-z0-9._-]{1,128}$/;

interface BookingMarks {
  _id: string;
  _type?: string;
  createdAt?: string;
  nameSealed?: string;
}

/** The booking a payment is for, with the marks its key is made from — or null. */
async function bookingFor(id: string): Promise<BookingMarks | null> {
  const booking = await sanityWriteClient.fetch<BookingMarks | null>(
    `*[_id == $id][0]{ _id, _type, createdAt, nameSealed }`,
    { id }
  );
  return booking && booking._type === "atelierBooking" ? booking : null;
}

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) return answer(403, "Это может делать только Studio.");

  // A year's catch-up is one save and one reload per line, so this is roomy
  const limited = rateLimit(`studio-ledger:${clientIp(req)}`, 600, 60 * 60 * 1000);
  if (!limited.ok) return answer(429, "Слишком много запросов подряд — подождите немного и попробуйте снова.");

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
    return answer(503, "Касса сейчас недоступна — на сайте не хватает ключей. Сообщите Сафару.");
  }

  const today = todayInSouthampton();

  if (body.action === "list") {
    const { from, to } = body;
    if (!isDay(from) || !isDay(to) || from > to || daysBetween(from, to) > MAX_SPAN_DAYS) {
      return answer(400, "Не удалось понять, за какой срок показать кассу.");
    }
    try {
      const { entries, unreadable } = await readLedger(from, to);
      return NextResponse.json({ entries, unreadable, today });
    } catch (error) {
      console.error("The ledger could not be read:", error instanceof Error ? error.message : error);
      return answer(503, "Не удалось прочитать кассу. Попробуйте через минуту.");
    }
  }

  if (body.action === "forBooking") {
    const bookingId = typeof body.bookingId === "string" ? body.bookingId.replace(/^drafts\./, "") : "";
    if (!BOOKING_ID.test(bookingId)) return answer(400, "Какая запись?");
    try {
      const booking = await bookingFor(bookingId);
      if (!booking) return answer(404, "Этой записи в ателье больше нет.");
      return NextResponse.json({ entries: await readBookingPayments(bookingKeyOf(booking)) });
    } catch {
      return answer(503, "Не удалось прочитать кассу. Попробуйте через минуту.");
    }
  }

  if (body.action === "add") {
    const verdict = judgeEntry(body.entry, today);
    if (!verdict.ok) return answer(400, verdict.error);
    const value = verdict.value;
    try {
      let bookingKey: string | undefined;
      if (value.bookingId) {
        const booking = await bookingFor(value.bookingId);
        if (!booking) return answer(404, "Этой записи в ателье больше нет.");
        bookingKey = bookingKeyOf(booking);
      }
      const id = `ledger-${randomUUID()}`;
      await sanityWriteClient.create(ledgerDocument(id, value, new Date().toISOString(), bookingKey));
      const entry: LedgerEntry = { id, ...value, source: value.bookingId ? "booking" : "manual" };
      return NextResponse.json({ ok: true, entry });
    } catch (error) {
      console.error("A ledger entry could not be saved:", error instanceof Error ? error.message : error);
      return answer(500, "Не удалось записать. Ничего не сохранилось — попробуйте ещё раз.");
    }
  }

  if (body.action === "update" || body.action === "remove") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!LEDGER_ID.test(id)) return answer(400, "Эту строку нельзя изменить: её записал сайт, а не вы.");

    let existing: { _id?: string; _type?: string; date?: string; sealed?: string; bookingKey?: string } | null;
    try {
      existing = await sanityWriteClient.fetch(`*[_id == $id][0]{ _id, _type, date, sealed, bookingKey }`, { id });
    } catch {
      return answer(503, "Не удалось прочитать кассу. Попробуйте через минуту.");
    }
    if (!existing || existing._type !== LEDGER_TYPE) return answer(404, "Этой строки в кассе больше нет.");

    if (body.action === "remove") {
      try {
        await sanityWriteClient.delete(id);
        return NextResponse.json({ ok: true });
      } catch {
        return answer(500, "Не удалось удалить. Попробуйте ещё раз.");
      }
    }

    const verdict = judgeEntry(body.entry, today);
    if (!verdict.ok) return answer(400, verdict.error);
    // A payment stays tied to the booking it was written against, whatever the
    // form sends: the booking is read from the sealed entry, not the request
    const before = openLedgerDocument(existing);
    const value = { ...verdict.value };
    delete value.bookingId;
    if (before?.bookingId) value.bookingId = before.bookingId;
    const doc = ledgerDocument(id, value, new Date().toISOString(), existing.bookingKey);
    try {
      await sanityWriteClient
        .patch(id)
        .set({ date: doc.date, sealed: doc.sealed, updatedAt: new Date().toISOString() })
        .commit();
      const entry: LedgerEntry = { id, ...value, source: value.bookingId ? "booking" : "manual" };
      return NextResponse.json({ ok: true, entry });
    } catch {
      return answer(500, "Не удалось сохранить исправление. Попробуйте ещё раз.");
    }
  }

  return answer(400, "Неизвестное действие.");
}
