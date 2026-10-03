import { useClient } from "sanity";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { sanityConfig } from "@/lib/sanity";
import { count } from "@/lib/studioStats";
import { studioToken } from "./studioToken";

/**
 * "Написать клиенту сейчас" (Email the customer now) — a button on orders and
 * atelier bookings.
 *
 * Publishing a change in the Studio doesn't reach the shop's server, so a
 * confirmed booking used to wait for the nightly job before the customer heard
 * anything. This asks the site to send whatever is due, straight away.
 *
 * Only enabled when there is actually something to send: the status has to be
 * one that emails, and the customer must not have been told about it already.
 *
 * The request carries the Studio's own session token, as «Показать контакты»
 * and the diary do (see studioToken.ts): /api/notify asks Sanity whether the
 * person pressing is someone who edits this project before it sends anything.
 */

/** Hoisted: useClient memoises on the options object's reference — see dashboardTool.tsx */
const CLIENT_OPTIONS = { apiVersion: sanityConfig.apiVersion };

const NO_SESSION =
  "Не удалось найти вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз.";

const ORDER_NOTIFIABLE = ["in-production", "shipped", "delivered"];
const BOOKING_NOTIFIABLE = ["confirmed", "declined", "cancelled", "completed"];

interface StatusDoc {
  _type?: string;
  status?: string;
  notifiedStatus?: string;
}

function pendingEmail(doc: StatusDoc | null): boolean {
  if (!doc?.status) return false;
  const notifiable = doc._type === "order" ? ORDER_NOTIFIABLE : BOOKING_NOTIFIABLE;
  return notifiable.includes(doc.status) && doc.notifiedStatus !== doc.status;
}

export const notifyCustomerAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Sanity renders document actions as React components, so hooks belong here;
  // the rule fires only because the convention names them `xAction`.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const client = useClient(CLIENT_OPTIONS);
  const doc = (props.draft ?? props.published) as StatusDoc | null;
  const published = props.published as StatusDoc | null;

  // A draft that hasn't been published yet isn't what the site will read
  const hasUnpublishedChanges = !!props.draft;
  const due = pendingEmail(published);

  return {
    label: hasUnpublishedChanges ? "Письмо — после публикации" : "Написать клиенту сейчас",
    tone: "primary",
    disabled: hasUnpublishedChanges || !due,
    title: hasUnpublishedChanges
      ? "Сначала опубликуйте изменения — сайт читает только опубликованную версию."
      : due
      ? "Сразу отправляет клиенту письмо с подтверждением или новым статусом."
      : doc?.status
      ? "Отправлять нечего: клиенту уже написали об этом статусе."
      : "Пока отправлять нечего.",
    onHandle: async () => {
      const token = studioToken(client.config().token);
      if (!token) {
        window.alert(NO_SESSION);
        props.onComplete();
        return;
      }
      try {
        const res = await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        // A refusal is not "nothing to send": say what the site said
        if (!res.ok) {
          window.alert(
            typeof data?.error === "string" ? data.error : "Сайт не отправил письмо. Оно уйдёт само ночью."
          );
          props.onComplete();
          return;
        }
        const sent =
          (data?.bookings?.sent ?? 0) + (data?.orders?.sent ?? 0);
        window.alert(
          sent > 0
            ? `Отправлено ${count(sent, "письмо", "письма", "писем")}. Клиент в курсе.`
            : "Отправлять было нечего — клиенту уже написали об этом статусе."
        );
      } catch {
        window.alert("Не удалось связаться с сайтом. Письмо отправится само ночью.");
      }
      props.onComplete();
    },
  };
};
