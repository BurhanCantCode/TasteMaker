"use client";

import { useState, useCallback } from "react";
import { Card, UserProfile, GenerateResponse } from "@/lib/types";

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
    setState((prev) => ({
      ...prev,
      currentIndex: Math.min(prev.currentIndex + 1, prev.cards.length),
    }));
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

  return {
    ...state,
    currentCard,
    hasMoreCards,
    progress,
    fetchCards,
    nextCard,
    reset,
  };
}
