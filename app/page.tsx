"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCardQueue } from "@/hooks/useCardQueue";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Onboarding } from "@/components/Onboarding";
import { Dashboard } from "@/components/Dashboard";
import { ResultsView } from "@/components/views/ResultsView";
import { CardStack } from "@/components/cards/CardStack";
import { ProgressBar } from "@/components/navigation/ProgressBar";
import { ResetButton } from "@/components/navigation/ResetButton";
import { SettingsGear } from "@/components/navigation/SettingsGear";
import { PromptEditor } from "@/components/navigation/PromptEditor";
import { PhoneSignIn } from "@/components/auth/PhoneSignIn";
import { TabBar, Tab } from "@/components/navigation/TabBar";
import { RecommendationInterstitialCard } from "@/components/cards/RecommendationInterstitialCard";
import { Question, ResultItem, UserProfile } from "@/lib/types";
import { clearSummary, clearCardSession, loadPendingCards, clearPendingCards } from "@/lib/cookies";
import { getAskBatchSize } from "@/lib/batching";
import { deleteCloudProfile } from "@/lib/firestore";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function Home() {
  const { profile, isLoaded, addFact, addLike, setInitialFacts, setUserLocation, reset: resetProfile } = useUserProfile();
  const {
    cards,
    currentIndex,
    currentCard,
    isLoading,
    error,
    progress,
    mode,
    hasMoreCards,
    fetchCards,
    nextCard,
    reset: resetQueue,
    hydrateFromPending,
    prefetchNextBatch,
  } = useCardQueue();

  const { user, isAuthLoading } = useAuth();
  const { initialSyncDone, hasPendingMerge } = useSync();
  const router = useRouter();

  const [systemPrompt, setSystemPrompt] = useState<string | undefined>();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("me"); // Default to 'Me' (Dashboard)
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPhoneSignIn, setShowPhoneSignIn] = useState(false);
  const [showInterstitial, setShowInterstitial] = useState(false);

  // Check if user is new (no profile data at all) — wait for sync to finish
  useEffect(() => {
    if (isLoaded && initialSyncDone && !hasPendingMerge) {
      const isNewUser = profile.facts.length === 0 &&
        profile.likes.length === 0 &&
        !profile.initialFacts;
      if (isNewUser) {
        setShowOnboarding(true);
        setActiveTab("questions");
      }
    }
  }, [isLoaded, initialSyncDone, hasPendingMerge, profile]);

  // PRE-FETCH: Load first batch of questions when new user is on welcome screen
  useEffect(() => {
    if (showOnboarding && isLoaded && !currentCard && !isLoading) {
      const isNewUser = profile.facts.length === 0 && profile.likes.length === 0;
      if (isNewUser) {
        fetchCards(profile, "ask", getAskBatchSize(profile.facts.length), systemPrompt);
      }
    }
  }, [showOnboarding, isLoaded, currentCard, isLoading, profile, systemPrompt, fetchCards]);

  // Restore from persisted questions (survives refresh) or fetch when transitioning to questions tab
  useEffect(() => {
    if (!isLoaded || activeTab !== "questions" || currentCard || isLoading) return;

    const pending = loadPendingCards();
    if (pending && pending.mode === "ask" && pending.cards.length > 0) {
      const answeredIds = new Set(profile.facts.map((f) => f.questionId));
      let firstUnanswered = 0;
      while (firstUnanswered < pending.cards.length) {
        const card = pending.cards[firstUnanswered];
        if (card.type === "ask") {
          const q = card.content as Question;
          if (!answeredIds.has(q.id)) break;
        }
        firstUnanswered++;
      }
      if (firstUnanswered >= pending.cards.length) {
        clearPendingCards();
        fetchCards(profile, "ask", getAskBatchSize(profile.facts.length), systemPrompt);
      } else {
        hydrateFromPending({ ...pending, currentIndex: firstUnanswered });
      }
      return;
    }

    fetchCards(profile, "ask", getAskBatchSize(profile.facts.length), systemPrompt);
  }, [isLoaded, activeTab, currentCard, isLoading, profile, systemPrompt, fetchCards, hydrateFromPending]);

  // Prefetch orchestration for ASK mode — single mid-batch trigger, never force
  useEffect(() => {
    if (activeTab !== "questions" || mode !== "ask" || cards.length === 0) return;
    if (showInterstitial || showOnboarding) return;

    const halfBatch = Math.ceil(cards.length / 2);
    if (currentIndex >= halfBatch) {
      const predictedFacts = profile.facts.length + (cards.length - currentIndex);
      const nextBatchSize = getAskBatchSize(predictedFacts);
      // Non-force: skipped if already prefetching or buffer exists
      prefetchNextBatch(profile, "ask", nextBatchSize, systemPrompt, { reason: "mid-batch-auto" });
    }
  }, [activeTab, mode, cards.length, currentIndex, profile, systemPrompt, prefetchNextBatch, showInterstitial, showOnboarding]);

  const handleAnswer = async (answer: string) => {
    if (!currentCard) return;

    if (currentCard.type === "ask") {
      const question = currentCard.content as Question;

      if (question.answerType === "text_input" &&
        (question.title.toLowerCase().includes("city") ||
          question.title.toLowerCase().includes("where") ||
          question.title.toLowerCase().includes("location"))) {
        const locationParts = answer.split(',').map(p => p.trim());
        if (locationParts.length >= 2) {
          setUserLocation(locationParts[0], locationParts[1]);
        } else if (locationParts[0] && locationParts[0].length > 0) {
          setUserLocation(locationParts[0]);
        }
      }

      const positive = [
        "yes", "like", "superlike", "want", "really_want",
        "interested", "want_to_try", "loved_it", "already_use",
        "want_to_visit", "been_loved", "want_to_watch", "seen_loved",
        "want_to_read", "read_loved", "id_listen", "already_fan",
        "love_them", "curious", "already_loyal", "id_try",
        "love_doing", "already_do", "already_have",
        "3", "4", "5"
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

    if (hasMoreCards) {
      nextCard();
    } else {
      const factsAfterThis = profile.facts.length + 1;
      // After each batch, check if we've reached 20 total
      if (factsAfterThis >= 20) {
        setShowInterstitial(true);
        // Kick off prefetch now so it's ready when "Keep Answering" is clicked
        const projectedProfile: UserProfile = {
          ...profile,
          facts: [
            ...profile.facts,
            ...(currentCard.type === "ask"
              ? [{
                  questionId: (currentCard.content as Question).id,
                  question: (currentCard.content as Question).title,
                  answer,
                  positive: [
                    "yes", "like", "superlike", "want", "really_want",
                    "interested", "want_to_try", "loved_it", "already_use",
                    "want_to_visit", "been_loved", "want_to_watch", "seen_loved",
                    "want_to_read", "read_loved", "id_listen", "already_fan",
                    "love_them", "curious", "already_loyal", "id_try",
                    "love_doing", "already_do", "already_have",
                    "3", "4", "5"
                  ].includes(answer.toLowerCase()),
                  timestamp: Date.now(),
                }]
              : []),
          ],
        };
        // Do not force here: preserve any ready prefetched batch for instant "Keep Answering".
        // If there's no buffer yet, this will still start a prefetch with projected latest context.
        prefetchNextBatch(
          projectedProfile,
          "ask",
          getAskBatchSize(factsAfterThis),
          systemPrompt,
          { reason: "post-batch-interstitial" }
        );
      } else {
        // Build a projected profile with the just-answered fact so generation has fresh context
        const nextProfile: UserProfile = {
          ...profile,
          facts: [
            ...profile.facts,
            ...(currentCard.type === "ask"
              ? [{
                  questionId: (currentCard.content as Question).id,
                  question: (currentCard.content as Question).title,
                  answer,
                  positive: answer.toLowerCase() === "yes",
                  timestamp: Date.now(),
                }]
              : []),
          ],
        };
        await fetchCards(nextProfile, "ask", getAskBatchSize(factsAfterThis), systemPrompt);
      }
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setActiveTab("questions");
  };

  const handleSignInSuccess = () => {
    setShowPhoneSignIn(false);
    window.location.reload();
  };

  const handleSavePrompt = (prompt: string) => {
    setSystemPrompt(prompt);
    resetQueue();
  };

  const handleReset = () => {
    if (confirm("Are you sure? This will delete your local profile and preferences.")) {
      resetProfile();
      resetQueue();
      clearSummary();
      clearCardSession();
      if (user) {
        deleteCloudProfile(user.uid);
      }
      setActiveTab("me"); // Reset to dashboard/me view
      window.location.reload();
    }
  };

  const handleBackToDashboard = () => {
    setActiveTab("me");
  };

  // Loading state
  const isSyncing = !initialSyncDone || hasPendingMerge;
  if (!isLoaded || isAuthLoading || isSyncing) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
        <p className="text-sm font-medium text-gray-500">
          {hasPendingMerge ? "Syncing data..." : "Loading your profile..."}
        </p>
      </div>
    );
  }

  // Welcome Screen (Modal-like)
  if (showOnboarding) {
    return (
      <>
        <Onboarding
          onComplete={handleOnboardingComplete}
          onSignInClick={() => setShowPhoneSignIn(true)}
          isSignedIn={!!user}
          signedInLabel={user?.phoneNumber ?? undefined}
        />
        <PhoneSignIn
          isOpen={showPhoneSignIn}
          onClose={() => setShowPhoneSignIn(false)}
          onSuccess={handleSignInSuccess}
        />
      </>
    );
  }

  // Recommendation Interstitial
  if (showInterstitial) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4">
        <div className="w-full max-w-[500px] h-[600px]">
          <RecommendationInterstitialCard
            onViewRecommendations={() => {
              setShowInterstitial(false);
              setActiveTab("results");
            }}
            onKeepAnswering={async () => {
              setShowInterstitial(false);
              // Interstitial only appears once user reaches 20+, so always resume with 10-card batches.
              // This avoids a one-tick stale profile count causing a 5-card request and missing the prefetch.
              const resumeFactsCount = Math.max(profile.facts.length, 20);
              const resumeBatchSize = getAskBatchSize(resumeFactsCount);
              await fetchCards(profile, "ask", resumeBatchSize, systemPrompt);
            }}
          />
        </div>
      </div>
    );
  }

  // Main App View (Tabs)
  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      <div className="pb-24">
        {activeTab === "me" && (
          <Dashboard
            profile={profile}
            onContinue={() => setActiveTab("questions")}
            onUpdateFacts={setInitialFacts}
            onSignInClick={!user ? () => setShowPhoneSignIn(true) : undefined}
            onReset={handleReset}
          />
        )}

        {activeTab === "questions" && (
          <div className="fixed inset-0 bg-[#F3F4F6] flex flex-col items-center justify-center pb-32 pt-14">
            {/* Progress Bar - Fixed at top */}
            <div className="absolute top-0 left-0 right-0 z-10">
              <ProgressBar progress={progress} />
            </div>

            {/* Back Button (to Me) */}
            <button
              onClick={handleBackToDashboard}
              className="fixed top-4 left-4 z-50 w-12 h-12 rounded-full bg-white shadow-[0_4px_12px_rgb(0,0,0,0.08)] flex items-center justify-center text-gray-600 hover:text-blue-600 transition-all duration-200 hover:shadow-[0_6px_16px_rgb(0,0,0,0.12)] active:scale-95"
              aria-label="Back to Me"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <SettingsGear onClick={() => setIsSettingsOpen(true)} />

            <PromptEditor
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              currentPrompt={systemPrompt}
              onSave={handleSavePrompt}
            />

            {/* Card Stack Container - Centered and contained */}
            <div className="w-full max-w-[500px] flex-1 flex items-center justify-center px-4 overflow-visible">
              {error && (
                <div className="absolute top-20 left-4 right-4 z-20 p-4 bg-red-100 text-red-700 rounded-[24px]">
                  <p className="font-medium">Error:</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <CardStack
                card={currentCard}
                onAnswer={handleAnswer}
                isLoading={isLoading}
              />
            </div>
          </div>
        )}

        {activeTab === "results" && (
          <ResultsView
            onKeepAnswering={() => setActiveTab("questions")}
            systemPrompt={systemPrompt}
            onSavePrompt={handleSavePrompt}
          />
        )}
      </div>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      <PhoneSignIn
        isOpen={showPhoneSignIn}
        onClose={() => setShowPhoneSignIn(false)}
        onSuccess={handleSignInSuccess}
      />
    </div>
  );
}
