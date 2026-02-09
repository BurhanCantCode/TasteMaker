export interface RatingOption {
  value: string;
  label: string;
  sentiment: "negative" | "neutral" | "positive" | "strong_positive";
}

export interface CategoryConfig {
  header: string;
  options: RatingOption[];
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  possible_diagnosis: {
    header: "Possible Condition",
    options: [
      { value: "dismiss", label: "Doesn't match", sentiment: "negative" },
      { value: "investigate", label: "Worth investigating", sentiment: "neutral" },
      { value: "matches", label: "Matches my symptoms", sentiment: "positive" },
      { value: "already_diagnosed", label: "Already diagnosed", sentiment: "strong_positive" },
    ],
  },
  risk_factor: {
    header: "Risk Factor",
    options: [
      { value: "not_relevant", label: "Not relevant", sentiment: "negative" },
      { value: "possibly_relevant", label: "Possibly relevant", sentiment: "neutral" },
      { value: "definitely_relevant", label: "Definitely relevant", sentiment: "positive" },
      { value: "known_risk", label: "Known risk for me", sentiment: "strong_positive" },
    ],
  },
  red_flag: {
    header: "Urgent Finding",
    options: [
      { value: "not_experiencing", label: "Not experiencing", sentiment: "negative" },
      { value: "mild_concern", label: "Mild concern", sentiment: "neutral" },
      { value: "significant_concern", label: "Significant concern", sentiment: "positive" },
      { value: "seeking_help", label: "Seeking help", sentiment: "strong_positive" },
    ],
  },
};

// Default fallback for unknown categories
export const DEFAULT_CONFIG: CategoryConfig = {
  header: "Diagnostic Finding",
  options: [
    { value: "dismiss", label: "Dismiss", sentiment: "negative" },
    { value: "note", label: "Note", sentiment: "neutral" },
    { value: "relevant", label: "Relevant", sentiment: "positive" },
    { value: "important", label: "Important", sentiment: "strong_positive" },
  ],
};

// Get config for a category with fallback
export function getCategoryConfig(category: string): CategoryConfig {
  return CATEGORY_CONFIG[category.toLowerCase()] || DEFAULT_CONFIG;
}
