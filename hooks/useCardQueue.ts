"use client";

import { useState, useCallback } from "react";
import { Card, UserProfile, GenerateResponse, CardSession } from "@/lib/types";
import { saveCardSession } from "@/lib/cookies";

interface CardQueueState {
  cards: Card[];
  currentIndex: number;
  isLoading: boolean;
  error: string | null;
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

  const fetchCards = useCallback(
    async (
      userProfile: UserProfile,
      mode: "ask" | "result",
      batchSize: number = 10,
      systemPrompt?: string
    ) => {
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

  const nextCard = useCallback(() => {
    setState((prev) => {
      const newIndex = Math.min(prev.currentIndex + 1, prev.cards.length);
      // Update card session progress
      saveCardSession({
        mode: prev.mode,
        batchProgress: newIndex,
        batchSize: prev.batchSize,
      });
      return { ...prev, currentIndex: newIndex };
    });
  }, []);

  const reset = useCallback(() => {
    setState({
      cards: [],
      currentIndex: 0,
      isLoading: false,
      error: null,
      mode: "ask",
      batchSize: 10,
    });
  }, []);

  const currentCard = state.cards[state.currentIndex] || null;
  const hasMoreCards = state.currentIndex < state.cards.length - 1;
  const progress =
    state.cards.length > 0
      ? ((state.currentIndex + 1) / state.cards.length) * 100
      : 0;

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
    fetchCards,
    nextCard,
    reset,
    getCardSession,
  };
}
