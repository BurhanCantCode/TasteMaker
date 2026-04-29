// Answer types matching the spec
export type AnswerType =
  | "yes_no"
  | "yes_no_maybe"
  | "want_scale"      // Want / Don't want / Already have / Really want
  | "text_input"
  | "multiple_choice"
  | "like_scale"      // Like / Don't like / Super like
  | "rating_scale";   // 1-5 numeric scale for frequency/intensity

export type Gesture =
  | "swipe_left"
  | "swipe_right"
  | "swipe_up"
  | "tap_left"
  | "tap_center"
  | "tap_right"
  | "tap_n";

export type CardType = "ask" | "result" | "interstitial";

// Raw personality question (from personality_questions.json)
export interface PersonalityQuestionOption {
  text: string;
  tag: string; // "affirmative" | "negative" | "neutral" | etc.
}

export interface PersonalityQuestionRaw {
  id: string;
  question: string;
  starred: boolean;
  options: PersonalityQuestionOption[];
  content_tags: string[]; // "mature" | "sexual" | other
}

// ASK card question (normalized for rendering)
export interface Question {
  id: string;
  title: string;
  answerType: AnswerType;
  options?: string[];        // For multiple_choice
  answerLabels?: string[];   // Labels for answer buttons
  superLikeEnabled?: boolean;
  tags?: string[];           // content_tags from source
  optionTags?: string[];     // per-option sentiment tag ("affirmative" | "negative" | "neutral")
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

// Numeric personality dimensions, each a float in [0, 1].
// Emitted alongside the text portrait so the 3D visualization can
// procedurally render a "personality sculpture" keyed to the person.
// Keep this tight — fewer dimensions = easier for the LLM to reason about
// and fewer degrees of freedom to design visuals around.
export interface PersonalityParams {
  warmth: number;       // 0 = cold/detached, 1 = warm/relational
  energy: number;       // 0 = slow/contemplative, 1 = restless/fast
  structure: number;    // 0 = organic/improvisational, 1 = structured/analytical
  density: number;      // 0 = minimal/spare, 1 = rich/layered/complex
  extroversion: number; // 0 = introverted/inward, 1 = extroverted/outward
  symmetry: number;     // 0 = asymmetric/experimental, 1 = symmetric/conventional
}

// Best-fit results across the five personality frameworks the engine maps.
// Confidence floats in [0, 1]; 0.5 means genuinely uncertain.
export interface FrameworkProfile {
  enneagram: { type: number; wing: number; confidence: number };
  mbti: { type: string; confidence: number };
  disc: { dominant: string; secondary: string; confidence: number };
  bigFive: { O: number; C: number; E: number; A: number; N: number };
  attachmentStyle: { type: string; confidence: number };
  ageRange: string;
  careerArchetypes: string[];
}

// Running per-framework probability vector; updated after each swipe.
// Values within each framework should sum to ~1 after normalization.
export interface ProbabilityState {
  mbti: Record<"I" | "E" | "N" | "S" | "T" | "F" | "J" | "P", number>;
  enneagram: Record<"1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9", number>;
  disc: Record<"D" | "I" | "S" | "C", number>;
  bigFive: Record<"O" | "C" | "E" | "A" | "N", number>;
  attachment: Record<"secure" | "anxious" | "avoidant" | "disorganized", number>;
}

// Demographic priors triangulated by indirect-probe answers. Each dim is
// a probability distribution that sums to ~1 after normalization. These
// are NEVER surfaced to the user directly — they only anchor the LLM's
// pronoun choice, age range, and probe-conditioned predictions in the
// synthesis prompt. Stays empty/uniform until probes start landing.
export interface DemographicState {
  gender: { male: number; female: number; nonbinary: number };
  ageBand: {
    teen: number;
    "20s": number;
    "30s": number;
    "40s": number;
    "50plus": number;
  };
  relationshipStatus: {
    single: number;
    partnered: number;
    married: number;
    divorced: number;
  };
  hasKids: { yes: number; no: number };
  geographyType: { urban: number; suburban: number; rural: number };
  workStatus: {
    student: number;
    employed: number;
    freelance: number;
    retired: number;
    unemployed: number;
  };
}

// Stashed personality report
export interface PersonalityReport {
  id: string;
  createdAt: number;
  factsCount: number;
  summary: string;   // short 2-3 sentence inference
  portrait: string;  // richer multi-paragraph "tell me about a user who reports these answers"
  highlights?: string[]; // bullet-point insights
  params?: PersonalityParams; // optional — reports stashed before this field existed won't have it
  profile?: FrameworkProfile; // optional — older reports lack the multi-framework profile
  predictions?: string[]; // 3-5 oddly-specific behavioral guesses; landed before framework chips
}

// User Profile (stored in localStorage)
export interface UserProfile {
  facts: UserFact[];
  likes: UserLike[];
  initialFacts?: string;
  userLocation?: {
    city: string;
    region?: string;
    country?: string;
  };
  skippedIds?: string[];        // Question IDs the user chose to skip
  reports?: PersonalityReport[]; // Stashed personality reports
  probabilityState?: ProbabilityState; // running per-framework confidence
  demographicState?: DemographicState; // running per-dim demographic priors
}

export type FactSentiment = "affirmative" | "neutral" | "non-affirmative";

export interface UserFact {
  questionId: string;
  question: string;
  answer: string;
  // Kept for back-compat with reports/prompts written before yes_no_maybe.
  // Equivalent to `sentiment === "affirmative"` for new facts.
  positive: boolean;
  // Three-way sentiment introduced with yes_no_maybe support. Older facts
  // lack this; readers should fall back to `positive`.
  sentiment?: FactSentiment;
  timestamp: number;
  skipped?: boolean;
  answerIndex?: number;
  gesture?: Gesture;
}

export interface UserLike {
  itemId: string;
  item: string;
  category: string;
  rating: string;
  timestamp: number;
}

// Batches are either "static" (served from the shuffled JSON question
// bank) or "dynamic" (generated by the LLM with context of the user's
// prior answers + latest report). See
// docs/plans/2026-04-22-dynamic-question-batching.md.
export type BatchSource = "static" | "dynamic";

// Claude API types
export interface GenerateRequest {
  userProfile: UserProfile;
  batchSize: number;
  mode: "ask" | "result";
  systemPrompt?: string;
  categoryFilter?: string;
  source?: BatchSource; // defaults to "static" server-side
}

export interface GenerateResponse {
  cards: Card[];
  reasoning?: string;
  hasMore?: boolean;
  source?: BatchSource; // echo so client can tell what was actually served
}

// Swipe direction for gesture handling
export type SwipeDirection = "left" | "right" | "up" | "down" | null;

// Card response mapping
export interface CardResponse {
  cardId: string;
  cardType: CardType;
  response: string | SwipeDirection;
  timestamp: number;
}

// Card session state for cross-device continuity
export interface CardSession {
  mode: "ask" | "result";
  batchProgress: number;
  batchSize: number;
}

// Local-only: persisted unanswered question batch (survives refresh)
export interface PendingCardsBatch {
  cards: Card[];
  currentIndex: number;
  mode: "ask" | "result";
  batchSize: number;
}

// Profile stage for progressive refinement
export type ProfileStage = "discovery" | "refining" | "personalized";

export function getProfileStage(profile: UserProfile): ProfileStage {
  const totalSignals = profile.facts.length + profile.likes.length;
  if (totalSignals < 5) return "discovery";
  if (totalSignals < 15) return "personalized";
  return "personalized";
}
