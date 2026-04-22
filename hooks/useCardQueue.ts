"use client";

import { useState, useCallback, useRef } from "react";
import { BatchSource, Card, Question, UserProfile, GenerateResponse, CardSession, PendingCardsBatch } from "@/lib/types";
import { saveCardSession, savePendingCards, clearPendingCards } from "@/lib/cookies";
import {
  BATCH_SIZE,
  filterSeenAskCards,
  planNextBatch,
} from "@/lib/questionSequencer";

// Pre-pivot cached batches may contain multiple_choice / yes_no_maybe
// cards that the new UI no longer renders. Refuse to hydrate such a
// batch — the caller will trigger a fresh fetch that returns yes_no only.
function isPrePivotBatch(batch: PendingCardsBatch): boolean {
  return batch.cards.some(
    (c) => c.type === "ask" && (c.content as Question).answerType !== "yes_no"
  );
}

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
  source: BatchSource;
  factsCountAtPrefetch: number;
  likesCountAtPrefetch: number;
}

// `delta` maps to planNextBatch's projectedAnsweredDelta — see the docs
// on that function for when to pass non-zero values.
interface BatchRequestOptions {
  mode?: "ask" | "result";
  systemPrompt?: string;
  delta?: number;
}

interface PrefetchOptions extends BatchRequestOptions {
  reason?: string;
  force?: boolean;
}

