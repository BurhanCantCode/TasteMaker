"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface MultipleChoiceProps {
  options: string[];
  onAnswer: (option: string | string[]) => void;
  disabled?: boolean;
  allowMultiple?: boolean;
}

export function MultipleChoice({
  options,
  onAnswer,
  disabled,
  allowMultiple = true,
}: MultipleChoiceProps) {
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set());

  const toggleOption = (option: string) => {
    if (!allowMultiple) {
      // Single selection - submit immediately
      onAnswer(option);
      return;
    }

    // Multiple selection
    const newSelected = new Set(selectedOptions);
    if (newSelected.has(option)) {
      newSelected.delete(option);
    } else {
      newSelected.add(option);
    }
    setSelectedOptions(newSelected);
  };

  const handleSubmit = () => {
    if (selectedOptions.size > 0) {
      onAnswer(Array.from(selectedOptions).join(", "));
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Scrollable options container */}
      <div className="flex flex-col gap-2 w-full max-h-[280px] overflow-y-auto pr-2 -mr-2">
        {options.map((option, index) => {
          const isSelected = selectedOptions.has(option);
          return (
            <button
              key={index}
              onClick={() => toggleOption(option)}
              disabled={disabled}
              className={cn(
                "py-3 px-4 rounded-[20px] transition-all duration-200",
                "text-left text-sm font-medium flex items-center justify-between gap-2",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isSelected
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-600"
              )}
            >
              <span className="flex-1">{option}</span>
              {allowMultiple && isSelected && (
                <Check className="w-4 h-4 flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Submit button for multiple selection */}
      {allowMultiple && (
        <button
          onClick={handleSubmit}
          disabled={disabled || selectedOptions.size === 0}
          className={cn(
            "py-3 px-6 rounded-[20px] font-semibold transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            selectedOptions.size > 0
              ? "bg-black text-white hover:bg-gray-800"
              : "bg-gray-200 text-gray-400"
          )}
        >
          Continue {selectedOptions.size > 0 && `(${selectedOptions.size} selected)`}
        </button>
      )}
    </div>
  );
}
