"use client";

import { useEffect, useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCardQueue } from "@/hooks/useCardQueue";
import { CardStack } from "@/components/cards/CardStack";
import { ProgressBar } from "@/components/navigation/ProgressBar";
import { ResetButton } from "@/components/navigation/ResetButton";
import { SettingsGear } from "@/components/navigation/SettingsGear";
import { PromptEditor } from "@/components/navigation/PromptEditor";
import { Question, ResultItem } from "@/lib/types";

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

  // Initial load: fetch first batch of ASK cards
  useEffect(() => {
    if (isLoaded && !currentCard && !isLoading) {
      fetchCards(profile, "ask", 10, systemPrompt);
    }
  }, [isLoaded, currentCard, isLoading, profile, systemPrompt, fetchCards]);

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
    }
  };

  const handleSavePrompt = (newPrompt: string) => {
    setSystemPrompt(newPrompt);
    // Reset and refetch with new prompt
    resetQueue();
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4">
      {/* Progress Bar */}
      <ProgressBar progress={progress} />

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
