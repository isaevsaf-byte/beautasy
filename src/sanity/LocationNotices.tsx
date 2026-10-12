"use client";

import { useEffect, useState } from "react";
import type { LayoutProps } from "sanity";
import { onLocationNotice, type LocationNotice } from "@/sanity/cleanUploads";

/**
 * The Studio's word to Kristina when an upload had its location taken out
 * (see cleanUploads.ts): a short calm note, not an alarm — nothing went
 * wrong, the Studio did its job. And a plain way forward on the rare photo it
 * could not clean and so did not upload.
 *
 * The Uploader that cleans files lives outside React and can't show anything
 * itself, so it announces and this listens. It wraps the whole Studio layout,
 * so it hears every field in every document.
 *
 * Why its own little card and not a Sanity toast: useToast lives in
 * @sanity/ui, which is not a dependency of this project (see the note in
 * dashboardTool.tsx). A dark card with light text reads the same on the
 * Studio's light theme and its dark one.
 */

const TEXT: Record<LocationNotice["kind"], { title: string; description: string; seconds: number }> = {
  cleaned: {
    title: "Место съёмки убрано из фото",
    description: "В файле было записано, где сделан снимок. Загружена копия без этого.",
    seconds: 6,
  },
  refused: {
    title: "Фото не загружено",
    description:
      "В нём записано место съёмки, и убрать его в этом браузере не получилось. Попробуйте загрузить в Safari или сохраните копию без места съёмки: на iPhone «Поделиться» → «Параметры» вверху → выключите «Геопозиция». Или отдайте фото Сафару.",
    seconds: 30,
  },
};

const STACK: React.CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 16,
  zIndex: 1000000,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxWidth: "min(420px, calc(100vw - 32px))",
};

const CARD: React.CSSProperties = {
  background: "#1f1f24",
  color: "#f4f4f6",
  borderRadius: 6,
  padding: "12px 14px",
  boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
  fontSize: 13,
  lineHeight: 1.45,
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
};

type Shown = LocationNotice & { id: number };

let nextId = 0;

function LocationNotices() {
  const [shown, setShown] = useState<Shown[]>([]);
  useEffect(
    () =>
      onLocationNotice((notice) => {
        const id = nextId++;
        setShown((list) => [...list, { ...notice, id }]);
        setTimeout(() => setShown((list) => list.filter((item) => item.id !== id)), TEXT[notice.kind].seconds * 1000);
      }),
    [],
  );
  if (shown.length === 0) return null;
  return (
    <div style={STACK} role="status" aria-live="polite">
      {shown.map((item) => {
        const { title, description } = TEXT[item.kind];
        return (
          <div key={item.id} style={{ ...CARD, borderLeft: `4px solid ${item.kind === "refused" ? "#e8a33d" : "#5aa469"}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>
              <div style={{ opacity: 0.85 }}>
                {item.name}: {description}
              </div>
            </div>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => setShown((list) => list.filter((other) => other.id !== item.id))}
              style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0, opacity: 0.7 }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function LocationNoticesLayout(props: LayoutProps) {
  return (
    <>
      <LocationNotices />
      {props.renderDefault(props)}
    </>
  );
}
