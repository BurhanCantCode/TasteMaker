"use client";

import { cn } from "@/lib/utils";
import {
  Utensils,     // restaurant
  MapPin,       // location
  Package,      // product
  Tag,          // brand
  Film,         // movie
  BookOpen,     // book
  Music,        // band
  Zap,          // activity
  Sparkles,     // all
} from "lucide-react";

const CATEGORIES = [
  { key: "all", label: "All", icon: Sparkles },
  { key: "restaurant", label: "Restaurants", icon: Utensils },
  { key: "location", label: "Places", icon: MapPin },
  { key: "product", label: "Products", icon: Package },
  { key: "brand", label: "Brands", icon: Tag },
  { key: "movie", label: "Movies", icon: Film },
  { key: "book", label: "Books", icon: BookOpen },
  { key: "band", label: "Music", icon: Music },
  { key: "activity", label: "Activities", icon: Zap },
];

interface CategoryPickerProps {
  selectedCategory: string | null;
  onSelect: (category: string) => void;
}

export function CategoryPicker({ selectedCategory, onSelect }: CategoryPickerProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
        What are you looking for?
      </h2>
      <div className="grid grid-cols-3 gap-3">
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
