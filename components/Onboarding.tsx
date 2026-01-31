"use client";

import { useState } from "react";
import { ArrowRight, Sparkles, MapPin, Check } from "lucide-react";

interface OnboardingProps {
  onComplete: (facts: string, location: string) => void;
  onSkip: () => void;
  onSignInClick?: () => void;
  isSignedIn?: boolean;
  signedInLabel?: string;
}

export function Onboarding({ onComplete, onSkip, onSignInClick, isSignedIn, signedInLabel }: OnboardingProps) {
  const [facts, setFacts] = useState("");
  const [location, setLocation] = useState("");

  const handleSubmit = () => {
    if (facts.trim() || location.trim()) {
      onComplete(facts.trim(), location.trim());
    } else {
      onSkip();
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        {/* Optional Sign-in Card (only when not signed in) */}
        {onSignInClick && !isSignedIn && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-[32px] p-6 shadow-[0_4px_12px_rgb(0,0,0,0.06)] border border-blue-100">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 mb-1">
                  Returning user?
                </h3>
                <p className="text-sm text-gray-600">
                  Sign in to continue your taste profile
                </p>
              </div>
              <button
                onClick={onSignInClick}
                className="flex-shrink-0 px-6 py-3 bg-[#171717] text-white text-sm font-semibold rounded-[24px] hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-[0_4px_12px_rgb(0,0,0,0.12)]"
              >
                Sign In
              </button>
            </div>
          </div>
        )}

        {/* Signed-in confirmation (flat card per UI guide) */}
        {onSignInClick && isSignedIn && (
          <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                <Check className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#171717]">Signed in</h3>
                <p className="text-sm text-gray-500">
                  {signedInLabel ? `Synced as ${signedInLabel}` : "Your profile will sync across devices"}
                </p>
              </div>
            </div>
          </div>
        )}

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

        {/* Input Fields */}
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6">
          {/* Facts Textarea */}
          <div className="space-y-4">
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

          {/* Location Input */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <MapPin className="w-4 h-4" />
              What city are you in?
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., San Francisco, CA"
              className="w-full p-4 rounded-[24px] bg-gray-50 border border-gray-200 focus:border-black focus:ring-black focus:outline-none text-gray-900 placeholder:text-gray-400 transition-all duration-200"
            />
            <p className="text-xs text-gray-500 px-4">
              Optional but helps us find local restaurants and places for you
            </p>
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
