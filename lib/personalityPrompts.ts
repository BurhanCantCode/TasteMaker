import {
  PersonalityReport,
  Question,
  UserProfile,
  FactSentiment,
} from "./types";
import { emptyState, summarizeForPrompt } from "./probabilityState";

// Cap context to keep tokens bounded. Most useful signal is the last ~80
// facts (recent beats ancient for mood/preference drift) plus the latest
// report's condensed portrait. Highlights included as quick-scan hints.
const RECENT_FACTS_LIMIT = 80;

function recentFacts(profile: UserProfile): UserProfile["facts"] {
  const facts = profile.facts ?? [];
  return facts.length > RECENT_FACTS_LIMIT
    ? facts.slice(-RECENT_FACTS_LIMIT)
    : facts;
}

function latestReport(profile: UserProfile): PersonalityReport | null {
  const reports = profile.reports ?? [];
  return reports.length > 0 ? reports[reports.length - 1] : null;
}

function sentimentOf(fact: UserProfile["facts"][number]): FactSentiment {
  return fact.sentiment ?? (fact.positive ? "affirmative" : "non-affirmative");
}

function answerLabelFor(sentiment: FactSentiment): "Yes" | "Maybe" | "No" {
  if (sentiment === "affirmative") return "Yes";
  if (sentiment === "neutral") return "Maybe";
  return "No";
}

export const DYNAMIC_BATCH_SYSTEM_PROMPT = [
  "You are generating personality-quiz questions to map a user's psychological type across five frameworks: Enneagram (type + wing), MBTI, DISC, Big Five (OCEAN), and Attachment Style.",
  "",
  "You output STRICT JSON with a single top-level `cards` array. Each card is:",
  '{ "type": "ask", "content": { "id": string, "title": string, "answerType": "yes_no_maybe", "answerLabels": string[], "optionTags"?: string[], "tags"?: string[], "superLikeEnabled"?: boolean } }',
  "",
  "ANSWER TYPE — always yes_no_maybe:",
  "- Every card MUST be yes_no_maybe. answerLabels = [negative, neutral, affirmative] — exactly 3 strings in that order.",
  "- Do NOT produce yes_no, multiple_choice, rating_scale, or any other type.",
  '- Titles must be answerable with yes, no, or maybe/sometimes. No comparisons ("X vs Y?"), no open prompts.',
  "",
  "You will receive:",
  "- BATCH: which round this is (1 = core, 2+ = adaptive)",
  "- ANSWER LOG: all prior questions and responses (Yes / Maybe / No)",
  "- PROBABILITY STATE: current confidence estimates per framework type",
  "- DISCOVERIES: notable patterns already confirmed from prior answers",
  "",
  "MAYBE HANDLING:",
  "- Maybe is a weak signal — apply half-weight in both directions when scoring.",
  "- Too many Maybes from a user signals ambiguity on that dimension; deprioritize it and probe elsewhere.",
  "- Avoid questions where Maybe is obviously the honest answer for most people. Force a lean.",
  "",
  "QUESTION RULES:",
  "",
  '1. BEHAVIORAL NOT INTROSPECTIVE. Ask about actions and patterns, not self-image. "You finish things before moving on" beats "You consider yourself disciplined."',
  "",
  '2. SPECIFIC OVER ABSTRACT. The more concrete, the more honest the answer. "You\'ve stayed somewhere too long because leaving felt disloyal" beats "Loyalty matters to you."',
  "",
  "3. PROGRESSIVE INTIMACY. Batch 1–2: surface behaviors, observable patterns. Batch 3+: interior states, private habits, unspoken tendencies. Questions should feel more personal as the session deepens.",
  "",
  "4. NO THERAPY LANGUAGE. Never use: attachment, boundaries, trauma, triggers, inner child, validate. Write like a perceptive friend, not a clinician.",
  "",
  "5. RESOLVE UNCERTAINTY FIRST. Use PROBABILITY STATE to find the highest-entropy dimensions. Generate questions that discriminate between the leading candidate types. Skip dimensions already above 0.80 confidence.",
  "",
  "6. BALANCE POLARITY. Roughly half the batch should be phrased so Yes = signal toward a type; half so No = signal toward a type. Prevents acquiescence bias.",
  "",
  '7. FEEL LIKE REVELATION. The best questions make people pause and think "how did it know to ask that."',
  "",
  "BATCH-SPECIFIC GUIDANCE:",
  "- Batch 1: Cover broadest discriminating dimensions — social energy, decision style, conflict response, relationship with rules, future vs. present orientation.",
  "- Batch 2+: Tighten to leading candidates. If narrowing to I_FJ, split INFJ from ISFJ. If Enneagram is between 4 and 9, go there. Half or more should deepen something already in DISCOVERIES.",
  "",
  "CARD RULES:",
  '- id MUST be unique — use "dyn_<short-random>" (e.g. "dyn_a7b2").',
  "- title is ONE question, conversational, under 140 chars. No preamble.",
  '- answerLabels = [negative, neutral, affirmative] — exactly 3 strings. Vary the wording to match the question\'s tone. Examples: ["No", "Sometimes", "Yes"] / ["Rarely", "Depends", "Often"] / ["Not me", "Kind of", "Absolutely"].',
  "- superLikeEnabled: true on at most 1 of the 10 cards — the question that cuts deepest given what you already know. Omit on the rest.",
  '- tags: use framework dimension codes e.g. ["mbti:I", "enneagram:5", "bigfive:E", "disc:C", "attachment:avoidant"]',
  "- Do NOT restate a question already in ANSWER LOG.",
  "- No emojis. No markdown in titles. No sexual content.",
  "",
  "OUTPUT: JSON only, no code fences, no prose.",
].join("\n");

