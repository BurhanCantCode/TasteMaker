"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { SettingsGear } from "@/components/navigation/SettingsGear";
import { PromptEditor } from "@/components/navigation/PromptEditor";
import { ReportStash } from "@/components/results/ReportStash";
import { PersonalityReport } from "@/lib/types";
import { Loader2, Sparkles, ArrowRight, RefreshCw } from "lucide-react";

// Lazy-loaded — three.js + R3F is ~200KB gzipped and only needed on Results.
// ssr:false because WebGL / Canvas require a browser.
const PersonalityOrb = dynamic(
  () => import("@/components/results/PersonalityOrb").then((m) => m.PersonalityOrb),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-[16/10] rounded-[28px] bg-gray-900 animate-pulse" />
    ),
  }
);

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface ResultsViewProps {
  onKeepAnswering: () => void;
  systemPrompt?: string;
  onSavePrompt: (prompt: string) => void;
  latestReport?: PersonalityReport | null;
  isGeneratingReport?: boolean;
  onRegenerate?: () => void;
}

export function ResultsView({
  onKeepAnswering,
  systemPrompt,
  onSavePrompt,
  latestReport,
  isGeneratingReport,
  onRegenerate,
}: ResultsViewProps) {
  const { profile, isLoaded } = useUserProfile();
  const { isAuthLoading } = useAuth();
  const { initialSyncDone, hasPendingMerge } = useSync();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const totalAnswered = profile.facts.length;
  const isLocked = totalAnswered < 20;
  const reports = profile.reports ?? [];

  const reportId = latestReport?.id;
  const reportCount = (profile.reports ?? []).length;
  useEffect(() => {
    if (!rootRef.current) return;
    const ctx = gsap.context(() => {
      // ONE mount animation — header slide/fade.
      // Everything else (portrait, highlights, stash) was previously animated
      // via overlapping opacity tweens (scroll-triggered reveals + a
      // ReportCard fromTo starting at opacity 0.4 + a highlights-children
      // from(opacity:0) + ExpandedBody fromTo). Some lived inside gsap.context
      // and some didn't, so when the report prop changed mid-animation old
      // tweens lingered and new ones re-started — elements ended up stuck
      // at partial opacity. The report was unreadable. Simpler is better:
      // content renders at opacity 1 immediately, period.
      gsap.from("[data-fade-in]", {
        opacity: 0,
        y: 14,
        duration: 0.45,
        ease: "power3.out",
        stagger: 0.07,
      });

      // Top scroll-progress bar, scrubbed (non-opacity; safe).
      const progress = rootRef.current?.querySelector<HTMLElement>(
        "[data-scroll-progress]"
      );
      if (progress) {
        gsap.set(progress, { scaleX: 0, transformOrigin: "left center" });
        ScrollTrigger.create({
          trigger: rootRef.current,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            gsap.to(progress, {
              scaleX: self.progress,
              duration: 0.15,
              ease: "power2.out",
              overwrite: "auto",
            });
          },
        });
      }
    }, rootRef);

    return () => ctx.revert();
  }, [reportId, reportCount]);

  if (!isLoaded || isAuthLoading || !initialSyncDone || hasPendingMerge) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
        <p className="text-sm font-medium text-gray-500">Loading report…</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="pb-24 relative">
      {/* Scroll-progress bar driven by ScrollTrigger */}
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-gray-200/60 z-40">
        <div data-scroll-progress className="h-full bg-gradient-to-r from-emerald-400 via-sky-500 to-indigo-500" />
      </div>

      <SettingsGear onClick={() => setIsSettingsOpen(true)} />
      <PromptEditor
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentPrompt={systemPrompt}
        onSave={onSavePrompt}
      />

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <div data-header className="text-center space-y-2 pt-8" data-fade-in>
          <h1 className="text-4xl font-bold tracking-tight text-[#171717]">
            Your Report
          </h1>
          <p className="text-base text-gray-500">
            {totalAnswered} answers · {reports.length} saved report{reports.length === 1 ? "" : "s"}
          </p>
        </div>

        {isLocked ? (
          <LockedState totalAnswered={totalAnswered} onKeepAnswering={onKeepAnswering} />
        ) : (
          <>
            <ReportCard
              report={latestReport}
              isLoading={!!isGeneratingReport}
              onRegenerate={onRegenerate}
              onKeepAnswering={onKeepAnswering}
            />

            {reports.length > 0 && <ReportStash reports={reports} />}
          </>
        )}
      </div>
    </div>
  );
}

