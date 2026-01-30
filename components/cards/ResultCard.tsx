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
    <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col">
      {/* Category Badge */}
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full flex items-center gap-1.5">
          <Tag className="w-3 h-3" />
          <span className="text-xs font-medium capitalize">{item.category}</span>
        </div>
      </div>

      {/* Item Name */}
      <div className="flex-1 flex flex-col justify-center min-h-0">
        <h2 className="text-3xl font-bold text-gray-800 mb-4">{item.name}</h2>
        
        {item.description && (
          <p className="text-gray-600 leading-relaxed">{item.description}</p>
        )}
      </div>

      {/* Like Scale - scrollable container */}
      <div className="mt-6 max-h-[240px] overflow-y-auto pr-2 -mr-2">
        <LikeScale category={item.category} onAnswer={onAnswer} disabled={disabled} />
      </div>

      {/* Card Type Indicator */}
      <div className="mt-4 text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          {config.header}
        </span>
      </div>
    </div>
  );
}
