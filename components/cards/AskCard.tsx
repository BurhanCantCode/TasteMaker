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
    <div className="bg-white rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col">
      {/* Question Title */}
      <div className="flex-1 flex items-center justify-center text-center px-4 min-h-0">
        <h2 className="text-2xl font-semibold text-gray-800">
          {question.title}
        </h2>
      </div>

      {/* Input Section */}
      <div className="mt-6">
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
            onAnswer={onAnswer}
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

      {/* Card Type Indicator */}
      <div className="mt-4 text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          Question
        </span>
      </div>
    </div>
  );
}
