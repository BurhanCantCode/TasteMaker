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
  factsCountAtPrefetch: number;
  likesCountAtPrefetch: number;
}

interface PrefetchOptions {
  force?: boolean;
  reason?: string;
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
  const prefetchGenerationRef = useRef(0);
  const prefetchPromiseRef = useRef<Promise<void> | null>(null);

  const fetchCards = useCallback(
    async (
      userProfile: UserProfile,
      mode: "ask" | "result",
      batchSize: number = 10,
      systemPrompt?: string
    ) => {
      // CHECK PREFETCH BUFFER FIRST
      let prefetched = prefetchedBatchRef.current;

      // If no buffer but a prefetch is in-flight, wait for it before falling back.
      // Ask 10-card batches get a longer wait window because generation can be slower.
      if (!prefetched && prefetchPromiseRef.current) {
        try {
          const prefetchWaitMs =
            mode === "ask" && batchSize >= 10 ? 45000 : 8000;
          console.info(
            `[Tastemaker] Waiting for pre-generation to finish (mode=${mode}, batch=${batchSize}, timeout=${prefetchWaitMs}ms)`
          );
          const timeoutPromise = new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("prefetch_timeout")), prefetchWaitMs)
          );
          await Promise.race([prefetchPromiseRef.current, timeoutPromise]);
          // Re-check buffer after awaiting
          prefetched = prefetchedBatchRef.current;
        } catch {
          // Timeout or error — fall through to normal fetch
          console.warn(
            `[Tastemaker] Pre-generation wait timed out; falling back to direct fetch (mode=${mode}, batch=${batchSize})`
          );
          prefetched = null;
        }
      }

      // Keep 10-card transitions instant: allow up to half-batch fact drift.
      const maxFactDrift =
        mode === "ask" && batchSize >= 10 ? Math.ceil(batchSize / 2) : 2;

      const isFresh =
        prefetched &&
        prefetched.mode === mode &&
        prefetched.batchSize === batchSize &&
        userProfile.facts.length - prefetched.factsCountAtPrefetch <= maxFactDrift;

      if (prefetched && isFresh) {
        // Consume the prefetched batch instantly -- no loading state, no API call
        console.info(
          `[Tastemaker] Using pre-generated batch instantly (${prefetched.cards.length} cards, mode=${prefetched.mode}, batch=${prefetched.batchSize})`
        );
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
    (
      userProfile: UserProfile,
      mode: "ask" | "result",
      batchSize: number = 10,
      systemPrompt?: string,
      options?: PrefetchOptions
    ) => {
      const force = options?.force ?? false;

      if (force) {
        // Increment generation — any in-flight request's result will be discarded (not aborted)
        prefetchGenerationRef.current += 1;
        prefetchedBatchRef.current = null;
      } else {
        // Guard: don't prefetch if already prefetching or buffer already exists
        if (isPrefetchingRef.current) {
          console.info(
            `[Tastemaker] Pre-generation skipped (${options?.reason ?? "auto"}): already in progress`
          );
          return;
        }
        if (prefetchedBatchRef.current) {
          console.info(
            `[Tastemaker] Pre-generation skipped (${options?.reason ?? "auto"}): next batch already ready`
          );
          return;
        }
      }

      const reason = options?.reason ?? "auto";
      const thisGeneration = prefetchGenerationRef.current;
      isPrefetchingRef.current = true;
      const startedAt = Date.now();
      console.info(
        `[Tastemaker] Pre-generation started (${reason}) -> mode=${mode}, batch=${batchSize}, facts=${userProfile.facts.length}, likes=${userProfile.likes.length}`
      );

      const promise = (async () => {
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
            // No AbortController — request always completes
          });

          if (!response.ok) {
            console.warn(
              `[Tastemaker] Pre-generation failed (${reason}) with status: ${response.status}`
            );
            return;
          }

          const data: GenerateResponse = await response.json();

          // Only store result if this generation is still current
          if (prefetchGenerationRef.current === thisGeneration) {
            prefetchedBatchRef.current = {
              cards: data.cards,
              mode,
              batchSize,
              factsCountAtPrefetch: userProfile.facts.length,
              likesCountAtPrefetch: userProfile.likes.length,
            };
            console.info(
              `[Tastemaker] Pre-generation completed (${reason}) -> ${data.cards.length} cards ready in ${Date.now() - startedAt}ms`
            );
          } else {
            console.info(
              `[Tastemaker] Pre-generation result discarded (${reason}): newer generation exists`
            );
          }
        } catch (error) {
          console.warn(
            `[Tastemaker] Pre-generation error (${reason}) (will fall back to normal fetch):`,
            error
          );
        } finally {
          if (prefetchGenerationRef.current === thisGeneration) {
            isPrefetchingRef.current = false;
            prefetchPromiseRef.current = null;
          }
        }
      })();

      prefetchPromiseRef.current = promise;
    },
    []
  );

  const clearPrefetch = useCallback(() => {
    // Invalidate any in-flight prefetch via generation (no HTTP abort)
    prefetchGenerationRef.current += 1;
    prefetchedBatchRef.current = null;
    isPrefetchingRef.current = false;
    prefetchPromiseRef.current = null;
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
