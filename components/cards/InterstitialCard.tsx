"use client";

import { InterstitialContent } from "@/lib/types";
import { ArrowRight, Sparkles } from "lucide-react";

interface InterstitialCardProps {
  content: InterstitialContent;
  onContinue: () => void;
}

export function InterstitialCard({
  content,
  onContinue,
}: InterstitialCardProps) {
  return (
    <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-full h-full flex flex-col items-center justify-center text-white">
      {/* Icon */}
      <div className="mb-6">
        <Sparkles className="w-16 h-16" />
      </div>

      {/* Title */}
      <h2 className="text-3xl font-bold mb-4 text-center">{content.title}</h2>

      {/* Message */}
      <p className="text-lg text-center mb-8 opacity-90 max-w-md">
        {content.message}
      </p>

      {/* Continue Button */}
      <button
        onClick={onContinue}
        className="bg-white text-blue-600 px-8 py-4 rounded-[24px] font-semibold hover:bg-gray-100 transition-all duration-200 flex items-center gap-2"
      >
        {content.actionLabel || "Continue"}
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}
