import rawData from "./personality_questions.json";
import {
  PersonalityQuestionRaw,
  PersonalityQuestionOption,
  Question,
  AnswerType,
} from "./types";

const EXCLUDED_TAGS = new Set(["sexual"]);

interface RawDataset {
  questions: PersonalityQuestionRaw[];
}

const dataset = rawData as RawDataset;

// Fisher-Yates on a fresh copy. We shuffle the UNSEEN POOL per
// getNextQuestionBatch call (not once at module load) so every batch
// is a fresh random sample for every user — different users don't
// march through the same sequence, and a refresh gives new questions.
// The seen-id guard in getNextQuestionBatch still handles uniqueness
// within a single user's session. The source JSON is front-loaded
// with LGBTQ+ / drag / dating-app-audience questions in the first
// ~30 rows, so without randomness the first batch would always be
// aggressively themed for audiences the quiz isn't targeted at.
function shuffledCopy<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const INCLUDED_QUESTIONS: readonly PersonalityQuestionRaw[] =
  dataset.questions.filter(
    (q) => !q.content_tags?.some((tag) => EXCLUDED_TAGS.has(tag))
  );

const BY_ID = new Map<string, PersonalityQuestionRaw>();
for (const q of INCLUDED_QUESTIONS) BY_ID.set(q.id, q);

export const TOTAL_QUESTIONS = INCLUDED_QUESTIONS.length;

// Sentiment order: negative (0) → neutral (1) → affirmative (2). Stable within groups.
function sentimentRank(tag: string): number {
  if (tag === "negative") return 0;
  if (tag === "affirmative") return 2;
  return 1;
}

function sortOptionsBySentiment(options: PersonalityQuestionOption[]): PersonalityQuestionOption[] {
  // Stable sort preserving original intra-group order.
  return options
    .map((o, i) => ({ o, i }))
    .sort((a, b) => {
      const s = sentimentRank(a.o.tag) - sentimentRank(b.o.tag);
      return s !== 0 ? s : a.i - b.i;
    })
    .map((x) => x.o);
}

function classifyAnswerType(raw: PersonalityQuestionRaw): AnswerType {
  const n = raw.options?.length ?? 0;
  const tags = raw.options?.map((o) => o.tag) ?? [];
  const hasAff = tags.includes("affirmative");
  const hasNeg = tags.includes("negative");
  // Only treat 2-option questions as yes_no when the options actually look
  // like yes/no — i.e. have affirmative + negative tags. Otherwise (e.g.
  // "Bigger deal: A or B?" with two neutral tags) the X/✓ icons hide the
  // real labels and the user has no way to know which button means which.
  if (n === 2 && hasAff && hasNeg) return "yes_no";
  if (n === 3 && hasAff && hasNeg) return "yes_no_maybe";
  return "multiple_choice";
}

function toQuestion(raw: PersonalityQuestionRaw): Question {
  const answerType = classifyAnswerType(raw);

  if (answerType === "yes_no") {
    const negative =
      raw.options.find((o) => o.tag === "negative") ?? raw.options[1] ?? raw.options[0];
    const affirmative =
      raw.options.find((o) => o.tag === "affirmative") ?? raw.options[0];
    const leftLabel = negative?.text ?? "No";
    const rightLabel = affirmative?.text ?? "Yes";
    return {
      id: raw.id,
      title: raw.question,
      answerType: "yes_no",
      answerLabels: [leftLabel, rightLabel],
      superLikeEnabled: raw.starred === true,
      tags: raw.content_tags ?? [],
      optionTags: [negative?.tag ?? "negative", affirmative?.tag ?? "affirmative"],
    };
  }

  if (answerType === "yes_no_maybe") {
    const negative = raw.options.find((o) => o.tag === "negative")!;
    const affirmative = raw.options.find((o) => o.tag === "affirmative")!;
    const neutral =
      raw.options.find((o) => o !== negative && o !== affirmative) ??
      raw.options.find((o) => o.tag === "neutral") ??
      raw.options[1];
    const ordered = [negative, neutral, affirmative];
    return {
      id: raw.id,
      title: raw.question,
      answerType: "yes_no_maybe",
      options: ordered.map((o) => o.text),
      answerLabels: ordered.map((o) => o.text),
      superLikeEnabled: raw.starred === true,
      tags: raw.content_tags ?? [],
      optionTags: ordered.map((o) => o.tag ?? "neutral"),
    };
  }

  // Multiple choice — order most-negative → most-positive
  const ordered = sortOptionsBySentiment(raw.options);
  const options = ordered.map((o) => o.text);
  return {
    id: raw.id,
    title: raw.question,
    answerType: "multiple_choice",
    options,
    answerLabels: options,
    superLikeEnabled: raw.starred === true,
    tags: raw.content_tags ?? [],
    optionTags: ordered.map((o) => o.tag ?? "neutral"),
  };
}

export function getNextQuestionBatch(
  seenIds: Iterable<string>,
  batchSize: number
): { questions: Question[]; hasMore: boolean; totalServed: number } {
  const seen = new Set(seenIds);

  // Build the unseen pool, shuffle it, then take the first batchSize.
  // Shuffling the whole unseen pool (vs shuffling INCLUDED_QUESTIONS
  // once and slicing) guarantees a uniform-random sample of the
  // remaining questions on every call — not a sliding window over
  // a fixed order. Uniqueness within a session is still enforced by
  // the seen-id filter above.
  const unseen = INCLUDED_QUESTIONS.filter((q) => !seen.has(q.id));
  const shuffled = shuffledCopy(unseen);
  const picked = shuffled.slice(0, batchSize);

  const out: Question[] = picked.map(toQuestion);

  const totalServed = seen.size;
  const hasMore = unseen.length > picked.length;
  return { questions: out, hasMore, totalServed };
}

export function getQuestionById(id: string): Question | null {
  const raw = BY_ID.get(id);
  return raw ? toQuestion(raw) : null;
}

export function isPositiveAnswer(question: Question, answer: string): boolean {
  if (!question.optionTags || !question.answerLabels) {
    return /^(yes|superlike|super_yes|like|agree|love)/i.test(answer);
  }
  const idx = question.answerLabels.findIndex(
    (label) => label.toLowerCase() === answer.toLowerCase()
  );
  if (idx < 0) return false;
  return question.optionTags[idx] === "affirmative";
}

export function indexForAnswer(question: Question, answer: string): number {
  if (!question.answerLabels) return -1;
  const exact = question.answerLabels.findIndex((l) => l === answer);
  if (exact >= 0) return exact;
  const ci = question.answerLabels.findIndex(
    (l) => l.toLowerCase() === answer.toLowerCase()
  );
  return ci;
}
