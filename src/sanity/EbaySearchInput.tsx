import React from "react";
import type { StringInputProps } from "sanity";
import { ebaySearchUrl } from "@/lib/supplies";

/**
 * The English words for a thing, with the eBay search they make right under
 * them — built from the words as they are now, so editing the words changes
 * the search, and nothing is stored that could go stale.
 */
export function EbaySearchInput(props: StringInputProps) {
  const words = typeof props.value === "string" ? props.value.trim() : "";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {props.renderDefault(props)}
      {words && (
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <a href={ebaySearchUrl(words)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>
            Партии на eBay ↗
          </a>{" "}
          — Великобритания, «Купить сейчас», дешевле с доставкой. В приложении eBay нажмите «Save this search» — eBay сам напишет, когда появится новая партия.
        </div>
      )}
    </div>
  );
}
