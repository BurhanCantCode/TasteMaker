"use client";

import { cn } from "@/lib/utils";
import { Heart, X, Sparkles } from "lucide-react";

interface LikeScaleProps {
  onAnswer: (rating: "like" | "dislike" | "superlike") => void;
  disabled?: boolean;
}

export function LikeScale({ onAnswer, disabled }: LikeScaleProps) {
  return (
    <div className="flex gap-3 w-full">
      <button
        onClick={() => onAnswer("dislike")}
        disabled={disabled}
        className={cn(
          "flex-1 py-4 px-4 rounded-[24px] bg-gray-100 hover:bg-red-100",
          "transition-all duration-200",
          "flex flex-col items-center justify-center gap-1",
          "text-gray-700 hover:text-red-600",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <X className="w-6 h-6" />
        <span className="text-xs font-medium">Dislike</span>
      </button>
      <button
        onClick={() => onAnswer("like")}
        disabled={disabled}
        className={cn(
          "flex-1 py-4 px-4 rounded-[24px] bg-gray-100 hover:bg-pink-100",
          "transition-all duration-200",
          "flex flex-col items-center justify-center gap-1",
          "text-gray-700 hover:text-pink-600",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Heart className="w-6 h-6" />
        <span className="text-xs font-medium">Like</span>
      </button>
      <button
        onClick={() => onAnswer("superlike")}
        disabled={disabled}
        className={cn(
          "flex-1 py-4 px-4 rounded-[24px] bg-gray-100 hover:bg-purple-100",
          "transition-all duration-200",
          "flex flex-col items-center justify-center gap-1",
          "text-gray-700 hover:text-purple-600",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Sparkles className="w-6 h-6" />
        <span className="text-xs font-medium">Super Like</span>
      </button>
    </div>
  );
}
