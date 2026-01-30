// Answer types matching the spec
export type AnswerType = 
  | "yes_no" 
  | "want_scale"      // Want / Don't want / Already have / Really want
  | "text_input" 
  | "multiple_choice" 
  | "like_scale"      // Like / Don't like / Super like
  | "rating_scale";   // 1-5 numeric scale for frequency/intensity

export type CardType = "ask" | "result" | "interstitial";

// ASK card question
export interface Question {
  id: string;
  title: string;
  answerType: AnswerType;
  options?: string[];  // For multiple choice
}

// RESULT card item (noun prediction)
export interface ResultItem {
  id: string;
  name: string;
  category: string;  // location, product, brand, movie, book, band, etc.
  description?: string;
  imageUrl?: string;
}

// Interstitial content
export interface InterstitialContent {
  id: string;
  title: string;
  message: string;
  actionLabel?: string;  // "Continue", "Share", "Save Progress"
}

// Union card type
export interface Card {
  type: CardType;
  content: Question | ResultItem | InterstitialContent;
}

// User Profile (stored in cookies)
export interface UserProfile {
  facts: UserFact[];     // USER FACTS - from ASK cards
  likes: UserLike[];     // USER LIKES - from RESULT cards
  initialFacts?: string; // Raw slash-separated facts user provided about themselves
  userLocation?: {       // User's location for localized recommendations
    city: string;
    region?: string;
    country?: string;
  };
}

export interface UserFact {
  questionId: string;
  question: string;
  answer: string;
  positive: boolean;     // Yes = true, No = false (both are valuable signal)
  timestamp: number;
}

export interface UserLike {
  itemId: string;
  item: string;
  category: string;
  rating: string; // Category-specific rating values
  timestamp: number;
}

// Claude API types
export interface GenerateRequest {
  userProfile: UserProfile;
  batchSize: number;
  mode: "ask" | "result";
  systemPrompt?: string;
}

export interface GenerateResponse {
  cards: Card[];
  reasoning?: string;  // Internal (not shown to user)
}

// Swipe direction for gesture handling
export type SwipeDirection = "left" | "right" | "up" | null;

// Card response mapping
export interface CardResponse {
  cardId: string;
  cardType: CardType;
  response: string | SwipeDirection;
  timestamp: number;
}

// Profile stage for progressive refinement
export type ProfileStage = "discovery" | "refining" | "personalized";

// Determine stage based on profile data
export function getProfileStage(profile: UserProfile): ProfileStage {
  const totalSignals = profile.facts.length + profile.likes.length;
  
  if (totalSignals < 10) return "discovery";
  if (totalSignals < 30) return "refining";
  return "personalized";
}
