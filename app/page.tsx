"use client";

import { useEffect, useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCardQueue } from "@/hooks/useCardQueue";
import { Onboarding } from "@/components/Onboarding";
import { Dashboard } from "@/components/Dashboard";
import { CardStack } from "@/components/cards/CardStack";
import { ProgressBar } from "@/components/navigation/ProgressBar";
import { ResetButton } from "@/components/navigation/ResetButton";
import { SettingsGear } from "@/components/navigation/SettingsGear";
import { PromptEditor } from "@/components/navigation/PromptEditor";
import { Question, ResultItem } from "@/lib/types";
import { clearSummary } from "@/lib/cookies";
import { ArrowLeft } from "lucide-react";

export default function Home() {
  const { profile, isLoaded, addFact, addLike, setInitialFacts, reset: resetProfile } = useUserProfile();
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
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if user is new (no profile data at all)
  useEffect(() => {
    if (isLoaded) {
      const isNewUser = profile.facts.length === 0 &&
        profile.likes.length === 0 &&
        !profile.initialFacts;
      setShowOnboarding(isNewUser);
    }
  }, [isLoaded, profile]);

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
      const positive = [
        "yes", "like", "superlike", "want", "really_want",
        "interested", "want_to_try", "loved_it", "already_use",
        "want_to_visit", "been_loved", "want_to_watch", "seen_loved",
        "want_to_read", "read_loved", "id_listen", "already_fan",
        "love_them", "curious", "already_loyal", "id_try",
        "love_doing", "already_do",
        "3", "4", "5"  // rating scale 3-5 are positive signals
      ].includes(answer.toLowerCase());

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
        rating: answer,
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
      clearSummary();
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

  const handleOnboardingComplete = (facts: string) => {
    setInitialFacts(facts);
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
  };

  // Show onboarding for new users
  if (showOnboarding && isLoaded) {
    return (
      <Onboarding
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    );
  }

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

        <Dashboard
          profile={profile}
          onContinue={handleContinue}
          onUpdateFacts={setInitialFacts}
        />
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
      <div className="w-full max-w-[500px]">
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
