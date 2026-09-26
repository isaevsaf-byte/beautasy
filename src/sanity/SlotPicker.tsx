import { useState, type CSSProperties } from "react";
import type { SlotDay } from "@/lib/slots";

/**
 * Pick a day, then a time — the diary's free slots, as the Studio shows them.
 * Plain buttons and inline styles, like the Studio's other panels, so it
 * looks right in the light and the dark theme without a design system.
 */

export const ACCENT = "#6c5a96";

export function chipStyle(selected: boolean): CSSProperties {
  return {
    font: "inherit",
    fontSize: 13,
    padding: "6px 10px",
    borderRadius: 6,
    border: `1px solid ${selected ? ACCENT : "rgba(128,128,128,0.35)"}`,
    background: selected ? ACCENT : "transparent",
    color: selected ? "#fff" : "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

export const primaryButton = (enabled: boolean): CSSProperties => ({
  font: "inherit",
  fontSize: 14,
  fontWeight: 600,
  padding: "10px 16px",
  borderRadius: 6,
  border: "none",
  background: ACCENT,
  color: "#fff",
  cursor: enabled ? "pointer" : "default",
  opacity: enabled ? 1 : 0.45,
});

export const secondaryButton: CSSProperties = {
  font: "inherit",
  fontSize: 13,
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};

/** "Tue 6 Oct" — a day chip has to be short to fit a row of them. */
export function shortDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function SlotPicker({
  days,
  value,
  onChange,
}: {
  days: SlotDay[];
  value: string | null;
  onChange: (slot: string) => void;
}) {
  const [picked, setPicked] = useState(() =>
    Math.max(0, days.findIndex((day) => value?.startsWith(day.date)))
  );

  if (days.length === 0) {
    return (
      <p style={{ fontSize: 14, opacity: 0.75, margin: 0 }}>
        No free times in the next few weeks. Check the hours in Fitting Times.
      </p>
    );
  }

  const day = days[Math.min(picked, days.length - 1)];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        role="group"
        aria-label="Day"
        style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}
      >
        {days.map((option, index) => (
          <button
            key={option.date}
            type="button"
            aria-pressed={option.date === day.date}
            onClick={() => setPicked(index)}
            style={chipStyle(option.date === day.date)}
          >
            {shortDay(option.date)}
          </button>
        ))}
      </div>
      <div role="group" aria-label={`Times on ${day.label}`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {day.slots.map((slot) => (
          <button
            key={slot.start}
            type="button"
            aria-pressed={slot.start === value}
            onClick={() => onChange(slot.start)}
            style={chipStyle(slot.start === value)}
          >
            {slot.label}
          </button>
        ))}
      </div>
    </div>
  );
}
