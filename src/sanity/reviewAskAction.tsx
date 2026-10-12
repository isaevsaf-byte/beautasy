import { useState } from "react";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { ATELIER_TIME_ZONE } from "@/lib/slots";
import { askSite, useDiaryToken, type DiaryReply } from "./diaryClient";
import { primaryButton, secondaryButton } from "./SlotPicker";

/**
 * «🙏 Попросить отзыв» on a finished booking (12.10.2026): one tap, and
 * WhatsApp opens with a message to the client already written — thanks, a
 * Google review link, signed Kristina. She reads it and presses send herself.
 *
 * The number is sealed, so the site makes the link (/api/studio/review-ask)
 * and stamps the booking; the label then says when she last asked, so the
 * same client is not asked twice by accident.
 *
 * The tab is opened at the tap, before the site answers. A window opened when
 * the answer comes back is no longer the tap's — browsers count it as a
 * pop-up and block it. If the browser blocks even this one, or there is no
 * number to write to, a window shows the link and the words to copy instead.
 */

export interface ReviewAskDoc {
  _id: string;
  status?: string;
  displayName?: string;
  reviewAskedAt?: string;
}

/** "12 окт" — the day she asked, by Southampton's calendar, as the button says it */
export function askedOn(iso: string): string | null {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: ATELIER_TIME_ZONE })
    .format(when)
    .replace(/\s+/g, " ")
    .replace(/\.$/, "");
}

/** The button's words: a second ask says when the first one was */
export function reviewAskLabel(reviewAskedAt: string | undefined): string {
  const day = reviewAskedAt ? askedOn(reviewAskedAt) : null;
  return day ? `🙏 Попросить ещё раз (просили ${day})` : "🙏 Попросить отзыв";
}

/** What the window shows when WhatsApp could not simply open */
export interface AskOutcome {
  message: string;
  url: string | null;
  text: string | null;
}

/**
 * Null when there is nothing to show: the tab is on its way to WhatsApp.
 * Otherwise the reason, with whatever the site did make — a link the browser
 * would not open by itself, or the words with no number to send them to.
 */
export function askOutcome(reply: DiaryReply, tabOpened: boolean): AskOutcome | null {
  const url = typeof reply.data.url === "string" ? reply.data.url : null;
  const text = typeof reply.data.text === "string" ? reply.data.text : null;
  if (reply.ok && url && tabOpened) return null;
  if (reply.ok && url) {
    return { message: "Браузер не дал открыть новую вкладку. Нажмите «Открыть WhatsApp» — сообщение уже написано.", url, text };
  }
  const error = typeof reply.data.error === "string" ? reply.data.error : "Не удалось подготовить сообщение. Попробуйте через минуту.";
  return { message: error, url: null, text: reply.ok ? text : null };
}

/** The window itself: plain props, so it can be drawn and checked outside the Studio */
export function ReviewAskDialog({ outcome }: { outcome: AskOutcome }) {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => setCopied(true),
      () => window.alert("Не удалось скопировать — выделите текст и скопируйте его вручную.")
    );
  };
  return (
    <div style={{ display: "grid", gap: 14, padding: 4 }}>
      <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>{outcome.message}</p>
      {outcome.text && (
        <pre
          style={{
            font: "inherit",
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            userSelect: "text",
            margin: 0,
            padding: 12,
            borderRadius: 6,
            border: "1px solid rgba(128,128,128,0.3)",
          }}
        >
          {outcome.text}
        </pre>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {outcome.url && (
          <a href={outcome.url} target="_blank" rel="noopener noreferrer" style={{ ...primaryButton(true), textDecoration: "none" }}>
            Открыть WhatsApp
          </a>
        )}
        {outcome.text && (
          <button type="button" style={secondaryButton} onClick={() => copy(outcome.text!)}>
            {copied ? "✓ Скопировано" : "Скопировать текст"}
          </button>
        )}
      </div>
    </div>
  );
}

export const reviewAskAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Document actions are components rendered by Sanity; the lower-case name is
  // Sanity's convention, which is why the rule needs telling — see revealAction.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const token = useDiaryToken();

  // A finished job, as published: a draft may be a status not yet decided
  const doc = props.published as ReviewAskDoc | null;
  if (!doc || doc.status !== "completed") return null;

  const close = () => {
    setOutcome(null);
    props.onComplete();
  };

  return {
    label: busy ? "Готовим сообщение…" : reviewAskLabel(doc.reviewAskedAt),
    disabled: busy,
    title:
      "Откроет WhatsApp с готовым сообщением клиентке: спасибо и ссылка на отзыв в Google. Прочитайте и отправьте сами.",
    onHandle: () => {
      if (busy) return;
      // Now, inside the tap — see the note at the top of this file
      const tab = window.open("", "_blank");
      if (tab) {
        // WhatsApp's page has no business reaching back into the Studio
        tab.opener = null;
        try {
          tab.document.title = "WhatsApp…";
          tab.document.body.textContent = "Открываем WhatsApp…";
        } catch {
          // Only words for the wait; an empty tab works just as well
        }
      }
      setBusy(true);
      void askSite("/api/studio/review-ask", token, { id: props.id }).then((reply) => {
        setBusy(false);
        const shown = askOutcome(reply, Boolean(tab));
        if (!shown && tab) {
          tab.location.href = String(reply.data.url);
          props.onComplete();
          return;
        }
        tab?.close();
        setOutcome(shown);
      });
    },
    dialog: outcome
      ? {
          type: "dialog",
          header: `🙏 Отзыв${doc.displayName ? ` — ${doc.displayName}` : ""}`,
          onClose: close,
          content: <ReviewAskDialog outcome={outcome} />,
        }
      : undefined,
  };
};
