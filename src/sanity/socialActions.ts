import { useDocumentOperation } from "sanity";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";

/**
 * The two buttons on a social post.
 *
 * "Одобрить" (Approve) is the only gate that matters — nothing reaches
 * Instagram without it — so it is one click, and it says what will happen next
 * rather than naming a status.
 */

/**
 * The publisher's own reasons, as "Выложить в Instagram" shows them.
 *
 * They are written in English in @/lib/socialQueue and must stay so there:
 * the same words are stored on the post as “Что пошло не так” and read by the
 * watchdog. So the Studio translates the ones it knows as they arrive, and
 * anything else — Instagram's own refusals above all — is shown as it came,
 * because a guessed translation of an error is worse than the real one.
 */
const REASONS_IN_RUSSIAN: Record<string, string> = {
  "Instagram is not connected": "Instagram не подключён",
  "That post is not approved, or has already gone out": "пост не одобрен или уже опубликован",
  "This Reel has no video uploaded": "к этому Reels не загружено видео",
  "The post has no usable picture": "у поста нет подходящей картинки",
  "Another run is already sending this one": "этот пост уже отправляется",
  "Instagram is still preparing the video — the next run will finish it":
    "Instagram ещё обрабатывает видео — пост выйдет со следующей отправкой",
};

/** The reason in Russian when it is one of ours, as a sentence either way. */
function reasonInRussian(reason: unknown): string {
  const said = String(reason).trim();
  const words = REASONS_IN_RUSSIAN[said] ?? said;
  return /[.!?…]$/.test(words) ? words : `${words}.`;
}

interface PostDoc {
  _id?: string;
  status?: string;
  caption?: string;
  scheduledFor?: string;
  publishedAt?: string;
}

function publishedIdOf(id: string): string {
  return id.replace(/^drafts\./, "");
}

export const approvePostAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Sanity renders document actions as React components, so hooks are correct
  // here — the rule only fires because the convention names them `xAction`
  // rather than starting with a capital letter.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { patch, publish } = useDocumentOperation(props.id, props.type);
  const doc = (props.draft ?? props.published) as PostDoc | null;
  const isDraft = doc?.status === "draft" || doc?.status === "failed";
  const when = doc?.scheduledFor
    ? new Date(doc.scheduledFor).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        timeZone: "Europe/London",
      })
    : null;

  return {
    label: "Одобрить",
    tone: "positive",
    disabled: !isDraft || !doc?.caption,
    title: !doc?.caption
      ? "Сначала напишите подпись."
      : !isDraft
      ? "Этот пост уже одобрен."
      : when
      ? `Пост станет одобренным и выйдет ${when}.`
      : "Пост станет одобренным и выйдет со следующей отправкой — обычно завтра утром.",
    onHandle: () => {
      // Publish as well as patch: the queue reads published documents, so an
      // approval left as a Studio draft would never go out.
      patch.execute([{ set: { status: "approved" } }]);
      publish.execute();
      props.onComplete();
    },
  };
};

export const publishNowAction: DocumentActionComponent = (props: DocumentActionProps) => {
  const published = props.published as PostDoc | null;
  const hasUnpublishedChanges = !!props.draft;
  const ready = published?.status === "approved" && !published?.publishedAt;

  return {
    label: hasUnpublishedChanges ? "Сначала опубликуйте правку" : "Выложить в Instagram",
    tone: "primary",
    disabled: hasUnpublishedChanges || !ready,
    title: hasUnpublishedChanges
      ? "Сначала опубликуйте изменения в Studio — сайт читает только опубликованную версию."
      : ready
      ? "Сразу отправляет пост в Instagram, не дожидаясь даты."
      : published?.publishedAt
      ? "Этот пост уже в Instagram."
      : "Сначала одобрите пост.",
    onHandle: async () => {
      try {
        const res = await fetch("/api/social/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: publishedIdOf(props.id) }),
        });
        const data = await res.json();
        if (data?.skipped) {
          window.alert(`Пост не ушёл: ${reasonInRussian(data.skipped)}`);
        } else if (data?.published > 0) {
          window.alert(
            data.posts?.[0]?.permalink
              ? `Пост вышел в Instagram: ${data.posts[0].permalink}`
              : "Пост вышел в Instagram."
          );
        } else {
          const reason = data?.posts?.[0]?.error;
          window.alert(
            `Выложить не получилось: ${reason ? reasonInRussian(reason) : "неизвестная ошибка."}`
          );
        }
      } catch {
        window.alert("Не удалось связаться с сайтом. Пост уйдёт по расписанию в течение пятнадцати минут.");
      }
      props.onComplete();
    },
  };
};
