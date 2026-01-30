import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { UserProfile } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function analyzeProfile(profile: UserProfile) {
  // Group likes by category
  const categoryBreakdown = profile.likes.reduce((acc, like) => {
    acc[like.category] = (acc[like.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Extract top traits from positive facts
  const topTraits = profile.facts
    .filter(f => f.positive)
    .slice(-5)
    .map(f => f.answer);

  // Recent activity (last 5 likes)
  const recentActivity = profile.likes.slice(-5).reverse();

  return { categoryBreakdown, topTraits, recentActivity };
}
