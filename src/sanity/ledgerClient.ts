import type { LedgerEntry } from "@/lib/ledger";

/**
 * The Studio's line to «Касса»: /api/studio/ledger, spoken with the Studio's
 * own session token (see diaryClient.ts for why that token, and studioToken.ts
 * for where it lives). The Studio can neither seal an entry nor open one —
 * only the server has the key — so every read and write goes through here.
 */

export interface LedgerReply {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

export async function askLedger(token: string | null, body: Record<string, unknown>): Promise<LedgerReply> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: { error: "Не удалось найти вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз." },
    };
  }
  try {
    const res = await fetch("/api/studio/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Не удалось связаться с сайтом. Проверьте интернет и попробуйте ещё раз." } };
  }
}

/** The entries in a reply, or none — never a half-read shape that breaks the page. */
export function entriesOf(reply: LedgerReply): LedgerEntry[] {
  return Array.isArray(reply.data.entries) ? (reply.data.entries as LedgerEntry[]) : [];
}

export function errorOf(reply: LedgerReply, fallback: string): string {
  return typeof reply.data.error === "string" ? reply.data.error : fallback;
}
