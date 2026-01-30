"use client";

import { Card, Question, ResultItem, InterstitialContent } from "@/lib/types";
import { SwipeableCard } from "./SwipeableCard";
import { AskCard } from "./AskCard";
import { ResultCard } from "./ResultCard";
import { InterstitialCard } from "./InterstitialCard";

interface CardStackProps {
  card: Card | null;
  onAnswer: (answer: string) => void;
  isLoading?: boolean;
}

export function CardStack({ card, onAnswer, isLoading }: CardStackProps) {
  if (isLoading) {
    return (
      <div className="w-full max-w-[400px] h-[600px] flex items-center justify-center">
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="w-full max-w-[400px] h-[600px] flex items-center justify-center">
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex items-center justify-center">
          <p className="text-gray-400">No cards available</p>
        </div>
      </div>
    );
  }

  // Interstitial cards don't need swipe
  if (card.type === "interstitial") {
    return (
      <div className="w-full max-w-[400px] h-[600px]">
        <InterstitialCard
          content={card.content as InterstitialContent}
          onContinue={() => onAnswer("continue")}
        />
      </div>
    );
  }

  // ASK cards with swipe support
  if (card.type === "ask") {
    const question = card.content as Question;
    const supportsSwipe = question.answerType === "yes_no" || question.answerType === "like_scale";

    return (
      <div className="w-full max-w-[400px] h-[600px]">
        <SwipeableCard
          enabled={supportsSwipe}
          onSwipe={(direction) => {
            if (direction === "left") {
              onAnswer(question.answerType === "yes_no" ? "no" : "dislike");
            } else if (direction === "right") {
              onAnswer(question.answerType === "yes_no" ? "yes" : "like");
            } else if (direction === "up") {
              onAnswer("superlike");
            }
          }}
        >
          <AskCard question={question} onAnswer={onAnswer} />
        </SwipeableCard>
      </div>
    );
  }

  // RESULT cards with swipe support
  if (card.type === "result") {
    const item = card.content as ResultItem;

    return (
      <div className="w-full max-w-[400px] h-[600px]">
        <SwipeableCard
          enabled={true}
          onSwipe={(direction) => {
            if (direction === "left") {
              onAnswer("dislike");
            } else if (direction === "right") {
              onAnswer("like");
            } else if (direction === "up") {
              onAnswer("superlike");
            }
          }}
        >
          <ResultCard item={item} onAnswer={onAnswer} />
        </SwipeableCard>
      </div>
    );
  }

  return null;
}
