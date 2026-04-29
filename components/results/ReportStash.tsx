"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { PersonalityReport } from "@/lib/types";
import { Clock, ChevronDown } from "lucide-react";

interface ReportStashProps {
  reports: PersonalityReport[];
}

export function ReportStash({ reports }: ReportStashProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      // Header only — subtle mount fade. Stash items render at opacity 1.
      // Previous version scroll-reveal'd each row with opacity 0 → 1 which,
      // combined with ResultsView's now-removed opacity stack, left rows
      // stuck at partial opacity when the report prop changed.
      gsap.from("[data-stash-header]", {
        opacity: 0,
        y: 8,
        duration: 0.35,
        ease: "power2.out",
      });
    }, containerRef);
    return () => ctx.revert();
  }, [reports.length]);

  if (reports.length === 0) return null;

  // Descending by time
  const sorted = [...reports].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div ref={containerRef} className="space-y-3">
      <div data-stash-header className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Report Stash
        </h3>
        <span className="text-xs font-medium text-gray-400">
          {sorted.length} saved
        </span>
      </div>

      {sorted.map((report) => {
        const isOpen = openId === report.id;
        return (
          <button
            data-stash-item
            key={report.id}
            onClick={() => setOpenId(isOpen ? null : report.id)}
            className="w-full text-left bg-white rounded-[24px] p-5 shadow-[0_4px_14px_rgb(0,0,0,0.04)] border border-gray-100 hover:border-gray-200 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <Clock className="w-3 h-3" />
                  <span>{formatDate(report.createdAt)}</span>
                  <span className="text-gray-300">•</span>
                  <span>{report.factsCount} answers</span>
                </div>
                <p className="text-sm font-medium text-gray-900 leading-relaxed line-clamp-2">
                  {report.summary}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </div>

            {isOpen && (
              <ExpandedBody report={report} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ExpandedBody({ report }: { report: PersonalityReport }) {
  // Previously animated opacity + height on mount, but the opacity tween
  // could collide with ResultsView's opacity stack and leave the expanded
  // body at partial opacity. Just render it directly.
  return (
    <div>
      <div className="pt-4 mt-4 border-t border-gray-100 space-y-3">
        {report.portrait && (
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {report.portrait}
          </p>
        )}
        {report.highlights && report.highlights.length > 0 && (
          <ul className="space-y-1.5 pt-1">
            {report.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 mt-2 shrink-0" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
