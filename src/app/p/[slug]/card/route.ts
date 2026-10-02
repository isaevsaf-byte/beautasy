import type { NextRequest } from "next/server";
import { findPartnerBySlug } from "@/lib/partnerStore";
import { cardUnavailableHtml, collectionLine, partnerCardHtml } from "@/lib/partnerCard";
import { referralSettings } from "@/lib/referrals";
import { collectionSettings } from "@/lib/siteSettings";
import { pounds } from "@/lib/friendsLink";
import { isPartnerSlug, partnerLink } from "@/lib/partners";

export const dynamic = "force-dynamic";

/**
 * GET /p/<slug>/card — a partner's business card, ready to print;
 * /p/<slug>/card?size=a6 — the card for their counter.
 *
 * Opened from the Studio's «Партнёры». Everything on it is printed for the
 * public anyway — the salon's name, its link and the £5 offer — so it needs
 * no session; it is kept out of search engines all the same.
 */
function page(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "no-store",
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const size = req.nextUrl.searchParams.get("size") === "a6" ? "a6" : "card";
  const partner = isPartnerSlug(slug) ? await findPartnerBySlug(slug).catch(() => null) : null;
  if (!partner) return page(cardUnavailableHtml("Такого партнёра нет. Проверьте ссылку в разделе «Партнёры»."), 404);
  if (partner.active === false) {
    return page(
      cardUnavailableHtml(
        `«${partner.partner.name}» на паузе: ссылка на карточке сейчас не даёт скидку. Включите партнёра в «Партнёры», потом печатайте.`
      ),
      409
    );
  }
  // The offer is printed as the settings have it today — a card outlives its print run
  const [settings, collection] = await Promise.all([referralSettings(), collectionSettings()]);
  if (!settings.enabled) {
    return page(
      cardUnavailableHtml("Программа «Beautasy Friends» выключена в «Настройках сайта» — ссылка на карточке сейчас не даёт скидку."),
      409
    );
  }
  if (settings.friendAtelierDiscount <= 0) {
    return page(cardUnavailableHtml("Скидка за друга в «Настройках сайта» — £0: карточке нечего обещать."), 409);
  }
  const offer = { discount: pounds(settings.friendAtelierDiscount), collection: collectionLine(collection) };
  return page(partnerCardHtml({ salon: partner.partner.name, slug, url: partnerLink(slug), size, offer, toolbar: true }));
}
