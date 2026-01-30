"use client";

import { cn } from "@/lib/utils";
import { getCategoryConfig } from "@/lib/categoryConfig";

interface LikeScaleProps {
  category?: string;
  onAnswer: (rating: string) => void;
  disabled?: boolean;
}

export function LikeScale({ category = "default", onAnswer, disabled }: LikeScaleProps) {
  const config = getCategoryConfig(category);
  
  // Color mapping based on sentiment
  const getSentimentColors = (sentiment: string) => {
    switch (sentiment) {
      case "negative":
        return "hover:bg-red-100 hover:text-red-600";
      case "neutral":
        return "hover:bg-gray-200 hover:text-gray-700";
      case "positive":
        return "hover:bg-blue-100 hover:text-blue-600";
      case "strong_positive":
        return "hover:bg-purple-100 hover:text-purple-600";
      default:
        return "hover:bg-gray-200 hover:text-gray-700";
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {config.options.map((option) => (
        <button
          key={option.value}
          onClick={() => onAnswer(option.value)}
          disabled={disabled}
          className={cn(
            "py-3 px-4 rounded-[20px] bg-gray-100",
            "transition-all duration-200",
            "flex items-center justify-center",
            "text-gray-700 font-medium text-sm",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            getSentimentColors(option.sentiment)
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
