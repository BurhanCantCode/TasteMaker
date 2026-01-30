import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { UserProfile } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format raw answer values for display
function formatAnswer(answer: string): string {
  const answerMap: Record<string, string> = {
    // Original answers
    "yes": "Yes",
    "no": "No",
    "like": "Like",
    "dislike": "Dislike",
    "superlike": "Super Like",
    "want": "Want",
    "dont_want": "Don't Want",
    "already_have": "Already Have",
    "really_want": "Really Want",
    // Rating scale (1-5)
    "1": "1 (Low)",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5 (High)",
    // Universal "Not interested"
    "not_interested": "Not interested",
    // Product ratings
    "nope": "Nope",
    "interested": "Interested",
    "already_use": "Already use",
    // Restaurant/Location ratings
    "havent_been": "Haven't been",
    "want_to_try": "Want to try",
    "want_to_visit": "Want to visit",
    "loved_it": "Loved it",
    "didnt_like": "Didn't like",
    "been_loved": "Been there - loved it",
    "been_meh": "Been there - meh",
    // Movie ratings
    "skip": "Skip",
    "want_to_watch": "Want to watch",
    "seen_loved": "Seen it - loved it",
    "seen_meh": "Seen it - meh",
    // Book ratings
    "not_for_me": "Not for me",
    "want_to_read": "Want to read",
    "read_loved": "Read it - loved it",
    "read_meh": "Read it - meh",
    // Music/Band ratings
    "not_my_style": "Not my style",
    "id_listen": "I'd listen",
    "already_fan": "Already a fan",
    "love_them": "Love them",
    // Brand ratings
    "curious": "Curious",
    "already_loyal": "Already loyal",
    // Activity ratings
    "id_try": "I'd try it",
    "love_doing": "Love doing this",
    "already_do": "Already do this",
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
