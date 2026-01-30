"use client";

import { UserProfile } from "@/lib/types";
import { analyzeProfile } from "@/lib/utils";
import { Heart, X, Sparkles, ArrowRight } from "lucide-react";

interface DashboardProps {
  profile: UserProfile;
  onContinue: () => void;
}

export function Dashboard({ profile, onContinue }: DashboardProps) {
  const { categoryBreakdown, topTraits, recentActivity } = analyzeProfile(profile);
  
  const totalFacts = profile.facts.length;
  const totalLikes = profile.likes.length;
  const isNewUser = totalFacts === 0 && totalLikes === 0;

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            {isNewUser ? "Welcome to Tastemaker" : "Welcome back!"}
          </h1>
          <p className="text-gray-600">
            {isNewUser 
              ? "Let's discover your unique taste profile" 
              : `You've answered ${totalFacts} questions`}
          </p>
        </div>

        {/* Stats Cards */}
        {!isNewUser && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Facts Card */}
              <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_12px_rgb(0,0,0,0.06)]">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {totalFacts}
                </div>
                <div className="text-sm text-gray-600">Facts Collected</div>
              </div>

              {/* Likes Card */}
              <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_12px_rgb(0,0,0,0.06)]">
                <div className="text-3xl font-bold text-pink-600 mb-1">
                  {totalLikes}
                </div>
                <div className="text-sm text-gray-600">Preferences Rated</div>
              </div>
            </div>

            {/* Category Breakdown */}
            {Object.keys(categoryBreakdown).length > 0 && (
              <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_12px_rgb(0,0,0,0.06)] mb-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  Category Breakdown
                </h2>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(categoryBreakdown).map(([category, count]) => (
                    <div
                      key={category}
                      className="bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium"
                    >
                      {category}: {count}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Traits */}
            {topTraits.length > 0 && (
              <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_12px_rgb(0,0,0,0.06)] mb-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  Your Top Traits
                </h2>
                <div className="space-y-2">
                  {topTraits.map((trait, index) => (
                    <div key={index} className="flex items-center gap-2 text-gray-700">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                      {trait}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_12px_rgb(0,0,0,0.06)] mb-6">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  Recent Activity
                </h2>
                <div className="space-y-3">
                  {recentActivity.map((like) => (
                    <div
                      key={like.itemId}
                      className="flex items-center gap-3 text-gray-700"
                    >
                      {like.rating === "superlike" && (
                        <Sparkles className="w-5 h-5 text-purple-500" />
                      )}
                      {like.rating === "like" && (
                        <Heart className="w-5 h-5 text-pink-500" />
                      )}
                      {like.rating === "dislike" && (
                        <X className="w-5 h-5 text-red-500" />
                      )}
                      <span className="flex-1">{like.item}</span>
                      <span className="text-xs text-gray-400 capitalize">
                        {like.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Continue Button */}
        <button
          onClick={onContinue}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-5 px-8 rounded-[24px] font-semibold text-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
        >
          {isNewUser ? "Get Started" : "Continue Your Journey"}
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
