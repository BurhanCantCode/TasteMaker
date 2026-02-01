"use client";

import { useEffect, useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCardQueue } from "@/hooks/useCardQueue";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Onboarding } from "@/components/Onboarding";
import { Dashboard } from "@/components/Dashboard";
import { CardStack } from "@/components/cards/CardStack";
import { ProgressBar } from "@/components/navigation/ProgressBar";
import { ResetButton } from "@/components/navigation/ResetButton";
import { SettingsGear } from "@/components/navigation/SettingsGear";
import { PromptEditor } from "@/components/navigation/PromptEditor";
import { PhoneSignIn } from "@/components/auth/PhoneSignIn";
import { Question, ResultItem } from "@/lib/types";
import { clearSummary, clearCardSession } from "@/lib/cookies";
import { deleteCloudProfile } from "@/lib/firestore";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function Home() {
  const { profile, isLoaded, addFact, addLike, setInitialFacts, setUserLocation, reset: resetProfile } = useUserProfile();
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

  const { user, isAuthLoading } = useAuth();
  const { initialSyncDone, hasPendingMerge } = useSync();

  const [systemPrompt, setSystemPrompt] = useState<string | undefined>();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPhoneSignIn, setShowPhoneSignIn] = useState(false);

  // Check if user is new (no profile data at all) — wait for sync to finish
  useEffect(() => {
    if (isLoaded && initialSyncDone) {
      const isNewUser = profile.facts.length === 0 &&
        profile.likes.length === 0 &&
        !profile.initialFacts;
      queueMicrotask(() => setShowOnboarding(isNewUser));
    }
  }, [isLoaded, initialSyncDone, profile]);

  // PRE-FETCH: Load first batch of questions when new user is on welcome screen
  useEffect(() => {
    if (showOnboarding && isLoaded && !currentCard && !isLoading) {
      // New user on welcome screen - pre-fetch questions so they load instantly
      const isNewUser = profile.facts.length === 0 && profile.likes.length === 0;
      if (isNewUser) {
        fetchCards(profile, "ask", 10, systemPrompt);
      }
    }
  }, [showOnboarding, isLoaded, currentCard, isLoading, profile, systemPrompt, fetchCards]);

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

      // NEW: Auto-detect and parse location from text_input questions about city
      if (question.answerType === "text_input" &&
        (question.title.toLowerCase().includes("city") ||
          question.title.toLowerCase().includes("where") ||
          question.title.toLowerCase().includes("location"))) {
        // Parse location from answer (e.g., "San Francisco, CA" or "New York")
        const locationParts = answer.split(',').map(p => p.trim());
        if (locationParts.length >= 2) {
          // Has city and region/state: "San Francisco, CA"
          setUserLocation(locationParts[0], locationParts[1]);
        } else if (locationParts[0] && locationParts[0].length > 0) {
          // Just city: "Tokyo" or "New York City"
          setUserLocation(locationParts[0]);
        }
      }

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

  const handleReset = async () => {
    if (confirm("Are you sure you want to reset? This will clear all your data.")) {
      resetProfile();
      resetQueue();
      clearSummary();
      clearCardSession();
      // Also clear cloud data if authenticated
      if (user) {
        await deleteCloudProfile(user.uid);
      }
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

  const handleOnboardingComplete = () => {
    // Questions already pre-fetched when welcome screen mounted
    setShowOnboarding(false);
    setShowDashboard(false); // Skip dashboard, go straight to cards
  };

  const handleSignInSuccess = () => {
    setShowPhoneSignIn(false);
  };

  // Wait for profile and auth to load before deciding what to show
  // Also wait for any pending merge from cloud sync to be applied
  if (!isLoaded || isAuthLoading || !initialSyncDone || hasPendingMerge) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="w-10 h-10 text-gray-400 animate-spin" aria-hidden />
        <p className="text-sm font-medium text-gray-500">Loading...</p>
      </div>
    );
  }

  // Show onboarding for new users
  if (showOnboarding) {
    return (
      <>
        <Onboarding
          onComplete={handleOnboardingComplete}
          onSignInClick={() => setShowPhoneSignIn(true)}
          isSignedIn={!!user}
          signedInLabel={user?.phoneNumber ? "***" + user.phoneNumber.slice(-4) : undefined}
        />
        <PhoneSignIn
          isOpen={showPhoneSignIn}
          onClose={() => setShowPhoneSignIn(false)}
          onSuccess={handleSignInSuccess}
        />
      </>
    );
  }

  // Show dashboard
  if (showDashboard) {
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
          onSignInClick={() => setShowPhoneSignIn(true)}
        />

        <PhoneSignIn
          isOpen={showPhoneSignIn}
          onClose={() => setShowPhoneSignIn(false)}
          onSuccess={handleSignInSuccess}
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
      <div className="w-full min-w-[400px] max-w-[500px]">
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
