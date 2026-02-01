"use client";

import { useState, useCallback, useRef } from "react";
import { Card, UserProfile, GenerateResponse, CardSession, PendingCardsBatch } from "@/lib/types";
import { saveCardSession, savePendingCards, clearPendingCards } from "@/lib/cookies";

interface CardQueueState {
  cards: Card[];
  currentIndex: number;
  isLoading: boolean;
  error: string | null;
  mode: "ask" | "result";
  batchSize: number;
}

interface PrefetchedBatch {
  cards: Card[];
  mode: "ask" | "result";
  batchSize: number;
}

export function useCardQueue() {
  const [state, setState] = useState<CardQueueState>({
    cards: [],
    currentIndex: 0,
    isLoading: false,
    error: null,
    mode: "ask",
    batchSize: 10,
  });

  const prefetchedBatchRef = useRef<PrefetchedBatch | null>(null);
  const isPrefetchingRef = useRef(false);
  const prefetchAbortRef = useRef<AbortController | null>(null);

  const fetchCards = useCallback(
    async (
      userProfile: UserProfile,
      mode: "ask" | "result",
      batchSize: number = 10,
      systemPrompt?: string
    ) => {
      // CHECK PREFETCH BUFFER FIRST
      const prefetched = prefetchedBatchRef.current;
      if (prefetched && prefetched.mode === mode) {
        // Consume the prefetched batch instantly -- no loading state, no API call
        prefetchedBatchRef.current = null;

        setState((prev) => ({
          ...prev,
          cards: prefetched.cards,
          currentIndex: 0,
          isLoading: false,
          error: null,
          mode: prefetched.mode,
          batchSize: prefetched.batchSize,
        }));

        saveCardSession({ mode: prefetched.mode, batchProgress: 0, batchSize: prefetched.batchSize });
        if (prefetched.mode === "ask") {
          savePendingCards({ cards: prefetched.cards, currentIndex: 0, mode: prefetched.mode, batchSize: prefetched.batchSize });
        }
        return;
      }

      // NORMAL FETCH PATH (existing logic)
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userProfile,
            batchSize,
            mode,
            systemPrompt,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch cards");
        }

        const data: GenerateResponse = await response.json();

        setState((prev) => ({
          ...prev,
          cards: data.cards,
          currentIndex: 0,
          isLoading: false,
          mode,
          batchSize,
        }));

        // Persist card session for cross-device continuity
        saveCardSession({ mode, batchProgress: 0, batchSize });
        // Persist question batch so it survives refresh (ask mode only)
        if (mode === "ask") {
          savePendingCards({ cards: data.cards, currentIndex: 0, mode, batchSize });
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }));
      }
    },
    []
  );

  const prefetchNextBatch = useCallback(
    async (
      userProfile: UserProfile,
      mode: "ask" | "result",
      batchSize: number = 10,
      systemPrompt?: string
    ) => {
      // Guard: don't prefetch if already prefetching or buffer already exists
      if (isPrefetchingRef.current || prefetchedBatchRef.current) {
        return;
      }

      isPrefetchingRef.current = true;

      // Create AbortController for this prefetch
      const abortController = new AbortController();
      prefetchAbortRef.current = abortController;

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userProfile,
            batchSize,
            mode,
            systemPrompt,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          // Silently fail -- normal fetch is the fallback
          console.warn("[Tastemaker] Prefetch failed with status:", response.status);
          return;
        }

        const data: GenerateResponse = await response.json();

        // Only store if we haven't been cancelled/reset in the meantime
        if (!abortController.signal.aborted) {
          prefetchedBatchRef.current = {
            cards: data.cards,
            mode,
            batchSize,
          };
        }
      } catch (error) {
        // AbortError is expected on cancellation -- not a real error
        if (error instanceof DOMException && error.name === "AbortError") {
          console.log("[Tastemaker] Prefetch cancelled");
        } else {
          console.warn("[Tastemaker] Prefetch error (will fall back to normal fetch):", error);
        }
      } finally {
        isPrefetchingRef.current = false;
        // Clear the controller ref if it's still ours
        if (prefetchAbortRef.current === abortController) {
          prefetchAbortRef.current = null;
        }
      }
    },
    []
  );

  const clearPrefetch = useCallback(() => {
    // Abort any in-flight prefetch
    if (prefetchAbortRef.current) {
      prefetchAbortRef.current.abort();
      prefetchAbortRef.current = null;
    }
    prefetchedBatchRef.current = null;
    isPrefetchingRef.current = false;
  }, []);

  const nextCard = useCallback(() => {
    setState((prev) => {
      const newIndex = Math.min(prev.currentIndex + 1, prev.cards.length);
      saveCardSession({
        mode: prev.mode,
        batchProgress: newIndex,
        batchSize: prev.batchSize,
      });
      if (prev.mode === "ask") {
        savePendingCards({ cards: prev.cards, currentIndex: newIndex, mode: prev.mode, batchSize: prev.batchSize });
      }
      return { ...prev, currentIndex: newIndex };
    });
  }, []);

  const reset = useCallback(() => {
    clearPrefetch();
    clearPendingCards();

    setState({
      cards: [],
      currentIndex: 0,
      isLoading: false,
      error: null,
      mode: "ask",
      batchSize: 10,
    });
  }, [clearPrefetch]);

  const hydrateFromPending = useCallback((batch: PendingCardsBatch) => {
    setState((prev) => ({
      ...prev,
      cards: batch.cards,
      currentIndex: batch.currentIndex,
      mode: batch.mode,
      batchSize: batch.batchSize,
      isLoading: false,
      error: null,
    }));
    saveCardSession({ mode: batch.mode, batchProgress: batch.currentIndex, batchSize: batch.batchSize });
  }, []);

  const currentCard = state.cards[state.currentIndex] || null;
  const hasMoreCards = state.currentIndex < state.cards.length - 1;
  const progress =
    state.cards.length > 0
      ? ((state.currentIndex + 1) / state.cards.length) * 100
      : 0;

  const shouldPrefetch =
    state.cards.length > 0 &&
    state.currentIndex >= Math.ceil(state.cards.length * 0.75) - 1 &&
    !isPrefetchingRef.current &&
    !prefetchedBatchRef.current;

  const getCardSession = useCallback((): CardSession => ({
    mode: state.mode,
    batchProgress: state.currentIndex,
    batchSize: state.batchSize,
  }), [state.mode, state.currentIndex, state.batchSize]);

  return {
    ...state,
    currentCard,
    hasMoreCards,
    progress,
    shouldPrefetch,
    fetchCards,
    nextCard,
    reset,
    getCardSession,
    hydrateFromPending,
    prefetchNextBatch,
    clearPrefetch,
  };
}
