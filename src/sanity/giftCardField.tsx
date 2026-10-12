import { useEffect, useState, type CSSProperties } from "react";
import { canonicalCode, cardLine, codeLooksComplete, type CardLook } from "@/lib/atelierGiftCard";
import { askSite } from "./diaryClient";

/**
 * «Код карты» — the field a payment by gift card asks for, in «Записать
 * оплату» and in «Касса».
 *
 * As Kristina types the code off the client's phone, the site is asked what
 * is on that card (/api/studio/gift-card) and the answer sits under the
 * field: "На карте £40.00 — после оплаты останется £24.50", or why it cannot
 * pay. Nothing is charged here. The card is checked again and charged on the
 * server when she saves, together with the ledger line.
 *
 * Browser code: it never sees a card's code other than the one typed, and
 * never imports anything that holds a key.
 */

export type CardCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "failed"; message: string }
  | { state: "found"; look: CardLook };

/** What is on the card typed, asked half a second after typing stops and only once the code is whole. */
export function useGiftCardCheck(token: string | null, code: string, enabled: boolean): CardCheck {
  const wanted = enabled && codeLooksComplete(code) ? canonicalCode(code) : null;
  const [answer, setAnswer] = useState<{ code: string; check: CardCheck } | null>(null);

  useEffect(() => {
    if (!wanted) return;
    let abandoned = false;
    const timer = setTimeout(() => {
      void askSite("/api/studio/gift-card", token, { code: wanted }).then((reply) => {
        if (abandoned) return;
        const look = reply.data.card as CardLook | undefined;
        setAnswer({
          code: wanted,
          check:
            reply.ok && look
              ? { state: "found", look }
              : { state: "failed", message: typeof reply.data.error === "string" ? reply.data.error : "Не удалось проверить карту." },
        });
      });
    }, 500);
    return () => {
      abandoned = true;
      clearTimeout(timer);
    };
  }, [token, wanted]);

  if (!wanted) return { state: "idle" };
  return answer && answer.code === wanted ? answer.check : { state: "checking" };
}

/** True when the card is found and covers this amount — the only time a card payment may be saved. */
export function cardCovers(check: CardCheck, pence: number | null): boolean {
  return check.state === "found" && pence !== null && pence <= check.look.available;
}

const OUT = "#c0392b";

export function GiftCardField({
  id,
  code,
  check,
  pence,
  onCode,
  inputStyle,
  labelStyle,
}: {
  id: string;
  code: string;
  check: CardCheck;
  pence: number | null;
  onCode: (code: string) => void;
  inputStyle: CSSProperties;
  labelStyle: CSSProperties;
}) {
  const line =
    check.state === "found"
      ? cardLine(check.look, pence)
      : check.state === "failed"
        ? { text: check.message, ok: false }
        : check.state === "checking"
          ? { text: "Проверяем карту…", ok: true }
          : { text: "Код из письма клиента: BEAUTASY и восемь букв и цифр. Большие или маленькие буквы, пробелы и тире — неважно.", ok: true };
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={labelStyle}>
        Код карты
        <input
          id={id}
          autoComplete="off"
          spellCheck={false}
          placeholder="BEAUTASY-XXXX-XXXX"
          style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: 1 }}
          value={code}
          onChange={(e) => onCode(e.target.value)}
        />
        <span
          aria-live="polite"
          role={line.ok ? undefined : "alert"}
          style={{ fontSize: 13, color: line.ok ? undefined : OUT, opacity: check.state === "idle" || check.state === "checking" ? 0.7 : 1 }}
        >
          {check.state === "found" && <strong>Карта …{check.look.hint}. </strong>}
          {line.text}
        </span>
      </label>
      <p style={{ fontSize: 13, margin: 0, opacity: 0.75 }}>
        Когда нажмёте «Записать», оплата спишется с карты сама. В «Пришло» она не войдёт: деньги за карту пришли, когда её
        купили. Если цена больше, чем на карте, — запишите здесь столько, сколько на карте, а остальное второй оплатой
        другим способом.
      </p>
    </div>
  );
}
