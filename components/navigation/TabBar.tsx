import { MessageCircle, Sparkles, User } from "lucide-react";

export type Tab = "questions" | "results" | "me";

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-t border-gray-200/50 safe-area-bottom">
      <div className="max-w-2xl mx-auto flex">
        {/* Questions Tab */}
        <button
          onClick={() => onTabChange("questions")}
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${activeTab === "questions" ? "text-[#171717]" : "text-gray-400"
            }`}
        >
          <MessageCircle className="w-6 h-6" />
          <span className="text-xs font-medium">Questions</span>
        </button>

        {/* Results Tab */}
        <button
          onClick={() => onTabChange("results")}
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${activeTab === "results" ? "text-[#171717]" : "text-gray-400"
            }`}
        >
          <Sparkles className="w-6 h-6" />
          <span className="text-xs font-medium">Results</span>
        </button>

        {/* Me Tab */}
        <button
          onClick={() => onTabChange("me")}
          className={`flex-1 flex flex-col items-center py-3 gap-1 transition-colors ${activeTab === "me" ? "text-[#171717]" : "text-gray-400"
            }`}
        >
          <User className="w-6 h-6" />
          <span className="text-xs font-medium">Me</span>
        </button>
      </div>
    </nav>
  );
}
