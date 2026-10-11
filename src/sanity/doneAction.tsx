import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import {
  GROUPS,
  LABEL_COLOURS,
  MAX_LINES,
  PHRASES,
  careLabelOf,
  careLineProblem,
  holdTogether,
  lineText,
  ownGroups,
  parseCm,
  phraseOf,
  type CareLabel,
  type CareLine,
  type GroupKey,
  type Phrase,
} from "@/lib/careLabel";
import { sameLine, whyNotDone } from "@/lib/markDone";
import { instantOf } from "@/lib/slots";
import { askSite, useDiaryToken } from "./diaryClient";
import { chipStyle, primaryButton, secondaryButton, slotInRussian } from "./SlotPicker";

/**
 * «✓ Работа готова» on a confirmed booking (11.10.2026): the job is done and
 * the piece has gone home.
 *
 * Kristina picks one or two lines for the care label in the thank-you email —
 * in Russian, with the centimetres tapped in — sees the label as the customer
 * will, and presses once. The booking becomes «Выполнена» with its label in
 * the same write, and the thank-you goes straight away (/api/studio/done):
 * the email is sent only once, so a line picked after it would never arrive.
 *
 * The phrases for the booking's own service come first; the rest wait under
 * «Другие работы». No line is also an answer: the label then says what is
 * true of any job of that kind (see @/lib/careLabel).
 *
 * On a booking already marked «Выполнена» by its radio, while its thank-you
 * has not gone, the same dialog adds the label before it does.
 */

export interface DoneDoc {
  _rev?: string;
  _type?: string;
  status?: string;
  notifiedStatus?: string;
  displayName?: string;
  service?: string;
  emailSealed?: string;
  replyNote?: string;
  slotStart?: string;
  /** A time agreed in words, with no slot in the diary */
  confirmedFor?: string;
  releasedAt?: string;
  careLabel?: CareLine[];
}

/** A line as she is filling it in: the phrase, and the numbers as typed */
export interface Typed {
  phrase: string | null;
  a: string;
  b: string;
}

const EMPTY: Typed = { phrase: null, a: "", b: "" };

/** The clock, read once when the dialog opens — a function, so the render stays pure */
function clock(): number {
  return Date.now();
}

/** A line as the booking will keep it, or what is wrong with it; an empty one is no line */
export function lineFrom(typed: Typed): { line: CareLine | null; problem: string | null } {
  if (!typed.phrase) return { line: null, problem: null };
  const line: CareLine = { phrase: typed.phrase };
  for (const name of ["a", "b"] as const) {
    const text = typed[name].trim();
    if (!text) continue;
    const value = parseCm(text);
    if (value === null) return { line: null, problem: "Впишите число сантиметров — например, 4 или 1,5." };
    line[name] = value;
  }
  const problem = careLineProblem(line);
  return problem ? { line: null, problem } : { line, problem: null };
}

const inputStyle: CSSProperties = {
  font: "inherit",
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  width: 110,
  boxSizing: "border-box",
};

const groupTitle: CSSProperties = { fontSize: 12, fontWeight: 600, opacity: 0.75, margin: "0 0 6px" };

