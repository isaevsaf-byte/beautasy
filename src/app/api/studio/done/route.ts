import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { isProjectMember } from "@/lib/studioMember";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { sendPendingBookingEmails } from "@/lib/bookingEmails";
import { settleOneBooking } from "@/lib/referralSettle";
import { linesFrom, whyNotDone, type DoneBooking } from "@/lib/markDone";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/done — «✓ Работа готова», from the Studio (11.10.2026).
 *
 *   { token, id, rev, lines: [{ phrase, a?, b? }], clearNote } → the booking
 *   marked «Выполнена» with its care label, and its thank-you sent now
 *
 * Why a route and not the radio: the thank-you is sent once — by this, by
 * «Написать клиенту сейчас» on any document, or by the morning job — and is
 * never sent again. A label line picked after «Выполнена» was published
 * could miss it for good. Here the status and the label are one write, made
 * only against the version Kristina was looking at, and the email for this
 * one booking goes straight after it (see PENDING_ONE_QUERY).
 *
 * Only a confirmed booking is finished this way — or one already marked
 * «Выполнена» by its radio whose thank-you, with an email to go to, has not
 * gone yet, so the label can still travel with it. Guarded as the diary is: the Studio's own session
 * token, spent on asking Sanity whether the caller is a member of the project.
 */

/** Every `error` goes straight into the Studio's dialog, so it is written in Russian */
function answer(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) return answer(403, "Это может делать только Studio.");

  const limited = rateLimit(`studio-done:${clientIp(req)}`, 60, 60 * 60 * 1000);
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
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return answer(503, "Сейчас запись нельзя изменить — на сайте не хватает ключа.");
  }

  const id = typeof body.id === "string" ? body.id.replace(/^drafts\./, "") : "";
  if (!id) return answer(400, "Какую запись отметить?");
  const parsed = linesFrom(body.lines);
  if (!parsed.ok) return answer(400, parsed.error);

  let doc: DoneBooking | null;
  try {
    doc = (await sanityWriteClient.getDocument<DoneBooking>(id)) ?? null;
  } catch (error) {
    console.error(`Could not read booking ${id} to mark it done:`, error);
    return answer(503, "Не удалось прочитать запись. Попробуйте через минуту.");
  }
  const refused = whyNotDone(doc);
  if (refused) return answer(409, refused);
  const booking = doc as DoneBooking;
  if (typeof body.rev === "string" && body.rev !== booking._rev) {
    return answer(409, "Пока окно было открыто, запись изменили. Закройте его, откройте запись заново и попробуйте ещё раз.");
  }

  // One unset, built whole: a second .unset() replaces the first rather than adding to it
  const drop = [...(body.clearNote === true ? ["replyNote"] : []), ...(parsed.lines.length ? [] : ["careLabel"])];
  let patch = sanityWriteClient
    .patch(id)
    .ifRevisionId(booking._rev)
    .set({
      status: "completed",
      ...(parsed.lines.length
        ? { careLabel: parsed.lines.map((line, k) => ({ _key: `line${k + 1}`, _type: "careLine", ...line })) }
        : {}),
    });
  if (drop.length) patch = patch.unset(drop);
  try {
    await patch.commit();
  } catch (error) {
    console.error(`Could not mark booking ${id} done:`, error);
    const changed = (error as { statusCode?: number }).statusCode === 409;
    return answer(
      changed ? 409 : 500,
      changed
        ? "Пока вы выбирали бирку, запись изменили. Откройте её заново и попробуйте ещё раз."
        : "Не удалось сохранить, поэтому ничего не изменилось. Попробуйте через минуту."
    );
  }

  // The thank-you for this booking alone; a refusal leaves it owed, and the
  // morning job sends it
  const hadEmail = typeof booking.emailSealed === "string" && booking.emailSealed.length > 0;
  let emailed = false;
  if (hadEmail) {
    try {
      emailed = (await sendPendingBookingEmails(1, id)).sent > 0;
    } catch (error) {
      console.error(`Could not send the thank-you for ${id} now; the morning job will:`, error);
    }
  }
  // Whoever recommended her is credited once she has heard — never fails the button
  try {
    await settleOneBooking(id);
  } catch (error) {
    console.error(`Could not settle the recommendation on ${id}:`, error);
  }

  return NextResponse.json({ ok: true, emailed, hadEmail });
}
