import Anthropic from "@anthropic-ai/sdk";
import { extractHistoryFeatures } from "./history";
import { getLearningContext, persistGeneratedRun } from "./db";
import {
  AssumptionCard,
  AssumptionEvidence,
  AssumptionsGenerateRequest,
  AssumptionsGenerateResponse,
  HistoryFeatureSummary,
} from "./types";

const MODEL = "claude-sonnet-4-6";
const PROMPT_VERSION = "wild_magic_v1";
const ASSUMPTION_BATCH_SIZE = 10;
const MAX_PROMPT_EVIDENCE = 220;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildSystemPrompt(): string {
  return `You are an elite behavioral inference engine.

Goal:
Generate bold, high-signal assumptions from browsing behavior that make users think: "WTF, how did it know?"

You must still ground each assumption in actual observed evidence. Creativity is required, but hallucination is forbidden.

Output constraints:
- Return ONLY valid JSON.
- Top-level shape must be: { "assumptions": [...] }
- Produce exactly 10 assumptions.
- Each assumption must include exactly 2 evidence entries.
- confidence must be a float between 0 and 1.
- tags should be short lowercase descriptors.

Evidence constraints:
- Evidence must be grounded in supplied evidence catalog entries.
- Each evidence entry includes:
  - signal: concise pattern statement
  - source: exact URL or domain-backed source from provided evidence
  - eventId: ID from evidence catalog when available

Quality constraints:
- Assumptions should be specific and vivid, not generic.
- Prefer latent intent and behavior patterns over literal restatement.
- Avoid repeating the same behavioral theme across many cards.
- Keep each assumption to 1 sentence.
- Keep each reason to 1-2 sentences.`;
}

function buildUserPrompt(params: {
  request: AssumptionsGenerateRequest;
  featureSummary: HistoryFeatureSummary;
  learningContext: { positivePatterns: string[]; negativePatterns: string[] };
}): string {
  const { request, featureSummary, learningContext } = params;

  const evidenceForPrompt = featureSummary.evidenceCatalog.slice(0, MAX_PROMPT_EVIDENCE);

  return `USER ID: ${request.userId}
WINDOW DAYS: ${request.windowDays ?? 90}
RAW HISTORY COUNT: ${request.history.length}

LEARNING CONTEXT:
- Positive patterns (reinforce): ${learningContext.positivePatterns.join(", ") || "none"}
- Negative patterns (down-rank): ${learningContext.negativePatterns.join(", ") || "none"}

FEATURE SUMMARY (computed from entire history):
${JSON.stringify(
  {
    totalEvents: featureSummary.totalEvents,
    distinctDomains: featureSummary.distinctDomains,
    recencyBreakdown: featureSummary.recencyBreakdown,
    topDomains: featureSummary.topDomains,
    topSearchQueries: featureSummary.topSearchQueries,
    topIntentTokens: featureSummary.topIntentTokens,
    domainClusters: featureSummary.domainClusters,
    notablePatterns: featureSummary.notablePatterns,
  },
  null,
  2
)}

EVIDENCE CATALOG (from real events):
${JSON.stringify(evidenceForPrompt, null, 2)}

TASK:
Generate exactly ${ASSUMPTION_BATCH_SIZE} assumptions.

RESPONSE SCHEMA:
{
  "assumptions": [
    {
      "id": "assumption-1",
      "assumption": "...",
      "reason": "...",
      "evidence": [
        {
          "signal": "...",
          "source": "...",
          "eventId": "event-42"
        },
        {
          "signal": "...",
          "source": "...",
          "eventId": "event-99"
        }
      ],
      "confidence": 0.82,
      "tags": ["shopping_intent", "hardware"]
    }
  ]
}

Return JSON only.`;
}

function extractJsonPayload(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }

  if (value < 0) return 0;
  if (value > 1) return 1;
  return Math.round(value * 100) / 100;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ["unclassified"];
  }

  const tags = value
    .map((tag) => (typeof tag === "string" ? tag.toLowerCase().trim() : ""))
    .filter((tag) => tag.length > 0)
    .map((tag) => tag.replace(/[^a-z0-9_\-]+/g, "_"));

  if (tags.length === 0) {
    return ["unclassified"];
  }

  return Array.from(new Set(tags)).slice(0, 6);
}