function LockedState({
  totalAnswered,
  onKeepAnswering,
}: {
  totalAnswered: number;
  onKeepAnswering: () => void;
}) {
  const fillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fillRef.current) return;
    gsap.to(fillRef.current, {
      width: `${(totalAnswered / 20) * 100}%`,
      duration: 0.8,
      ease: "power3.out",
    });
  }, [totalAnswered]);

  return (
    <div
      data-fade-in
      className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center space-y-6"
    >
      <div className="inline-flex p-4 bg-gray-50 rounded-full">
        <Sparkles className="w-10 h-10 text-gray-400" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-[#171717]">
        {20 - totalAnswered} more to unlock your first report
      </h2>
      <p className="text-base text-gray-500">
        After 20 answers we generate a personality portrait based on how you responded.
      </p>
      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
        <div ref={fillRef} className="bg-black h-3 rounded-full" style={{ width: "0%" }} />
      </div>
      <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
        {totalAnswered} / 20 answered
      </p>
      <button
        onClick={onKeepAnswering}
        className="inline-flex items-center justify-center gap-3 w-full bg-[#171717] text-white h-[64px] rounded-[28px] font-bold text-lg hover:bg-black active:scale-[0.98] transition-all duration-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
      >
        Keep Answering
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function ReportCard({
  report,
  isLoading,
  onRegenerate,
  onKeepAnswering,
}: {
  report?: PersonalityReport | null;
  isLoading: boolean;
  onRegenerate?: () => void;
  onKeepAnswering: () => void;
}) {
  // No internal mount/regenerate animations. Previously this component
  // ran a fromTo starting at opacity:0.4 plus a children fade for the
  // highlights — both lived outside ResultsView's gsap.context, so when
  // the report prop changed the old tweens weren't cleaned up and new
  // ones re-started on top. Elements got stuck at partial opacity and
  // the report became unreadable. Content now renders at opacity 1.

  if (isLoading && !report) {
    return (
      <div data-fade-in className="bg-white rounded-[32px] p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center space-y-4">
        <Loader2 className="w-8 h-8 mx-auto text-gray-400 animate-spin" />
        <p className="text-gray-500 font-medium">Writing your portrait…</p>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <div
      data-fade-in
      className="bg-white rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6"
    >
      {report.params && <PersonalityOrb params={report.params} />}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-900 text-xs font-bold uppercase tracking-wider">
            Latest Portrait
          </span>
          <p className="text-xs text-gray-400 font-medium">
            Based on {report.factsCount} answers
          </p>
        </div>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className="p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            aria-label="Regenerate report"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {report.summary && (
        <p className="text-xl font-semibold leading-snug text-[#171717] tracking-tight">
          {report.summary}
        </p>
      )}

      {report.portrait && (
        <p className="text-base text-gray-700 leading-relaxed whitespace-pre-line">
          {report.portrait}
        </p>
      )}

      {report.highlights && report.highlights.length > 0 && (
        <ul className="grid gap-2 pt-2">
          {report.highlights.map((h, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 text-sm font-medium text-gray-800 bg-gray-50 rounded-2xl px-4 py-2.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onKeepAnswering}
        className="w-full bg-[#171717] text-white h-[56px] rounded-[24px] font-bold text-base hover:bg-black active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
      >
        Answer More Questions
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}
