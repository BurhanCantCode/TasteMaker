"use client";

import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { ReactNode } from "react";
import { SwipeDirection } from "@/lib/types";

interface SwipeableCardProps {
  children: ReactNode;
  onSwipe?: (direction: SwipeDirection) => void;
  enabled?: boolean;
}

const SWIPE_THRESHOLD = 100;
const SWIPE_UP_THRESHOLD = 150;

export function SwipeableCard({
  children,
  onSwipe,
  enabled = true,
}: SwipeableCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Rotation based on x position
  const rotate = useTransform(x, [-200, 200], [-20, 20]);

  // Opacity based on distance
  const opacity = useTransform(
    x,
    [-200, -100, 0, 100, 200],
    [0.5, 1, 1, 1, 0.5]
  );

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const offsetX = info.offset.x;
    const offsetY = info.offset.y;
    const velocityX = info.velocity.x;
    const velocityY = info.velocity.y;

    // Check for swipe up (super like)
    if (offsetY < -SWIPE_UP_THRESHOLD || velocityY < -500) {
      onSwipe?.("up");
      return;
    }

    // Check for swipe right (yes/like/positive)
    if (offsetX > SWIPE_THRESHOLD || velocityX > 500) {
      onSwipe?.("right");
      return;
    }

    // Check for swipe left (no/dislike/negative)
    if (offsetX < -SWIPE_THRESHOLD || velocityX < -500) {
      onSwipe?.("left");
      return;
    }
  }

  if (!enabled) {
    return <div className="w-full h-full">{children}</div>;
  }

  return (
    <motion.div
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={1}
      onDragEnd={handleDragEnd}
      style={{
        x,
        y,
        rotate,
        opacity,
        cursor: "grab",
      }}
      whileTap={{ cursor: "grabbing" }}
      className="w-full h-full touch-none"
    >
      {children}
    </motion.div>
  );
}
