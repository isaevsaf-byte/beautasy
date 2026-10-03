import { NextRequest, NextResponse } from "next/server";
import { isProjectMember } from "@/lib/studioMember";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { fromThisSite } from "@/lib/sameOrigin";
import { secretsConfigured } from "@/lib/secrets";
import { todayInSouthampton } from "@/lib/ledger";
import { referralSettings } from "@/lib/referrals";
import {
  isMonth,
  judgePartner,
  monthOf,
  partnerLink,
  partnerReportText,
  partnerStatement,
  type PartnerSummary,
} from "@/lib/partners";
import {
  attributeBooking,
  attributionOf,
  createPartner,
  creditOf,
  findPartnerById,
  isAttributionConflict,
  listPartners,
  partnerContacts,
  partnerTerms,
  readPartnerActivity,
  updatePartner,
  type PartnerRecord,
} from "@/lib/partnerStore";

export const dynamic = "force-dynamic";

/**
 * POST /api/studio/partners — «Партнёры»: the salons and shops that send
 * Kristina their clients.
 *
 *   { token, action: "options" }                       → the partners, for a list to pick from
 *   { token, action: "list", month }                   → each partner and its month
 *   { token, action: "create", partner }               → a new partner and its link
 *   { token, action: "update", id, partner }           → the same, corrected (the link stays)
 *   { token, action: "statement", id, month }          → one partner's month, contacts and credit
 *   { token, action: "forBooking", bookingId }         → who a booking is put down to
 *   { token, action: "attribute", bookingId, partnerId }→ put it down to a partner, or to nobody
 *
 * Why it is a route: a partner's owner, percentage, email and phone are
 * sealed, its clients' payments are sealed in «Касса», and only the server
 * has the key. The
 * Studio's session token is spent on asking Sanity whether the caller is a
 * member of the project — the same door as /api/studio/ledger — before
 * anything is read or written.
 *
 * 🚨 What comes back is opened: partners' contacts, clients' first names,
 * what they paid, a credit code. It goes to the Studio and nowhere else, and
 * nothing here logs it.
 */

