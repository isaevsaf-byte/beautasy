"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";

type Status = "idle" | "loading" | "done" | "error";

/**
 * Email capture with a welcome discount.
 *
 * The shop had no way at all to collect an email address, which for a
 * made-to-order brand meant every visitor who wasn't ready to buy was gone for
 * good. The code is created in Stripe on first signup and redeemable at
 * checkout straight away.
 */
export default function NewsletterSignup({ source = "footer" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, company }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("done");
      setMessage(
        data.alreadySubscribed
          ? "You're already on the list 💜"
          : "Check your inbox for your code 💜"
      );
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div>
      <p className="text-sm tracking-eyebrow uppercase text-charcoal-light mb-3">
        10% off your first order
      </p>
      <p className="text-sm text-charcoal-light leading-relaxed mb-4 max-w-xs">
        New pieces, atelier news and a welcome code. No noise.
      </p>

      {/* initial={false}: the form is there from the first paint. Without it
          the form was sent from the server at opacity 0, so every page's
          footer had an invisible signup until the scripts had loaded. Only
          the swap to the thank-you line animates. */}
      <AnimatePresence mode="wait" initial={false}>
        {status === "done" ? (
          <motion.p
            key="done"
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            // Charcoal, with the tick in the brand's darker lavender: the
            // green it was in failed contrast on the cream footer
            className="flex items-center gap-2 text-sm text-charcoal font-medium"
          >
            <CheckCircle2 size={16} className="text-lavender-ink shrink-0" aria-hidden="true" />
            {message}
          </motion.p>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={handleSubmit}
            className="flex flex-col gap-2 max-w-xs"
          >
            {/* Honeypot — hidden from people, catnip for bots */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              aria-hidden="true"
              className="hidden"
            />
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                aria-label="Email address"
                // The saved address offered as you tap, and a Send key
                autoComplete="email"
                enterKeyHint="send"
                className="flex-1 min-w-0 text-sm px-4 py-2.5 rounded-full border border-lavender-soft/60 bg-white/70 text-charcoal placeholder:text-charcoal-light/50 focus:outline-none focus:border-lavender-ink focus:ring-2 focus:ring-lavender-ink/25"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="press shrink-0 px-5 py-2.5 rounded-full bg-lavender text-charcoal text-xs tracking-wider uppercase font-medium hover:bg-lavender-hover disabled:opacity-60 flex items-center gap-1.5"
              >
                {status === "loading" && <Loader2 size={13} className="animate-spin" />}
                Join
              </button>
            </div>
            {status === "error" && (
              <p role="alert" className="text-xs text-rose-700">{message}</p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
