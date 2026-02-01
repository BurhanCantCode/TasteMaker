"use client";

import { Sparkles, ArrowRight } from "lucide-react";

interface RecommendationInterstitialCardProps {
  onViewRecommendations: () => void;
  onKeepAnswering: () => void;
}

export function RecommendationInterstitialCard({
  onViewRecommendations,
  onKeepAnswering,
}: RecommendationInterstitialCardProps) {
  return (
    <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col items-center justify-center text-center">
      {/* Icon */}
      <div className="mb-6 p-4 bg-gray-50 rounded-full">
        <Sparkles className="w-8 h-8 text-[#171717]" />
      </div>

      {/* Title */}
      <h2 className="text-3xl font-bold mb-4 text-[#171717] tracking-tight">
        We found some matches
      </h2>

      {/* Message */}
      <p className="text-lg text-gray-500 mb-10 max-w-xs font-medium leading-relaxed">
        Based on your profile, we've curated some recommendations just for you.
      </p>

      {/* Two Buttons */}
      <div className="w-full space-y-3">
        {/* Primary: View Recommendations */}
        <button
          onClick={onViewRecommendations}
          className="w-full bg-[#171717] text-white h-[72px] rounded-[32px] font-bold text-lg hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
        >
          View Recommendations
          <ArrowRight className="w-6 h-6" />
        </button>

        {/* Secondary: Keep Answering */}
        <button
          onClick={onKeepAnswering}
          className="w-full bg-white text-gray-500 h-[56px] rounded-[24px] font-semibold hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
        >
          Keep Answering
        </button>
      </div>
    </div>
  );
}
