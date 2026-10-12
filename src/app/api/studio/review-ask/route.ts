import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { isProjectMember } from "@/lib/studioMember";
import { open } from "@/lib/pii";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { googleReviewUrl } from "@/lib/siteSettings";
import { reviewAskLink, reviewAskText } from "@/lib/reviewAsk";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/review-ask — «🙏 Попросить отзыв», from the Studio (12.10.2026).
 *
 *   { token, id } → { url, text } — a wa.me link to the client with the ask
 *   already typed, and the booking stamped `reviewAskedAt`
 *   { token, id } → { text, error } — no number WhatsApp can take: the words
 *   alone, so she can copy them somewhere else
 *
 * A route and not the Studio itself, because the number is sealed (see
 * @/lib/pii) and only the server holds the key — the same door as «Показать
 * контакты», guarded the same way: the Studio's own session token, spent on
 * asking Sanity whether the caller is a member of the project.
 *
 * The stamp means "the link was made", not "the message was sent": WhatsApp
 * does not tell anyone. It is what the button and the Dashboard read to stop
 * suggesting the same client twice, and a timestamp is not money, so it is a
 * plain set rather than a write against her revision.
 */

/** Every `error` goes straight into the Studio's window, so it is written in Russian */
function answer(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

interface AskedBooking {
  _id: string;
  status?: string;
  displayName?: string;
  service?: string;
  phoneSealed?: string;
}

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) return answer(403, "Это может делать только Studio.");

  const limited = rateLimit(`studio-review-ask:${clientIp(req)}`, 60, 60 * 60 * 1000);
  if (!limited.ok) return answer(429, "Слишком много запросов — попробуйте через несколько минут.");

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  if (!(await isProjectMember(token))) {
    return answer(401, "Не удалось проверить вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз.");
  }
  if (!process.env.SANITY_API_WRITE_TOKEN) {
    return answer(503, "Сейчас запись нельзя изменить — на сайте не хватает ключа.");
  }

  const id = typeof body?.id === "string" ? body.id.replace(/^drafts\./, "") : "";
  if (!id) return answer(400, "У какой записи попросить отзыв?");

  // Both versions: a draft open in the Studio is published over the stamp
  // later, so it has to carry the stamp too
  let versions: AskedBooking[];
  try {
    versions = await sanityWriteClient.fetch<AskedBooking[]>(
      `*[_type == "atelierBooking" && _id in [$id, "drafts." + $id]]{ _id, status, displayName, service, phoneSealed }`,
      { id }
    );
  } catch (error) {
    console.error(`Could not read booking ${id} to ask for a review:`, error);
    return answer(503, "Не удалось прочитать запись. Попробуйте через минуту.");
  }
  // The published booking is what happened; a draft may be a status not yet decided
  const booking = versions.find((doc) => doc._id === id);
  if (!booking) return answer(404, "Этой записи больше нет — или она ещё не опубликована.");
  if (booking.status !== "completed") {
    return answer(409, "Отзыв просят, когда работа готова: сначала отметьте запись «✓ Работа готова».");
  }

  const reviewUrl = await googleReviewUrl();
  if (!reviewUrl) {
    return answer(503, "На сайте нет ссылки на отзывы в Google. Вставьте её в «Настройки сайта».");
  }
  const text = reviewAskText(booking, reviewUrl);
  const url = reviewAskLink(open(booking.phoneSealed), text);
  if (!url) {
    // Nothing is stamped: no link was made, and whether she sends the words
    // some other way is hers to know
    return NextResponse.json({
      text,
      error: booking.phoneSealed
        ? "Номер в заявке записан так, что WhatsApp его не примет. Скопируйте текст и отправьте его клиентке сами."
        : "В заявке нет телефона, поэтому WhatsApp не открыть. Скопируйте текст и отправьте его клиентке сами.",
    });
  }

  const askedAt = new Date().toISOString();
  const stamp = sanityWriteClient.transaction();
  for (const version of versions) stamp.patch(version._id, (patch) => patch.set({ reviewAskedAt: askedAt }));
  try {
    await stamp.commit();
  } catch (error) {
    // The link still works; only the reminder that she asked is lost
    console.error(`Could not record the review ask on ${id}:`, error);
  }

  return NextResponse.json({ url, text, askedAt });
}
