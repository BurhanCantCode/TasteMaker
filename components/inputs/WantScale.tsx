"use client";

import { cn } from "@/lib/utils";
import { X, Check, CheckCheck, Star } from "lucide-react";

interface WantScaleProps {
  onAnswer: (rating: "dont_want" | "want" | "already_have" | "really_want") => void;
  disabled?: boolean;
  labels?: string[]; // [dontWant, want, alreadyHave, reallyWant]
}

export function WantScale({ onAnswer, disabled, labels }: WantScaleProps) {
  const dontWantLabel = labels?.[0] || "Don't Want";
  const wantLabel = labels?.[1] || "Want";
  const alreadyHaveLabel = labels?.[2] || "Already Have";
  const reallyWantLabel = labels?.[3] || "Really Want";

  return (
    <div className="grid grid-cols-2 gap-3 w-full">
      <button
        onClick={() => onAnswer("dont_want")}
        disabled={disabled}
        className={cn(
          "py-4 px-4 rounded-[24px] bg-gray-100 hover:bg-red-100",
          "transition-all duration-200",
          "flex flex-col items-center justify-center gap-1",
          "text-gray-700 hover:text-red-600",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <X className="w-6 h-6" />
        <span className="text-xs font-medium">{dontWantLabel}</span>
      </button>
      <button
        onClick={() => onAnswer("want")}
        disabled={disabled}
        className={cn(
          "py-4 px-4 rounded-[24px] bg-gray-100 hover:bg-blue-100",
          "transition-all duration-200",
          "flex flex-col items-center justify-center gap-1",
          "text-gray-700 hover:text-blue-600",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Check className="w-6 h-6" />
        <span className="text-xs font-medium">{wantLabel}</span>
      </button>
      <button
        onClick={() => onAnswer("already_have")}
        disabled={disabled}
        className={cn(
          "py-4 px-4 rounded-[24px] bg-gray-100 hover:bg-green-100",
          "transition-all duration-200",
          "flex flex-col items-center justify-center gap-1",
          "text-gray-700 hover:text-green-600",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <CheckCheck className="w-6 h-6" />
        <span className="text-xs font-medium">{alreadyHaveLabel}</span>
      </button>
      <button
        onClick={() => onAnswer("really_want")}
        disabled={disabled}
        className={cn(
          "py-4 px-4 rounded-[24px] bg-gray-100 hover:bg-purple-100",
          "transition-all duration-200",
          "flex flex-col items-center justify-center gap-1",
          "text-gray-700 hover:text-purple-600",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Star className="w-6 h-6" />
        <span className="text-xs font-medium">{reallyWantLabel}</span>
      </button>
    </div>
  );
}