/** Every `error` is shown to Kristina as it is, so it is Russian and says what to do. */
function answer(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

const ID = /^[A-Za-z0-9._-]{1,128}$/;

/** A partner for the Studio: its terms opened here, since the pane has no key to open them itself. */
function summaryOf(doc: PartnerRecord): PartnerSummary {
  const terms = partnerTerms(doc);
  return {
    id: doc._id,
    name: doc.partner.name,
    slug: doc.partner.slug,
    kind: doc.partner.kind,
    commissionPercent: terms.commissionPercent,
    ...(terms.contactName ? { contactName: terms.contactName } : {}),
    ...(doc.emailHint ? { emailHint: doc.emailHint } : {}),
    active: doc.active !== false,
    link: partnerLink(doc.partner.slug),
    createdAt: doc.createdAt,
  };
}

function idFrom(value: unknown): string {
  const id = typeof value === "string" ? value.replace(/^drafts\./, "") : "";
  return ID.test(id) ? id : "";
}

export async function POST(req: NextRequest) {
  if (!fromThisSite(req)) return answer(403, "Это может делать только Studio.");

  const limited = rateLimit(`studio-partners:${clientIp(req)}`, 300, 60 * 60 * 1000);
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
    return answer(503, "Партнёры сейчас недоступны — на сайте не хватает ключей. Сообщите Сафару.");
  }

  const thisMonth = monthOf(todayInSouthampton());
  const month = isMonth(body.month) ? body.month : thisMonth;

  try {
    // What the programme gives right now, so the Studio never promises an old £5
    const offerNow = async () => {
      const settings = await referralSettings();
      return { enabled: settings.enabled, discount: settings.friendAtelierDiscount, credit: settings.referrerReward };
    };

    if (body.action === "options") {
      const [partners, offer] = await Promise.all([listPartners(), offerNow()]);
      return NextResponse.json({
        offer,
        partners: partners.map((p) => ({ id: p._id, name: p.partner.name, kind: p.partner.kind, active: p.active !== false })),
      });
    }

    if (body.action === "list") {
      const [partners, offer] = await Promise.all([listPartners(), offerNow()]);
      const activity = await readPartnerActivity(partners.map((p) => p._id));
      return NextResponse.json({
        offer,
        month,
        thisMonth,
        partners: partners.map((p) => {
          const a = activity.get(p._id) ?? { bookings: [], orders: [], rewards: [] };
          const statement = partnerStatement({ month, commissionPercent: partnerTerms(p).commissionPercent, ...a });
          return { ...summaryOf(p), totals: statement.totals, allTime: statement.allTime };
        }),
      });
    }

    if (body.action === "create" || body.action === "update") {
      const verdict = judgePartner(body.partner);
      if (!verdict.ok) return answer(400, verdict.error);

      if (body.action === "create") {
        const made = await createPartner(verdict.value);
        if (made.outcome === "taken") {
          return answer(409, `Ссылка /p/${verdict.value.slug} уже занята другим партнёром — придумайте другую.`);
        }
        const doc = await findPartnerById(made.id);
        return NextResponse.json({ ok: true, partner: doc ? summaryOf(doc) : null });
      }

      const id = idFrom(body.id);
      if (!id) return answer(400, "Какого партнёра изменить?");
      const updated = await updatePartner(id, verdict.value);
      if (updated === "missing") return answer(404, "Этого партнёра больше нет.");
      const doc = await findPartnerById(id);
      return NextResponse.json({ ok: true, partner: doc ? summaryOf(doc) : null });
    }

    if (body.action === "statement") {
      const id = idFrom(body.id);
      const doc = id ? await findPartnerById(id) : null;
      if (!doc) return answer(404, "Этого партнёра больше нет.");
      const [activity, credit] = await Promise.all([readPartnerActivity([doc._id]), creditOf(doc)]);
      const a = activity.get(doc._id) ?? { bookings: [], orders: [], rewards: [] };
      const terms = partnerTerms(doc);
      const statement = partnerStatement({ month, commissionPercent: terms.commissionPercent, ...a });
      return NextResponse.json({
        month,
        thisMonth,
        partner: { ...summaryOf(doc), ...partnerContacts(doc) },
        statement,
        credit,
        report: partnerReportText({
          partner: { name: doc.partner.name, slug: doc.partner.slug, ...terms },
          statement,
          creditBalance: credit?.balance ?? null,
        }),
      });
    }

    if (body.action === "forBooking" || body.action === "attribute") {
      const bookingId = idFrom(body.bookingId);
      if (!bookingId) return answer(400, "Какая запись?");

      if (body.action === "attribute") {
        const partnerId = body.partnerId === null || body.partnerId === "" ? null : idFrom(body.partnerId);
        if (partnerId === "") return answer(400, "Какой партнёр?");
        try {
          const result = await attributeBooking(bookingId, partnerId);
          if (!result.ok) return answer(result.status, result.error);
          return NextResponse.json({ ok: true, message: result.message, attribution: await attributionOf(bookingId) });
        } catch (error) {
          if (isAttributionConflict(error)) {
            return answer(409, "Пока вы выбирали, запись изменилась. Закройте окно, откройте запись заново и попробуйте ещё раз.");
          }
          throw error;
        }
      }

      const attribution = await attributionOf(bookingId);
      if (!attribution) return answer(404, "Этой записи в ателье больше нет.");
      return NextResponse.json({ attribution });
    }
  } catch (error) {
    console.error(`Partners: "${String(body.action)}" failed:`, error instanceof Error ? error.message : error);
    return answer(503, "Не удалось связаться с базой. Попробуйте через минуту.");
  }

  return answer(400, "Неизвестное действие.");
}
