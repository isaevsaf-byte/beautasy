import { useState, type CSSProperties } from "react";
import { useRouter } from "sanity/router";
import { ATELIER_SERVICES } from "@/lib/atelierServices";
import { askDiary, useDiaryToken, useFreeTimes } from "./diaryClient";
import { SlotPicker, primaryButton, secondaryButton, slotInRussian } from "./SlotPicker";

/**
 * "Записать вручную" (Book by hand) — for someone who got in touch on
 * WhatsApp, by phone or on Nextdoor.
 *
 * Those bookings never reached the diary, so the site kept offering their
 * times, and a customer booking online could take the same one. This writes
 * the booking through the same claim the site uses (see @/lib/diary), so the
 * time is closed online the moment it is saved. The notice customers must
 * give does not apply: Kristina has just agreed the time with the person.
 */

/**
 * The services as the Studio names them. The values stay English — they are
 * what the booking stores, and what the customer's email and the site show —
 * so the Studio gets a Russian title per value, and diaryStudio.test.ts fails
 * the day a service is added to ATELIER_SERVICES without one here.
 */
export const SERVICE_TITLES: Record<string, string> = {
  Alterations: "Подгонка по фигуре",
  Repairs: "Ремонт одежды",
  "Custom Sewing": "Индивидуальный пошив",
  "Home Textiles": "Шторы и домашний текстиль",
  "Other / Not Sure": "Другое / пока не знаю",
};

const inputStyle: CSSProperties = {
  font: "inherit",
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 13 };

interface Booked {
  id: string;
  label: string;
  emailed: boolean;
  withEmail: boolean;
}

export function ManualBookingPane() {
  const token = useDiaryToken();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const times = useFreeTimes(token, attempt);

  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [service, setService] = useState(ATELIER_SERVICES[0]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);

  const ready = Boolean(slot) && name.trim().length >= 2 && !busy;

  async function book() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const reply = await askDiary(token, { action: "book", slot, name, phone, email, service, notes });
    setBusy(false);
    if (!reply.ok) {
      setError(String(reply.data.error ?? "Не удалось записать."));
      if (reply.data.slotTaken) {
        setSlot(null);
        setAttempt((n) => n + 1);
      }
      return;
    }
    setBooked({
      id: String(reply.data.id),
      // The time the diary says it booked, in Kristina's words; the English
      // label beside it is kept for anything older that only sends that.
      label: typeof reply.data.slot === "string" ? slotInRussian(reply.data.slot) : String(reply.data.label),
      emailed: Boolean(reply.data.emailed),
      withEmail: email.trim().length > 0,
    });
  }

  function startAgain() {
    setBooked(null);
    setSlot(null);
    setName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setService(ATELIER_SERVICES[0]);
    setAttempt((n) => n + 1);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "24px 24px 64px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Запись клиента вручную</h1>
          <p style={{ fontSize: 14, margin: 0, opacity: 0.75, lineHeight: 1.5 }}>
            Для тех, кто написал в WhatsApp, позвонил или связался через Nextdoor. Как только вы
            запишете клиента, это время закроется на сайте — больше никто его не займёт.
          </p>
        </div>

        {booked ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ fontSize: 15, margin: 0 }}>
              ✓ <strong>{name.trim()}</strong> — запись на <strong>{booked.label}</strong>. Это время на
              сайте закрыто.
            </p>
            <p style={{ fontSize: 13, margin: 0, opacity: 0.75 }}>
              {booked.emailed
                ? "Клиенту ушло письмо со временем и приглашением в календарь."
                : booked.withEmail
                ? "Письмо сейчас не отправилось — сайт отправит его утром."
                : "Эл. почту не указали, поэтому сообщите клиенту время сами."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                style={primaryButton(true)}
                onClick={() => router.navigateIntent("edit", { id: booked.id, type: "atelierBooking" })}
              >
                Открыть запись
              </button>
              <button type="button" style={secondaryButton} onClick={startAgain}>
                Записать ещё кого-то
              </button>
            </div>
          </div>
        ) : (
          <>
            <section style={{ display: "grid", gap: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Когда</h2>
              {times.state === "loading" && <p style={{ fontSize: 14, margin: 0 }}>Загружаем дневник записей…</p>}
              {times.state === "failed" && (
                <p style={{ fontSize: 14, margin: 0 }}>
                  {times.message}{" "}
                  <button type="button" style={secondaryButton} onClick={() => setAttempt((n) => n + 1)}>
                    Попробовать снова
                  </button>
                </p>
              )}
              {times.state === "ready" && !times.enabled && (
                <p style={{ fontSize: 14, margin: 0 }}>
                  Онлайн-запись выключена в разделе «Часы для примерок», поэтому на сайте никто записаться
                  не может и защищать нечего. Включите её, чтобы записи попадали в дневник.
                </p>
              )}
              {times.state === "ready" && times.enabled && (
                <SlotPicker days={times.days} value={slot} onChange={setSlot} />
              )}
            </section>

            <section style={{ display: "grid", gap: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Кто</h2>
              <label style={labelStyle}>
                Имя
                <input id="manual-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Телефон (по желанию)
                <input id="manual-phone" style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Эл. почта (по желанию — придёт подтверждение и приглашение в календарь)
                <input
                  id="manual-email"
                  type="email"
                  style={inputStyle}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label style={labelStyle}>
                Услуга
                <select id="manual-service" style={inputStyle} value={service} onChange={(e) => setService(e.target.value)}>
                  {ATELIER_SERVICES.map((option) => (
                    <option key={option} value={option}>
                      {SERVICE_TITLES[option] ?? option}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                Заметки (по желанию, видите только вы)
                <textarea
                  id="manual-notes"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </section>

            {error && (
              <p role="alert" style={{ fontSize: 14, margin: 0, color: "#c0392b" }}>
                {error}
              </p>
            )}

            <div>
              <button type="button" style={primaryButton(ready)} disabled={!ready} onClick={book}>
                {busy ? "Записываем…" : slot ? `Записать на ${slotInRussian(slot)}` : "Выберите время выше"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
