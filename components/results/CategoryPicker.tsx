"use client";

import { cn } from "@/lib/utils";
import {
  Sparkles,       // all
  Activity,        // possible_diagnosis
  AlertTriangle,   // risk_factor
  AlertCircle,     // red_flag
} from "lucide-react";

const CATEGORIES = [
  { key: "all", label: "All", icon: Sparkles },
  { key: "possible_diagnosis", label: "Conditions", icon: Activity },
  { key: "risk_factor", label: "Risk Factors", icon: AlertTriangle },
  { key: "red_flag", label: "Red Flags", icon: AlertCircle },
];

interface CategoryPickerProps {
  selectedCategory: string | null;
  onSelect: (category: string) => void;
}

export function CategoryPicker({ selectedCategory, onSelect }: CategoryPickerProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        View diagnostic findings
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={cn(
              "bg-white rounded-[24px] p-4 flex flex-col items-center gap-2 transition-all duration-200",
              "shadow-[0_4px_12px_rgb(0,0,0,0.04)]",
              "hover:scale-[1.02] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)]",
              "active:scale-[0.98]",
              selectedCategory === key
                ? "ring-2 ring-[#171717] bg-gray-50"
                : ""
            )}
          >
            <Icon className={cn(
              "w-6 h-6",
              selectedCategory === key ? "text-[#171717]" : "text-gray-400"
            )} />
            <span className={cn(
              "text-sm font-medium",
              selectedCategory === key ? "text-[#171717]" : "text-gray-600"
            )}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
