"use client";

import { cn } from "@/lib/utils";
import { X, Check } from "lucide-react";

interface YesNoButtonsProps {
  onAnswer: (answer: "yes" | "no") => void;
  disabled?: boolean;
}

export function YesNoButtons({ onAnswer, disabled }: YesNoButtonsProps) {
  return (
    <div className="flex gap-4 w-full">
      <button
        onClick={() => onAnswer("no")}
        disabled={disabled}
        className={cn(
          "flex-1 py-4 px-6 rounded-[24px] bg-gray-100 hover:bg-red-100",
          "transition-all duration-200",
          "flex items-center justify-center gap-2",
          "text-gray-700 hover:text-red-600 font-medium",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <X className="w-5 h-5" />
        No
      </button>
      <button
        onClick={() => onAnswer("yes")}
        disabled={disabled}
        className={cn(
          "flex-1 py-4 px-6 rounded-[24px] bg-gray-100 hover:bg-green-100",
          "transition-all duration-200",
          "flex items-center justify-center gap-2",
          "text-gray-700 hover:text-green-600 font-medium",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Check className="w-5 h-5" />
        Yes
      </button>
    </div>
  );
}
