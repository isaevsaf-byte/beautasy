"use client";

import { useState } from "react";
import ReviewCard from "@/components/reviews/ReviewCard";
import { atelierReviews, type PublishedReview } from "@/lib/siteReviews";

type Shelf = "all" | "atelier" | "shop";

/**
 * Every review, in columns that fill like a wall of notes, with a choice
 * between the atelier's and the shop's. Someone deciding who takes up their
 * curtains wants the atelier's reviews; someone buying a scrunchie wants the
 * shop's. The choice is only offered when there are both.
 *
 * All of them are in the page as it arrives — "all" is the first view — so
 * search engines and anyone without JavaScript read every one.
 */
export default function ReviewWall({
  reviews,
  nextdoorUrl,
}: {
  reviews: PublishedReview[];
  nextdoorUrl: string | null;
}) {
  const [shelf, setShelf] = useState<Shelf>("all");
  const atelier = atelierReviews(reviews);
  const shop = reviews.filter((review) => !atelier.includes(review));
  const shown = shelf === "atelier" ? atelier : shelf === "shop" ? shop : reviews;

  const shelves: { key: Shelf; label: string; n: number }[] = [
    { key: "all", label: "All", n: reviews.length },
    { key: "atelier", label: "Alterations & sewing", n: atelier.length },
    { key: "shop", label: "Handmade pieces", n: shop.length },
  ];

  return (
    <div>
      {atelier.length > 0 && shop.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mb-8" role="group" aria-label="Show reviews about">
          {shelves.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={shelf === option.key}
              onClick={() => setShelf(option.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                shelf === option.key
                  ? "bg-plum text-white border-plum"
                  : "bg-white/70 text-charcoal border-lavender-soft hover:border-lavender"
              }`}
            >
              {option.label}
              <span className="tabular-nums text-xs opacity-70">{option.n}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="columns-1 md:columns-2 lg:columns-3 gap-5">
        {shown.map((review) => (
          <ReviewCard
            key={review._id}
            review={review}
            nextdoorUrl={nextdoorUrl}
            className="mb-5 break-inside-avoid"
          />
        ))}
      </ul>
    </div>
  );
}
