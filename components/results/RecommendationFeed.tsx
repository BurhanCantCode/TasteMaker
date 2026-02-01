"use client";

import { ResultItem } from "@/lib/types";
import { RecommendationCard } from "./RecommendationCard";
import { RefreshCw } from "lucide-react";

interface RecommendationFeedProps {
  results: ResultItem[];
  onRate: (item: ResultItem, rating: string) => void;
  onLoadMore: () => void;
  isLoading?: boolean;
}

export function RecommendationFeed({ results, onRate, onLoadMore, isLoading }: RecommendationFeedProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        Your recommendations
      </h2>

      <div className="space-y-4">
        {results.map((item) => (
          <RecommendationCard
            key={item.id}
            item={item}
            onRate={(rating) => onRate(item, rating)}
          />
        ))}
      </div>

      {/* Load More */}
      <button
        onClick={onLoadMore}
        disabled={isLoading}
        className="w-full bg-white text-gray-700 h-[56px] rounded-[24px] font-semibold hover:bg-gray-50 transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgb(0,0,0,0.06)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        {isLoading ? 'Loading...' : 'Load more recommendations'}
      </button>
    </div>
  );
}
