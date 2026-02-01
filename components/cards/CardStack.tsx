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
  // FIXED: Adjusted dimensions to fit within viewport above tab bar
  const cardContainerClass = "w-full max-w-[380px] h-[520px]";

  if (isLoading) {
    return (
      <div className={cardContainerClass}>
        <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col items-center justify-center gap-4">
          <div className="animate-spin text-[#171717]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">Loading...</p>
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
