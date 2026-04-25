"use client";

import { useCallback, useEffect, useState } from "react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useCardQueue } from "@/hooks/useCardQueue";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Onboarding } from "@/components/Onboarding";
import { Dashboard } from "@/components/Dashboard";
import { ResultsView } from "@/components/views/ResultsView";
import { CardStack } from "@/components/cards/CardStack";
import { ProgressBar } from "@/components/navigation/ProgressBar";
import { SettingsGear } from "@/components/navigation/SettingsGear";
import { PromptEditor } from "@/components/navigation/PromptEditor";
import { PhoneSignIn } from "@/components/auth/PhoneSignIn";
import { TabBar, Tab } from "@/components/navigation/TabBar";
import { RecommendationInterstitialCard } from "@/components/cards/RecommendationInterstitialCard";
import { Card, FrameworkProfile, Gesture, PersonalityParams, PersonalityReport, Question } from "@/lib/types";
import { clearSummary, clearCardSession, loadPendingCards, clearPendingCards } from "@/lib/cookies";
import { deleteCloudProfile } from "@/lib/firestore";
import { sentimentForAnswer } from "@/lib/personalityQuestions";
import { BATCH_SIZE, CHUNK_SIZE, isMilestoneAnswer } from "@/lib/questionSequencer";
import { ArrowLeft, Loader2, Undo2 } from "lucide-react";