function normalizeEvidence(rawEvidence: unknown): [AssumptionEvidence, AssumptionEvidence] | null {
  if (!Array.isArray(rawEvidence) || rawEvidence.length < 2) {
    return null;
  }

  const mapped: AssumptionEvidence[] = [];

  for (const entry of rawEvidence.slice(0, 2)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const signal =
      "signal" in entry && typeof entry.signal === "string"
        ? entry.signal.trim()
        : "";
    const source =
      "source" in entry && typeof entry.source === "string"
        ? entry.source.trim()
        : "";
    const eventId =
      "eventId" in entry && typeof entry.eventId === "string"
        ? entry.eventId.trim()
        : undefined;

    if (!signal || !source) {
      continue;
    }

    mapped.push({
      signal,
      source,
      eventId,
    });
  }

  if (mapped.length !== 2) {
    return null;
  }

  return [mapped[0], mapped[1]];
}

function normalizeAssumptions(parsed: unknown): AssumptionCard[] {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model response is not an object");
  }

  if (!("assumptions" in parsed) || !Array.isArray(parsed.assumptions)) {
    throw new Error("Model response missing assumptions array");
  }

  if (parsed.assumptions.length < ASSUMPTION_BATCH_SIZE) {
    throw new Error("Model returned fewer than 10 assumptions");
  }

  const cards: AssumptionCard[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < ASSUMPTION_BATCH_SIZE; index += 1) {
    const item = parsed.assumptions[index];

    if (!item || typeof item !== "object") {
      throw new Error(`Invalid assumption at index ${index}`);
    }

    const assumptionText =
      "assumption" in item && typeof item.assumption === "string"
        ? item.assumption.trim()
        : "";

    const reasonText =
      "reason" in item && typeof item.reason === "string"
        ? item.reason.trim()
        : "";

    if (!assumptionText || !reasonText) {
      throw new Error(`Assumption ${index + 1} is missing assumption or reason text`);
    }

    const evidence =
      "evidence" in item ? normalizeEvidence(item.evidence) : null;

    if (!evidence) {
      throw new Error(`Assumption ${index + 1} does not include exactly 2 valid evidence entries`);
    }

    const rawId = "id" in item && typeof item.id === "string" ? item.id.trim() : "";
    let id = rawId || `assumption-${index + 1}`;

    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);

    cards.push({
      id,
      assumption: assumptionText,
      reason: reasonText,
      evidence,
      confidence: normalizeConfidence("confidence" in item ? item.confidence : null),
      tags: normalizeTags("tags" in item ? item.tags : []),
    });
  }

  return cards;
}

export function validateAndNormalizeAssumptionsPayload(parsed: unknown): AssumptionCard[] {
  return normalizeAssumptions(parsed);
}

async function requestClaudeAssumptions(params: {
  prompt: string;
  repairHint?: string;
  temperature: number;
}): Promise<string> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: params.temperature,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: params.repairHint
          ? `${params.prompt}\n\nIMPORTANT REPAIR HINT: ${params.repairHint}`
          : params.prompt,
      },
    ],
  });

  const textBlocks = message.content.filter((entry) => entry.type === "text");
  if (textBlocks.length === 0) {
    throw new Error("Claude returned no text blocks");
  }

  const textBlock = textBlocks[textBlocks.length - 1];
  if (textBlock.type !== "text") {
    throw new Error("Claude response was not textual");
  }

  return textBlock.text;
}

export async function generateWildMagicAssumptions(
  request: AssumptionsGenerateRequest
): Promise<AssumptionsGenerateResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const windowDays = request.windowDays ?? 90;
  const featureSummary = extractHistoryFeatures(request.history, windowDays);
  const learningContext = await getLearningContext(request.userId);
  const prompt = buildUserPrompt({ request, featureSummary, learningContext });

  let lastError: Error | null = null;
  let cards: AssumptionCard[] | null = null;

  const attemptTemperatures = [0.8, 0.3, 0];
  for (const [attemptIndex, temperature] of attemptTemperatures.entries()) {
    try {
      const rawText = await requestClaudeAssumptions({
        prompt,
        temperature,
        repairHint:
          lastError && attemptIndex > 0
            ? `Your previous output failed validation: ${lastError.message}. Return corrected JSON.`
            : undefined,
      });

      const jsonPayload = extractJsonPayload(rawText);
      const parsed = JSON.parse(jsonPayload) as unknown;
      cards = normalizeAssumptions(parsed);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown generation error");
    }
  }

  if (!cards) {
    throw new Error(
      `Failed to produce valid assumptions after retries: ${lastError?.message ?? "unknown error"}`
    );
  }

  const runId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();

  await persistGeneratedRun({
    runId,
    userId: request.userId,
    windowDays,
    historyCount: request.history.length,
    generatedAt,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    featureSummary: featureSummary as unknown as Record<string, unknown>,
    clientContext: request.clientContext,
    assumptions: cards,
  });

  return {
    runId,
    generatedAt,
    assumptions: cards,
  };
}
