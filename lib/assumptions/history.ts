import {
  HistoryEvent,
  HistoryEvidenceItem,
  HistoryFeatureSummary,
} from "./types";

interface EnrichedHistoryEvent extends HistoryEvent {
  eventId: string;
  domain: string;
  normalizedTitle: string;
  normalizedUrl: string;
  cluster: string;
  searchQuery: string | null;
  intentHints: string[];
  score: number;
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "all",
  "also",
  "and",
  "any",
  "are",
  "back",
  "been",
  "before",
  "being",
  "between",
  "both",
  "can",
  "did",
  "does",
  "each",
  "for",
  "from",
  "get",
  "has",
  "have",
  "how",
  "into",
  "its",
  "just",
  "like",
  "more",
  "most",
  "new",
  "not",
  "now",
  "our",
  "out",
  "over",
  "per",
  "same",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "time",
  "too",
  "use",
  "using",
  "very",
  "was",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "you",
  "your",
]);

const DOMAIN_CLUSTER_RULES: Array<{ cluster: string; patterns: RegExp[] }> = [
  {
    cluster: "ai_tools",
    patterns: [
      /claude/i,
      /anthropic/i,
      /chatgpt/i,
      /openai/i,
      /gemini/i,
      /aistudio/i,
      /openrouter/i,
      /grok/i,
      /elevenlabs/i,
      /huggingface/i,
      /v0\.app/i,
    ],
  },
  {
    cluster: "engineering",
    patterns: [/github/i, /gitlab/i, /vercel/i, /netlify/i, /localhost/i, /stack/i],
  },
  {
    cluster: "finance",
    patterns: [/psx/i, /sarmaaya/i, /tradingview/i, /stocks?/i, /kse/i, /invest/i],
  },
  {
    cluster: "shopping",
    patterns: [/checkout/i, /cart/i, /daraz/i, /amazon/i, /ebay/i, /shop/i, /store/i],
  },
  {
    cluster: "career",
    patterns: [/linkedin/i, /glassdoor/i, /sharepoint/i, /jobs?/i, /careers?/i, /hr/i],
  },
  {
    cluster: "travel",
    patterns: [/airblue/i, /skyscanner/i, /booking/i, /flights?/i, /rail/i, /trip/i],
  },
  {
    cluster: "social",
    patterns: [/youtube/i, /x\.com/i, /twitter/i, /instagram/i, /facebook/i, /reddit/i],
  },
  {
    cluster: "email_docs",
    patterns: [/mail\./i, /docs\./i, /notion/i, /coda/i, /drive\./i],
  },
];

const INTENT_RULES: Array<{ hint: string; patterns: RegExp[] }> = [
  { hint: "purchase_intent", patterns: [/checkout/i, /cart/i, /buy/i, /order/i, /price/i] },
  { hint: "payment_flow", patterns: [/payment/i, /thank-you/i, /invoice/i, /3ds/i, /secureacceptance/i] },
  { hint: "job_transition", patterns: [/offer letter/i, /contract/i, /onboarding/i, /required documents/i, /hr-/i] },
  { hint: "trading_activity", patterns: [/psx/i, /kse/i, /stock/i, /market watch/i, /ticker/i, /ogdc/i] },
  { hint: "travel_booking", patterns: [/airblue/i, /skyscanner/i, /booking/i, /pnr/i, /flight/i] },
  { hint: "hardware_setup", patterns: [/driver/i, /firmware/i, /software/i, /keyboard/i, /gpu/i] },
  { hint: "ai_optimization", patterns: [/usage/i, /quota/i, /api keys/i, /models?/i, /pricing/i, /gemini/i, /claude/i] },
];

function normalizeDomain(hostname: string): string {
  return hostname.replace(/^www\./, "").toLowerCase();
}

function extractDomain(url: string): string {
  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return "invalid-domain";
  }
}

function extractSearchQuery(url: string): string | null {
  try {
    const parsed = new URL(url);
    const domain = normalizeDomain(parsed.hostname);
    const looksLikeSearch =
      domain.includes("google.") ||
      domain.includes("bing.") ||
      domain.includes("duckduckgo.") ||
      domain.includes("yahoo.") ||
      parsed.pathname.includes("search");

    if (!looksLikeSearch) return null;

    const keys = ["q", "query", "text", "p", "k", "search_query"];
    for (const key of keys) {
      const value = parsed.searchParams.get(key);
      if (value && value.trim()) {
        return value.trim().toLowerCase();
      }
    }

    return null;
  } catch {
    return null;
  }
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        token.length <= 30 &&
        !STOP_WORDS.has(token) &&
        /[a-z]/.test(token)
    );
}

function classifyDomain(domain: string): string {
  for (const rule of DOMAIN_CLUSTER_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(domain))) {
      return rule.cluster;
    }
  }

  return "general";
}

function extractIntentHints(title: string, url: string): string[] {
  const content = `${title} ${url}`.toLowerCase();
  const hints = new Set<string>();

  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(content))) {
      hints.add(rule.hint);
    }
  }

  return Array.from(hints);
}

function recencyScore(lastVisitTime: number, now: number): number {
  const deltaMs = Math.max(0, now - lastVisitTime);
  const dayMs = 1000 * 60 * 60 * 24;
  const days = deltaMs / dayMs;

  if (days <= 1) return 4;
  if (days <= 7) return 3;
  if (days <= 30) return 2;
  return 1;
}

function safeVisitCount(visitCount: number): number {
  if (!Number.isFinite(visitCount) || visitCount < 1) return 1;
  return Math.floor(visitCount);
}

