"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";

interface TextInputProps {
  onAnswer: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function TextInput({
  onAnswer,
  disabled,
  placeholder = "Type your answer...",
}: TextInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onAnswer(value.trim());
      setValue("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-3">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "flex-1 py-4 px-6 rounded-[24px] bg-gray-100",
            "text-gray-700 placeholder:text-gray-400",
            "focus:outline-none focus:ring-2 focus:ring-blue-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-all duration-200"
          )}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className={cn(
            "py-4 px-6 rounded-[24px] bg-blue-600 hover:bg-blue-700",
            "text-white font-medium",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-all duration-200",
            "flex items-center justify-center"
          )}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </form>
  );
}
