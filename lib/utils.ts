import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { UserProfile } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format raw answer values for display
function formatAnswer(answer: string): string {
  const answerMap: Record<string, string> = {
    // Yes/No answers
    "yes": "Yes",
    "no": "No",
    // Diagnostic feedback - possible_diagnosis
    "dismiss": "Doesn't match",
    "investigate": "Worth investigating",
    "matches": "Matches my symptoms",
    "already_diagnosed": "Already diagnosed",
    // Diagnostic feedback - risk_factor
    "not_relevant": "Not relevant",
    "possibly_relevant": "Possibly relevant",
    "definitely_relevant": "Definitely relevant",
    "known_risk": "Known risk",
    // Diagnostic feedback - red_flag
    "not_experiencing": "Not experiencing",
    "mild_concern": "Mild concern",
    "significant_concern": "Significant concern",
    "seeking_help": "Seeking help",
    // Fallback generic
    "like": "Relevant",
    "dislike": "Not relevant",
    "superlike": "Very relevant",
  };

  return answerMap[answer.toLowerCase()] || answer;
}

export function analyzeProfile(profile: UserProfile) {
  // Group likes by category with display labels
  const categoryBreakdown = profile.likes.reduce((acc, like) => {
    const label = like.category === "possible_diagnosis" ? "Conditions"
      : like.category === "risk_factor" ? "Risk Factors"
      : like.category === "red_flag" ? "Red Flags"
      : like.category;
    acc[label] = (acc[label] || 0) + 1;
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
