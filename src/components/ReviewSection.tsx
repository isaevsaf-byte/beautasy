"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import StarRating from "./StarRating";
import { fadeUp, stagger } from "./animations";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Conditionally import Clerk hooks — only used when Clerk is configured
let useUser: () => {
  user: { firstName?: string | null; username?: string | null; emailAddresses?: { emailAddress: string }[] } | null | undefined;
  isSignedIn: boolean | undefined;
  isLoaded: boolean;
};
let SignInButton: React.ComponentType<{ mode: string; children: React.ReactNode }>;

if (clerkEnabled) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const clerk = require("@clerk/nextjs");
  useUser = clerk.useUser;
  SignInButton = clerk.SignInButton;
} else {
  useUser = () => ({ user: null, isSignedIn: false, isLoaded: true });
  SignInButton = ({ children }: { mode: string; children: React.ReactNode }) => <>{children}</>;
}

interface Review {
  _id: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export default function ReviewSection({ productId }: { productId: string }) {
  const { user, isSignedIn, isLoaded } = useUser();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [loading, setLoading] = useState(true);

  // Form state
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch reviews
  useEffect(() => {
    fetch(`/api/reviews?productId=${productId}`)
      .then((res) => res.json())
      .then((data) => {
        setReviews(data.reviews || []);
        setAverageRating(data.averageRating || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [productId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          userName:
            user?.firstName ||
            user?.username ||
            user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ||
            "Customer",
          rating,
          comment,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit review");
        setSubmitting(false);
        return;
      }

      // Refresh reviews
      const refreshed = await fetch(
        `/api/reviews?productId=${productId}`
      ).then((r) => r.json());
      setReviews(refreshed.reviews || []);
      setAverageRating(refreshed.averageRating || 0);
      setRating(0);
      setComment("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <section className="py-16 border-t border-lavender-soft/40">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={stagger}
      >
        <motion.h3
          variants={fadeUp}
          custom={0}
          className="font-serif text-2xl mb-6"
        >
          Customer Reviews
        </motion.h3>

        {/* Average rating summary */}
        {!loading && reviews.length > 0 && (
          <motion.div
            variants={fadeUp}
            custom={1}
            className="flex items-center gap-3 mb-8"
          >
            <StarRating rating={Math.round(averageRating)} />
            <span className="text-sm text-charcoal-light">
              {averageRating.toFixed(1)} ({reviews.length} review
              {reviews.length !== 1 ? "s" : ""})
            </span>
          </motion.div>
        )}

        {/* Review form */}
        <motion.div variants={fadeUp} custom={2}>
          {isLoaded && isSignedIn ? (
            <form
              onSubmit={handleSubmit}
              className="bg-lavender-bg/50 rounded-2xl p-6 mb-8 border border-lavender-soft/30"
            >
              <h4 className="font-medium text-charcoal mb-4">
                Write a Review
              </h4>
              <div className="mb-4">
                <StarRating
                  rating={rating}
                  interactive
                  onRate={setRating}
                  size={24}
                />
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience with this product..."
                className="w-full p-4 rounded-xl border border-lavender-soft/40 bg-white/60 text-sm text-charcoal placeholder:text-charcoal/30 resize-none focus:outline-none focus:ring-2 focus:ring-lavender/40"
                rows={4}
              />
              <div className="flex items-center gap-4 mt-4">
                <button
                  type="submit"
                  disabled={
                    submitting || rating === 0 || comment.length < 10
                  }
                  className="px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {submitting ? "Submitting..." : "Submit Review"}
                </button>
                {comment.length > 0 && comment.length < 10 && (
                  <p className="text-xs text-charcoal-light">
                    {10 - comment.length} more characters needed
                  </p>
                )}
              </div>
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-red-500 mt-3"
                  >
                    {error}
                  </motion.p>
                )}
                {success && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-green-600 mt-3"
                  >
                    Thank you! Your review has been submitted.
                  </motion.p>
                )}
              </AnimatePresence>
            </form>
          ) : isLoaded ? (
            <div className="bg-lavender-bg/50 rounded-2xl p-6 mb-8 text-center border border-lavender-soft/30">
              <p className="text-sm text-charcoal-light mb-4">
                Sign in to leave a review
              </p>
              <SignInButton mode="modal">
                <button className="px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300">
                  Sign In
                </button>
              </SignInButton>
            </div>
          ) : null}
        </motion.div>

        {/* Reviews list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-lavender" />
          </div>
        ) : reviews.length > 0 ? (
          <motion.div variants={fadeUp} custom={3}>
            {reviews.map((rev) => (
              <div
                key={rev._id}
                className="py-4 border-b border-lavender-soft/20 last:border-b-0"
              >
                <div className="flex items-center gap-3 mb-2">
                  <StarRating rating={rev.rating} size={14} />
                  <span className="font-medium text-sm text-charcoal">
                    {rev.userName}
                  </span>
                  <span className="text-xs text-charcoal-light">
                    {new Date(rev.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-sm text-charcoal-light leading-relaxed">
                  {rev.comment}
                </p>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.p
            variants={fadeUp}
            custom={3}
            className="text-sm text-charcoal-light text-center py-8"
          >
            No reviews yet. Be the first to share your thoughts!
          </motion.p>
        )}
      </motion.div>
    </section>
  );
}
