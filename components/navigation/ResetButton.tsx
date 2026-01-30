"use client";

import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResetButtonProps {
  onReset: () => void;
}

export function ResetButton({ onReset }: ResetButtonProps) {
  return (
    <button
      onClick={onReset}
      className={cn(
        "fixed top-4 left-4 z-50",
        "w-12 h-12 rounded-full",
        "bg-white shadow-[0_4px_12px_rgb(0,0,0,0.08)]",
        "flex items-center justify-center",
        "text-gray-600 hover:text-blue-600",
        "transition-all duration-200",
        "hover:shadow-[0_6px_16px_rgb(0,0,0,0.12)]",
        "active:scale-95"
      )}
      aria-label="Reset"
    >
      <RotateCcw className="w-5 h-5" />
    </button>
  );
}