function buildNotablePatterns(events: EnrichedHistoryEvent[]): string[] {
  const patterns: string[] = [];
  const content = events.map((event) => `${event.normalizedTitle} ${event.normalizedUrl}`).join("\n");

  if (/(cart|checkout|payment|orderconfirmation|thank-you)/i.test(content)) {
    patterns.push("Purchase funnels detected (cart/checkout/payment style navigation).");
  }

  if (/(offer letter|contract|required documents|sharepoint|onboarding)/i.test(content)) {
    patterns.push("Career-transition/onboarding behavior detected.");
  }

  if (/(psx|kse|stock|ticker|sarmaaya|tradingview)/i.test(content)) {
    patterns.push("Frequent market-monitoring and trading research behavior detected.");
  }

  if (/(airblue|skyscanner|pnr|flight|booking)/i.test(content)) {
    patterns.push("Travel planning and booking journey behavior detected.");
  }

  if (/(driver|firmware|keyboard|software download)/i.test(content)) {
    patterns.push("Hardware setup and post-purchase configuration behavior detected.");
  }

  if (/(claude|chatgpt|gemini|aistudio|api keys|usage|quota|models)/i.test(content)) {
    patterns.push("High-frequency AI tooling usage and optimization behavior detected.");
  }

  return patterns.slice(0, 12);
}

function topMapEntries(map: Map<string, number>, limit: number): Array<{ key: string; value: number }> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

export function extractHistoryFeatures(
  history: HistoryEvent[],
  windowDays: number,
  now: number = Date.now()
): HistoryFeatureSummary {
  const earliestTime = now - windowDays * 24 * 60 * 60 * 1000;

  const domainCounts = new Map<string, number>();
  const searchQueryCounts = new Map<string, number>();
  const intentTokenCounts = new Map<string, number>();
  const clusterCounts = new Map<string, number>();
  const distinctDomains = new Set<string>();

  const recencyBreakdown = {
    last24h: 0,
    last7d: 0,
    last30d: 0,
    older: 0,
  };

  const enriched: EnrichedHistoryEvent[] = [];

  for (const event of history) {
    if (!event || typeof event.url !== "string" || event.url.trim().length === 0) {
      continue;
    }

    const lastVisitTime = Number(event.lastVisitTime);
    if (!Number.isFinite(lastVisitTime) || lastVisitTime < earliestTime) {
      continue;
    }

    const visitCount = safeVisitCount(event.visitCount);
    const domain = extractDomain(event.url);
    const searchQuery = extractSearchQuery(event.url);
    const title = (event.title || "").trim();
    const normalizedTitle = title.toLowerCase();
    const normalizedUrl = event.url.toLowerCase();
    const cluster = classifyDomain(domain);
    const intentHints = extractIntentHints(title, event.url);

    const score =
      Math.log1p(visitCount) * 2 +
      recencyScore(lastVisitTime, now) +
      intentHints.length * 1.2;

    const enrichedEvent: EnrichedHistoryEvent = {
      eventId: `event-${enriched.length + 1}`,
      url: event.url,
      title,
      lastVisitTime,
      visitCount,
      domain,
      normalizedTitle,
      normalizedUrl,
      cluster,
      searchQuery,
      intentHints,
      score,
    };

    enriched.push(enrichedEvent);

    distinctDomains.add(domain);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + visitCount);
    clusterCounts.set(cluster, (clusterCounts.get(cluster) ?? 0) + visitCount);

    if (searchQuery) {
      searchQueryCounts.set(searchQuery, (searchQueryCounts.get(searchQuery) ?? 0) + 1);
      for (const token of tokenize(searchQuery)) {
        intentTokenCounts.set(token, (intentTokenCounts.get(token) ?? 0) + 2);
      }
    }

    for (const token of tokenize(`${title} ${domain}`)) {
      intentTokenCounts.set(token, (intentTokenCounts.get(token) ?? 0) + 1);
    }

    const delta = now - lastVisitTime;
    if (delta <= 24 * 60 * 60 * 1000) {
      recencyBreakdown.last24h += 1;
      recencyBreakdown.last7d += 1;
      recencyBreakdown.last30d += 1;
    } else if (delta <= 7 * 24 * 60 * 60 * 1000) {
      recencyBreakdown.last7d += 1;
      recencyBreakdown.last30d += 1;
    } else if (delta <= 30 * 24 * 60 * 60 * 1000) {
      recencyBreakdown.last30d += 1;
    } else {
      recencyBreakdown.older += 1;
    }
  }

  const evidenceCatalog: HistoryEvidenceItem[] = enriched
    .sort((a, b) => b.score - a.score)
    .slice(0, 280)
    .map((event) => ({
      eventId: event.eventId,
      domain: event.domain,
      title: event.title,
      url: event.url,
      lastVisitTime: event.lastVisitTime,
      visitCount: event.visitCount,
      intentHints: event.intentHints,
    }));

  const domainClusters = Array.from(clusterCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([cluster, hits]) => ({ cluster, hits }));

  return {
    totalEvents: enriched.length,
    distinctDomains: distinctDomains.size,
    recencyBreakdown,
    topDomains: topMapEntries(domainCounts, 25),
    topSearchQueries: topMapEntries(searchQueryCounts, 30),
    topIntentTokens: topMapEntries(intentTokenCounts, 40),
    domainClusters,
    notablePatterns: buildNotablePatterns(enriched),
    evidenceCatalog,
  };
}
