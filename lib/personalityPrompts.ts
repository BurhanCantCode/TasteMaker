import { PersonalityReport, Question, UserProfile } from "./types";

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

export const DYNAMIC_BATCH_SYSTEM_PROMPT = [
  "You are generating personality-quiz questions for a user you have already learned about.",
  "You output STRICT JSON with a single top-level `cards` array. Each card is:",
  '{ "type": "ask", "content": { "id": string, "title": string, "answerType": "yes_no", "answerLabels": string[], "optionTags"?: string[], "tags"?: string[], "superLikeEnabled"?: boolean } }',
  "",
  "ANSWER TYPE — always yes_no:",
  "- Every card MUST be yes_no. answerLabels = [negative, affirmative] — exactly 2 strings in that order.",
  "- Do NOT produce yes_no_maybe, multiple_choice, rating_scale, or any other type. Cards with any other answerType will be discarded.",
  "- Titles must be answerable with a clean yes or no. No comparisons (\"X vs Y?\"), no scale questions (\"how often…?\"), no open prompts.",
  "",
  "RULES:",
  '- id MUST be unique per card — use "dyn_<short-random>" (e.g. "dyn_a7b2").',
  "- title is ONE question, conversational, under 140 chars. No preamble.",
  "- superLikeEnabled: true on at most 1 of the 10 cards (a question that really cuts to the core of this person). Omit on the rest.",
  "- Do NOT restate a question you can see was already asked.",
  "- Do NOT include sexual content. Mature/political/identity content is fine in moderation.",
  "- Reference what you know. Half or more of the 10 should follow up on / deepen something in the DISCOVERIES or PORTRAIT below.",
  "- The other half can probe new territory but should be informed by the pattern you see.",
  "- No emojis. No leading dashes. No markdown in titles.",
  "",
  "OUTPUT: JSON only, no code fences, no prose.",
].join("\n");

/**
 * Builds the user-role message for a dynamic batch.
 * Includes the latest portrait summary (if present) and the recent facts
 * so the LLM can follow up / test hypotheses / avoid repeats.
 */
export function buildDynamicBatchUserPrompt(
  profile: UserProfile,
  batchSize: number
): string {
  const facts = recentFacts(profile);
  const report = latestReport(profile);

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
    : "LATEST PORTRAIT: (none yet — this is the user's second chunk; lean on raw DISCOVERIES)";

  const discoveriesBlock = facts.length
    ? facts
        .map((f) => {
          const slant = f.positive ? "affirmative" : "non-affirmative";
          return `- Q: ${f.question}\n  A: ${f.answer} (${slant})`;
        })
        .join("\n")
    : "- (none yet)";

  return [
    portraitBlock,
    "",
    `DISCOVERIES (last ${facts.length} answers):`,
    discoveriesBlock,
    "",
    `TASK: Generate ${batchSize} personality-quiz questions tailored to THIS person.`,
    "- At least half must directly follow up on / deepen / cross-reference something in the DISCOVERIES or PORTRAIT.",
    "- The rest can explore new territory but should be INFORMED by the pattern you see.",
    "- Use only yes_no / yes_no_maybe / multiple_choice.",
    "- Every card gets a unique id, a conversational title, and appropriate answerLabels.",
    '- Respond with JSON only: { "cards": [ ... ] }',
  ].join("\n");
}

// Shape validator for a single LLM-generated card. Returns null on invalid
// so the API route can drop bad cards without crashing the batch.
// Post yes/no pivot: only yes_no is accepted; anything else is dropped.
export function validateDynamicCard(raw: unknown): Question | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const content = obj.content as Record<string, unknown> | undefined;
  if (obj.type !== "ask" || !content) return null;

  const id = typeof content.id === "string" ? content.id : null;
  const title = typeof content.title === "string" ? content.title : null;
  if (!id || !title) return null;
  if (content.answerType !== "yes_no") return null;

  const answerLabels = Array.isArray(content.answerLabels)
    ? (content.answerLabels as unknown[]).filter(
        (x): x is string => typeof x === "string"
      )
    : [];
  if (answerLabels.length !== 2) return null;

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
    answerType: "yes_no",
    answerLabels,
    optionTags,
    tags,
    superLikeEnabled,
  };
}
