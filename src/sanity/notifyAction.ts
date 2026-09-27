import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { count } from "@/lib/studioStats";

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
 */

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
      try {
        const res = await fetch("/api/notify", { method: "POST" });
        const data = await res.json();
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
