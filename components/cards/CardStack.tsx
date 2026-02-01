"use client";

import { Card, Question, ResultItem, InterstitialContent } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
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
  // FIXED: Added min-width to force proper skeleton display
  const cardContainerClass = "w-full min-w-[400px] max-w-[500px] h-[600px]";

  if (isLoading) {
    return (
      <div className={cardContainerClass}>
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col gap-6">
          {/* Progress / Badge Skeleton */}
          <div className="flex-shrink-0">
            <Skeleton className="h-6 w-24 rounded-full bg-gray-200" />
          </div>

          {/* Title Area */}
          <div className="flex-1 flex flex-col justify-center min-h-0 space-y-4">
            <Skeleton className="h-10 w-full rounded-xl bg-gray-200" />
            <Skeleton className="h-10 w-3/4 rounded-xl bg-gray-200" />
          </div>

          {/* Action Buttons */}
          <div className="flex-shrink-0 pt-2 border-t border-gray-100/50 space-y-3">
            <Skeleton className="h-12 w-full rounded-full bg-gray-200" />
            <Skeleton className="h-12 w-full rounded-full bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className={`${cardContainerClass} flex items-center justify-center`}>
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex items-center justify-center">
          <p className="text-gray-400">No cards available</p>
        </div>
      </div>
    );
  }

  // Interstitial cards don't need swipe
  if (card.type === "interstitial") {
    return (
      <div className={cardContainerClass}>
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
      <div className={cardContainerClass}>
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
      <div className={cardContainerClass}>
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
