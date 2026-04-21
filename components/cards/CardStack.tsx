"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import {
  Card,
  Question,
  ResultItem,
  InterstitialContent,
  SwipeDirection,
} from "@/lib/types";
import { SwipeableCard } from "./SwipeableCard";
import { AskCard } from "./AskCard";
import { ResultCard } from "./ResultCard";
import { InterstitialCard } from "./InterstitialCard";
import { Star } from "lucide-react";

type Gesture =
  | "swipe_left"
  | "swipe_right"
  | "swipe_up"
  | "tap_left"
  | "tap_center"
  | "tap_right"
  | "tap_n";

interface CardStackProps {
  card: Card | null;
  nextCard?: Card | null;
  onAnswer: (answer: string, meta?: { index: number; gesture: Gesture }) => void;
  onSkip?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  isLoading?: boolean;
}

export function CardStack({
  card,
  nextCard,
  onAnswer,
  onSkip,
  canUndo: _canUndo,
  onUndo: _onUndo,
  isLoading,
}: CardStackProps) {
  void _canUndo;
  void _onUndo;

  const containerClass = "w-full max-w-[360px] flex flex-col gap-5";
  const cardAreaClass = "relative w-full h-[380px]";
  const activeRef = useRef<HTMLDivElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const actionRowRef = useRef<HTMLDivElement | null>(null);
  const dismissingRef = useRef(false);

  // Reset the guard when the active card changes (new card = new session).
  const cardKey =
    card?.type === "ask" ? (card.content as Question).id : card?.type ?? null;
  useEffect(() => {
    dismissingRef.current = false;
  }, [cardKey]);

  // Peek has no mount animation — it sits at its resting transform via inline
  // CSS. Animating it per-card change caused an opacity overlap with the
  // active card's entry animation (= visible blink). Only drag progress
  // (handleDragProgress below) animates the peek now.

  const handleDragProgress = (p: { x: number; y: number }) => {
    if (peekRef.current) {
      const magnitude = Math.max(Math.abs(p.x), Math.abs(p.y));
      gsap.to(peekRef.current, {
        scale: 0.94 + magnitude * 0.04,
        y: 10 - magnitude * 8,
        duration: 0.2,
        ease: "power2.out",
        overwrite: "auto",
      });
    }
    if (actionRowRef.current) {
      const leftBtn = actionRowRef.current.querySelector<HTMLElement>("[data-btn=left]");
      const rightBtn = actionRowRef.current.querySelector<HTMLElement>("[data-btn=right]");
      const centerBtn = actionRowRef.current.querySelector<HTMLElement>("[data-btn=center]");
      const superBtn = actionRowRef.current.querySelector<HTMLElement>("[data-btn=super]");
      if (leftBtn)
        gsap.to(leftBtn, {
          scale: 1 + Math.max(0, -p.x) * 0.12,
          duration: 0.15,
          overwrite: "auto",
        });
      if (rightBtn)
        gsap.to(rightBtn, {
          scale: 1 + Math.max(0, p.x) * 0.12,
          duration: 0.15,
          overwrite: "auto",
        });
      if (centerBtn && Math.abs(p.x) < 0.05)
        gsap.to(centerBtn, { scale: 1.03, duration: 0.15, overwrite: "auto" });
      else if (centerBtn) gsap.to(centerBtn, { scale: 1, duration: 0.15, overwrite: "auto" });
      if (superBtn)
        gsap.to(superBtn, {
          scale: 1 + Math.max(0, -p.y) * 0.15,
          duration: 0.15,
          overwrite: "auto",
        });
    }
  };

  const triggerDismissAndCommit = (
    direction: SwipeDirection,
    commit: () => void
  ) => {
    if (dismissingRef.current) return; // ignore rapid re-taps mid-animation
    dismissingRef.current = true;

    const el = activeRef.current?.querySelector<HTMLDivElement>("[data-tm-swipeable]");
    if (!el) {
      commit();
      return;
    }
    const onDone = () => {
      el.removeEventListener("tm:dismissed", onDone);
      commit();
    };
    el.addEventListener("tm:dismissed", onDone);
    el.dispatchEvent(
      new CustomEvent<SwipeDirection>("tm:trigger-swipe", { detail: direction })
    );
  };

  if (isLoading) {
    return (
      <div className={containerClass}>
        <div className={cardAreaClass}>
          <div className="bg-white rounded-[28px] p-8 shadow-[0_10px_36px_rgba(0,0,0,0.06)] w-full h-full flex flex-col items-center justify-center gap-4">
            <div className="animate-spin text-[#171717]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm font-medium">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className={containerClass}>
        <div className={cardAreaClass}>
          <div className="bg-white rounded-[28px] p-8 shadow-[0_10px_36px_rgba(0,0,0,0.06)] w-full h-full flex items-center justify-center">
            <p className="text-gray-400">No cards available</p>
          </div>
        </div>
      </div>
    );
  }

  if (card.type === "interstitial") {
    return (
      <div className={containerClass}>
        <div className={cardAreaClass}>
          <InterstitialCard
            content={card.content as InterstitialContent}
            onContinue={() => onAnswer("continue")}
          />
        </div>
      </div>
    );
  }

  const question = card.type === "ask" ? (card.content as Question) : null;
  const superLikeEnabled = question?.superLikeEnabled ?? false;
  const answerType = question?.answerType;
  const labels = question?.answerLabels ?? [];

  return (
    <div className={containerClass}>
      <div className={cardAreaClass}>
        {nextCard && (
          <div
            key={`peek-${peekKey(nextCard)}`}
            ref={peekRef}
            className="absolute inset-0 pointer-events-none"
            style={{ filter: "blur(1.5px)", transform: "scale(0.94) translateY(10px)" }}
            aria-hidden
          >
            {nextCard.type === "ask" && <AskCard question={nextCard.content as Question} disabled />}
            {nextCard.type === "result" && (
              <ResultCard item={nextCard.content as ResultItem} onAnswer={() => {}} />
            )}
          </div>
        )}

        <div ref={activeRef} className="absolute inset-0">
          {card.type === "ask" && question && (
            <SwipeableCard
              key={`active-${question.id}`}
              enabled={answerType === "yes_no" || answerType === "yes_no_maybe"}
              superLikeEnabled={superLikeEnabled}
              showMaybeLabel={answerType === "yes_no_maybe"}
              onSwipe={(direction) => {
                if (!question) return;
                if (direction === "left") {
                  onAnswer(labels[0] ?? "No", { index: 0, gesture: "swipe_left" });
                } else if (direction === "right") {
                  const lastIdx = labels.length - 1;
                  onAnswer(labels[lastIdx] ?? "Yes", { index: lastIdx, gesture: "swipe_right" });
                } else if (direction === "up") {
                  const lastIdx = labels.length - 1;
                  onAnswer("super_yes", { index: lastIdx, gesture: "swipe_up" });
                } else if (direction === "down") {
                  onSkip?.();
                }
              }}
              onDragProgress={handleDragProgress}
            >
              <AskCard question={question} />
            </SwipeableCard>
          )}

          {card.type === "result" && (
            <SwipeableCard
              key={`active-result-${(card.content as ResultItem).id}`}
              enabled
              superLikeEnabled
              onSwipe={(direction) => {
                if (direction === "left") onAnswer("dislike", { index: 0, gesture: "swipe_left" });
                else if (direction === "right") onAnswer("like", { index: 1, gesture: "swipe_right" });
                else if (direction === "up") onAnswer("superlike", { index: 1, gesture: "swipe_up" });
              }}
              onDragProgress={handleDragProgress}
            >
              <ResultCard item={card.content as ResultItem} onAnswer={onAnswer} />
            </SwipeableCard>
          )}
        </div>
      </div>

      {card.type === "ask" && question && (
        <div ref={actionRowRef} className="w-full flex flex-col items-center gap-2.5">
          {answerType === "yes_no" && (
            <YesNoActions
              labels={[labels[0] ?? "No", labels[1] ?? "Yes"]}
              superLikeEnabled={superLikeEnabled}
              onNo={() => triggerDismissAndCommit("left", () => onAnswer(labels[0] ?? "No", { index: 0, gesture: "tap_left" }))}
              onYes={() => triggerDismissAndCommit("right", () => onAnswer(labels[1] ?? "Yes", { index: 1, gesture: "tap_right" }))}
              onSuper={() => triggerDismissAndCommit("up", () => onAnswer("super_yes", { index: 1, gesture: "swipe_up" }))}
            />
          )}
          {answerType === "yes_no_maybe" && (
            <YesNoMaybeActions
              labels={[labels[0] ?? "No", labels[1] ?? "Maybe", labels[2] ?? "Yes"]}
              superLikeEnabled={superLikeEnabled}
              onNo={() => triggerDismissAndCommit("left", () => onAnswer(labels[0] ?? "No", { index: 0, gesture: "tap_left" }))}
              onMaybe={() => triggerDismissAndCommit("down", () => onAnswer(labels[1] ?? "Maybe", { index: 1, gesture: "tap_center" }))}
              onYes={() => triggerDismissAndCommit("right", () => onAnswer(labels[2] ?? "Yes", { index: 2, gesture: "tap_right" }))}
              onSuper={() => triggerDismissAndCommit("up", () => onAnswer("super_yes", { index: 2, gesture: "swipe_up" }))}
            />
          )}
          {answerType === "multiple_choice" && question.options && (
            <MultipleChoiceActions
              options={question.options}
              onPick={(index) => {
                const option = question.options?.[index] ?? "";
                const lastIdx = (question.options?.length ?? 1) - 1;
                const direction: SwipeDirection =
                  index === 0 ? "left" : index === lastIdx ? "right" : "down";
                const gesture: Gesture =
                  index === 0 ? "tap_left" : index === lastIdx ? "tap_right" : "tap_n";
                triggerDismissAndCommit(direction, () => onAnswer(option, { index, gesture }));
              }}
            />
          )}

          <button
            onClick={() => onSkip?.()}
            className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 hover:text-gray-700 transition-colors"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Action variants ---------- */

function YesNoActions({
  labels,
  superLikeEnabled,
  onNo,
  onYes,
  onSuper,
}: {
  labels: [string, string];
  superLikeEnabled: boolean;
  onNo: () => void;
  onYes: () => void;
  onSuper: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <IconBtn dataBtn="left" tint="#ef4444" size={66} onClick={onNo} ariaLabel={labels[0]}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </IconBtn>
      {superLikeEnabled && (
        <IconBtn dataBtn="super" tint="#f59e0b" size={52} onClick={onSuper} ariaLabel="Super Yes">
          <Star className="w-5 h-5 fill-current" />
        </IconBtn>
      )}
      <IconBtn dataBtn="right" tint="#10b981" size={66} onClick={onYes} ariaLabel={labels[1]}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </IconBtn>
    </div>
  );
}

function YesNoMaybeActions({
  labels,
  superLikeEnabled,
  onNo,
  onMaybe,
  onYes,
  onSuper,
}: {
  labels: [string, string, string];
  superLikeEnabled: boolean;
  onNo: () => void;
  onMaybe: () => void;
  onYes: () => void;
  onSuper: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3.5">
      <IconBtn dataBtn="left" tint="#ef4444" size={62} onClick={onNo} ariaLabel={labels[0]}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </IconBtn>
      <IconBtn dataBtn="center" tint="#737373" size={54} onClick={onMaybe} ariaLabel={labels[1]}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </IconBtn>
      {superLikeEnabled && (
        <IconBtn dataBtn="super" tint="#f59e0b" size={48} onClick={onSuper} ariaLabel="Super Yes">
          <Star className="w-4 h-4 fill-current" />
        </IconBtn>
      )}
      <IconBtn dataBtn="right" tint="#10b981" size={62} onClick={onYes} ariaLabel={labels[2]}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </IconBtn>
    </div>
  );
}

function MultipleChoiceActions({
  options,
  onPick,
}: {
  options: string[];
  onPick: (index: number) => void;
}) {
  const count = options.length;
  const tints = gradientTints(count);

  // 2 options → horizontal row
  // 3 options → horizontal row
  // 4 options → 2×2 grid (wider pills, full text)
  // 5+ options → vertical stack
  if (count <= 3) {
    return (
      <div className="w-full grid gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {options.map((opt, i) => (
          <PillBtn
            key={i}
            dataBtn={i === 0 ? "left" : i === count - 1 ? "right" : "center"}
            tint={tints[i]}
            label={opt}
            onClick={() => onPick(i)}
          />
        ))}
      </div>
    );
  }

  if (count === 4) {
    return (
      <div className="w-full grid grid-cols-2 gap-2">
        {options.map((opt, i) => (
          <PillBtn
            key={i}
            dataBtn={i === 0 ? "left" : i === 3 ? "right" : undefined}
            tint={tints[i]}
            label={opt}
            onClick={() => onPick(i)}
          />
        ))}
      </div>
    );
  }

  // 5+ → vertical stack
  return (
    <div className="w-full grid grid-cols-1 gap-1.5">
      {options.map((opt, i) => (
        <PillBtn
          key={i}
          dataBtn={i === 0 ? "left" : i === count - 1 ? "right" : undefined}
          tint={tints[i]}
          label={opt}
          onClick={() => onPick(i)}
          fullWidth
        />
      ))}
    </div>
  );
}

/* ---------- Shared buttons ---------- */

function IconBtn({
  children,
  tint,
  size,
  onClick,
  disabled,
  ariaLabel,
  dataBtn,
}: {
  children: React.ReactNode;
  tint: string;
  size: number;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel: string;
  dataBtn?: "left" | "center" | "right" | "super";
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const press = () => {
    if (!ref.current || disabled) return;
    gsap.fromTo(
      ref.current,
      { scale: 1 },
      { scale: 0.92, duration: 0.08, yoyo: true, repeat: 1, ease: "power2.out" }
    );
  };
  return (
    <button
      ref={ref}
      data-btn={dataBtn}
      aria-label={ariaLabel}
      onClick={() => {
        press();
        onClick?.();
      }}
      disabled={disabled}
      style={{
        width: size,
        height: size,
        color: tint,
        borderColor: `${tint}40`,
      }}
      className="flex items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)] border-2 disabled:opacity-30 disabled:cursor-not-allowed active:shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition-shadow"
    >
      {children}
    </button>
  );
}

function PillBtn({
  tint,
  label,
  onClick,
  dataBtn,
  fullWidth,
}: {
  tint: string;
  label: string;
  onClick?: () => void;
  dataBtn?: "left" | "center" | "right";
  fullWidth?: boolean;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const press = () => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { scale: 1 },
      { scale: 0.95, duration: 0.08, yoyo: true, repeat: 1, ease: "power2.out" }
    );
  };
  return (
    <button
      ref={ref}
      data-btn={dataBtn}
      aria-label={label}
      onClick={() => {
        press();
        onClick?.();
      }}
      style={{
        color: tint,
        borderColor: `${tint}40`,
        backgroundImage: `linear-gradient(180deg, #fff, ${tint}08)`,
      }}
      className={`${fullWidth ? "w-full" : ""} min-h-[48px] px-3 py-2 rounded-[16px] bg-white border-2 shadow-[0_4px_14px_rgba(0,0,0,0.05)] active:shadow-[0_2px_6px_rgba(0,0,0,0.04)] transition-shadow flex items-center justify-center text-center text-[12px] font-bold uppercase tracking-[0.04em] leading-[1.15]`}
    >
      {/* No line-clamp: a truncated option like "OCCASIONALLY, WHEN I CAN'T
          SMOKE A…" leaves the user guessing what they're picking. Grid rows
          auto-match heights, so letting this wrap just grows the whole row
          uniformly. */}
      <span className="break-words">{label}</span>
    </button>
  );
}

function peekKey(c: Card): string {
  if (c.type === "ask") return (c.content as Question).id;
  if (c.type === "result") return (c.content as ResultItem).id;
  return (c.content as InterstitialContent).id;
}

function gradientTints(count: number): string[] {
  const start = { r: 239, g: 68, b: 68 };
  const end = { r: 16, g: 185, b: 129 };
  if (count <= 1) return ["#737373"];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const r = Math.round(start.r + (end.r - start.r) * t);
    const g = Math.round(start.g + (end.g - start.g) * t);
    const b = Math.round(start.b + (end.b - start.b) * t);
    out.push(`rgb(${r}, ${g}, ${b})`);
  }
  return out;
}
