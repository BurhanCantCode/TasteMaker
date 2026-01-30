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
  product: {
    header: "Suggested Product",
    options: [
      { value: "not_interested", label: "Not interested", sentiment: "negative" },
      { value: "interested", label: "I'm interested", sentiment: "neutral" },
      { value: "want", label: "I want this", sentiment: "positive" },
      { value: "already_use", label: "I already use this", sentiment: "strong_positive" },
    ],
  },
  restaurant: {
    header: "Suggested Restaurant",
    options: [
      { value: "not_interested", label: "Not interested", sentiment: "negative" },
      { value: "havent_been", label: "Haven't been", sentiment: "neutral" },
      { value: "want_to_try", label: "Want to try", sentiment: "positive" },
      { value: "loved_it", label: "Been there - loved it", sentiment: "strong_positive" },
    ],
  },
  location: {
    header: "Suggested Place",
    options: [
      { value: "not_interested", label: "Not interested", sentiment: "negative" },
      { value: "havent_been", label: "Haven't been", sentiment: "neutral" },
      { value: "want_to_visit", label: "Want to visit", sentiment: "positive" },
      { value: "been_loved", label: "Been there - loved it", sentiment: "strong_positive" },
    ],
  },
  movie: {
    header: "Suggested Movie",
    options: [
      { value: "not_interested", label: "Not interested", sentiment: "negative" },
      { value: "want_to_watch", label: "Want to watch", sentiment: "positive" },
      { value: "seen_loved", label: "Seen it - loved it", sentiment: "strong_positive" },
      { value: "seen_meh", label: "Seen it - meh", sentiment: "neutral" },
    ],
  },
  book: {
    header: "Suggested Book",
    options: [
      { value: "not_interested", label: "Not interested", sentiment: "negative" },
      { value: "want_to_read", label: "Want to read", sentiment: "positive" },
      { value: "read_loved", label: "Read it - loved it", sentiment: "strong_positive" },
      { value: "read_meh", label: "Read it - meh", sentiment: "neutral" },
    ],
  },
  band: {
    header: "Suggested Artist",
    options: [
      { value: "not_interested", label: "Not interested", sentiment: "negative" },
      { value: "id_listen", label: "I'd listen", sentiment: "neutral" },
      { value: "already_fan", label: "Already a fan", sentiment: "positive" },
      { value: "love_them", label: "Love them", sentiment: "strong_positive" },
    ],
  },
  brand: {
    header: "Suggested Brand",
    options: [
      { value: "not_interested", label: "Not interested", sentiment: "negative" },
      { value: "curious", label: "Curious", sentiment: "neutral" },
      { value: "already_loyal", label: "Already loyal", sentiment: "positive" },
      { value: "love_them", label: "Love them", sentiment: "strong_positive" },
    ],
  },
  activity: {
    header: "Suggested Activity",
    options: [
      { value: "not_interested", label: "Not interested", sentiment: "negative" },
      { value: "id_try", label: "I'd try it", sentiment: "neutral" },
      { value: "love_doing", label: "Love doing this", sentiment: "positive" },
      { value: "already_do", label: "Already do this", sentiment: "strong_positive" },
    ],
  },
};

// Default fallback for unknown categories
export const DEFAULT_CONFIG: CategoryConfig = {
  header: "Prediction",
  options: [
    { value: "dislike", label: "Dislike", sentiment: "negative" },
    { value: "like", label: "Like", sentiment: "positive" },
    { value: "superlike", label: "Super Like", sentiment: "strong_positive" },
  ],
};

// Get config for a category with fallback
export function getCategoryConfig(category: string): CategoryConfig {
  return CATEGORY_CONFIG[category.toLowerCase()] || DEFAULT_CONFIG;
}
