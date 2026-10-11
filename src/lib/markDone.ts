import { MAX_LINES, careLineProblem, type CareLine } from "@/lib/careLabel";

/**
 * What «✓ Работа готова» checks before it marks a booking «Выполнена»
 * (src/app/api/studio/done/route.ts): which bookings it may finish, and the
 * care label's lines as the booking will keep them. A module of its own, so
 * the tests can ask it, and the route file exports only what Next allows.
 */

export interface DoneBooking {
  _id: string;
  _rev: string;
  _type?: string;
  status?: string;
  notifiedStatus?: string;
  emailSealed?: string;
  releasedAt?: string;
}

/** The same line twice: one phrase with the same numbers — the label would say it twice */
export function sameLine(one: CareLine, other: CareLine): boolean {
  return one.phrase === other.phrase && (one.a ?? null) === (other.a ?? null) && (one.b ?? null) === (other.b ?? null);
}

/** The lines as the booking keeps them — keys and numbers only — or what is wrong with them */
export function linesFrom(value: unknown): { ok: true; lines: CareLine[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, lines: [] };
  if (!Array.isArray(value) || value.length > MAX_LINES) return { ok: false, error: "На бирке помещается одна или две строки." };
  const lines: CareLine[] = [];
  for (const item of value) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const line: CareLine = { phrase: String(raw.phrase ?? "") };
    for (const name of ["a", "b"] as const) {
      if (raw[name] === undefined || raw[name] === null) continue;
      if (typeof raw[name] !== "number") return { ok: false, error: "Число на бирке пришло не числом — выберите строку заново." };
      line[name] = raw[name] as number;
    }
    const problem = careLineProblem(line);
    if (problem) return { ok: false, error: problem };
    if (lines.some((kept) => sameLine(kept, line))) {
      return { ok: false, error: "Эта строка уже на бирке — уберите вторую или впишите другие числа." };
    }
    lines.push(line);
  }
  return { ok: true, lines };
}

/** Whether this booking may be finished, or still given its label — and, if not, why */
export function whyNotDone(doc: DoneBooking | null): string | null {
  if (!doc || doc._type !== "atelierBooking") return "Запись не найдена — возможно, её удалили.";
  if (doc.releasedAt) return "Время этой записи уже занял другой клиент — отметить её выполненной нельзя.";
  if (doc.status === "completed") {
    // Without an email no thank-you is owed, so there is nothing a label could travel with
    if (!doc.emailSealed) return "Запись уже выполнена, а эл. почты в ней нет — письма «спасибо» не будет.";
    return doc.notifiedStatus === "completed" ? "Письмо «спасибо» уже ушло — бирку больше не изменить." : null;
  }
  if (doc.status !== "confirmed") return "Выполненной можно отметить только подтверждённую запись.";
  return null;
}

