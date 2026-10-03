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

/*
 * The Studio's words for a time, in Russian.
 *
 * A slot is a Southampton wall-clock minute with no zone in it,
 * "2026-10-06T14:30". So it is read as though it were UTC and printed back in
 * UTC, which hands the stored digits back unchanged. Printing it in
 * Europe/London instead would move every summer appointment an hour — the
 * zone is already in the digits. The labels the site and the emails use
 * ("Tuesday 6 October at 2:30pm", from @/lib/slots) stay English; these are
 * for Kristina.
 */

/** "вт, 6 окт." — a day chip has to be short to fit a row of them. */
export function shortDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "вторник, 6 октября" */
export function dayInRussian(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "14:30" — a Russian clock has no "pm". */
export function timeInRussian(localMinute: string): string {
  return new Date(`${localMinute}:00Z`).toLocaleTimeString("ru-RU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** "вторник, 6 октября, в 14:30" — the whole appointment, for buttons and messages. */
export function slotInRussian(localMinute: string): string {
  return `${dayInRussian(localMinute.slice(0, 10))}, в ${timeInRussian(localMinute)}`;
}

/** "вторник, 6 октября, 14:00–15:00" — a collection's trip, or a bride's two slots. */
export function spanInRussian(start: string, end: string): string {
  return `${dayInRussian(start.slice(0, 10))}, ${timeInRussian(start)}–${timeInRussian(end)}`;
}

/** "1 час", "1,5 часа" — how long a trip or a fitting takes, in the Studio's words. */
export function tripInRussian(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = minutes / 60;
  if (hours === 1) return "1 час";
  return `${String(hours).replace(".", ",")} часа`;
}

export function SlotPicker({
  days,
  value,
  onChange,
  emptyText = "На ближайшие недели свободного времени нет. Проверьте часы в разделе «Часы для примерок».",
}: {
  days: SlotDay[];
  value: string | null;
  onChange: (slot: string) => void;
  /** What to say when nothing fits — a collection says which trip length to try */
  emptyText?: string;
}) {
  // The day is remembered by its date, not its place in the row: a longer trip
  // drops days that have no room for it, and the row shifts under the index
  const [picked, setPicked] = useState<string | null>(() => value?.slice(0, 10) ?? null);

  if (days.length === 0) {
    return <p style={{ fontSize: 14, opacity: 0.75, margin: 0 }}>{emptyText}</p>;
  }

  const day = days.find((option) => option.date === picked) ?? days[0];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        role="group"
        aria-label="День"
        style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}
      >
        {days.map((option) => (
          <button
            key={option.date}
            type="button"
            aria-pressed={option.date === day.date}
            onClick={() => setPicked(option.date)}
            style={chipStyle(option.date === day.date)}
          >
            {shortDay(option.date)}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label={`Свободное время: ${dayInRussian(day.date)}`}
        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
      >
        {day.slots.map((slot) => (
          <button
            key={slot.start}
            type="button"
            aria-pressed={slot.start === value}
            onClick={() => onChange(slot.start)}
            style={chipStyle(slot.start === value)}
          >
            {timeInRussian(slot.start)}
          </button>
        ))}
      </div>
    </div>
  );
}
