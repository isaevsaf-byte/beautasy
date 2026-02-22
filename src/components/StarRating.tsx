"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  size?: number;
}

export default function StarRating({
  rating,
  maxStars = 5,
  interactive = false,
  onRate,
  size = 16,
}: StarRatingProps) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-0.5">
      {Array.from({ length: maxStars }, (_, i) => {
        const starValue = i + 1;
        const filled = interactive
          ? starValue <= (hover || rating)
          : starValue <= rating;

        return interactive ? (
          <button
            key={i}
            type="button"
            onClick={() => onRate?.(starValue)}
            onMouseEnter={() => setHover(starValue)}
            onMouseLeave={() => setHover(0)}
            className="cursor-pointer"
          >
            <Star
              size={size}
              className={
                filled
                  ? "fill-lavender text-lavender"
                  : "text-charcoal/20"
              }
            />
          </button>
        ) : (
          <span key={i} className="cursor-default">
            <Star
              size={size}
              className={
                filled
                  ? "fill-lavender text-lavender"
                  : "text-charcoal/20"
              }
            />
          </span>
        );
      })}
    </div>
  );
}
