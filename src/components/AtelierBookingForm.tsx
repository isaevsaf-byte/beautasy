"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, CalendarClock } from "lucide-react";
import { trackLead } from "@/lib/analytics";

/**
 * Google Ads conversion for a fitting request. Create a "Lead" conversion in
 * Google Ads and paste its label here (looks like "AW-18152477897/AbCdEfGh").
 * Until then GA4 and Meta still get the event; only the Ads conversion waits.
 */
const ADS_LEAD_CONVERSION: string | undefined = undefined;

const SERVICES = [
  "Alterations",
  "Repairs",
  "Custom Sewing",
  "Home Textiles",
  "Other / Not Sure",
];

const FIELD_CLASS =
  "w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20";

interface Slot {
  start: string;
  label: string;
}
interface SlotDay {
  date: string;
  label: string;
  slots: Slot[];
}

/**
 * Booking a fitting.
 *
 * When Kristina has filled in her opening hours the form offers real times and
 * confirms one on the spot; until then it asks for a preferred date and she
 * replies by hand, exactly as before. That fallback is the point — the shop
 * must never end up with a booking form that offers nothing.
 *
 * `defaultService` lets a landing page name the job it is about — a request
 * from the wedding page arrives in the Studio as "Wedding Dress Alterations"
 * rather than a generic "Alterations", so Kristina can see which page is
 * actually bringing work in without opening analytics.
 */
export default function AtelierBookingForm({
  defaultService,
}: {
  defaultService?: string;
} = {}) {
  const options =
    defaultService && !SERVICES.includes(defaultService)
      ? [defaultService, ...SERVICES]
      : SERVICES;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState(defaultService ?? SERVICES[0]);
  const [preferredDate, setPreferredDate] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // The diary
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [confirmedFor, setConfirmedFor] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    try {
      const res = await fetch("/api/atelier/slots", { cache: "no-store" });
      const data = await res.json();
      const available: SlotDay[] = data?.bookable ? data.days ?? [] : [];
      setDays(available);
      setActiveDate((current) =>
        current && available.some((d) => d.date === current) ? current : available[0]?.date ?? null
      );
      setSlot((current) =>
        current && available.some((d) => d.slots.some((s) => s.start === current)) ? current : null
      );
    } catch {
      // No diary is the same as no diary configured: ask for a date instead
      setDays([]);
    }
  }, []);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const bookable = !!days && days.length > 0;
  const day = days?.find((d) => d.date === activeDate) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (bookable && !slot) {
      setError("Please choose a time.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/atelier-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          service,
          notes,
          ...(slot ? { slot } : { preferredDate }),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data?.slotTaken) {
          // Somebody got there first — show the diary as it is now
          setSlot(null);
          await loadSlots();
        }
        throw new Error(data.error || "Failed to send request");
      }

      setConfirmedFor(data.confirmedFor ?? null);
      setStatus("done");
      trackLead({ service, adsConversionLabel: ADS_LEAD_CONVERSION });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="flex flex-col items-center text-center py-8" role="status">
        <CheckCircle2 size={36} className="text-lavender mb-4" aria-hidden="true" />
        {confirmedFor ? (
          <>
            <p className="font-serif text-xl mb-2">You&apos;re booked in</p>
            <p className="text-sm text-charcoal mb-1 font-medium">{confirmedFor}</p>
            <p className="text-sm text-charcoal-light max-w-sm">
              A confirmation is on its way to your inbox. Reply to it if you need to move the time.
            </p>
          </>
        ) : (
          <>
            <p className="font-serif text-xl mb-2">Request sent!</p>
            <p className="text-sm text-charcoal-light max-w-sm">
              We&apos;ll confirm your appointment by email or WhatsApp shortly.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
      {/* ── Pick a time ──
          min-w-0 matters more than it looks: a grid item will not shrink below
          its own content, so without it the strip of days stretches the whole
          form instead of scrolling inside it, and takes the page sideways. */}
      {bookable && (
        <fieldset className="sm:col-span-2 min-w-0 border-0 p-0 m-0">
          <legend className="flex items-center gap-2 text-xs tracking-wider uppercase text-charcoal-light mb-3">
            <CalendarClock size={14} aria-hidden="true" />
            Choose a time
          </legend>

          <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2 -mx-1 px-1">
            {days!.map((d) => {
              const active = d.date === activeDate;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => setActiveDate(d.date)}
                  aria-pressed={active}
                  className={`shrink-0 px-4 py-2 rounded-full border text-xs font-medium transition-colors ${
                    active
                      ? "bg-lavender border-lavender text-charcoal"
                      : "bg-white border-lavender-soft/50 text-charcoal-light hover:border-lavender"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          {day && (
            <div className="flex flex-wrap gap-2 mt-3">
              {day.slots.map((s) => {
                const active = s.start === slot;
                return (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => {
                      setSlot(s.start);
                      setError(null);
                      if (status === "error") setStatus("idle");
                    }}
                    aria-pressed={active}
                    className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                      active
                        ? "bg-lavender border-lavender text-charcoal shadow-sm"
                        : "bg-white border-lavender-soft/50 text-charcoal hover:border-lavender hover:bg-lavender/10"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-charcoal-light mt-3">
            Times are Southampton time, and yours is held the moment you book. Nothing suits?{" "}
            <a
              href="https://wa.me/447729741116"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-charcoal"
            >
              Ask on WhatsApp
            </a>
            .
          </p>
        </fieldset>
      )}

      <div className="sm:col-span-1">
        <label htmlFor="booking-name" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">Name</label>
        <input
          id="booking-name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="booking-email" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">Email</label>
        <input
          id="booking-email"
          name="email"
          autoComplete="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="booking-phone" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
          Phone <span className="normal-case text-charcoal-light/70">(optional)</span>
        </label>
        <input
          id="booking-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={FIELD_CLASS}
        />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="booking-service" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">Service</label>
        <select
          id="booking-service"
          name="service"
          value={service}
          onChange={(e) => setService(e.target.value)}
          className={FIELD_CLASS}
        >
          {options.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Only worth asking when there is no diary to pick from */}
      {!bookable && (
        <div className="sm:col-span-1">
          <label htmlFor="booking-date" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
            Preferred Date <span className="normal-case text-charcoal-light/70">(optional)</span>
          </label>
          <input
            id="booking-date"
            name="preferredDate"
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
      )}

      <div className="sm:col-span-2">
        <label htmlFor="booking-notes" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
          Notes <span className="normal-case text-charcoal-light/70">(optional)</span>
        </label>
        <textarea
          id="booking-notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tell us about the garment and what you need done..."
          className={`${FIELD_CLASS} resize-none`}
        />
      </div>

      <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 disabled:opacity-60"
        >
          {status === "loading" && <Loader2 size={16} className="animate-spin" />}
          {status === "loading"
            ? "Sending..."
            : bookable
            ? "Book This Time"
            : "Request Booking"}
        </button>
        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-red-500"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