export default function Home() {
  const {
    profile,
    isLoaded,
    addFact,
    addSkip,
    undoLast,
    addReport,
    setInitialFacts,
    reset: resetProfile,
  } = useUserProfile();

  const {
    cards,
    currentIndex,
    currentCard,
    isLoading,
    error,
    mode,
    hasMoreCards,
    ensureBatch,
    nextCard,
    reset: resetQueue,
    hydrateFromPending,
    prefetchAhead,
  } = useCardQueue();

  const { user, isAuthLoading } = useAuth();
  const { initialSyncDone, hasPendingMerge } = useSync();

  const [systemPrompt, setSystemPrompt] = useState<string | undefined>();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("me");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPhoneSignIn, setShowPhoneSignIn] = useState(false);
  const [showInterstitial, setShowInterstitial] = useState(false);

  const [latestReport, setLatestReport] = useState<PersonalityReport | null>(null);
  const [isReportGenerating, setIsReportGenerating] = useState(false);

  const answeredCount = profile.facts.length;
  const chunkProgress = ((answeredCount % CHUNK_SIZE) / CHUNK_SIZE) * 100;

  // Seed latest report from profile on load.
  useEffect(() => {
    const reports = profile.reports ?? [];
    if (reports.length > 0) {
      setLatestReport(reports[reports.length - 1]);
    }
  }, [profile.reports]);

  // Onboarding for new users after initial sync.
  useEffect(() => {
    if (isLoaded && initialSyncDone && !hasPendingMerge) {
      const isNewUser =
        profile.facts.length === 0 &&
        (profile.skippedIds?.length ?? 0) === 0 &&
        !profile.initialFacts;
      if (isNewUser) {
        setShowOnboarding(true);
        setActiveTab("questions");
      }
    }
  }, [isLoaded, initialSyncDone, hasPendingMerge, profile]);

  // Pre-fetch first batch when new user is on welcome screen.
  // Always static — a brand-new user has no facts for the LLM to ground on
  // (and planNextBatch returns "static" for facts.length=0, so no override needed).
  useEffect(() => {
    if (showOnboarding && isLoaded && !currentCard && !isLoading) {
      if (profile.facts.length === 0 && (profile.skippedIds?.length ?? 0) === 0) {
        ensureBatch(profile, { systemPrompt });
      }
    }
  }, [showOnboarding, isLoaded, currentCard, isLoading, profile, systemPrompt, ensureBatch]);

  // Restore/fetch when entering questions tab.
  useEffect(() => {
    if (!isLoaded || activeTab !== "questions" || currentCard || isLoading) return;

    const pending = loadPendingCards();
    if (pending && pending.mode === "ask" && pending.cards.length > 0) {
      const seen = new Set(profile.facts.map((f) => f.questionId));
      for (const id of profile.skippedIds ?? []) seen.add(id);
      let firstUnanswered = 0;
      while (firstUnanswered < pending.cards.length) {
        const c = pending.cards[firstUnanswered];
        if (c.type === "ask") {
          const q = c.content as Question;
          if (!seen.has(q.id)) break;
        }
        firstUnanswered++;
      }
      if (firstUnanswered >= pending.cards.length) {
        clearPendingCards();
        ensureBatch(profile, { systemPrompt });
      } else {
        hydrateFromPending({ ...pending, currentIndex: firstUnanswered });
      }
      return;
    }

    ensureBatch(profile, { systemPrompt });
  }, [isLoaded, activeTab, currentCard, isLoading, profile, systemPrompt, ensureBatch, hydrateFromPending]);

  // Prefetch next batch AS EARLY AS POSSIBLE in the current batch.
  // "Next" is the batch after what the user is answering now, so plan
  // for `answeredCount + BATCH_SIZE`. Previously this waited until
  // currentIndex >= halfBatch (card 5 of 10), giving the LLM only
  // ~5 cards of runway — a fast answerer could outpace dynamic
  // generation and hit a spinner. Firing at currentIndex >= 0 gives
  // the full ~10 cards of runway and eliminates most prefetch misses.
  // prefetchAhead internally skips static batches (instant client-side)
  // and dedupes against in-flight / already-ready buffers, so this is
  // safe to fire every render.
  useEffect(() => {
    if (activeTab !== "questions" || mode !== "ask" || cards.length === 0) return;
    if (showInterstitial || showOnboarding) return;

    prefetchAhead(profile, {
      systemPrompt,
      delta: BATCH_SIZE,
      reason: "batch-start-auto",
    });
  }, [activeTab, mode, cards.length, currentIndex, profile, systemPrompt, prefetchAhead, showInterstitial, showOnboarding]);

  const generateReport = useCallback(
    async (factsCountSnapshot: number) => {
      setIsReportGenerating(true);
      try {
        const res = await fetch("/api/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userProfile: profile, mode: "full" }),
        });
        if (!res.ok) throw new Error(`summary ${res.status}`);
        const data: {
          summary: string;
          portrait: string;
          highlights: string[];
          params?: PersonalityParams;
          profile?: FrameworkProfile;
        } = await res.json();

        const stored = addReport({
          summary: data.summary ?? "",
          portrait: data.portrait ?? "",
          highlights: data.highlights ?? [],
          params: data.params,
          profile: data.profile,
          factsCount: factsCountSnapshot,
        });
        setLatestReport(stored);
      } catch (e) {
        console.error("[Tastemaker] Failed to generate report:", e);
      } finally {
        setIsReportGenerating(false);
      }
    },
    [profile, addReport]
  );

  // Kick off pre-generation of the report at EXACT milestones (20, 40, 60, ...).
  // Dedupe against profile.reports — NOT a useRef. A useRef resets to its
  // initial value on every component mount, which in practice means every
  // page refresh AND every dev Fast Refresh wipes the guard. If the user
  // lands on the page with answeredCount already at a milestone (e.g. 20
  // facts in localStorage), the old ref-based guard fired a fresh
  // generateReport call every mount — producing duplicate reports for the
  // same factsCount. Checking the stored reports is durable across reloads.
  useEffect(() => {
    if (answeredCount === 0) return;
    if (answeredCount % CHUNK_SIZE !== 0) return;
    if (isReportGenerating) return;
    const alreadyReported = (profile.reports ?? []).some(
      (r) => r.factsCount === answeredCount
    );
    if (alreadyReported) return;
    generateReport(answeredCount);
  }, [answeredCount, isReportGenerating, profile.reports, generateReport]);

  const commitAnswer = (
    answer: string,
    meta?: { index: number; gesture: Gesture }
  ) => {
    if (!currentCard || currentCard.type !== "ask") return;
    const question = currentCard.content as Question;

    const isSuper = answer === "super_yes" || answer === "superlike";
    const sentiment = isSuper
      ? "affirmative"
      : sentimentForAnswer(question, answer, meta?.index);
    const isPositive = sentiment === "affirmative";
    const lastIdx = (question.answerLabels?.length ?? 1) - 1;
    const displayAnswer = isSuper
      ? `${question.answerLabels?.[lastIdx] ?? "Yes"} (super)`
      : answer;

    addFact(
      {
        questionId: question.id,
        question: question.title,
        answer: displayAnswer,
        positive: isPositive,
        sentiment,
        answerIndex: meta?.index,
        gesture: meta?.gesture,
      },
      question
    );
  };

  const advance = async (projectedAnswered: number) => {
    if (isMilestoneAnswer(projectedAnswered)) {
      setShowInterstitial(true);
      // After the interstitial the user pulls the FIRST batch of the new
      // chunk, which is always static — projectedAnswered is a multiple
      // of CHUNK_SIZE, and projectedAnswered = facts.length + 1 because
      // the new fact is committed but the closure still holds the stale
      // profile, so we pass delta=1 to compensate.
      prefetchAhead(profile, {
        systemPrompt,
        delta: 1,
        reason: "post-milestone",
      });
      return;
    }

    if (hasMoreCards) {
      nextCard();
    } else {
      // projectedAnswered = facts.length + 1 (see above); pass delta=1.
      await ensureBatch(profile, { systemPrompt, delta: 1 });
    }
  };

  const handleAnswer = async (
    answer: string,
    meta?: { index: number; gesture: Gesture }
  ) => {
    if (!currentCard) return;
    if (currentCard.type !== "ask") return;

    commitAnswer(answer, meta);
    const projected = answeredCount + 1;
    await advance(projected);
  };

  const handleSkip = async () => {
    if (!currentCard || currentCard.type !== "ask") return;
    const q = currentCard.content as Question;
    addSkip(q.id);
    if (hasMoreCards) {
      nextCard();
    } else {
      // Count this skip + existing skips as they shift the projected
      // answered count across chunk boundaries (profile closure is stale
      // until React re-renders).
      await ensureBatch(profile, {
        systemPrompt,
        delta: (profile.skippedIds?.length ?? 0) + 1,
      });
    }
  };

  const handleUndo = () => {
    const undid = undoLast();
    if (!undid) return;
    // Rewind index so the previously-answered card becomes current again.
    // Note: If we're at index 0 of the current batch, the prior card was in a
    // previous batch that's been discarded; in that case we just re-fetch.
    if (currentIndex > 0) {
      // Mutate queue via hydrate: decrement index.
      hydrateFromPending({
        cards,
        currentIndex: currentIndex - 1,
        mode,
        batchSize: BATCH_SIZE,
      });
    } else {
      // Undo at the very start of a batch — re-pull with the current
      // batch source for where we are now.
      ensureBatch(profile, { systemPrompt });
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
    if (confirm("Are you sure? This will delete your local profile, skip list, and all stashed reports.")) {
      resetProfile();
      resetQueue();
      clearSummary();
      clearCardSession();
      setLatestReport(null);
      if (user) {
        deleteCloudProfile(user.uid);
      }
      setActiveTab("me");
      window.location.reload();
    }
  };

  const handleBackToDashboard = () => setActiveTab("me");

  const nextPreview: Card | null = hasMoreCards ? cards[currentIndex + 1] ?? null : null;

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

  if (showInterstitial) {
    return (
      <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4">
        <div className="w-full max-w-[500px] h-[600px]">
          <RecommendationInterstitialCard
            answeredCount={answeredCount}
            reportsCount={profile.reports?.length ?? 0}
            isReportLoading={isReportGenerating}
            previewLine={latestReport?.summary}
            onViewRecommendations={() => {
              setShowInterstitial(false);
              setActiveTab("results");
            }}
            onKeepAnswering={async () => {
              setShowInterstitial(false);
              await ensureBatch(profile, { systemPrompt });
            }}
          />
        </div>
      </div>
    );
  }

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
          <div className="fixed inset-0 bg-[#F3F4F6] flex flex-col items-center justify-center pb-32 pt-20">
            <div className="absolute top-0 left-0 right-0 z-10">
              <ProgressBar progress={chunkProgress} />
            </div>

            <button
              onClick={handleBackToDashboard}
              className="fixed top-4 left-4 z-50 w-12 h-12 rounded-full bg-white shadow-[0_4px_12px_rgb(0,0,0,0.08)] flex items-center justify-center text-gray-600 hover:text-blue-600 transition-all duration-200 hover:shadow-[0_6px_16px_rgb(0,0,0,0.12)] active:scale-95"
              aria-label="Back to Me"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <button
              onClick={handleUndo}
              disabled={answeredCount === 0}
              className="fixed top-4 right-[76px] z-50 w-12 h-12 rounded-full bg-white shadow-[0_4px_12px_rgb(0,0,0,0.08)] flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all duration-200 hover:shadow-[0_6px_16px_rgb(0,0,0,0.12)] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Undo last answer"
              title="Undo"
            >
              <Undo2 className="w-5 h-5" />
            </button>

            <SettingsGear onClick={() => setIsSettingsOpen(true)} />

            <PromptEditor
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              currentPrompt={systemPrompt}
              onSave={handleSavePrompt}
            />

            <div className="w-full max-w-[500px] flex-1 flex items-center justify-center px-4 overflow-visible">
              {error && (
                <div className="absolute top-20 left-4 right-4 z-20 p-4 bg-red-100 text-red-700 rounded-[24px]">
                  <p className="font-medium">Error:</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <CardStack
                card={currentCard}
                nextCard={nextPreview}
                onAnswer={handleAnswer}
                onSkip={handleSkip}
                onUndo={handleUndo}
                canUndo={answeredCount > 0}
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
            latestReport={latestReport}
            isGeneratingReport={isReportGenerating}
            onRegenerate={() => generateReport(answeredCount)}
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
