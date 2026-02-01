"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Sparkles } from "lucide-react";

export function TabBar() {
  const pathname = usePathname();
  const isResults = pathname === "/results";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-t border-gray-200/50 safe-area-bottom">
      <div className="max-w-2xl mx-auto flex">
        {/* Questions Tab */}
        <Link
          href="/"
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${
            !isResults ? "text-[#171717]" : "text-gray-400"
          }`}
        >
          <MessageCircle className="w-6 h-6" />
          <span className="text-xs font-medium">Questions</span>
        </Link>

        {/* Results Tab */}
        <Link
          href="/results"
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${
            isResults ? "text-[#171717]" : "text-gray-400"
          }`}
        >
          <Sparkles className="w-6 h-6" />
          <span className="text-xs font-medium">Results</span>
        </Link>
      </div>
    </nav>
  );
}
