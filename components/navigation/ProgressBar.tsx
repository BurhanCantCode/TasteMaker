"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
}

export function ProgressBar({ progress, label }: ProgressBarProps) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!fillRef.current) return;
    gsap.to(fillRef.current, {
      width: `${gsap.utils.clamp(0, 100, progress)}%`,
      duration: 0.55,
      ease: "power3.out",
    });
  }, [progress]);

  useEffect(() => {
    if (!labelRef.current) return;
    gsap.fromTo(
      labelRef.current,
      { opacity: 0.7, y: 2 },
      { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }
    );
  }, [label]);

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="h-1 bg-gray-200/80 overflow-hidden">
        <div
          ref={fillRef}
          className="h-full bg-gradient-to-r from-emerald-400 via-sky-500 to-indigo-500"
          style={{ width: "0%" }}
        />
      </div>
      {label && (
        <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2">
          <span
            ref={labelRef}
            className="rounded-full bg-white/85 backdrop-blur px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 shadow-sm"
          >
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
