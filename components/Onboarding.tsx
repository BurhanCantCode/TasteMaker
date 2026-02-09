"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingProps {
  onComplete: (chiefComplaint: string) => void;
  onSignInClick?: () => void;
  isSignedIn?: boolean;
  signedInLabel?: string;
}

export function Onboarding({ onComplete, onSignInClick, isSignedIn, signedInLabel }: OnboardingProps) {
  const [complaint, setComplaint] = useState("");

  const handleSubmit = () => {
    onComplete(complaint.trim());
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
                  Sign in to continue your assessment
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
          <h1 className="text-4xl font-bold tracking-tight text-[#171717]">
            Diagno Alpha
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Tell us what's going on, and we'll ask targeted yes/no questions to assess potential conditions
          </p>
        </div>

        {/* Chief Complaint Input */}
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
          <h3 className="text-xl font-bold text-[#171717]">
            What's bothering you?
          </h3>
          <p className="text-sm text-gray-500">
            Describe your main symptoms or concerns in a few words. This helps us ask the right questions.
          </p>
          <textarea
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="e.g., I've had a persistent headache and dizziness for the past 3 days..."
            className={cn(
              "w-full h-32 p-5 rounded-[24px] bg-gray-50",
              "border border-gray-200 focus:border-black focus:ring-black focus:outline-none",
              "text-gray-900 placeholder:text-gray-400 text-lg resize-none transition-all duration-200"
            )}
          />
        </div>

        {/* How it works */}
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-gray-900">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Screening questions</h3>
                <p className="text-sm text-gray-600">
                  20 yes/no questions across 4 rounds, each building on your previous answers
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-gray-900">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Progressive narrowing</h3>
                <p className="text-sm text-gray-600">
                  Each round gets more targeted as the AI narrows down possibilities
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-gray-900">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Get insights</h3>
                <p className="text-sm text-gray-600">
                  Receive preliminary diagnostic hypotheses based on your symptom pattern
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleSubmit}
          disabled={!complaint.trim()}
          className={cn(
            "w-full h-[72px] rounded-[32px] font-bold text-lg transition-all duration-200 flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]",
            complaint.trim()
              ? "bg-[#171717] text-white hover:bg-black hover:scale-[1.02] active:scale-[0.98]"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
        >
          Begin Assessment
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
