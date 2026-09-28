"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Star, X } from "lucide-react";
import { COMMENT_MAX, COMMENT_MIN, NAME_MAX, REVIEW_TOPICS } from "@/lib/siteReviews";

type Status = "idle" | "loading" | "done" | "error";

const FIELD_CLASS =
  "w-full px-4 py-3 rounded-xl border border-lavender-soft/40 bg-white text-sm focus:outline-none focus:border-lavender focus:ring-2 focus:ring-lavender/20";
const LABEL_CLASS = "block text-xs tracking-wider uppercase text-charcoal-light mb-1.5";

/**
 * "Write it here": a first name, what it was about, stars and a few words.
 * No account and no email — the review waits for Kristina in the Studio, and
 * she decides whether it goes up.
 *
 * A piece's own page links here as /reviews?product=<id>&piece=<name>#write,
 * so a review of something from the shop lands on that piece's page too. The
 * name in the address is only shown back to the writer; the server looks the
 * piece up by its id.
 */
// The address never changes while the form is open, so there is nothing to
// subscribe to; the server has no address to read, and renders no piece
const noSubscribe = () => () => {};
const readSearch = () => window.location.search;
const noSearch = () => "";

export default function SiteReviewForm({ googleUrl }: { googleUrl: string | null }) {
  const search = useSyncExternalStore(noSubscribe, readSearch, noSearch);
  const linked = useMemo(() => {
    const params = new URLSearchParams(search);
    const id = params.get("product");
    return id ? { id, name: params.get("piece") || "this piece" } : null;
  }, [search]);
  const [pieceDismissed, setPieceDismissed] = useState(false);
  const piece = pieceDismissed ? null : linked;

  const [name, setName] = useState("");
  const [topicChoice, setTopic] = useState("");
  // Arriving from a piece's page, the answer to "What was it?" is already known
  const topic = topicChoice || (piece ? "shop" : "");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating < 1) {
      setStatus("error");
      setError("Please choose from one to five stars.");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/reviews/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          topic,
          rating,
          comment,
          company,
          productId: topic === "shop" ? piece?.id : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  }

  async function copyForGoogle() {
    try {
      await navigator.clipboard.writeText(comment.trim());
      setCopied(true);
    } catch {
      // The link still opens; they can type it again there
    }
  }

  const shown = hover || rating;
  const length = comment.trim().length;

  return (
    <div className="bg-lavender-bg rounded-3xl p-7 sm:p-9">
      <AnimatePresence mode="wait">
        {status === "done" ? (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="font-serif text-2xl mb-2">Thank you, {name.trim()}</h2>
            <p className="text-sm text-charcoal-light leading-relaxed">
              Kristina reads every review before it goes up. Yours will appear on this page once she has.
            </p>
            {googleUrl && (
              <div className="mt-7 pt-6 border-t border-lavender-soft/50">
                <p className="text-sm text-charcoal leading-relaxed mb-4">
                  Would you share the same words on Google? That&apos;s what helps neighbours in Southampton find
                  us.
                </p>
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={copyForGoogle}
                  className="inline-flex items-center gap-2 px-7 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300"
                >
                  Copy my review &amp; open Google
                </a>
                {copied && (
                  <p className="text-xs text-charcoal-light mt-3" role="status">
                    Copied. Paste it into the box on Google.
                  </p>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onSubmit={handleSubmit}>
            <h2 className="font-serif text-2xl mb-2">Or write it here</h2>
            <p className="text-sm text-charcoal-light leading-relaxed mb-6">
              No account needed. Your first name, stars and words appear on this page once Kristina has read them.
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

            <div className="grid gap-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="review-name" className={LABEL_CLASS}>
                    First name
                  </label>
                  <input
                    id="review-name"
                    name="name"
                    autoComplete="given-name"
                    required
                    minLength={2}
                    maxLength={NAME_MAX}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="review-topic" className={LABEL_CLASS}>
                    What was it?
                  </label>
                  <select
                    id="review-topic"
                    name="topic"
                    required
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    <option value="" disabled>
                      Choose one
                    </option>
                    {REVIEW_TOPICS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {piece && topic === "shop" && (
                <p className="flex items-center justify-between gap-3 text-sm bg-white/70 rounded-xl px-4 py-3 border border-lavender-soft/40">
                  <span>
                    About <strong className="font-medium">{piece.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPieceDismissed(true)}
                    className="text-charcoal/60 hover:text-charcoal p-1"
                    aria-label="Not about this piece"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </p>
              )}

              <fieldset>
                <legend className={LABEL_CLASS}>Your rating</legend>
                <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
                      <input
                        type="radio"
                        name="rating"
                        value={n}
                        checked={rating === n}
                        onChange={() => setRating(n)}
                        className="sr-only peer"
                      />
                      <span className="block rounded-md p-0.5 peer-focus-visible:ring-2 peer-focus-visible:ring-lavender">
                        <Star
                          size={30}
                          aria-hidden="true"
                          className={
                            n <= shown ? "fill-[#BCA8F2] text-[#BCA8F2]" : "text-charcoal/35"
                          }
                        />
                      </span>
                      <span className="sr-only">
                        {n} {n === 1 ? "star" : "stars"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="review-comment" className={LABEL_CLASS}>
                  Your review
                </label>
                <textarea
                  id="review-comment"
                  name="comment"
                  required
                  rows={5}
                  minLength={COMMENT_MIN}
                  maxLength={COMMENT_MAX}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What did Kristina make or mend for you, and how did it turn out?"
                  className={`${FIELD_CLASS} resize-y`}
                />
                <p className="text-[11px] text-charcoal-light mt-1.5 text-right tabular-nums">
                  {length} / {COMMENT_MAX.toLocaleString("en-GB")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-5">
              <button
                type="submit"
                disabled={status === "loading"}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 disabled:opacity-60"
              >
                {status === "loading" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {status === "loading" ? "Sending…" : "Send my review"}
              </button>
              {error && (
                <p role="alert" className="text-xs text-red-600">
                  {error}
                </p>
              )}
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
