"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompts";

interface PromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt?: string;
  onSave: (prompt: string) => void;
}

export function PromptEditor({
  isOpen,
  onClose,
  currentPrompt,
  onSave,
}: PromptEditorProps) {
  const [prompt, setPrompt] = useState(currentPrompt || DEFAULT_SYSTEM_PROMPT);

  useEffect(() => {
    if (!isOpen) return;
    setPrompt(currentPrompt || DEFAULT_SYSTEM_PROMPT);
  }, [isOpen, currentPrompt]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(prompt);
    onClose();
  };

  const handleReset = () => {
    setPrompt(DEFAULT_SYSTEM_PROMPT);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl z-50">
        <div className="bg-white rounded-[32px] shadow-2xl h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800">
              Edit System Prompt
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className={cn(
                "w-full h-full min-h-[300px] p-4 rounded-[24px] bg-gray-50",
                "border border-gray-200 focus:border-blue-500 focus:outline-none",
                "text-gray-700 font-mono text-sm resize-none"
              )}
              placeholder="Enter your custom system prompt..."
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 p-6 border-t border-gray-200">
            <button
              onClick={handleReset}
              className="px-6 py-3 rounded-[24px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
            >
              Reset to Default
            </button>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-[24px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-3 rounded-[24px] bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
