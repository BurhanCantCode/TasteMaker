"use client";

import { cn } from "@/lib/utils";

interface MultipleChoiceProps {
  options: string[];
  onAnswer: (option: string) => void;
  disabled?: boolean;
}

export function MultipleChoice({
  options,
  onAnswer,
  disabled,
}: MultipleChoiceProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => onAnswer(option)}
          disabled={disabled}
          className={cn(
            "py-4 px-6 rounded-[24px] bg-gray-100 hover:bg-blue-100",
            "transition-all duration-200",
            "text-left text-gray-700 hover:text-blue-600 font-medium",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
