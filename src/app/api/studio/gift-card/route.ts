import { NextRequest, NextResponse } from "next/server";
import { sanityWriteClient } from "@/lib/sanity";
import { isProjectMember } from "@/lib/studioMember";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { secretsConfigured } from "@/lib/secrets";
import { CARD_TRIES, CARD_WINDOW_MS, judgeCard, readCard, type CardDesk } from "@/lib/atelierGiftCardStore";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/gift-card — { token, code } → what is on that card.
 *
 * Asked by «💷 Записать оплату» while Kristina types the code a client shows
 * her, so she sees "На карте £40.00 — после оплаты останется £24.50" before
 * she saves. It reads; it never charges. The charge happens with the ledger
 * line, in /api/studio/ledger, which checks the card again.
 *
 * Guarded like /api/studio/reveal — a member of the project, from the Studio —
 * and more tightly limited: an answer here says whether a code is a real
 * card, and a real card is money, so this must not become a way to try codes
 * one after another. The allowance is shared with saving a card payment.
 *
 * What comes back is the balance and the last four characters, both already
 * public in the dataset. Never the card's code, never who it belongs to.
 */

function answer(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) return answer(403, "Это может делать только Studio.");

  const limited = rateLimit(`studio-gift-card:${clientIp(req)}`, CARD_TRIES, CARD_WINDOW_MS);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Слишком много проверок карт подряд — подождите немного и попробуйте снова." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const code = typeof body?.code === "string" ? body.code.slice(0, 80) : "";

  if (!(await isProjectMember(token))) {
    return answer(401, "Не удалось проверить вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз.");
  }
  if (!code.trim()) return answer(400, "Напишите код карты.");
  if (!process.env.SANITY_API_WRITE_TOKEN || !secretsConfigured()) {
    return answer(503, "Проверить карту сейчас нельзя — на сайте не хватает ключей. Сообщите Сафару.");
  }

  let verdict;
  try {
    verdict = judgeCard(await readCard(sanityWriteClient as unknown as CardDesk, code));
  } catch (error) {
    console.error("A gift card could not be read for the atelier:", error instanceof Error ? error.message : error);
    return answer(503, "Не удалось проверить карту. Попробуйте через минуту.");
  }
  if (!verdict.ok) return answer(verdict.status, verdict.error);
  return NextResponse.json({ card: verdict.look });
}
