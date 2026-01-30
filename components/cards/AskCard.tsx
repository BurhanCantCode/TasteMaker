"use client";

import { Question } from "@/lib/types";
import { YesNoButtons } from "../inputs/YesNoButtons";
import { LikeScale } from "../inputs/LikeScale";
import { WantScale } from "../inputs/WantScale";
import { MultipleChoice } from "../inputs/MultipleChoice";
import { TextInput } from "../inputs/TextInput";
import { RatingScale } from "../inputs/RatingScale";

interface AskCardProps {
  question: Question;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}


export function AskCard({ question, onAnswer, disabled }: AskCardProps) {
  return (
    <div className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col gap-6">
      {/* Question Badge */}
      <div className="flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-900 text-xs font-bold uppercase tracking-wider">
          Question
        </span>
      </div>

      {/* Question Title */}
      <div className="flex-1 overflow-y-auto flex items-center min-h-0">
        <h2 className="text-3xl font-bold text-[#171717] leading-tight tracking-tight">
          {question.title}
        </h2>
      </div>

      {/* Input Section - Fixed at Bottom */}
      <div className="flex-shrink-0 pt-2 border-t border-gray-100/50 input-area">
        {question.answerType === "yes_no" && (
          <YesNoButtons onAnswer={onAnswer} disabled={disabled} />
        )}

        {question.answerType === "like_scale" && (
          <LikeScale onAnswer={onAnswer} disabled={disabled} />
        )}

        {question.answerType === "want_scale" && (
          <WantScale onAnswer={onAnswer} disabled={disabled} />
        )}

        {question.answerType === "rating_scale" && (
          <RatingScale onAnswer={onAnswer} disabled={disabled} />
        )}

        {question.answerType === "multiple_choice" && question.options && (
          <MultipleChoice
            key={question.id}
            options={question.options}
            onAnswer={(ans) => {
              if (Array.isArray(ans)) {
                onAnswer(ans.join(","));
              } else {
                onAnswer(ans);
              }
            }}
            disabled={disabled}
            allowMultiple={true}
          />
        )}

        {question.answerType === "text_input" && (
          <TextInput
            onAnswer={onAnswer}
            disabled={disabled}
            placeholder="Type your answer..."
          />
        )}
      </div>
    </div>
  );
}
