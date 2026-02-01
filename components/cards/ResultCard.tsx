"use client";

import { ResultItem } from "@/lib/types";
import { LikeScale } from "../inputs/LikeScale";
import { getCategoryConfig } from "@/lib/categoryConfig";
import { Tag } from "lucide-react";

interface ResultCardProps {
  item: ResultItem;
  onAnswer: (rating: string) => void;
  disabled?: boolean;
}

export function ResultCard({ item, onAnswer, disabled }: ResultCardProps) {
  const config = getCategoryConfig(item.category);

  return (
    <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col gap-6">
      {/* Category Badge & Content Container */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
        {/* Category Badge */}
        <div className="flex-shrink-0 mb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-900 text-xs font-bold uppercase tracking-wider">
            <Tag className="w-3 h-3" />
            {item.category}
          </span>
        </div>

        {/* Item Name & Description */}
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-[#171717] leading-tight tracking-tight">
            {item.name}
          </h2>

          {item.description && (
            <p className="text-lg text-gray-500 leading-relaxed font-medium">
              {item.description}
            </p>
          )}
        </div>
      </div>

      {/* Like Scale - Fixed at bottom */}
      <div className="flex-shrink-0 pt-2 border-t border-gray-100/50">
        <LikeScale category={item.category} onAnswer={onAnswer} disabled={disabled} />
      </div>
    </div>
  );
}
