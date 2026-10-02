import { sanityWriteClient } from "./sanity";
import { sendEmail } from "./sendEmail";
import { secretsConfigured } from "./secrets";
import { formatPounds, ledgerCsv, periodOf, summarise, todayInSouthampton, type LedgerSummary } from "./ledger";
import { readLedger } from "./ledgerStore";

/**
 * Last month's «Касса», by email, once a month — the books' copy outside the
 * database.
 *
 * 🚨 Why it exists: every entry is sealed with DATA_SECRET, amount and all.
 * A lost or rotated key would make the whole ledger unreadable, and tax
 * records have to be kept for years. Bookings only lose their contact
 * details that way; the books would lose everything. So once a month the
 * month goes, opened, as two spreadsheets to the atelier's own inbox.
 *
 * Runs from the daily cron. Each month is claimed before it is sent — the
 * document `ledgerExport-2026-09` is created first, and only the request that
 * creates it sends — and handed back if the email is refused, so the next
 * morning tries again and nobody gets the same month twice. A month with
 * nothing in it is not sent and not claimed: an entry added for it later
 * still goes out.
 */

const FROM_EMAIL = "Beautasy <orders@beautasy.co.uk>";
const KRISTINA_EMAIL = "hello@beautasy.co.uk";

export function exportIdFor(month: string): string {
  return `ledgerExport-${month}`;
}

export function exportEmailHtml(title: string, summary: LedgerSummary): string {
  const giftCards =
    summary.paidByGiftCard > 0
      ? `<p style="margin:0 0 12px;color:#555;">Ещё ${formatPounds(summary.paidByGiftCard)} оплачено подарочными картами — эти деньги пришли раньше, когда карты купили.</p>`
      : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#faf9f7;font-family:Georgia,serif;color:#2d2d2d;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 32px;">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7a6d9a;">Касса Beautasy</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:400;">${title}</h1>
    <p style="margin:0 0 12px;font-size:16px;">Пришло <strong>${formatPounds(summary.income)}</strong> · ушло <strong>${formatPounds(summary.expense)}</strong> · осталось <strong>${formatPounds(summary.net)}</strong></p>
    ${giftCards}
    <p style="margin:0 0 12px;line-height:1.6;">Во вложении — все строки кассы за месяц. Сохраните письмо: это копия бухгалтерии на случай, если с сайтом что-то случится.</p>
    <p style="margin:0;line-height:1.6;color:#555;font-size:14px;">Два файла с одним и тем же: «uk» открывайте в Google Таблицах, Numbers или английском Excel, «ru» — в Excel на русском.</p>
  </div>
</body></html>`;
}

export type ExportOutcome = "sent" | "already" | "empty" | "unconfigured" | "failed";

export async function sendMonthlyLedgerExport(now: Date = new Date()): Promise<{ month: string; outcome: ExportOutcome }> {
  const period = periodOf("lastMonth", todayInSouthampton(now));
  const month = period.from.slice(0, 7);
  if (!process.env.SANITY_API_WRITE_TOKEN || !process.env.RESEND_API_KEY || !secretsConfigured()) {
    return { month, outcome: "unconfigured" };
  }

  const id = exportIdFor(month);
  if (await sanityWriteClient.fetch<string | null>(`*[_id == $id][0]._id`, { id })) {
    return { month, outcome: "already" };
  }

  const { entries } = await readLedger(period.from, period.to);
  if (entries.length === 0) return { month, outcome: "empty" };

  // The claim: only the request that creates this document sends the email
  try {
    await sanityWriteClient.create({ _id: id, _type: "ledgerExport", month, claimedAt: now.toISOString() });
  } catch {
    return { month, outcome: "already" };
  }

  const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
  try {
    await sendEmail({
      from: FROM_EMAIL,
      to: KRISTINA_EMAIL,
      subject: `Касса Beautasy: ${period.title.toLowerCase()} — таблица`,
      html: exportEmailHtml(period.title, summarise(entries)),
      attachments: [
        { filename: `beautasy-kassa-${month}-uk.csv`, content: base64(ledgerCsv(entries, "uk")), contentType: "text/csv" },
        { filename: `beautasy-kassa-${month}-ru.csv`, content: base64(ledgerCsv(entries, "ru")), contentType: "text/csv" },
      ],
    });
    return { month, outcome: "sent" };
  } catch (error) {
    console.error("The monthly ledger copy was not sent:", error instanceof Error ? error.message : error);
    // Hand the month back, so tomorrow's run tries again
    try {
      await sanityWriteClient.delete(id);
    } catch (release) {
      console.error(`Could not hand back ${id}; that month will not be retried:`, release instanceof Error ? release.message : release);
    }
    return { month, outcome: "failed" };
  }
}
