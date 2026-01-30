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
  // Common card container classes to ensure consistency
  const cardContainerClass = "w-full max-w-[500px] h-[520px]";

  if (isLoading) {
    return (
      <div className={`${cardContainerClass} flex items-center justify-center`}>
        <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col">
          {/* Progress / Badge Skeleton */}
          <div className="flex justify-center mb-10">
            <Skeleton className="h-1.5 w-20 rounded-full bg-gray-100" />
          </div>

          {/* Title Area */}
          <div className="space-y-3 mb-auto px-2">
            <Skeleton className="h-8 w-full rounded-xl" />
            <Skeleton className="h-8 w-2/3 rounded-xl" />
          </div>

          {/* Center Visual / Content */}
          <div className="flex-1 w-full max-h-[180px] mb-auto mx-auto my-6 p-6">
            <div className="w-full h-full rounded-2xl bg-gray-50 border-2 border-dashed border-gray-100/50 flex items-center justify-center">
              <Skeleton className="h-12 w-12 rounded-full opacity-50" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 mt-auto">
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl bg-gray-50" />
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
