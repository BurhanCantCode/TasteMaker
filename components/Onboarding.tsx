"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

interface OnboardingProps {
  onComplete: (facts: string) => void;
  onSkip: () => void;
}

export function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [facts, setFacts] = useState("");

  const handleSubmit = () => {
    if (facts.trim()) {
      onComplete(facts.trim());
    } else {
      onSkip();
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex p-4 bg-white shadow-sm rounded-full mb-4 ring-1 ring-gray-200">
            <Sparkles className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[#171717]">
            Tell us about yourself
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Share a few facts to help us understand your taste. The more we know, the better our recommendations!
          </p>
        </div>

        {/* Text Area */}
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
          <textarea
            value={facts}
            onChange={(e) => setFacts(e.target.value)}
            placeholder="Male / New York City / Single / iPhone user / Rents home..."
            className="w-full h-32 p-4 rounded-[24px] bg-gray-50 border border-gray-200 focus:border-black focus:ring-black focus:outline-none text-gray-900 placeholder:text-gray-400 resize-none transition-all duration-200"
          />

          {/* Example Hint */}
          <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <span className="font-semibold text-gray-900 block mb-1">Example</span>
            Male / New York City / Single / iPhone user / Rents home / No pets / No sports / Online dating / owns a Kindle
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4">
          <button
            onClick={onSkip}
            className="flex-1 h-[72px] rounded-[32px] font-bold text-lg text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200 shadow-[0_4px_12px_rgb(0,0,0,0.06)] hover:shadow-[0_6px_16px_rgb(0,0,0,0.08)] active:scale-95"
          >
            Skip for now
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 bg-[#171717] text-white h-[72px] rounded-[32px] font-bold text-lg hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
          >
            Get Started
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
