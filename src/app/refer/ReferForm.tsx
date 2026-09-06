"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import FriendsShare from "@/components/FriendsShare";

type Status = "idle" | "loading" | "done" | "error";

const FIELD_CLASS =
  "w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20";

/**
 * "Get my link": a first name and an email. The link is shown here at once
 * and emailed too, so it is never lost. Nobody needs an account for this —
 * the email is the identity, exactly as with the review links.
 */
export default function ReferForm() {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, email, company }),
      });
      const data = await res.json();
      if (!res.ok || !data.code) {
        setStatus("error");
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setCode(data.code);
      setEmailed(!!data.emailed);
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="bg-lavender-bg rounded-3xl p-7 sm:p-9">
      <AnimatePresence mode="wait">
        {status === "done" && code ? (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="font-serif text-2xl mb-2">Your link is ready{firstName.trim() ? `, ${firstName.trim()}` : ""}</h2>
            <p className="text-sm text-charcoal-light leading-relaxed mb-6">
              {emailed
                ? "We've emailed it to you as well, so it's never lost."
                : "Keep it somewhere handy — it's yours for good."}
            </p>
            <FriendsShare code={code} />
          </motion.div>
        ) : (
          <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleSubmit}>
            <h2 className="font-serif text-2xl mb-2">Get your link</h2>
            <p className="text-sm text-charcoal-light leading-relaxed mb-6">
              Your first name goes on the link, so friends see who sent it.
            </p>
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
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="refer-name" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
                  First name
                </label>
                <input
                  id="refer-name"
                  name="firstName"
                  autoComplete="given-name"
                  required
                  maxLength={40}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label htmlFor="refer-email" className="block text-xs tracking-wider uppercase text-charcoal-light mb-1.5">
                  Email
                </label>
                <input
                  id="refer-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-6">
              <button
                type="submit"
                disabled={status === "loading"}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 disabled:opacity-60"
              >
                {status === "loading" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {status === "loading" ? "One moment…" : "Get my link"}
              </button>
              {error && (
                <p role="alert" className="text-xs text-red-500">
                  {error}
                </p>
              )}
            </div>
            <p className="text-[11px] text-charcoal-light mt-4 leading-relaxed">
              We use your email to send you the link and to tell you when a friend has used it. Nothing else.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
