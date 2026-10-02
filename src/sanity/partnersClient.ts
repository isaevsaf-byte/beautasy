import { useEffect, useState } from "react";
import type { PartnerSummary, PartnerStatement, PartnerTotals } from "@/lib/partners";

/**
 * The Studio's line to «Партнёры»: /api/studio/partners, spoken with the
 * Studio's own session token (see diaryClient.ts for why that token). A
 * partner's email and phone are sealed and its clients' payments are in
 * «Касса», so the Studio reads and writes partners only through here.
 */

export interface PartnersReply {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

export async function askPartners(token: string | null, body: Record<string, unknown>): Promise<PartnersReply> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: { error: "Не удалось найти вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз." },
    };
  }
  try {
    const res = await fetch("/api/studio/partners", {
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

export function errorOf(reply: PartnersReply, fallback: string): string {
  return typeof reply.data.error === "string" ? reply.data.error : fallback;
}

/** What the programme gives right now: the client's £ off, the partner's credit, and whether it is on. */
export interface Offer {
  enabled: boolean;
  discount: number;
  credit: number;
}

export function offerOf(reply: PartnersReply): Offer | null {
  const o = reply.data.offer as Partial<Offer> | undefined;
  return o && typeof o.discount === "number" && typeof o.credit === "number" ? { enabled: o.enabled !== false, discount: o.discount, credit: o.credit } : null;
}

export interface PartnerOption {
  id: string;
  name: string;
  kind: string;
  active: boolean;
}

export function optionsOf(reply: PartnersReply): PartnerOption[] {
  return Array.isArray(reply.data.partners) ? (reply.data.partners as PartnerOption[]) : [];
}

/** The partners to pick from, read once; none until they arrive, and none if they cannot be read. */
export function usePartnerOptions(token: string | null): PartnerOption[] {
  const [options, setOptions] = useState<PartnerOption[]>([]);
  useEffect(() => {
    let abandoned = false;
    void askPartners(token, { action: "options" }).then((reply) => {
      if (!abandoned && reply.ok) setOptions(optionsOf(reply));
    });
    return () => {
      abandoned = true;
    };
  }, [token]);
  return options;
}

export type PartnerRow = PartnerSummary & { totals: PartnerTotals; allTime: PartnerTotals };

export function rowsOf(reply: PartnersReply): PartnerRow[] {
  return Array.isArray(reply.data.partners) ? (reply.data.partners as PartnerRow[]) : [];
}

export interface PartnerDetails {
  month: string;
  thisMonth: string;
  partner: PartnerSummary & { email: string | null; phone: string | null };
  statement: PartnerStatement;
  credit: { balance: number; expiresAt?: string; code: string | null } | null;
  report: string;
}

/** The whole answer, or null when it is not the shape a statement has. */
export function detailsOf(reply: PartnersReply): PartnerDetails | null {
  const d = reply.data as Partial<PartnerDetails>;
  return d.partner && d.statement && typeof d.month === "string" ? (d as PartnerDetails) : null;
}

export interface Attribution {
  partnerId: string | null;
  referredBy: string | null;
  friendLink: boolean;
  decided: boolean;
  status: string | null;
}

export function attributionFrom(reply: PartnersReply): Attribution | null {
  const a = reply.data.attribution as Attribution | undefined;
  return a && typeof a === "object" ? a : null;
}
