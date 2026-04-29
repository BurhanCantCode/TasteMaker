import { BatchSource, Card, Question, UserProfile } from "./types";
import { getNextQuestionBatch } from "./personalityQuestions";
import { selectProbesForBatch, shuffleCards } from "./indirectProbes";
import { selectMBTIProbesForBatch } from "./personalityProbes";

// Per-batch probe budget — kept in sync with the server's split so
// client-served and server-served batches feel identical.
const DEMO_PROBES_PER_BATCH_CLIENT = 2;
const MBTI_PROBES_PER_BATCH_CLIENT = 1;

// Batches the sequencer hands out. CHUNK_SIZE is the milestone where
// the first personality report fires (and every subsequent report).
// Three batches per chunk: 2 static (broad signal collection) + 1
// dynamic (LLM-personalized) before the first report at fact 30.
export const BATCH_SIZE = 10;
export const CHUNK_SIZE = 30;

export interface BatchPlan {
  source: BatchSource;
  size: number;
}

// First two batches → static (cards 0-19) for broad signal collection.
// Batch 3 (cards 20-29) is the FIRST dynamic batch — informs the
// 30-fact report with personalized questions instead of pure pool draw.
// After that, batches alternate dynamic ↔ static every BATCH_SIZE cards.
//
// Pattern:
//   batch 1 (0-9)    static
//   batch 2 (10-19)  static
//   batch 3 (20-29)  DYNAMIC   ← personalizes the first report
//   ─── REPORT at 30 ───
//   batch 4 (30-39)  static
//   batch 5 (40-49)  dynamic
//   batch 6 (50-59)  static
//   ...
function sourceForAnsweredCount(answeredCount: number): BatchSource {
  if (answeredCount < BATCH_SIZE * 2) return "static";
  const batchIdx = Math.floor(answeredCount / BATCH_SIZE);
  return batchIdx % 2 === 0 ? "dynamic" : "static";
}

/**
 * Plan the next batch from the profile's current state.
 *
 * `projectedAnsweredDelta` accounts for React state lag and look-ahead
 * planning:
 *   - delta = 0 → plan for a batch served at the current `facts.length`
 *     (tab-enter, undo, interstitial continue).
 *   - delta = 1 → plan for the batch served immediately after a fact is
 *     committed but before React has re-rendered (advance / skip).
 *   - delta = BATCH_SIZE → plan for the batch AFTER the current batch
 *     fully completes (mid-batch prefetch).
 */
export function planNextBatch(
  profile: UserProfile,
  opts?: { projectedAnsweredDelta?: number }
): BatchPlan {
  const delta = opts?.projectedAnsweredDelta ?? 0;
  const projected = profile.facts.length + delta;
  return {
    source: sourceForAnsweredCount(projected),
    size: BATCH_SIZE,
  };
}

// True when a projected answered count crosses a chunk boundary — used
// to gate the interstitial and to decide the source of the next batch.
export function isMilestoneAnswer(projectedAnsweredCount: number): boolean {
  return projectedAnsweredCount > 0 && projectedAnsweredCount % CHUNK_SIZE === 0;
}

// Canonical "seen" set: questions the user has answered OR explicitly
// skipped. Used both server-side (to exclude from generation) and
// client-side (to defend against prefetch staleness).
export function buildSeenIds(profile: UserProfile): Set<string> {
  const seen = new Set<string>();
  for (const f of profile.facts ?? []) seen.add(f.questionId);
  for (const id of profile.skippedIds ?? []) seen.add(id);
  return seen;
}

// Normalize a question title for fuzzy duplicate detection. Lowercases,
// strips punctuation/diacritics, collapses whitespace. Two questions
// that differ only in punctuation or capitalization will hash to the
// same key — that's the point. The dynamic LLM occasionally invents a
// "dyn_xxxx" card whose text is identical or near-identical to one the
// user already answered (or to a starred static-pool question), and id
// dedup alone can't catch that. Text dedup catches it.
export function normalizeQuestionText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

// Set of normalized question titles the user has already answered.
// Pairs with buildSeenIds for belt-and-suspenders dedup against the
// dynamic LLM occasionally re-asking a known question with a fresh id.
export function buildSeenTexts(profile: UserProfile): Set<string> {
  const out = new Set<string>();
  for (const f of profile.facts ?? []) {
    if (typeof f.question === "string") {
      out.add(normalizeQuestionText(f.question));
    }
  }
  return out;
}

// Drop ask cards whose questions are already in the user's seen set
// (by id OR by normalized text). Non-ask cards pass through unchanged.
// The server already dedupes during static / dynamic generation, but
// this is still useful on the client:
//   1. A prefetched buffer may have been generated against a smaller
//      seen set than the user's current state (user answered while the
//      prefetch was in flight).
//   2. Defensively on the fresh-fetch path, in case the profile
//      snapshot passed to the server was stale for the same reason.
//   3. Text dedup catches dynamic-LLM rephrases of seen questions.
export function filterSeenAskCards(cards: Card[], profile: UserProfile): Card[] {
  const seenIds = buildSeenIds(profile);
  const seenTexts = buildSeenTexts(profile);
  return cards.filter((c) => {
    if (c.type !== "ask") return true;
    const q = c.content as Question;
    if (seenIds.has(q.id)) return false;
    if (seenTexts.has(normalizeQuestionText(q.title))) return false;
    return true;
  });
}

// Build a static batch of ask Cards entirely in-process. The static
// question pool is already bundled into the client (personalityQuestions
// statically imports the JSON), so this runs at memory speed — zero
// network, zero latency. Shuffle semantics match the server's
// `serveStatic` exactly, so client-rendered batches are indistinguishable
// from server-rendered ones.
//
// This is the foundation of the never-wait guarantee: we never hit the
// network for static batches, and we fall back to this for any dynamic
// batch that isn't ready in time.
export function nextStaticBatchClientSide(
  profile: UserProfile,
  batchSize: number = BATCH_SIZE
): Card[] {
  const seenIds = buildSeenIds(profile);
  const seenTexts = buildSeenTexts(profile);

  const demoCount = Math.min(DEMO_PROBES_PER_BATCH_CLIENT, batchSize);
  const demoProbes = selectProbesForBatch(
    profile,
    demoCount,
    seenIds,
    seenTexts
  );
  const mbtiCount = Math.min(
    MBTI_PROBES_PER_BATCH_CLIENT,
    batchSize - demoCount
  );
  const mbtiSeenTexts = new Set([
    ...seenTexts,
    ...demoProbes.map((q) => q.title.toLowerCase()),
  ]);
  const mbtiProbes = selectMBTIProbesForBatch(
    profile.probabilityState,
    mbtiCount,
    seenIds,
    mbtiSeenTexts
  );

  const probeQuestions = [...demoProbes, ...mbtiProbes];
  const remaining = Math.max(0, batchSize - probeQuestions.length);
  const { questions } = getNextQuestionBatch(seenIds, remaining);

  const personalityCards: Card[] = questions.map((q) => ({
    type: "ask",
    content: q,
  }));
  const probeCards: Card[] = probeQuestions.map((q) => ({
    type: "ask",
    content: q,
  }));
  return shuffleCards([...personalityCards, ...probeCards]);
}
