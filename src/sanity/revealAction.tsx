import { useState } from "react";
import { useClient } from "sanity";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { sanityConfig } from "@/lib/sanity";
import { studioToken } from "./studioToken";

/**
 * "Показать контакты" (Show contact details) — reads back what is sealed on a
 * document.
 *
 * Customer names, emails, phone numbers and addresses are sealed in Sanity
 * because the dataset is readable by anyone (see @/lib/pii). The Studio has no
 * key, so it asks the site, which checks that the person asking is a member of
 * this Sanity project before it decrypts anything.
 *
 * The details are shown, not stored: nothing is written back into the
 * document, so the dataset stays free of readable customer data.
 */

interface Field {
  label: string;
  value: string;
}

export const revealContactAction: DocumentActionComponent = (props: DocumentActionProps) => {
  // Sanity renders document actions as React components, so hooks belong here.
  // The rule only fires because the convention names them `xAction` rather
  // than starting with a capital letter — same suppression as socialActions.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [fields, setFields] = useState<Field[] | null>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const client = useClient({ apiVersion: sanityConfig.apiVersion });

  return {
    label: busy ? "Загрузка…" : "Показать контакты",
    disabled: busy,
    title: "Расшифровывает контакты клиента только для вас — в документ ничего не записывается.",
    onHandle: async () => {
      setBusy(true);
      try {
        const token = studioToken(client.config().token);
        if (!token) {
          window.alert(
            "Не удалось найти вашу сессию Studio. Выйдите из Studio, войдите снова и попробуйте ещё раз."
          );
          return;
        }

        const res = await fetch("/api/studio/reveal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: props.id, token }),
        });
        const data = await res.json();

        if (!res.ok) {
          window.alert(data?.error ?? "Не удалось прочитать контакты.");
          return;
        }
        setFields(data.fields as Field[]);
      } catch {
        window.alert("Не удалось связаться с сайтом. Попробуйте ещё раз через минуту.");
      } finally {
        setBusy(false);
      }
    },
    dialog: fields
      ? {
          type: "popover",
          onClose: () => {
            setFields(null);
            props.onComplete();
          },
          content: (
            <div style={{ padding: 16, minWidth: 280, maxWidth: 420 }}>
              {fields.map((field) => (
                <div key={field.label} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      opacity: 0.6,
                      marginBottom: 2,
                    }}
                  >
                    {field.label}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-line", userSelect: "text" }}>
                    {field.value}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
                Видно только вам. В документ ничего не записывается.
              </div>
            </div>
          ),
        }
      : undefined,
  };
};
