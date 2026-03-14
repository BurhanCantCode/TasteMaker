export interface HistoryEvent {
  url: string;
  title: string;
  lastVisitTime: number;
  visitCount: number;
}

export interface HistoryEvidenceItem {
  eventId: string;
  domain: string;
  title: string;
  url: string;
  lastVisitTime: number;
  visitCount: number;
  intentHints: string[];
}

export interface FeatureBucketItem {
  key: string;
  value: number;
}

export interface DomainCluster {
  cluster: string;
  hits: number;
}

export interface HistoryFeatureSummary {
  totalEvents: number;
  distinctDomains: number;
  recencyBreakdown: {
    last24h: number;
    last7d: number;
    last30d: number;
    older: number;
  };
  topDomains: FeatureBucketItem[];
  topSearchQueries: FeatureBucketItem[];
  topIntentTokens: FeatureBucketItem[];
  domainClusters: DomainCluster[];
  notablePatterns: string[];
  evidenceCatalog: HistoryEvidenceItem[];
}

export interface AssumptionEvidence {
  signal: string;
  source: string;
  eventId?: string;
}

export interface AssumptionCard {
  id: string;
  assumption: string;
  reason: string;
  evidence: [AssumptionEvidence, AssumptionEvidence];
  confidence: number;
  tags: string[];
}

export interface AssumptionsGenerateRequest {
  userId: string;
  windowDays?: number;
  history: HistoryEvent[];
  clientContext?: Record<string, unknown>;
}

export interface AssumptionsGenerateResponse {
  runId: string;
  generatedAt: string;
  assumptions: AssumptionCard[];
}

export type AssumptionVote = "agree" | "disagree";

export interface AssumptionFeedbackEntry {
  assumptionId: string;
  vote: AssumptionVote;
}

export interface AssumptionsFeedbackRequest {
  userId: string;
  runId: string;
  feedback: AssumptionFeedbackEntry[];
}

export interface AssumptionsChatRequest {
  userId: string;
  message: string;
  runId?: string;
}

export interface AssumptionsChatResponse {
  reply: string;
}

export interface LearningPatternWeight {
  patternKey: string;
  weight: number;
  agreeCount: number;
  disagreeCount: number;
}

export interface LearningSummary {
  strongestPositive: LearningPatternWeight[];
  strongestNegative: LearningPatternWeight[];
}

export interface LearningContext {
  positivePatterns: string[];
  negativePatterns: string[];
}

export interface PersistedRun {
  runId: string;
  generatedAt: string;
}

export interface ChatContextAssumption {
  runId: string;
  assumption: string;
  reason: string;
  tags: string[];
  vote: AssumptionVote | null;
}

export interface ChatContextSnapshot {
  recentAssumptions: ChatContextAssumption[];
  learningSummary: LearningSummary;
}
