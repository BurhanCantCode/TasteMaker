"use client";

import { Smartphone } from "lucide-react";

interface SignInPromptProps {
  onSignInClick: () => void;
}

export function SignInPrompt({ onSignInClick }: SignInPromptProps) {
  return (
    <div className="w-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-4 h-4 text-blue-600" />
        </div>
        <p className="text-sm text-gray-700">
          Sign in to save your profile across devices
        </p>
      </div>
      <button
        onClick={onSignInClick}
        className="flex-shrink-0 px-4 py-2 bg-[#171717] text-white text-sm font-semibold rounded-xl hover:bg-[#2a2a2a] transition-all active:scale-95"
      >
        Sign In
      </button>
    </div>
  );
}
