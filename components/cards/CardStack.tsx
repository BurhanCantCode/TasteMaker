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

  // Standard playing-card aspect ratio (poker: 2.5 x 3.5 = 5/7), portrait.
  const containerClass = "w-full max-w-[360px] flex flex-col";
  const cardAreaWrapperClass = "relative w-full";
  const cardAreaClass = "relative w-full aspect-[5/7]";
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
        <div className={cardAreaWrapperClass}>
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
      </div>
    );
  }

  if (!card) {
    return (
      <div className={containerClass}>
        <div className={cardAreaWrapperClass}>
          <div className={cardAreaClass}>
            <div className="bg-white rounded-[28px] p-8 shadow-[0_10px_36px_rgba(0,0,0,0.06)] w-full h-full flex items-center justify-center">
              <p className="text-gray-400">No cards available</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (card.type === "interstitial") {
    return (
      <div className={containerClass}>
        <div className={cardAreaWrapperClass}>
          <div className={cardAreaClass}>
            <InterstitialCard
              content={card.content as InterstitialContent}
              onContinue={() => onAnswer("continue")}
            />
          </div>
        </div>
      </div>
    );
  }

  const question = card.type === "ask" ? (card.content as Question) : null;
  const labels = question?.answerLabels ?? [];

  const askFooter =
    card.type === "ask" && question ? (
      <div ref={actionRowRef} className="w-full flex items-center justify-center">
        {question.answerType === "yes_no_maybe" ? (
          <YesNoMaybeActions
            labels={[
              labels[0] ?? "No",
              labels[1] ?? "Maybe",
              labels[2] ?? "Yes",
            ]}
            onNo={() =>
              triggerDismissAndCommit("left", () =>
                onAnswer(labels[0] ?? "No", { index: 0, gesture: "tap_left" })
              )
            }
            onMaybe={() =>
              onAnswer(labels[1] ?? "Maybe", {
                index: 1,
                gesture: "tap_center",
              })
            }
            onYes={() =>
              triggerDismissAndCommit("right", () =>
                onAnswer(labels[2] ?? "Yes", {
                  index: 2,
                  gesture: "tap_right",
                })
              )
            }
          />
        ) : (
          <YesNoActions
            labels={[labels[0] ?? "No", labels[labels.length - 1] ?? "Yes"]}
            onNo={() =>
              triggerDismissAndCommit("left", () =>
                onAnswer(labels[0] ?? "No", { index: 0, gesture: "tap_left" })
              )
            }
            onYes={() => {
              const lastIdx = labels.length - 1;
              triggerDismissAndCommit("right", () =>
                onAnswer(labels[lastIdx] ?? "Yes", { index: lastIdx, gesture: "tap_right" })
              );
            }}
          />
        )}
      </div>
    ) : null;

  return (
    <div className={containerClass}>
      <div className={cardAreaWrapperClass}>
        <div className={cardAreaClass}>
          {nextCard && (
            <div
              key={`peek-${peekKey(nextCard)}`}
              ref={peekRef}
              className="absolute inset-0 pointer-events-none"
              style={{ filter: "blur(1.5px)", transform: "scale(0.94) translateY(10px)" }}
              aria-hidden
            >
              {nextCard.type === "ask" && (
                <AskCard
                  question={nextCard.content as Question}
                  disabled
                  // Ghost footer keeps the peek's text vertically anchored
                  // exactly where the active card's text sits; without it,
                  // the title is centered in the WHOLE card on the peek and
                  // then jumps when buttons appear at commit time.
                  footer={renderGhostFooter(nextCard.content as Question)}
                />
              )}
              {nextCard.type === "result" && (
                <ResultCard item={nextCard.content as ResultItem} onAnswer={() => {}} />
              )}
            </div>
          )}

          <div ref={activeRef} className="absolute inset-0">
            {card.type === "ask" && question && (
              <SwipeableCard
                key={`active-${question.id}`}
                enabled
                superLikeEnabled={false}
                onSwipe={(direction) => {
                  if (!question) return;
                  if (direction === "left") {
                    onAnswer(labels[0] ?? "No", { index: 0, gesture: "swipe_left" });
                  } else if (direction === "right") {
                    const lastIdx = labels.length - 1;
                    onAnswer(labels[lastIdx] ?? "Yes", { index: lastIdx, gesture: "swipe_right" });
                  } else if (direction === "down") {
                    onSkip?.();
                  }
                }}
                onDragProgress={handleDragProgress}
              >
                <AskCard question={question} footer={askFooter} />
              </SwipeableCard>
            )}

            {card.type === "result" && (
              <SwipeableCard
                key={`active-result-${(card.content as ResultItem).id}`}
                enabled
                superLikeEnabled={false}
                onSwipe={(direction) => {
                  if (direction === "left") onAnswer("dislike", { index: 0, gesture: "swipe_left" });
                  else if (direction === "right") onAnswer("like", { index: 1, gesture: "swipe_right" });
                }}
                onDragProgress={handleDragProgress}
              >
                <ResultCard item={card.content as ResultItem} onAnswer={onAnswer} />
              </SwipeableCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Action variants ---------- */

const NO_GLYPH = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const YES_GLYPH = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const MAYBE_GLYPH = (
  <span className="text-[36px] leading-none font-bold translate-y-[7px]">~</span>
);

function YesNoActions({
  labels,
  onNo,
  onYes,
}: {
  labels: [string, string];
  onNo: () => void;
  onYes: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-6">
      <IconBtn dataBtn="left" tint="#ef4444" size={66} onClick={onNo} ariaLabel={labels[0]}>
        {NO_GLYPH}
      </IconBtn>
      <IconBtn dataBtn="right" tint="#10b981" size={66} onClick={onYes} ariaLabel={labels[1]}>
        {YES_GLYPH}
      </IconBtn>
    </div>
  );
}

function YesNoMaybeActions({
  labels,
  onNo,
  onMaybe,
  onYes,
}: {
  labels: [string, string, string];
  onNo: () => void;
  onMaybe: () => void;
  onYes: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-[18px]">
      <IconBtn dataBtn="left" tint="#ef4444" size={62} onClick={onNo} ariaLabel={labels[0]}>
        {NO_GLYPH}
      </IconBtn>
      <IconBtn dataBtn="center" tint="#f59e0b" size={62} onClick={onMaybe} ariaLabel={labels[1]}>
        {MAYBE_GLYPH}
      </IconBtn>
      <IconBtn dataBtn="right" tint="#10b981" size={62} onClick={onYes} ariaLabel={labels[2]}>
        {YES_GLYPH}
      </IconBtn>
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
  dataBtn?: "left" | "center" | "right";
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  void ref;
  return (
    <button
      ref={ref}
      data-btn={dataBtn}
      aria-label={ariaLabel}
      onClick={() => onClick?.()}
      disabled={disabled}
      style={
        {
          width: size,
          height: size,
          borderColor: tint,
          borderWidth: 4,
          "--tint": tint,
        } as React.CSSProperties
      }
      className="group flex items-center justify-center rounded-full bg-white text-[color:var(--tint)] transition-all duration-100 hover:scale-110 active:bg-[var(--tint)] active:text-white disabled:opacity-30 disabled:cursor-not-allowed"
    >
      <span className="inline-flex items-center justify-center transition-transform duration-75 group-active:scale-[1.4]">
        {children}
      </span>
    </button>
  );
}

function peekKey(c: Card): string {
  if (c.type === "ask") return (c.content as Question).id;
  if (c.type === "result") return (c.content as ResultItem).id;
  return (c.content as InterstitialContent).id;
}

// Ghost footer for the peek card. Same shape and dimensions as the
// active card's action row but with no-op handlers and no actionRowRef
// — the peek is wrapped in pointer-events-none anyway, but we still
// avoid sharing the ref with the active card.
function renderGhostFooter(q: Question) {
  const noop = () => {};
  return (
    <div className="w-full flex items-center justify-center">
      {q.answerType === "yes_no_maybe" ? (
        <YesNoMaybeActions
          labels={["No", "Maybe", "Yes"]}
          onNo={noop}
          onMaybe={noop}
          onYes={noop}
        />
      ) : (
        <YesNoActions labels={["No", "Yes"]} onNo={noop} onYes={noop} />
      )}
    </div>
  );
}
