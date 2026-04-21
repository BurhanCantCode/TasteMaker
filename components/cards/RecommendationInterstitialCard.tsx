"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";

interface RecommendationInterstitialCardProps {
  onViewRecommendations: () => void;
  onKeepAnswering: () => void;
  answeredCount: number;
  reportsCount?: number;
  isReportLoading?: boolean;
  previewLine?: string;
}

export function RecommendationInterstitialCard({
  onViewRecommendations,
  onKeepAnswering,
  answeredCount,
  reportsCount,
  isReportLoading,
  previewLine,
}: RecommendationInterstitialCardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        rootRef.current,
        { opacity: 0, y: 20, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }
      );
      gsap.fromTo(
        "[data-fade-in]",
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out",
          stagger: 0.06,
          delay: 0.08,
        }
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  // Animate progress ring (fills as more questions are answered, capped at full ring per milestone)
  useEffect(() => {
    if (!ringRef.current) return;
    const circumference = 2 * Math.PI * 46;
    const ratio = ((answeredCount % 20) / 20) || 1; // show full ring at exact milestone
    gsap.to(ringRef.current, {
      strokeDashoffset: circumference * (1 - ratio),
      duration: 0.9,
      ease: "power3.out",
    });
  }, [answeredCount]);

  return (
    <div
      ref={rootRef}
      className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] w-full h-full flex flex-col items-center justify-center text-center"
    >
      <div className="mb-4 relative" data-fade-in>
        <svg width="104" height="104" viewBox="0 0 104 104">
          <circle cx="52" cy="52" r="46" stroke="#f3f4f6" strokeWidth="6" fill="none" />
          <circle
            ref={ringRef}
            cx="52"
            cy="52"
            r="46"
            stroke="#171717"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 46}
            strokeDashoffset={2 * Math.PI * 46}
            transform="rotate(-90 52 52)"
          />
        </svg>
        <Sparkles className="w-8 h-8 text-[#171717] absolute inset-0 m-auto" />
      </div>

      <h2 data-fade-in className="text-2xl font-bold mb-2 text-[#171717] tracking-tight">
        {answeredCount >= 20
          ? `You've answered ${answeredCount}`
          : `${answeredCount}/20 answered`}
      </h2>
      <p data-fade-in className="text-sm text-gray-500 mb-4 max-w-xs font-medium leading-relaxed">
        {previewLine
          ? previewLine
          : isReportLoading
          ? "We're writing a fresh portrait of you…"
          : "Take a beat. View the report or keep answering."}
      </p>

      {reportsCount && reportsCount > 0 ? (
        <div data-fade-in className="mb-4 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {reportsCount} report{reportsCount === 1 ? "" : "s"} saved
        </div>
      ) : null}

      <div className="w-full space-y-3">
        <button
          data-fade-in
          onClick={onViewRecommendations}
          className="w-full bg-[#171717] text-white h-[64px] rounded-[28px] font-bold text-base hover:bg-black active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
        >
          {isReportLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Preparing report
            </>
          ) : (
            <>
              View the Report
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>

        <button
          data-fade-in
          onClick={onKeepAnswering}
          className="w-full bg-white text-gray-600 h-[52px] rounded-[24px] font-semibold hover:bg-gray-50 hover:text-gray-900 transition-all duration-200 border border-gray-200"
        >
          Answer More Questions
        </button>
      </div>
    </div>
  );
}
