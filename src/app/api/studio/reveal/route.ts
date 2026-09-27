import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { isProjectMember } from "@/lib/studioMember";
import { open } from "@/lib/pii";
import { revealCode } from "@/lib/giftCards";
import { revealReferralCode } from "@/lib/referrals";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/reveal — the contact details behind a sealed document.
 *
 * Customer details are sealed in Sanity because the dataset is readable by
 * anyone (see @/lib/pii), which means the Studio cannot show them: only the
 * server has the key. This is the one door back, and it opens for members of
 * this Sanity project and nobody else.
 *
 * Proving membership: the caller sends the session token their Studio is
 * already using, and it is spent immediately on one request to Sanity's
 * management API, which answers 200 only for a member of this project. The
 * token is never stored, never logged, and never used for anything else. It is
 * the same check Sanity itself makes when Kristina opens the Studio.
 */

/**
 * Which sealed fields each document type has, and what to call them.
 *
 * The labels and every `error` below are read only by the Studio's "Показать
 * контакты" button, which shows them to Kristina as they are — so they are
 * Russian, and the labels are the fields' own titles in the schemas.
 */
const SEALED_FIELDS: Record<string, { field: string; label: string }[]> = {
  atelierBooking: [
    { field: "nameSealed", label: "Имя" },
    { field: "emailSealed", label: "Эл. почта" },
    { field: "phoneSealed", label: "Телефон" },
    { field: "notesSealed", label: "Заметки" },
  ],
  order: [
    { field: "customerNameSealed", label: "Имя" },
    { field: "customerEmailSealed", label: "Эл. почта" },
    { field: "shippingAddressSealed", label: "Адрес доставки" },
  ],
  giftCard: [
    { field: "recipientNameSealed", label: "Имя получателя" },
    { field: "recipientEmailSealed", label: "Эл. почта получателя" },
    { field: "messageSealed", label: "Подарочное послание" },
    { field: "purchaserEmailSealed", label: "Кто купил" },
  ],
  subscriber: [{ field: "emailSealed", label: "Эл. почта" }],
  stockAlert: [{ field: "emailSealed", label: "Эл. почта" }],
  abandonedCart: [{ field: "emailSealed", label: "Эл. почта" }],
  referrer: [{ field: "emailSealed", label: "Эл. почта" }],
};

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) {
    return NextResponse.json({ error: "Это может делать только Studio." }, { status: 403 });
  }

  const limited = rateLimit(`studio-reveal:${clientIp(req)}`, 120, 60 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов — подождите немного и попробуйте снова." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  const token = typeof body?.token === "string" ? body.token : null;

  if (!id || !token) {
    return NextResponse.json(
      { error: "Войдите в Studio и попробуйте ещё раз." },
      { status: 400 }
    );
  }

  if (!(await isProjectMember(token))) {
    return NextResponse.json(
      { error: "Этот вход в Studio не относится к участникам проекта." },
      { status: 403 }
    );
  }

  // Drafts carry a prefix; either version of the document will do
  const doc = await sanityWriteClient.fetch<Record<string, unknown> | null>(
    `*[_id == $id || _id == "drafts." + $id][0]`,
    { id: id.replace(/^drafts\./, "") }
  );

  if (!doc) {
    return NextResponse.json({ error: "Этого документа больше нет." }, { status: 404 });
  }

  const shape = SEALED_FIELDS[String(doc._type)];
  if (!shape) {
    return NextResponse.json({ error: "В этом документе нет зашифрованных данных." }, { status: 400 });
  }

  const fields = shape
    .map(({ field, label }) => ({ label, value: open(doc[field] as string | undefined) }))
    .filter((f): f is { label: string; value: string } => !!f.value);

  // A gift card's code is sealed the same way, and this is the only place it
  // can be read back — worth having when a recipient says it never arrived.
  if (doc._type === "giftCard") {
    const code = revealCode(doc as { codeSealed?: string });
    if (code) fields.unshift({ label: "Код", value: code });
  }

  // A Friends link code is sealed the same way — for when someone asks
  // Kristina "what was my link again?"
  if (doc._type === "referrer") {
    const code = revealReferralCode(doc as { codeSealed?: string });
    if (code) fields.unshift({ label: "Код ссылки", value: code });
  }

  if (fields.length === 0) {
    return NextResponse.json(
      { error: "Здесь нечего прочитать: документ создан до шифрования или ключ DATA_SECRET поменялся." },
      { status: 404 }
    );
  }

  return NextResponse.json({ fields });
}
