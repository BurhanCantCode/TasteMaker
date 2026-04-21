"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { SwipeDirection } from "@/lib/types";

interface SwipeableCardProps {
  children: ReactNode;
  onSwipe?: (direction: SwipeDirection) => void;
  enabled?: boolean;
  superLikeEnabled?: boolean;
  /** When true, the gold "SUPER" label is replaced with a "MAYBE" label. */
  showMaybeLabel?: boolean;
  /**
   * Called with a normalized swipe progress (-1 ... +1 for x, 0..-1 for up)
   * while dragging. Lets parents sync button highlights, tint overlays, etc.
   */
  onDragProgress?: (p: { x: number; y: number }) => void;
}

const SWIPE_THRESHOLD = 110;
const SUPER_THRESHOLD = 150;
const VELOCITY_THRESHOLD = 600;
const DISMISS_DISTANCE = 600;
const MAX_ROTATION = 10; // spec: card rotates ~10° max

export function SwipeableCard({
  children,
  onSwipe,
  enabled = true,
  superLikeEnabled = true,
  showMaybeLabel = false,
  onDragProgress,
}: SwipeableCardProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const leftTintRef = useRef<HTMLDivElement | null>(null);
  const rightTintRef = useRef<HTMLDivElement | null>(null);
  const upTintRef = useRef<HTMLDivElement | null>(null);
  const noLabelRef = useRef<HTMLDivElement | null>(null);
  const yesLabelRef = useRef<HTMLDivElement | null>(null);
  const superLabelRef = useRef<HTMLDivElement | null>(null);

  // Prop refs keep the effects stable while still always calling the latest props.
  const onSwipeRef = useRef(onSwipe);
  const onDragProgressRef = useRef(onDragProgress);
  const superLikeRef = useRef(superLikeEnabled);
  useEffect(() => {
    onSwipeRef.current = onSwipe;
  }, [onSwipe]);
  useEffect(() => {
    onDragProgressRef.current = onDragProgress;
  }, [onDragProgress]);
  useEffect(() => {
    superLikeRef.current = superLikeEnabled;
  }, [superLikeEnabled]);

  // Entry animation + quick-setter init + trigger-swipe listener.
  // useLayoutEffect so initial transform lands BEFORE paint; otherwise the
  // card flashes at its default scale for one frame before snapping.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    // CRITICAL: kill any tweens still running against this element from a
    // previous lifecycle. Fast Refresh / rapid remount / an interrupted
    // dismiss can leave a tween alive that lands opacity:0 on this exact
    // DOM node AFTER our gsap.set below runs — the active card then
    // invisibly covers the peek and the UI reads as "blurred & stuck".
    // Also mirrored in the cleanup so unmount doesn't leak live tweens.
    gsap.killTweensOf(el);

    // Simple scale-pop entry. Previously tried entering from (0.94, y:10)
    // to match the peek's rest transform, but that stacked with the peek
    // reset + dismiss tween and amplified the zombie-opacity risk. Back
    // to the original shape.
    gsap.set(el, { x: 0, y: 0, rotation: 0, opacity: 1, scale: 1 });
    gsap.fromTo(
      el,
      { scale: 0.96 },
      { scale: 1, duration: 0.22, ease: "back.out(1.4)" }
    );

    const setters = {
      x: gsap.quickSetter(el, "x", "px") as (v: number) => void,
      y: gsap.quickSetter(el, "y", "px") as (v: number) => void,
      rot: gsap.quickSetter(el, "rotation", "deg") as (v: number) => void,
      leftOpacity: leftTintRef.current
        ? (gsap.quickSetter(leftTintRef.current, "opacity") as (v: number) => void)
        : undefined,
      rightOpacity: rightTintRef.current
        ? (gsap.quickSetter(rightTintRef.current, "opacity") as (v: number) => void)
        : undefined,
      upOpacity: upTintRef.current
        ? (gsap.quickSetter(upTintRef.current, "opacity") as (v: number) => void)
        : undefined,
      noOpacity: noLabelRef.current
        ? (gsap.quickSetter(noLabelRef.current, "opacity") as (v: number) => void)
        : undefined,
      yesOpacity: yesLabelRef.current
        ? (gsap.quickSetter(yesLabelRef.current, "opacity") as (v: number) => void)
        : undefined,
      superOpacity: superLabelRef.current
        ? (gsap.quickSetter(superLabelRef.current, "opacity") as (v: number) => void)
        : undefined,
    };

    let committed = false;

    const applyVisual = (dx: number, dy: number) => {
      setters.x(dx);
      setters.y(Math.min(0, dy));
      setters.rot(gsap.utils.clamp(-MAX_ROTATION, MAX_ROTATION, dx / 18));

      const leftP = gsap.utils.clamp(0, 1, -dx / 160);
      const rightP = gsap.utils.clamp(0, 1, dx / 160);
      const upP = gsap.utils.clamp(0, 1, -dy / 160);

      setters.leftOpacity?.(leftP * 0.7);
      setters.rightOpacity?.(rightP * 0.7);
      setters.upOpacity?.(upP * 0.7);
      setters.noOpacity?.(leftP);
      setters.yesOpacity?.(rightP);
      setters.superOpacity?.(upP);

      onDragProgressRef.current?.({
        x: gsap.utils.clamp(-1, 1, dx / SWIPE_THRESHOLD),
        y: gsap.utils.clamp(-1, 0, dy / SUPER_THRESHOLD),
      });
    };

    const snapBack = () => {
      gsap.to(el, {
        x: 0,
        y: 0,
        rotation: 0,
        duration: 0.55,
        ease: "elastic.out(1, 0.55)",
      });
      const overlays = [
        leftTintRef.current,
        rightTintRef.current,
        upTintRef.current,
        noLabelRef.current,
        yesLabelRef.current,
        superLabelRef.current,
      ].filter(Boolean);
      if (overlays.length) {
        gsap.to(overlays, { opacity: 0, duration: 0.25, ease: "power2.out" });
      }
      onDragProgressRef.current?.({ x: 0, y: 0 });
    };

    const dismiss = (direction: SwipeDirection, fromGesture: boolean) => {
      if (committed) return;
      committed = true;

      // Reset the peek's drag-morphed transform back to its resting (0.94, y:10)
      // state DURING dismiss. Without this, the peek stays at e.g. (0.98, y:2)
      // from the final drag frame, then React unmounts it and the new peek
      // mounts at inline (0.94, y:10) — a visible backwards snap = the stutter.
      // Peek-reset tween is 0.2s; dismiss is 0.25s; so peek lands at rest right
      // before commit, matching the next active's entry transform.
      onDragProgressRef.current?.({ x: 0, y: 0 });

      const dx =
        direction === "left" ? -DISMISS_DISTANCE : direction === "right" ? DISMISS_DISTANCE : 0;
      const dy =
        direction === "up" ? -DISMISS_DISTANCE : direction === "down" ? DISMISS_DISTANCE : 0;
      const rot = direction === "left" ? -14 : direction === "right" ? 14 : 0;

      gsap.to(el, {
        x: dx,
        y: dy,
        rotation: rot,
        opacity: 0,
        duration: 0.25,
        ease: "power2.in",
        onComplete: () => {
          el.dispatchEvent(new CustomEvent("tm:dismissed", { detail: direction }));
          // onSwipe ONLY fires for user-gesture-driven dismisses. Programmatic
          // dismisses (via tm:trigger-swipe) rely on the listener-based commit
          // path, so firing both would double-commit the answer.
          if (fromGesture) onSwipeRef.current?.(direction);
        },
      });
    };

    const state = {
      dragging: false,
      startX: 0,
      startY: 0,
      startTime: 0,
      dx: 0,
      dy: 0,
      pointerId: null as number | null,
    };

    const onPointerDown = (e: PointerEvent) => {
      if (committed || !enabled) return;
      state.dragging = true;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.startTime = performance.now();
      state.pointerId = e.pointerId;
      state.dx = 0;
      state.dy = 0;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!state.dragging) return;
      state.dx = e.clientX - state.startX;
      state.dy = e.clientY - state.startY;
      applyVisual(state.dx, state.dy);
    };

    const finish = () => {
      if (!state.dragging) return;
      state.dragging = false;
      if (state.pointerId !== null && el.hasPointerCapture(state.pointerId)) {
        el.releasePointerCapture(state.pointerId);
      }
      state.pointerId = null;
      el.style.cursor = enabled ? "grab" : "default";

      const elapsed = Math.max(1, performance.now() - state.startTime);
      const vx = (state.dx / elapsed) * 1000;
      const vy = (state.dy / elapsed) * 1000;

      if (superLikeRef.current && (state.dy < -SUPER_THRESHOLD || vy < -VELOCITY_THRESHOLD)) {
        dismiss("up", true);
        return;
      }
      if (state.dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) {
        dismiss("right", true);
        return;
      }
      if (state.dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) {
        dismiss("left", true);
        return;
      }
      snapBack();
    };

    const onTrigger = (e: Event) => {
      const detail = (e as CustomEvent<SwipeDirection>).detail;
      if (detail) dismiss(detail, false);
    };

    if (enabled) {
      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", finish);
      el.addEventListener("pointercancel", finish);
    }
    el.addEventListener("tm:trigger-swipe", onTrigger as EventListener);

    return () => {
      // Kill tweens on unmount so a half-finished dismiss doesn't outlive
      // the component and land opacity:0 on the replaced DOM node.
      gsap.killTweensOf(el);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", finish);
      el.removeEventListener("tm:trigger-swipe", onTrigger as EventListener);
    };
  }, [enabled]);

  if (!enabled) {
    return (
      <div
        ref={rootRef}
        data-tm-swipeable
        className="relative w-full h-full"
        // opacity:1 is explicit so React's reconciler re-applies it on every
        // fresh mount. Belt-and-suspenders against any scenario where a
        // stale gsap tween from a previous instance slipped an opacity:0
        // inline style onto a DOM node React then reused (shouldn't happen
        // with different keys, but React 19 + Turbopack HMR can get weird).
        style={{ willChange: "transform", opacity: 1 }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-tm-swipeable
      className="relative w-full h-full touch-none select-none"
      style={{ cursor: "grab", willChange: "transform", opacity: 1 }}
    >
      {children}

      <div
        ref={leftTintRef}
        className="pointer-events-none absolute inset-0 rounded-[32px]"
        style={{
          background: "linear-gradient(90deg, rgba(239,68,68,0.55) 0%, rgba(239,68,68,0) 70%)",
          opacity: 0,
        }}
      />
      <div
        ref={rightTintRef}
        className="pointer-events-none absolute inset-0 rounded-[32px]"
        style={{
          background: "linear-gradient(270deg, rgba(34,197,94,0.55) 0%, rgba(34,197,94,0) 70%)",
          opacity: 0,
        }}
      />
      <div
        ref={upTintRef}
        className="pointer-events-none absolute inset-0 rounded-[32px]"
        style={{
          background: "linear-gradient(0deg, rgba(234,179,8,0.0) 0%, rgba(234,179,8,0.55) 100%)",
          opacity: 0,
        }}
      />

      <div
        ref={noLabelRef}
        className="pointer-events-none absolute top-8 left-8 rotate-[-14deg] rounded-2xl border-4 border-red-500 px-4 py-2 text-4xl font-black tracking-widest text-red-500"
        style={{ opacity: 0 }}
      >
        NO
      </div>
      <div
        ref={yesLabelRef}
        className="pointer-events-none absolute top-8 right-8 rotate-[14deg] rounded-2xl border-4 border-emerald-500 px-4 py-2 text-4xl font-black tracking-widest text-emerald-500"
        style={{ opacity: 0 }}
      >
        YES
      </div>
      {(superLikeEnabled || showMaybeLabel) && (
        <div
          ref={superLabelRef}
          className={`pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 rounded-2xl border-4 px-4 py-2 text-4xl font-black tracking-widest ${
            showMaybeLabel ? "border-gray-500 text-gray-500" : "border-amber-500 text-amber-500"
          }`}
          style={{ opacity: 0 }}
        >
          {showMaybeLabel ? "~ MAYBE" : "★ SUPER"}
        </div>
      )}
    </div>
  );
}
