"use client";

import { ArrowRight, Check } from "lucide-react";

interface OnboardingProps {
  onComplete: () => void; // Simplified - just signals ready to start
  onSignInClick?: () => void;
  isSignedIn?: boolean;
  signedInLabel?: string;
}

export function Onboarding({ onComplete, onSignInClick, isSignedIn, signedInLabel }: OnboardingProps) {
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

        {/* Welcome Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex mb-4">
            <svg
              className="w-8 h-8 text-black"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* First card (behind) */}
              <rect
                x="4"
                y="6"
                width="20"
                height="26"
                rx="2"
                fill="white"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect
                x="6"
                y="8"
                width="16"
                height="22"
                rx="1"
                fill="currentColor"
                opacity="0.1"
              />
              {/* Second card (in front) */}
              <rect
                x="8"
                y="2"
                width="20"
                height="26"
                rx="2"
                fill="white"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect
                x="10"
                y="4"
                width="16"
                height="22"
                rx="1"
                fill="currentColor"
                opacity="0.1"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[#171717]">
            Tastemaker Alpha
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Answer a few quick questions and we'll discover your unique taste profile together
          </p>
        </div>

        {/* Info Cards */}
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-gray-900">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Quick questions</h3>
                <p className="text-sm text-gray-600">
                  We'll ask about your location, preferences, and lifestyle
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-gray-900">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Discover your taste</h3>
                <p className="text-sm text-gray-600">
                  Get personalized recommendations for restaurants, products, and experiences
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-gray-900">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Swipe and refine</h3>
                <p className="text-sm text-gray-600">
                  The more you interact, the better we understand your preferences
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={onComplete}
          className="w-full bg-[#171717] text-white h-[72px] rounded-[32px] font-bold text-lg hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
        >
          Let's Start
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
