"use client";

import { ResultItem } from "@/lib/types";
import { getCategoryConfig } from "@/lib/categoryConfig";
import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecommendationCardProps {
  item: ResultItem;
  onRate: (rating: string) => void;
}

export function RecommendationCard({ item, onRate }: RecommendationCardProps) {
  const config = getCategoryConfig(item.category);

  return (
    <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
      {/* Category Badge */}
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-900 text-xs font-bold uppercase tracking-wider">
        <Tag className="w-3 h-3" />
        {item.category}
      </span>

      {/* Name */}
      <h3 className="text-xl font-bold text-[#171717] tracking-tight">
        {item.name}
      </h3>

      {/* Description */}
      {item.description && (
        <p className="text-base text-gray-500 leading-relaxed">
          {item.description}
        </p>
      )}

      {/* Compact Rating Row */}
      <div className="flex gap-2 pt-2">
        {config.options.map((option) => (
          <button
            key={option.value}
            onClick={() => onRate(option.value)}
            className={cn(
              "flex-1 py-2.5 px-2 rounded-[16px] bg-gray-100",
              "text-xs font-medium text-gray-600 text-center",
              "transition-all duration-200",
              "hover:scale-[1.02] active:scale-[0.98]",
              option.sentiment === "negative" && "hover:bg-red-100 hover:text-red-600",
              option.sentiment === "neutral" && "hover:bg-gray-200 hover:text-gray-700",
              option.sentiment === "positive" && "hover:bg-blue-100 hover:text-blue-600",
              option.sentiment === "strong_positive" && "hover:bg-purple-100 hover:text-purple-600",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
