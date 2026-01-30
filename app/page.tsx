"use client";

import { useEffect, useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCardQueue } from "@/hooks/useCardQueue";
import { Dashboard } from "@/components/Dashboard";
import { CardStack } from "@/components/cards/CardStack";
import { ProgressBar } from "@/components/navigation/ProgressBar";
import { ResetButton } from "@/components/navigation/ResetButton";
import { SettingsGear } from "@/components/navigation/SettingsGear";
import { PromptEditor } from "@/components/navigation/PromptEditor";
import { Question, ResultItem } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export default function Home() {
  const { profile, isLoaded, addFact, addLike, reset: resetProfile } = useUserProfile();
  const {
    currentCard,
    isLoading,
    error,
    progress,
    mode,
    hasMoreCards,
    fetchCards,
    nextCard,
    reset: resetQueue,
  } = useCardQueue();

  const [systemPrompt, setSystemPrompt] = useState<string | undefined>();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);

  // Fetch cards when transitioning from dashboard to card stack
  useEffect(() => {
    if (isLoaded && !showDashboard && !currentCard && !isLoading) {
      fetchCards(profile, "ask", 10, systemPrompt);
    }
  }, [isLoaded, showDashboard, currentCard, isLoading, profile, systemPrompt, fetchCards]);

  const handleAnswer = async (answer: string) => {
    if (!currentCard) return;

    // Save response to profile
    if (currentCard.type === "ask") {
      const question = currentCard.content as Question;
      const positive = ["yes", "like", "superlike", "want", "really_want"].includes(
        answer.toLowerCase()
      );

      addFact({
        questionId: question.id,
        question: question.title,
        answer,
        positive,
      });
    } else if (currentCard.type === "result") {
      const item = currentCard.content as ResultItem;
      addLike({
        itemId: item.id,
        item: item.name,
        category: item.category,
        rating: answer as "like" | "dislike" | "superlike",
      });
    }

    // Move to next card or fetch new batch
    if (hasMoreCards) {
      nextCard();
    } else {
      // Finished current batch, switch modes
      const nextMode = mode === "ask" ? "result" : "ask";
      const nextBatchSize = nextMode === "ask" ? 10 : 5; // 10 questions, 5 predictions
      
      await fetchCards(profile, nextMode, nextBatchSize, systemPrompt);
    }
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset? This will clear all your data.")) {
      resetProfile();
      resetQueue();
      setShowDashboard(true);
    }
  };

  const handleSavePrompt = (newPrompt: string) => {
    setSystemPrompt(newPrompt);
    // Reset and refetch with new prompt
    resetQueue();
  };

  const handleContinue = () => {
    setShowDashboard(false);
  };

  const handleBackToDashboard = () => {
    setShowDashboard(true);
  };

  // Show dashboard
  if (showDashboard && isLoaded) {
    return (
      <>
        {/* Reset Button */}
        <ResetButton onReset={handleReset} />

        {/* Settings Gear */}
        <SettingsGear onClick={() => setIsSettingsOpen(true)} />

        {/* Settings Modal */}
        <PromptEditor
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentPrompt={systemPrompt}
          onSave={handleSavePrompt}
        />

        <Dashboard profile={profile} onContinue={handleContinue} />
      </>
    );
  }

  // Show card stack
  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4">
      {/* Progress Bar */}
      <ProgressBar progress={progress} />

      {/* Back Button */}
      <button
        onClick={handleBackToDashboard}
        className="fixed top-4 left-4 z-50 w-12 h-12 rounded-full bg-white shadow-[0_4px_12px_rgb(0,0,0,0.08)] flex items-center justify-center text-gray-600 hover:text-blue-600 transition-all duration-200 hover:shadow-[0_6px_16px_rgb(0,0,0,0.12)] active:scale-95"
        aria-label="Back to Dashboard"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Settings Gear */}
      <SettingsGear onClick={() => setIsSettingsOpen(true)} />

      {/* Settings Modal */}
      <PromptEditor
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentPrompt={systemPrompt}
        onSave={handleSavePrompt}
      />

      {/* Card Stack */}
      <div className="w-full max-w-[400px]">
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-[24px]">
            <p className="font-medium">Error:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        <CardStack
          card={currentCard}
          onAnswer={handleAnswer}
          isLoading={isLoading}
        />

        {/* Stats */}
        {isLoaded && !isLoading && (
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              {profile.facts.length} facts • {profile.likes.length} likes
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
