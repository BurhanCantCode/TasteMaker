"use client";

import { cn } from "@/lib/utils";
import { X, Check, Minus } from "lucide-react";

interface YesNoMaybeButtonsProps {
  onAnswer: (answer: "no" | "maybe" | "yes") => void;
  disabled?: boolean;
  labels?: [string, string, string]; // [noLabel, maybeLabel, yesLabel]
}

export function YesNoMaybeButtons({
  onAnswer,
  disabled,
  labels,
}: YesNoMaybeButtonsProps) {
  const noLabel = labels?.[0] || "No";
  const maybeLabel = labels?.[1] || "Maybe";
  const yesLabel = labels?.[2] || "Yes";

  return (
    <div className="flex gap-2 w-full">
      <button
        onClick={() => onAnswer("no")}
        disabled={disabled}
        className={cn(
          "flex-1 py-4 px-3 rounded-[24px] bg-gray-100 hover:bg-red-100",
          "transition-all duration-200",
          "flex items-center justify-center gap-2",
          "text-gray-700 hover:text-red-600 font-medium text-sm",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <X className="w-5 h-5 shrink-0" />
        <span className="truncate">{noLabel}</span>
      </button>
      <button
        onClick={() => onAnswer("maybe")}
        disabled={disabled}
        className={cn(
          "flex-1 py-4 px-3 rounded-[24px] bg-gray-100 hover:bg-amber-100",
          "transition-all duration-200",
          "flex items-center justify-center gap-2",
          "text-gray-700 hover:text-amber-600 font-medium text-sm",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Minus className="w-5 h-5 shrink-0" />
        <span className="truncate">{maybeLabel}</span>
      </button>
      <button
        onClick={() => onAnswer("yes")}
        disabled={disabled}
        className={cn(
          "flex-1 py-4 px-3 rounded-[24px] bg-gray-100 hover:bg-green-100",
          "transition-all duration-200",
          "flex items-center justify-center gap-2",
          "text-gray-700 hover:text-green-600 font-medium text-sm",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Check className="w-5 h-5 shrink-0" />
        <span className="truncate">{yesLabel}</span>
      </button>
    </div>
  );
}