function PhraseChips({ phrases, onPick }: { phrases: readonly Phrase[]; onPick: (key: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {phrases.map((phrase) => (
        <button key={phrase.key} type="button" style={chipStyle(false)} onClick={() => onPick(phrase.key)}>
          {phrase.chip}
        </button>
      ))}
    </div>
  );
}

/** One line of the label: its phrase from the groups, then the numbers it asks for */
function LinePicker({
  typed,
  service,
  number,
  onChange,
  onRemove,
}: {
  typed: Typed;
  service: string | undefined;
  number: number;
  onChange: (typed: Typed) => void;
  onRemove: (() => void) | null;
}) {
  const phrase = phraseOf(typed.phrase);
  const own = ownGroups(service);
  const byGroup = (key: GroupKey) => PHRASES.filter((p) => p.group === key);
  const titleOf = (key: GroupKey) => GROUPS.find((group) => group.key === key)?.ru ?? key;
  const rest = GROUPS.map((group) => group.key).filter((key) => !own.includes(key));
  const { problem } = lineFrom(typed);

  if (!phrase) {
    const pick = (key: string) => onChange({ phrase: key, a: "", b: "" });
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
          {number === 1 ? "Что сделано" : "Вторая строка"}
          {onRemove && (
            <button type="button" style={{ ...secondaryButton, marginLeft: 10, padding: "3px 8px", fontSize: 12 }} onClick={onRemove}>
              убрать
            </button>
          )}
        </p>
        {own.map((key) => (
          <div key={key}>
            <p style={groupTitle}>{titleOf(key)}</p>
            <PhraseChips phrases={byGroup(key)} onPick={pick} />
          </div>
        ))}
        {own.length > 0 ? (
          <details>
            <summary style={{ fontSize: 13, cursor: "pointer" }}>Другие работы</summary>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {rest.map((key) => (
                <div key={key}>
                  <p style={groupTitle}>{titleOf(key)}</p>
                  <PhraseChips phrases={byGroup(key)} onPick={pick} />
                </div>
              ))}
            </div>
          </details>
        ) : (
          rest.map((key) => (
            <div key={key}>
              <p style={groupTitle}>{titleOf(key)}</p>
              <PhraseChips phrases={byGroup(key)} onPick={pick} />
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{number === 1 ? "Что сделано" : "Вторая строка"}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={chipStyle(true)}>{phrase.chip}</span>
        <button type="button" style={{ ...secondaryButton, padding: "5px 10px" }} onClick={() => onChange(EMPTY)}>
          Другая строка
        </button>
        {onRemove && (
          <button type="button" style={{ ...secondaryButton, padding: "5px 10px" }} onClick={onRemove}>
            Убрать
          </button>
        )}
      </div>
      {(["a", "b"] as const).map((name) =>
        phrase[name] ? (
          <label key={name} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input
              style={inputStyle}
              inputMode="decimal"
              value={typed[name]}
              placeholder="см"
              onChange={(e) => onChange({ ...typed, [name]: e.target.value })}
            />
            <span>
              см — {phrase[name]!.ru}
            </span>
          </label>
        ) : null
      )}
      {problem && typed.a.trim() !== "" && (
        <p role="alert" style={{ fontSize: 13, margin: 0, color: "#c0392b" }}>
          {problem}
        </p>
      )}
    </div>
  );
}

/** Written as a code, not typed: an invisible character in the source is refused (sourceHygiene.test.ts) */
const NO_BREAK = String.fromCharCode(160);

/** The label as the email draws it — the same colours and type, in the dialog */
function LabelPreview({ label }: { label: CareLabel }) {
  const { band, stitch, small, ink, line } = LABEL_COLOURS;
  const caps: CSSProperties = { fontSize: 10, lineHeight: "14px", letterSpacing: 2, color: small };
  return (
    <div style={{ background: band, padding: 5, maxWidth: 280, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <div
        style={{
          border: `1px dashed ${stitch}`,
          padding: "16px 18px 14px",
          textAlign: "center",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <p style={{ ...caps, margin: "0 0 10px" }}>BEAUTASY · SOUTHAMPTON</p>
        <p style={{ margin: "0 0 8px", fontSize: 18, lineHeight: "24px", fontStyle: "italic", color: ink }}>{label.maker}</p>
        {label.lines.map((text, k) => (
          <p key={k} style={{ margin: `0 0 ${k === label.lines.length - 1 ? 12 : 6}px`, fontSize: 14, lineHeight: "20px", color: line }}>
            {holdTogether(text, NO_BREAK)}
          </p>
        ))}
        <p style={{ ...caps, margin: 0 }}>{label.month.toUpperCase()}</p>
      </div>
    </div>
  );
}

/**
 * Where the dialog stands, from what she has filled in: the whole lines, a
 * picked line still missing its numbers (its own words say what is missing),
 * the same line twice, and the label as the customer would see it.
 */
export function dialogState(typed: Typed[], doc: DoneDoc, now: number) {
  const parsed = typed.map(lineFrom);
  const lines = parsed.map((p) => p.line).filter((line): line is CareLine => line !== null);
  const pending = parsed.find((p, k) => typed[k].phrase && p.problem)?.problem ?? null;
  const twice = lines.length === 2 && sameLine(lines[0], lines[1]);
  return {
    lines,
    pending,
    twice,
    unfinished: Boolean(pending) || twice,
    label: careLabelOf({ displayName: doc.displayName, service: doc.service, careLabel: lines }, new Date(now)),
  };
}

/** What she is told once it is done — the dialog is gone by then. A look with no line went without a label */
export function doneMessage(data: Record<string, unknown>, labelled: boolean): string {
  if (data.emailed) return `✓ Готово. Клиенту ушло письмо «спасибо»${labelled ? " с биркой" : ""} и просьбой об отзыве.`;
  if (data.hadEmail) {
    return `✓ Запись выполнена. Письмо сейчас не ушло — сайт отправит его утром${labelled ? ", с этой биркой" : ""}.`;
  }
  return "✓ Запись выполнена. Эл. почты в заявке нет, поэтому письма не будет.";
}

/** The dialog itself: plain props, so it can be drawn and checked outside the Studio */
export function DoneDialog({
  id,
  doc,
  token,
  onClose,
}: {
  id: string;
  doc: DoneDoc;
  token: string | null;
  onClose: () => void;
}) {
  const [openedAt] = useState(clock);
  const [typed, setTyped] = useState<Typed[]>(() => {
    const kept = (doc.careLabel ?? []).filter((line) => !careLineProblem(line)).slice(0, MAX_LINES);
    return kept.length
      ? kept.map((line) => ({ phrase: line.phrase, a: line.a ? String(line.a).replace(".", ",") : "", b: line.b ? String(line.b).replace(".", ",") : "" }))
      : [EMPTY];
  });
  const [clearNote, setClearNote] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The booking may be replaced under the dialog; an answer after that has nowhere to show
  const shown = useRef(true);
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
    };
  }, []);

  const { lines, pending, twice, unfinished, label } = dialogState(typed, doc, openedAt);
  const hasEmail = Boolean(doc.emailSealed);
  const ahead = doc.slotStart ? instantOf(doc.slotStart).getTime() > openedAt : false;
  // Read as one sentence: "По-русски: укорочено на 6 см…; пояс ушит…"
  const russian = (lines.map((line) => lineText(line, "ru")).filter(Boolean) as string[]).map(
    (text) => text.charAt(0).toLowerCase() + text.slice(1)
  );

  const setLine = (k: number, next: Typed) => setTyped((all) => all.map((one, i) => (i === k ? next : one)));
  const removeLine = (k: number) => setTyped((all) => (all.length > 1 ? all.filter((_, i) => i !== k) : [EMPTY]));

  async function finish() {
    if (busy || unfinished) return;
    setBusy(true);
    setError(null);
    const reply = await askSite("/api/studio/done", token, {
      id,
      rev: doc._rev,
      lines,
      clearNote: Boolean(doc.replyNote) && clearNote,
    });
    if (reply.ok) {
      onClose();
      window.alert(doneMessage(reply.data, label !== null));
      return;
    }
    const message = String(reply.data.error ?? "Не удалось отметить работу готовой.");
    if (!shown.current) {
      window.alert(message);
      return;
    }
    setBusy(false);
    setError(message);
  }

  return (
    <div style={{ display: "grid", gap: 16, padding: 4 }}>
      <p style={{ fontSize: 13, margin: 0, opacity: 0.8, lineHeight: 1.5 }}>
        Нажимайте, когда вещь снова у клиента — забрал сам или вы отвезли.{" "}
        {hasEmail
          ? "Сразу уйдёт письмо «спасибо»: бирка с тем, что вы сделали, просьба об отзыве в Google и ссылка «Give £5, get £5»."
          : "Эл. почты в заявке нет, поэтому письма не будет — запись просто станет «Выполнена»."}
      </p>
      {ahead && doc.slotStart && (
        <p role="alert" style={{ fontSize: 13, margin: 0, color: "#b9770e" }}>
          Время ещё впереди: {slotInRussian(doc.slotStart)}. Отмечайте работу готовой, когда вещь вернётся к клиенту.
        </p>
      )}
      {!doc.slotStart && doc.status === "confirmed" && (
        <p role="alert" style={{ fontSize: 13, margin: 0, color: "#b9770e", lineHeight: 1.5 }}>
          {doc.confirmedFor
            ? `Время записано словами: «${doc.confirmedFor}» — в дневнике его нет, и сайт не знает, прошёл ли визит.`
            : "Время визита не записано."}{" "}
          Отмечайте, только если вещь уже у клиента.
        </p>
      )}

      {typed.map((one, k) => (
        <LinePicker
          key={k}
          typed={one}
          service={doc.service}
          number={k + 1}
          onChange={(next) => setLine(k, next)}
          onRemove={k > 0 ? () => removeLine(k) : null}
        />
      ))}
      {typed.length < MAX_LINES && lines.length === typed.length && lines.length > 0 && (
        <div>
          <button type="button" style={secondaryButton} onClick={() => setTyped((all) => [...all, EMPTY])}>
            + Вторая строка
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: 8, borderTop: "1px solid rgba(128,128,128,0.25)", paddingTop: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Так клиент увидит бирку в письме</p>
        {pending || twice ? (
          <p role="alert" style={{ fontSize: 13, margin: 0, lineHeight: 1.5, color: "#c0392b" }}>
            {twice
              ? "Эта строка уже на бирке — уберите вторую или впишите другие числа."
              : `${pending} Тогда здесь появится бирка — так, как её увидит клиент.`}
          </p>
        ) : label ? (
          <>
            <LabelPreview label={label} />
            <p style={{ fontSize: 12, margin: 0, opacity: 0.75, lineHeight: 1.5 }}>
              {russian.length
                ? `По-русски: ${russian.join("; ")}.`
                : "Строка не выбрана — на бирке общая строка для этой услуги. Лучше выберите, что именно сделано: это и есть смысл бирки."}
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Бирки не будет: в заявке не названа работа, и строка не выбрана. Если работа была — выберите, что сделано.
          </p>
        )}
      </div>

      {doc.replyNote && hasEmail && (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5 }}>
          <input type="checkbox" checked={clearNote} onChange={(e) => setClearNote(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            Убрать «Сообщение клиенту» — иначе оно попадёт и в это письмо: «{doc.replyNote}»
          </span>
        </label>
      )}

      {error && (
        <p role="alert" style={{ fontSize: 14, margin: 0, color: "#c0392b" }}>
          {error}
        </p>
      )}
      <div>
        <button type="button" style={primaryButton(!busy && !unfinished)} disabled={busy || unfinished} onClick={finish}>
          {busy
            ? "Сохраняем…"
            : twice
            ? "Уберите повтор выше"
            : unfinished
            ? "Допишите числа выше"
            : hasEmail
            ? "✓ Готово — отправить «спасибо»"
            : "✓ Отметить «Выполнена»"}
        </button>
      </div>
    </div>
  );
}

export const doneAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Document actions are components rendered by Sanity; the lower-case name is
  // Sanity's convention, which is why the rule needs telling — see revealAction.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const token = useDiaryToken();

  const doc = props.published as (DoneDoc & { _id: string }) | null;
  if (!doc || whyNotDone({ ...doc, _rev: doc._rev ?? "" })) return null;

  const label = doc.status === "completed" ? "✓ Бирка и «спасибо»" : "✓ Работа готова";
  const close = () => {
    setOpen(false);
    props.onComplete();
  };

  return {
    label,
    tone: "positive",
    disabled: Boolean(props.draft),
    title: props.draft
      ? "Сначала опубликуйте или отмените изменения, потом отмечайте работу готовой."
      : "Отмечает запись «Выполнена» и сразу отправляет клиенту «спасибо» с биркой: вы выберете, что сделано.",
    onHandle: () => setOpen(true),
    dialog: open
      ? {
          type: "dialog",
          header: `${label}${doc.displayName ? ` — ${doc.displayName}` : ""}`,
          onClose: close,
          content: <DoneDialog id={props.id} doc={doc} token={token} onClose={close} />,
        }
      : undefined,
  };
};
