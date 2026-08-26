import type { DocumentActionComponent, DocumentActionProps } from "sanity";

/**
 * "Email the customer now" — a button on orders and atelier bookings.
 *
 * Publishing a change in the Studio doesn't reach the shop's server, so a
 * confirmed booking used to wait for the nightly job before the customer heard
 * anything. This asks the site to send whatever is due, straight away.
 *
 * Only enabled when there is actually something to send: the status has to be
 * one that emails, and the customer must not have been told about it already.
 */

const ORDER_NOTIFIABLE = ["in-production", "shipped", "delivered"];
const BOOKING_NOTIFIABLE = ["confirmed", "declined"];

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
    label: hasUnpublishedChanges ? "Publish first, then email" : "Email the customer now",
    tone: "primary",
    disabled: hasUnpublishedChanges || !due,
    title: hasUnpublishedChanges
      ? "Publish your change first — the site reads the published version."
      : due
      ? "Sends the confirmation or status email straight away."
      : doc?.status
      ? "Nothing to send: the customer has already been emailed about this status."
      : "Nothing to send yet.",
    onHandle: async () => {
      try {
        const res = await fetch("/api/notify", { method: "POST" });
        const data = await res.json();
        const sent =
          (data?.bookings?.sent ?? 0) + (data?.orders?.sent ?? 0);
        window.alert(
          sent > 0
            ? `Sent ${sent} email${sent === 1 ? "" : "s"}. The customer has been told.`
            : "Nothing was due — the customer has already been emailed about this status."
        );
      } catch {
        window.alert("Could not reach the site. The nightly job will send it instead.");
      }
      props.onComplete();
    },
  };
};
