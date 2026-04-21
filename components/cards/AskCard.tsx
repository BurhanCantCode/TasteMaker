"use client";

import { useRef } from "react";
import { Question } from "@/lib/types";
import { Star } from "lucide-react";

interface AskCardProps {
  question: Question;
  disabled?: boolean;
}

export function AskCard({ question, disabled }: AskCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  void disabled;

  // No on-mount fade for card content. The peek (rendered with disabled=true)
  // shows the same question's content at opacity 1 just before commit; if the
  // active then mounts with content opacity 0 and fades in, the user sees the
  // question text vanish, the new peek's text flash behind, then the active
  // text fade back in — that's the stutter on button tap. Keep content visible
  // on mount so the peek→active handoff is continuous.

  const category = question.tags && question.tags[0];

  // Tune text size to question length so the card never feels empty or cramped.
  const len = question.title.length;
  const textSize =
    len > 140 ? "text-[20px] leading-[1.25]" :
    len > 90  ? "text-[24px] leading-[1.2]"  :
    len > 50  ? "text-[28px] leading-[1.15]" :
                "text-[32px] leading-[1.1]";

  return (
    <div
      ref={ref}
      className="bg-white rounded-[28px] p-7 shadow-[0_10px_36px_rgba(0,0,0,0.06)] w-full h-full flex flex-col"
    >
      <div className="flex items-center justify-between" data-card-fade>
        {category ? (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-900 text-white text-[10px] font-bold uppercase tracking-[0.14em]">
            {category}
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-[0.14em]">
            Question
          </span>
        )}
        {question.superLikeEnabled && (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold uppercase tracking-[0.08em]"
            title="Swipe up for Super Yes"
          >
            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
            Super
          </span>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center">
        <h2
          data-card-fade
          className={`${textSize} font-bold text-[#171717] tracking-tight text-balance text-center`}
        >
          {question.title}
        </h2>
      </div>
    </div>
  );
}
