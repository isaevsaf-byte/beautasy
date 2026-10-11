import React from "react";
import type { StringInputProps } from "sanity";

/**
 * The usual address field with a button that opens it — Sanity shows a URL as
 * text to edit, and on a phone that means copy, switch apps, paste. Opens in a
 * new tab, so on a phone the Facebook link goes to the Facebook app.
 */
export function OpenLinkInput(props: StringInputProps) {
  const href = typeof props.value === "string" && /^https:\/\//.test(props.value) ? props.value : null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {props.renderDefault(props)}
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
          Открыть ↗
        </a>
      )}
    </div>
  );
}
