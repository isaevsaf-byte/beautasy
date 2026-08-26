"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Camera, X, CheckCircle2 } from "lucide-react";
import StarRating from "@/components/StarRating";

/* eslint-disable @next/next/no-img-element */

const MAX_PHOTOS = 4;

/**
 * Review form for a customer arriving from a review-request email.
 *
 * No account, no sign-in: the token in the URL is what proves they bought the
 * piece, which is also what lets the review carry a "verified purchase" badge.
 */
export default function ReviewByTokenForm({
  token,
  productId,
  productName,
  defaultName,
}: {
  token: string;
  productId: string;
  productName: string;
  defaultName?: string;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [userName, setUserName] = useState(defaultName ?? "");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const room = MAX_PHOTOS - photos.length;
    setPhotos((prev) => [
      ...prev,
      ...files.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const imageAssetIds: string[] = [];
      for (const { file } of photos) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("token", token);
        const res = await fetch("/api/reviews/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not upload that photo");
        imageAssetIds.push(data.assetId);
      }

      const res = await fetch("/api/reviews/by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, productId, rating, comment, userName, imageAssetIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save your review");
        setStatus("idle");
        return;
      }

      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <div className="bg-lavender-bg/50 rounded-2xl p-6 border border-lavender-soft/30 flex items-start gap-3">
        <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />
        <p className="text-sm text-charcoal-light leading-relaxed">
          Thank you — your review of <strong className="text-charcoal">{productName}</strong> is
          in. It appears on the product page once we&apos;ve read it.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-lavender-bg/50 rounded-2xl p-6 border border-lavender-soft/30"
    >
      <div className="mb-4">
        <StarRating rating={rating} interactive onRate={setRating} size={26} />
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        placeholder={`How does the ${productName} feel to wear?`}
        className="w-full p-4 rounded-xl border border-lavender-soft/40 bg-white/70 text-sm text-charcoal placeholder:text-charcoal/30 resize-none focus:outline-none focus:ring-2 focus:ring-lavender/40 mb-3"
      />

      <input
        type="text"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
        placeholder="Name shown with your review"
        aria-label="Name shown with your review"
        className="w-full px-4 py-2.5 rounded-xl border border-lavender-soft/40 bg-white/70 text-sm text-charcoal placeholder:text-charcoal/30 focus:outline-none focus:ring-2 focus:ring-lavender/40 mb-4"
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {photos.map((photo, i) => (
          <div
            key={photo.preview}
            className="relative w-16 h-16 rounded-lg overflow-hidden border border-lavender-soft/40"
          >
            <img src={photo.preview} alt={`Attached ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              aria-label="Remove photo"
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add photo"
            className="w-16 h-16 rounded-lg border border-dashed border-lavender-soft/60 flex flex-col items-center justify-center text-charcoal-light hover:border-lavender hover:text-charcoal transition-colors"
          >
            <Camera size={16} />
            <span className="text-[10px] mt-0.5">Add</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoSelect}
          className="hidden"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={status === "sending" || rating === 0 || comment.length < 10}
          className="px-6 py-3 bg-lavender text-charcoal rounded-full text-sm tracking-wider uppercase font-medium hover:bg-[#CFC0F0] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {status === "sending" && <Loader2 size={14} className="animate-spin" />}
          Send review
        </button>
        {comment.length > 0 && comment.length < 10 && (
          <p className="text-xs text-charcoal-light">{10 - comment.length} more characters</p>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-red-500 mt-3"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
