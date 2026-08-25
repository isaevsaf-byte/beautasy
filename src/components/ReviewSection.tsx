"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Camera, X } from "lucide-react";
import { useUser, SignInButton } from "@clerk/nextjs";
import StarRating from "./StarRating";
import { fadeUp, stagger } from "./animations";

interface Review {
  _id: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
  images?: string[];
}

const MAX_PHOTOS = 4;

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

  // Photo attachments
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const room = MAX_PHOTOS - photos.length;
    const toAdd = files.slice(0, room).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...toAdd]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

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
      // Upload any attached photos first, collecting their Sanity asset ids
      let imageAssetIds: string[] = [];
      if (photos.length > 0) {
        setUploadingPhotos(true);
        try {
          imageAssetIds = await Promise.all(
            photos.map(async ({ file }) => {
              const formData = new FormData();
              formData.append("file", file);
              const res = await fetch("/api/reviews/upload", {
                method: "POST",
                body: formData,
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Failed to upload photo");
              return data.assetId as string;
            })
          );
        } finally {
          setUploadingPhotos(false);
        }
      }

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
          imageAssetIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit review");
        setSubmitting(false);
        return;
      }

      setRating(0);
      setComment("");
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
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
              {/* Photo attachments */}
              <div className="mb-1">
                <div className="flex flex-wrap gap-2">
                  {photos.map((photo, i) => (
                    <div
                      key={photo.preview}
                      className="relative w-16 h-16 rounded-lg overflow-hidden border border-lavender-soft/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.preview}
                        alt={`Attached photo ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                        aria-label="Remove photo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 rounded-lg border border-dashed border-lavender-soft/60 flex flex-col items-center justify-center text-charcoal-light hover:border-lavender hover:text-charcoal transition-colors"
                      aria-label="Add photo"
                    >
                      <Camera size={16} />
                      <span className="text-[10px] mt-0.5">Add</span>
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-4 mt-4">
                <button
                  type="submit"
                  disabled={
                    submitting || rating === 0 || comment.length < 10
                  }
                  className="px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {(submitting || uploadingPhotos) && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {uploadingPhotos ? "Uploading photos..." : submitting ? "Submitting..." : "Submit Review"}
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
                    Thank you! Your review has been submitted and will appear once approved.
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
                {rev.images && rev.images.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    {rev.images.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt={`Photo from ${rev.userName}'s review, ${i + 1}`}
                        className="w-16 h-16 rounded-lg object-cover border border-lavender-soft/30"
                      />
                    ))}
                  </div>
                )}
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
