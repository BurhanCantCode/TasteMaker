"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { TabBar } from "@/components/navigation/TabBar";
import { CategoryPicker } from "@/components/results/CategoryPicker";
import { RecommendationFeed } from "@/components/results/RecommendationFeed";
import { SettingsGear } from "@/components/navigation/SettingsGear";
import { PromptEditor } from "@/components/navigation/PromptEditor";
import { ResultItem } from "@/lib/types";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";

// Module-level cache persists across component mounts/unmounts (navigation)
const categoryCache = new Map<string, ResultItem[]>();

export default function ResultsPage() {
  const { profile, isLoaded, addLike } = useUserProfile();
  const { user, isAuthLoading } = useAuth();
  const { initialSyncDone, hasPendingMerge } = useSync();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Track initial profile state to detect when user rates items
  const initialProfileLikesCount = useRef(profile.likes.length);

  const totalAnswered = profile.facts.length;
  const isLocked = totalAnswered < 20;

  // Clear cache when user rates an item (profile.likes changes)
  useEffect(() => {
    if (profile.likes.length !== initialProfileLikesCount.current) {
      // User rated something, clear the cache for current category
      if (selectedCategory) {
        categoryCache.delete(selectedCategory);
      }
      initialProfileLikesCount.current = profile.likes.length;
    }
  }, [profile.likes.length, selectedCategory]);

  const handleCategorySelect = async (category: string) => {
    setSelectedCategory(category);
    setError(null);

    // Special handling for "all" category - aggregate all cached items (deduplicated by id)
    if (category === "all") {
      const byId = new Map<string, ResultItem>();
      for (const [key, items] of categoryCache.entries()) {
        if (key !== "all") {
          for (const item of items) {
            if (!byId.has(item.id)) byId.set(item.id, item);
          }
        }
      }
      const allCachedItems = Array.from(byId.values());

      // If we have cached items from other categories, show them
      if (allCachedItems.length > 0) {
        categoryCache.set("all", allCachedItems);
        setResults(allCachedItems);
        return;
      }

      // Otherwise check if "all" itself has a cache
      const cached = categoryCache.get("all");
      if (cached && cached.length > 0) {
        setResults(cached);
        return;
      }
    } else {
      // Check cache first for specific categories
      const cached = categoryCache.get(category);
      if (cached && cached.length > 0) {
        setResults(cached);
        return;
      }
    }

    // No cache, fetch new results
    setIsGenerating(true);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProfile: profile,
          batchSize: 5,
          mode: "result",
          categoryFilter: category === "all" ? undefined : category,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate recommendations");
      }

      const data = await response.json();
      const items = data.cards
        .filter((c: any) => c.type === "result")
        .map((c: any) => c.content as ResultItem);

      // Store in cache
      categoryCache.set(category, items);
      setResults(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRate = (item: ResultItem, rating: string) => {
    addLike({
      itemId: item.id,
      item: item.name,
      category: item.category,
      rating,
    });
    // Remove rated item from list and cache
    setResults(prev => {
      const updated = prev.filter(r => r.id !== item.id);
      if (selectedCategory) {
        categoryCache.set(selectedCategory, updated);
      }
      return updated;
    });
  };

  const handleLoadMore = async () => {
    if (!selectedCategory) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userProfile: profile,
          batchSize: 5,
          mode: "result",
          categoryFilter: selectedCategory === "all" ? undefined : selectedCategory,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate recommendations");
      }

      const data = await response.json();
      const newItems = data.cards
        .filter((c: { type: string }) => c.type === "result")
        .map((c: { content: ResultItem }) => c.content as ResultItem) as ResultItem[];

      // Append to existing results and cache, filtering out duplicates by ID
      setResults(prev => {
        const existingIds = new Set(prev.map((item: ResultItem) => item.id));
        const uniqueNewItems = newItems.filter((item: ResultItem) => !existingIds.has(item.id));
        const updated = [...prev, ...uniqueNewItems];
        categoryCache.set(selectedCategory, updated);
        return updated;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  // Loading states
  if (!isLoaded || isAuthLoading || !initialSyncDone || hasPendingMerge) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
        <p className="text-sm font-medium text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] pb-24">
      {/* Settings Gear */}
      <SettingsGear onClick={() => setIsSettingsOpen(true)} />
      <PromptEditor
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentPrompt={undefined}
        onSave={() => {}}
      />

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3 pt-8">
          <h1 className="text-4xl font-bold tracking-tight text-[#171717]">
            Recommendations
          </h1>
          <p className="text-lg text-gray-500">
            Personalized picks based on your taste profile
          </p>
        </div>

        {/* Locked State (< 20 questions) */}
        {isLocked ? (
          <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center space-y-6">
            <div className="inline-flex p-4 bg-gray-50 rounded-full">
              <Sparkles className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[#171717]">
              {20 - totalAnswered} more questions to go
            </h2>
            <p className="text-lg text-gray-500">
              Answer more questions to unlock personalized recommendations
            </p>
            {/* Progress bar */}
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${(totalAnswered / 20) * 100}%` }}
              />
            </div>
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
              {totalAnswered} / 20 questions answered
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-3 w-full bg-[#171717] text-white h-[72px] rounded-[32px] font-bold text-lg hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
            >
              Keep Answering
              <ArrowRight className="w-6 h-6" />
            </Link>
          </div>
        ) : (
          <>
            {/* Category Picker */}
            <CategoryPicker
              selectedCategory={selectedCategory}
              onSelect={handleCategorySelect}
            />

            {/* Results Feed */}
            {error ? (
              <div className="bg-red-50 rounded-[32px] p-8 text-center space-y-4">
                <p className="text-red-600 font-medium">Error: {error}</p>
                <button
                  onClick={() => selectedCategory && handleCategorySelect(selectedCategory)}
                  className="bg-red-600 text-white px-6 py-3 rounded-[24px] font-semibold hover:bg-red-700 transition-all"
                >
                  Try Again
                </button>
              </div>
            ) : results.length > 0 ? (
              <RecommendationFeed
                results={results}
                onRate={handleRate}
                onLoadMore={handleLoadMore}
                isLoading={isGenerating}
              />
            ) : isGenerating ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
                <p className="text-sm font-medium text-gray-500">Generating recommendations...</p>
              </div>
            ) : selectedCategory ? (
              <div className="bg-white rounded-[32px] p-8 text-center space-y-4">
                <p className="text-gray-500 text-lg">No recommendations yet. Try selecting a category.</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Tab Bar */}
      <TabBar />
    </div>
  );
}
