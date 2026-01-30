import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { UserProfile } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format raw answer values for display
function formatAnswer(answer: string): string {
  const answerMap: Record<string, string> = {
    "yes": "Yes",
    "no": "No",
    "like": "Like",
    "dislike": "Dislike",
    "superlike": "Super Like",
    "want": "Want",
    "dont_want": "Don't Want",
    "already_have": "Already Have",
    "really_want": "Really Want",
  };
  
  return answerMap[answer.toLowerCase()] || answer;
}

export function analyzeProfile(profile: UserProfile) {
  // Group likes by category
  const categoryBreakdown = profile.likes.reduce((acc, like) => {
    acc[like.category] = (acc[like.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Extract recent answers - show last 5 with question context
  const topTraits = profile.facts
    .slice(-5)
    .reverse()
    .map(f => {
      // Format answer for display
      const formattedAnswer = formatAnswer(f.answer);
      return `${f.question} → ${formattedAnswer}`;
    });

  // Recent activity (last 5 likes)
  const recentActivity = profile.likes.slice(-5).reverse();

  return { categoryBreakdown, topTraits, recentActivity };
}
