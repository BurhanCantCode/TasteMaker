"use client";

import { cn } from "@/lib/utils";

interface RatingScaleProps {
  onAnswer: (rating: string) => void;
  disabled?: boolean;
  anchorLabels?: [string, string]; // [lowLabel, highLabel]
}

export function RatingScale({ onAnswer, disabled, anchorLabels }: RatingScaleProps) {
  const ratings = [1, 2, 3, 4, 5];
  const lowLabel = anchorLabels?.[0] || "Low";
  const highLabel = anchorLabels?.[1] || "High";

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Rating buttons */}
      <div className="flex justify-between items-center gap-2">
        {ratings.map((rating) => (
          <button
            key={rating}
            onClick={() => onAnswer(rating.toString())}
            disabled={disabled}
            className={cn(
              "w-14 h-14 rounded-full transition-all duration-200",
              "flex items-center justify-center",
              "text-lg font-semibold",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "bg-gray-100 text-gray-700 hover:bg-blue-600 hover:text-white",
              "active:scale-95"
            )}
          >
            {rating}
          </button>
        ))}
      </div>

      {/* Labels */}
      <div className="flex justify-between px-1">
        <span className="text-xs text-gray-500 font-medium">{lowLabel}</span>
        <span className="text-xs text-gray-500 font-medium">{highLabel}</span>
      </div>
    </div>
  );
}
