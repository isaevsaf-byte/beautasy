import { useState } from "react";
import { useClient } from "sanity";
import type { DocumentActionComponent, DocumentActionProps } from "sanity";
import { sanityConfig } from "@/lib/sanity";

/**
 * "Show contact details" — reads back what is sealed on a document.
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

/** The session token the Studio is already using for its own requests. */
function studioToken(configToken: string | undefined): string | null {
  if (configToken) return configToken;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`__studio_auth_token_${sanityConfig.projectId}`);
    if (!raw) return null;
    // Stored as JSON in current Studio versions, a bare string in older ones
    try {
      const parsed = JSON.parse(raw) as { token?: string };
      return parsed.token ?? null;
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
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
    label: busy ? "Reading…" : "Show contact details",
    disabled: busy,
    title: "Decrypts this customer's details for you alone — nothing is written back.",
    onHandle: async () => {
      setBusy(true);
      try {
        const token = studioToken(client.config().token);
        if (!token) {
          window.alert(
            "Could not find your Studio session. Sign out and back in to the Studio, then try again."
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
          window.alert(data?.error ?? "Could not read the details.");
          return;
        }
        setFields(data.fields as Field[]);
      } catch {
        window.alert("Could not reach the site. Try again in a moment.");
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
                Shown to you only. Nothing is written back into the document.
              </div>
            </div>
          ),
        }
      : undefined,
  };
};