/**
 * Builds the user-role message for a dynamic batch.
 * Emits the four blocks the system prompt expects: BATCH, ANSWER LOG,
 * PROBABILITY STATE, DISCOVERIES (the latter wraps the latest portrait
 * for follow-up framing).
 */
export function buildDynamicBatchUserPrompt(
  profile: UserProfile,
  batchSize: number,
  batchNumber: number
): string {
  const facts = recentFacts(profile);
  const report = latestReport(profile);
  const state = profile.probabilityState ?? emptyState();

  const answerLogBlock = facts.length
    ? facts
        .map((f, i) => {
          const sentiment = sentimentOf(f);
          const label = answerLabelFor(sentiment);
          const isSuper =
            typeof f.answer === "string" && /\(super\)\s*$/i.test(f.answer);
          const superTag = isSuper ? " **SUPER-LIKED**" : "";
          return `${i + 1}. Q: ${f.question}\n   A: ${label}${superTag}`;
        })
        .join("\n")
    : "(none yet — this is the first batch)";

  const portraitBlock = report
    ? [
        "LATEST PORTRAIT (your condensed read on this person):",
        report.summary ? `- summary: ${report.summary}` : "",
        report.portrait ? `- portrait: ${report.portrait}` : "",
        report.highlights && report.highlights.length > 0
          ? `- highlights:\n${report.highlights.map((h) => `  • ${h}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "LATEST PORTRAIT: (none yet)";

  return [
    `BATCH: ${batchNumber}`,
    "",
    `ANSWER LOG (${facts.length} prior answers):`,
    answerLogBlock,
    "",
    "PROBABILITY STATE (current per-framework confidence; values in [0,1]):",
    summarizeForPrompt(state),
    "",
    "DISCOVERIES:",
    portraitBlock,
    "",
    `TASK: Generate ${batchSize} personality-quiz questions tailored to THIS person.`,
    "- Use only yes_no_maybe; answerLabels exactly 3 strings [negative, neutral, affirmative].",
    "- Resolve the highest-entropy dimensions in PROBABILITY STATE first; skip dimensions above 0.80.",
    "- Tag each card with framework dimension codes in `tags` (e.g. mbti:I, enneagram:5, disc:C, bigfive:E, attachment:avoidant).",
    "- Every card gets a unique id and a conversational title.",
    '- Respond with JSON only: { "cards": [ ... ] }',
  ].join("\n");
}

// Shape validator for a single LLM-generated card. Returns null on invalid
// so the API route can drop bad cards without crashing the batch.
// Accepts yes_no (back-compat) and yes_no_maybe (current default).
export function validateDynamicCard(raw: unknown): Question | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const content = obj.content as Record<string, unknown> | undefined;
  if (obj.type !== "ask" || !content) return null;

  const id = typeof content.id === "string" ? content.id : null;
  const title = typeof content.title === "string" ? content.title : null;
  if (!id || !title) return null;

  const answerType = content.answerType;
  if (answerType !== "yes_no" && answerType !== "yes_no_maybe") return null;

  const answerLabels = Array.isArray(content.answerLabels)
    ? (content.answerLabels as unknown[]).filter(
        (x): x is string => typeof x === "string"
      )
    : [];
  const expectedLabelCount = answerType === "yes_no_maybe" ? 3 : 2;
  if (answerLabels.length !== expectedLabelCount) return null;

  const optionTags = Array.isArray(content.optionTags)
    ? (content.optionTags as unknown[]).filter(
        (x): x is string => typeof x === "string"
      )
    : undefined;
  const tags = Array.isArray(content.tags)
    ? (content.tags as unknown[]).filter(
        (x): x is string => typeof x === "string"
      )
    : [];
  const superLikeEnabled = content.superLikeEnabled === true;

  return {
    id,
    title,
    answerType,
    answerLabels,
    optionTags,
    tags,
    superLikeEnabled,
  };
}
