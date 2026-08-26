"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Gift } from "lucide-react";
import { fadeUp, stagger } from "@/components/animations";

const PRESETS = [2500, 5000, 10000];
const MIN = 1000;
const MAX = 50000;

/**
 * Buying a gift card.
 *
 * Sold as a real balance rather than a one-shot discount code: spend £28 of a
 * £50 card and £22 stays on it. The buyer picks who it goes to and, if it's for
 * a birthday, the morning it should arrive.
 */
export default function GiftCardPurchase() {
  const [amount, setAmount] = useState<number>(5000);
  const [custom, setCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [deliverAt, setDeliverAt] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customPence = Math.round(parseFloat(custom.replace(",", ".")) * 100);
  const chosenAmount = useCustom ? customPence : amount;
  const customValid =
    !useCustom || (Number.isFinite(customPence) && customPence >= MIN && customPence <= MAX);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customValid) {
      setError("Choose an amount between £10 and £500");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/gift-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: chosenAmount,
          recipientEmail,
          recipientName,
          message,
          deliverAt: deliverAt || undefined,
          company,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not start checkout");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not start checkout. Please try again.");
      setLoading(false);
    }
  }

  return (
    <motion.form
      initial="hidden"
      animate="visible"
      variants={stagger}
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto"
    >
      {/* Honeypot */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        className="hidden"
      />

      <motion.fieldset variants={fadeUp} custom={0} className="mb-8">
        <legend className="text-sm tracking-[0.2em] uppercase text-charcoal-light mb-4">
          Amount
        </legend>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((preset) => {
            const active = !useCustom && amount === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setUseCustom(false);
                  setAmount(preset);
                }}
                aria-pressed={active}
                className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                  active
                    ? "bg-lavender border-lavender text-charcoal shadow-sm"
                    : "bg-white border-lavender-soft/50 text-charcoal hover:border-lavender"
                }`}
              >
                £{preset / 100}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setUseCustom(true)}
            aria-pressed={useCustom}
            className={`py-3 rounded-xl border text-sm font-medium transition-all ${
              useCustom
                ? "bg-lavender border-lavender text-charcoal shadow-sm"
                : "bg-white border-lavender-soft/50 text-charcoal hover:border-lavender"
            }`}
          >
            Other
          </button>
        </div>

        {useCustom && (
          <div className="mt-3">
            <label className="block">
              <span className="block text-[11px] tracking-wider uppercase text-charcoal-light mb-1">
                Your amount (£10–£500)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={custom}
                onChange={(e) => setCustom(e.target.value.slice(0, 6))}
                placeholder="e.g. 75"
                className="w-full text-sm px-4 py-2.5 rounded-xl border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
              />
            </label>
            {!customValid && custom !== "" && (
              <p className="text-xs text-rose-500 mt-1.5">Between £10 and £500, please</p>
            )}
          </div>
        )}
      </motion.fieldset>

      <motion.div variants={fadeUp} custom={1} className="space-y-4 mb-8">
        <label className="block">
          <span className="block text-[11px] tracking-wider uppercase text-charcoal-light mb-1">
            Send it to <span className="text-rose-400">*</span>
          </span>
          <input
            type="email"
            required
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="their@email.com"
            className="w-full text-sm px-4 py-2.5 rounded-xl border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] tracking-wider uppercase text-charcoal-light mb-1">
            Their name
          </span>
          <input
            type="text"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value.slice(0, 60))}
            placeholder="So we can greet them properly"
            className="w-full text-sm px-4 py-2.5 rounded-xl border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] tracking-wider uppercase text-charcoal-light mb-1">
            Your message
          </span>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 300))}
            placeholder="Happy birthday, choose something you love…"
            className="w-full text-sm px-4 py-2.5 rounded-xl border border-lavender-soft/50 bg-white resize-none focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
          />
        </label>

        <label className="block">
          <span className="block text-[11px] tracking-wider uppercase text-charcoal-light mb-1">
            Deliver on
          </span>
          <input
            type="date"
            value={deliverAt}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDeliverAt(e.target.value)}
            className="w-full text-sm px-4 py-2.5 rounded-xl border border-lavender-soft/50 bg-white focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20"
          />
          <span className="block text-[11px] text-charcoal-light mt-1">
            Leave empty and it arrives as soon as you&apos;ve paid.
          </span>
        </label>
      </motion.div>

      {error && <p className="text-sm text-rose-500 mb-4">{error}</p>}

      <motion.button
        variants={fadeUp}
        custom={2}
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 hover:shadow-lg hover:shadow-lavender/30 disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
        {customValid && chosenAmount > 0
          ? `Buy gift card — £${(chosenAmount / 100).toFixed(2)}`
          : "Buy gift card"}
      </motion.button>

      <motion.p
        variants={fadeUp}
        custom={3}
        className="text-xs text-charcoal-light text-center mt-4 leading-relaxed"
      >
        Valid for a year · spend it across several orders · nothing to post, it arrives by email
      </motion.p>
    </motion.form>
  );
}
