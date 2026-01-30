"use client";

import { useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFacts?: string;
  onSave: (facts: string) => void;
}

export function FactsModal({
  isOpen,
  onClose,
  currentFacts,
  onSave,
}: FactsModalProps) {
  const [facts, setFacts] = useState(currentFacts || "");

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(facts.trim());
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-all duration-300"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl z-50">
        <div className="bg-white rounded-[32px] shadow-[0_24px_50px_rgb(0,0,0,0.12)] h-full md:h-auto flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-8 pb-4">
            <h2 className="text-3xl font-bold tracking-tight text-[#171717]">
              Share Facts
            </h2>
            <button
              onClick={onClose}
              className="w-12 h-12 rounded-full bg-gray-50 text-gray-900 hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-8 pt-4 space-y-6">
            <p className="text-lg text-gray-500">
              The AI uses these details to generate better questions and recommendations for you.
            </p>

            <div className="space-y-4">
              <textarea
                value={facts}
                onChange={(e) => setFacts(e.target.value)}
                placeholder="Male / New York City / Single / iPhone user / Rents home..."
                className={cn(
                  "w-full h-48 p-5 rounded-[24px] bg-gray-50",
                  "border border-gray-200 focus:border-black focus:ring-black focus:outline-none",
                  "text-gray-900 placeholder:text-gray-400 text-lg resize-none transition-all duration-200"
                )}
              />

              {/* Example Hint */}
              <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="font-semibold text-gray-900 block mb-1">Example</span>
                Male / New York City / Single / iPhone user / Rents home / No pets / No sports / Online dating
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-8 pt-0 flex gap-4">
            <button
              onClick={onClose}
              className="px-8 py-5 rounded-[24px] bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold text-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-8 py-5 rounded-[24px] bg-[#171717] hover:bg-black text-white font-bold text-lg transition-all shadow-[0_4px_12px_rgb(0,0,0,0.12)] hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
            >
              Update Profile
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
