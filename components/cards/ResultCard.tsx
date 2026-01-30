"use client";

import { ResultItem } from "@/lib/types";
import { LikeScale } from "../inputs/LikeScale";
import { Tag } from "lucide-react";

interface ResultCardProps {
  item: ResultItem;
  onAnswer: (rating: "like" | "dislike" | "superlike") => void;
  disabled?: boolean;
}

export function ResultCard({ item, onAnswer, disabled }: ResultCardProps) {
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
      <div className="flex-1 flex flex-col justify-center">
        <h2 className="text-3xl font-bold text-gray-800 mb-4">{item.name}</h2>
        
        {item.description && (
          <p className="text-gray-600 leading-relaxed">{item.description}</p>
        )}
      </div>

      {/* Like Scale */}
      <div className="mt-6">
        <LikeScale onAnswer={onAnswer} disabled={disabled} />
      </div>

      {/* Card Type Indicator */}
      <div className="mt-4 text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          Prediction
        </span>
      </div>
    </div>
  );
}
