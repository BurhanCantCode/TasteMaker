"use client";

import { useEffect, useState } from "react";
import { UserProfile } from "@/lib/types";
import { analyzeProfile } from "@/lib/utils";
import { loadSummary, saveSummary, CachedSummary } from "@/lib/cookies";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { FactsModal } from "./FactsModal";
import { AccountMenu } from "./auth/AccountMenu";
import { SignInPrompt } from "./auth/SignInPrompt";
import { Heart, X, Sparkles, ArrowRight, BookOpen, ThumbsUp, Loader2, Plus } from "lucide-react";

interface DashboardProps {
  profile: UserProfile;
  onContinue: () => void;
  onUpdateFacts?: (facts: string) => void;
  onSignInClick?: () => void;
}

export function Dashboard({ profile, onContinue, onUpdateFacts, onSignInClick }: DashboardProps) {
  const { categoryBreakdown, topTraits, recentActivity } = analyzeProfile(profile);
  const { user } = useAuth();
  const { triggerSync } = useSync();
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [isFactsModalOpen, setIsFactsModalOpen] = useState(false);

  const totalFacts = profile.facts.length;
  const totalLikes = profile.likes.length;
  const isNewUser = totalFacts === 0 && totalLikes === 0;

  // Fetch AI summary only when profile has new data
  useEffect(() => {
    async function fetchSummary() {
      // Check cached summary first
      const cached = loadSummary();
      
      // Use cached if profile hasn't grown
      if (cached && 
          cached.factsCount === totalFacts && 
          cached.likesCount === totalLikes) {
        setSummary(cached.text);
        return;
      }
      
      // Need minimum data to generate summary
      if (totalFacts < 3 && totalLikes < 2) return;
      
      // Only fetch if we have new data
      if (!cached || totalFacts > cached.factsCount || totalLikes > cached.likesCount) {
        setSummaryLoading(true);
        try {
          const response = await fetch("/api/summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userProfile: profile }),
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.summary) {
              setSummary(data.summary);
              
              // Cache the new summary
              const newCache: CachedSummary = {
                text: data.summary,
                factsCount: totalFacts,
                likesCount: totalLikes,
              };
              saveSummary(newCache);
              // Sync summary to cloud if authenticated
              if (user) {
                triggerSync(profile, undefined, newCache);
              }
            }
          }
        } catch (error) {
          console.error("Failed to fetch summary:", error);
        } finally {
          setSummaryLoading(false);
        }
      }
    }

    fetchSummary();
  }, [profile, totalFacts, totalLikes, user, triggerSync]);

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        {/* Account Menu */}
        {onSignInClick && (
          <div className="flex justify-end">
            <AccountMenu onSignInClick={onSignInClick} />
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold tracking-tight text-[#171717]">
            {isNewUser ? "Welcome to Tastemaker" : "Welcome back"}
          </h1>
          <p className="text-lg text-gray-500">
            {isNewUser
              ? "Let's discover your unique taste profile"
              : "Here's what we know about you so far"}
          </p>
        </div>

        {/* Stats Grid */}
        {!isNewUser && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Facts Card */}
              <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col items-center text-center space-y-2">
                <div className="p-3 bg-gray-50 rounded-full mb-2">
                  <BookOpen className="w-6 h-6 text-gray-900" />
                </div>
                <div className="text-4xl font-bold text-gray-900">
                  {totalFacts}
                </div>
                <div className="text-sm font-medium text-gray-400 uppercase tracking-wide">Facts</div>
              </div>

              {/* Likes Card */}
              <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col items-center text-center space-y-2">
                <div className="p-3 bg-gray-50 rounded-full mb-2">
                  <ThumbsUp className="w-6 h-6 text-gray-900" />
                </div>
                <div className="text-4xl font-bold text-gray-900">
                  {totalLikes}
                </div>
                <div className="text-sm font-medium text-gray-400 uppercase tracking-wide">Rated</div>
              </div>
            </div>

            {/* AI Summary */}
            {(summary || summaryLoading) && (
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-blue-100">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  About You
                </h2>
                {summaryLoading ? (
                  <div className="flex items-center gap-3 text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Analyzing your profile...</span>
                  </div>
                ) : (
                  <p className="text-gray-700 leading-relaxed">{summary}</p>
                )}
              </div>
            )}

            {/* Category Breakdown */}
            {Object.keys(categoryBreakdown).length > 0 && (
              <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  Taste Profile
                </h2>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(categoryBreakdown).map(([category, count]) => (
                    <div
                      key={category}
                      className="bg-gray-50 border border-gray-100 text-gray-900 px-5 py-2.5 rounded-full text-sm font-medium transition-colors hover:bg-gray-100"
                    >
                      {category} <span className="text-gray-400 ml-1">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Answers */}
            {topTraits.length > 0 && (
              <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  Recent Answers
                </h2>
                <div className="space-y-3">
                  {topTraits.map((trait, index) => (
                    <div key={index} className="flex items-start gap-4 group p-3 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="w-2 h-2 bg-black rounded-full ring-4 ring-gray-100 group-hover:ring-gray-200 transition-all mt-2 flex-shrink-0" />
                      <span className="text-gray-700 font-medium">{trait}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  Recent Activity
                </h2>
                <div className="space-y-4">
                  {recentActivity.map((like) => (
                    <div
                      key={like.itemId}
                      className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 transition-colors hover:bg-gray-100"
                    >
                      {like.rating === "superlike" && (
                        <div className="p-2 bg-yellow-100 rounded-full">
                          <Sparkles className="w-4 h-4 text-yellow-600" />
                        </div>
                      )}
                      {like.rating === "like" && (
                        <div className="p-2 bg-green-100 rounded-full">
                          <Heart className="w-4 h-4 text-green-600" />
                        </div>
                      )}
                      {like.rating === "dislike" && (
                        <div className="p-2 bg-red-100 rounded-full">
                          <X className="w-4 h-4 text-red-600" />
                        </div>
                      )}
                      <span className="flex-1 font-medium text-gray-900">{like.item}</span>
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                        {like.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sign-in prompt for guest users with data */}
        {!user && onSignInClick && !isNewUser && (totalFacts >= 5 || totalLikes >= 3) && (
          <SignInPrompt onSignInClick={onSignInClick} />
        )}

        {/* Actions */}
        <div className="space-y-4">
          {/* Share More Facts Button */}
          {!isNewUser && onUpdateFacts && (
            <button
              onClick={() => setIsFactsModalOpen(true)}
              className="w-full bg-white text-gray-700 h-[56px] rounded-[24px] font-semibold hover:bg-gray-50 transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgb(0,0,0,0.06)]"
            >
              <Plus className="w-5 h-5" />
              Share more facts
            </button>
          )}

          {/* Continue Button */}
          <button
            onClick={onContinue}
            className="w-full bg-[#171717] text-white h-[72px] rounded-[32px] font-bold text-lg hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
          >
            {isNewUser ? "Start Profiling" : "Continue Journey"}
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>

        {/* Facts Modal */}
        <FactsModal
          isOpen={isFactsModalOpen}
          onClose={() => setIsFactsModalOpen(false)}
          currentFacts={profile.initialFacts}
          onSave={(facts) => {
            onUpdateFacts?.(facts);
            setIsFactsModalOpen(false);
          }}
        />
      </div>
    </div>
  );
}