export function useCardQueue() {
  const [state, setState] = useState<CardQueueState>({
    cards: [],
    currentIndex: 0,
    isLoading: false,
    error: null,
    mode: "ask",
    batchSize: BATCH_SIZE,
  });

  const prefetchedBatchRef = useRef<PrefetchedBatch | null>(null);
  const isPrefetchingRef = useRef(false);
  const prefetchGenerationRef = useRef(0);
  const prefetchPromiseRef = useRef<Promise<void> | null>(null);

  // Fetch the next batch the user should see. The source and size are
  // derived from `profile` via planNextBatch — callers control
  // look-ahead via `delta` only. Uses a prefetched buffer if one is
  // available and still fresh for the planned (mode, size, source).
  const ensureBatch = useCallback(
    async (
      profile: UserProfile,
      opts?: BatchRequestOptions
    ): Promise<void> => {
      const mode = opts?.mode ?? "ask";
      const plan = planNextBatch(profile, { projectedAnsweredDelta: opts?.delta ?? 0 });
      const batchSize = plan.size;
      const source = plan.source;
      const systemPrompt = opts?.systemPrompt;

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

      // Buffer is fresh only if its source also matches what we're asking
      // for. Otherwise we'd serve a static batch where the caller asked
      // for dynamic (or vice-versa) and the user loses the "they really
      // get me" moment — or gets an unexpected LLM call mid-session.
      const isFresh =
        prefetched &&
        prefetched.mode === mode &&
        prefetched.batchSize === batchSize &&
        prefetched.source === source &&
        profile.facts.length - prefetched.factsCountAtPrefetch <= maxFactDrift;

      if (prefetched && isFresh) {
        // Filter already-answered cards: prefetch was generated with a
        // smaller seen-set than the user's current state, so the batch
        // can start with questions the user just answered.
        const filteredCards =
          prefetched.mode === "ask"
            ? filterSeenAskCards(prefetched.cards, profile)
            : prefetched.cards;

        if (filteredCards.length === 0) {
          // Everything in the buffer was already answered — discard it
          // and fall through to a fresh fetch.
          console.info(
            `[Tastemaker] Pre-generated batch fully stale after filter; discarding and fetching fresh`
          );
          prefetchedBatchRef.current = null;
        } else {
          console.info(
            `[Tastemaker] Using pre-generated batch instantly (${filteredCards.length} cards after filter, mode=${prefetched.mode}, batch=${prefetched.batchSize})`
          );
          prefetchedBatchRef.current = null;

          setState((prev) => ({
            ...prev,
            cards: filteredCards,
            currentIndex: 0,
            isLoading: false,
            error: null,
            mode: prefetched.mode,
            batchSize: prefetched.batchSize,
          }));

          saveCardSession({ mode: prefetched.mode, batchProgress: 0, batchSize: prefetched.batchSize });
          if (prefetched.mode === "ask") {
            savePendingCards({ cards: filteredCards, currentIndex: 0, mode: prefetched.mode, batchSize: prefetched.batchSize });
          }
          return;
        }
      }

      // NORMAL FETCH PATH
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userProfile: profile,
            batchSize,
            mode,
            systemPrompt,
            source,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch cards");
        }

        const data: GenerateResponse = await response.json();

        // Defensive dedup on the fresh-fetch path. The server already
        // filters, but if the profile snapshot sent in the request was
        // stale (e.g. a fact committed during the in-flight fetch), the
        // response can still contain a just-answered question. This is
        // the same filter the prefetched-buffer path applies.
        const freshCards =
          mode === "ask" ? filterSeenAskCards(data.cards, profile) : data.cards;

        setState((prev) => ({
          ...prev,
          cards: freshCards,
          currentIndex: 0,
          isLoading: false,
          mode,
          batchSize,
        }));

        // Persist card session for cross-device continuity
        saveCardSession({ mode, batchProgress: 0, batchSize });
        // Persist question batch so it survives refresh (ask mode only)
        if (mode === "ask") {
          savePendingCards({ cards: freshCards, currentIndex: 0, mode, batchSize });
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

  // Fire-and-forget prefetch for an upcoming batch. Default delta = 0;
  // common callers pass delta=BATCH_SIZE (prefetch the batch after the
  // current one finishes) or delta=1 (prefetch what comes right after
  // the answer being committed right now).
  const prefetchAhead = useCallback(
    (
      profile: UserProfile,
      opts?: PrefetchOptions
    ): void => {
      const mode = opts?.mode ?? "ask";
      const plan = planNextBatch(profile, { projectedAnsweredDelta: opts?.delta ?? 0 });
      const batchSize = plan.size;
      const source = plan.source;
      const systemPrompt = opts?.systemPrompt;
      const force = opts?.force ?? false;

      if (force) {
        // Increment generation — any in-flight request's result will be discarded (not aborted)
        prefetchGenerationRef.current += 1;
        prefetchedBatchRef.current = null;
      } else {
        // Guard: don't prefetch if already prefetching or buffer already exists
        if (isPrefetchingRef.current) {
          console.info(
            `[Tastemaker] Pre-generation skipped (${opts?.reason ?? "auto"}): already in progress`
          );
          return;
        }
        if (prefetchedBatchRef.current) {
          console.info(
            `[Tastemaker] Pre-generation skipped (${opts?.reason ?? "auto"}): next batch already ready`
          );
          return;
        }
      }

      const reason = opts?.reason ?? "auto";
      const thisGeneration = prefetchGenerationRef.current;
      isPrefetchingRef.current = true;
      const startedAt = Date.now();
      console.info(
        `[Tastemaker] Pre-generation started (${reason}, source=${source}) -> mode=${mode}, batch=${batchSize}, facts=${profile.facts.length}, likes=${profile.likes.length}`
      );

      const promise = (async () => {
        try {
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userProfile: profile,
              batchSize,
              mode,
              systemPrompt,
              source,
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
            // Use the source the server actually returned — on dynamic
            // failure it silently falls back to static, and we need the
            // buffer to reflect that so ensureBatch's freshness check
            // (which compares caller-requested source against buffered
            // source) can decide whether to reuse or refetch.
            const servedSource: BatchSource = data.source ?? source;
            prefetchedBatchRef.current = {
              cards: data.cards,
              mode,
              batchSize,
              source: servedSource,
              factsCountAtPrefetch: profile.facts.length,
              likesCountAtPrefetch: profile.likes.length,
            };
            console.info(
              `[Tastemaker] Pre-generation completed (${reason}, served=${servedSource}) -> ${data.cards.length} cards ready in ${Date.now() - startedAt}ms`
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
      batchSize: BATCH_SIZE,
    });
  }, [clearPrefetch]);

  const hydrateFromPending = useCallback((batch: PendingCardsBatch) => {
    // Reject stale pre-pivot cache. Calling clearPendingCards here lets the
    // caller's no-currentCard useEffect fall through to ensureBatch on the
    // next tick without re-reading the same stale payload.
    if (isPrePivotBatch(batch)) {
      clearPendingCards();
      return;
    }

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
    ensureBatch,
    nextCard,
    reset,
    getCardSession,
    hydrateFromPending,
    prefetchAhead,
    clearPrefetch,
  };
}
