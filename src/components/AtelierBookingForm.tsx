"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";
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

/**
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/atelier-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, service, preferredDate, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send request");
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
        <p className="font-serif text-xl mb-2">Request sent!</p>
        <p className="text-sm text-charcoal-light max-w-sm">
          We&apos;ll confirm your appointment by email or WhatsApp shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-1">
        <label htmlFor="booking-name" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">Name</label>
        <input
          id="booking-name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
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
          className="w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
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
          className="w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
        />
      </div>
      <div className="sm:col-span-1">
        <label htmlFor="booking-service" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">Service</label>
        <select
          id="booking-service"
          name="service"
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
        >
          {options.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
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
          className="w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
        />
      </div>
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
          className="w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm resize-none focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
        />
      </div>

      <div className="sm:col-span-2 flex items-center gap-4">
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 disabled:opacity-60"
        >
          {status === "loading" && <Loader2 size={16} className="animate-spin" />}
          {status === "loading" ? "Sending..." : "Request Booking"}
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
