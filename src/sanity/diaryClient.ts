import { useEffect, useState } from "react";
import { useClient } from "sanity";
import { sanityConfig } from "@/lib/sanity";
import type { SlotDay } from "@/lib/slots";
import { studioToken } from "./studioToken";

/**
 * The Studio's line to the diary: /api/studio/diary, spoken with the Studio's
 * own session token, which the site spends on asking Sanity whether this is a
 * member of the project (see @/lib/studioMember). The Studio cannot write a
 * booking itself — contact details are sealed, and only the server has the key.
 */

/** Hoisted: useClient memoises on the options object's reference — see dashboardTool.tsx */
const CLIENT_OPTIONS = { apiVersion: sanityConfig.apiVersion };

export interface DiaryReply {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

export function useDiaryToken(): string | null {
  const client = useClient(CLIENT_OPTIONS);
  return studioToken(client.config().token);
}

export async function askDiary(token: string | null, body: Record<string, unknown>): Promise<DiaryReply> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: { error: "Could not find your Studio session. Sign out and back in to the Studio, then try again." },
    };
  }
  try {
    const res = await fetch("/api/studio/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Could not reach the site. Check you are online, then try again." } };
  }
}

export type FreeTimes =
  | { state: "loading" }
  | { state: "ready"; enabled: boolean; days: SlotDay[] }
  | { state: "failed"; message: string };

/** The free times, read again whenever `attempt` changes. */
export function useFreeTimes(token: string | null, attempt: number): FreeTimes {
  const [times, setTimes] = useState<FreeTimes>({ state: "loading" });
  useEffect(() => {
    let abandoned = false;
    void askDiary(token, { action: "slots" }).then((reply) => {
      if (abandoned) return;
      setTimes(
        reply.ok
          ? { state: "ready", enabled: Boolean(reply.data.enabled), days: (reply.data.days as SlotDay[]) ?? [] }
          : { state: "failed", message: String(reply.data.error ?? "Could not read the diary.") }
      );
    });
    return () => {
      abandoned = true;
    };
  }, [token, attempt]);
  return times;
}
