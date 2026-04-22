import { BatchSource, Card, Question, UserProfile } from "./types";

// Batches the sequencer hands out. Two batches per CHUNK_SIZE-answer
// milestone; keep them in lockstep so a chunk is always static+dynamic.
export const BATCH_SIZE = 10;
export const CHUNK_SIZE = 20;

export interface BatchPlan {
  source: BatchSource;
  size: number;
}

// First CHUNK_SIZE answers → all static (no context exists yet).
// After that, each CHUNK_SIZE-answer window is static(first BATCH_SIZE) +
// dynamic(last BATCH_SIZE). See docs/plans/2026-04-22-dynamic-question-batching.md.
function sourceForAnsweredCount(answeredCount: number): BatchSource {
  if (answeredCount < CHUNK_SIZE) return "static";
  return answeredCount % CHUNK_SIZE >= BATCH_SIZE ? "dynamic" : "static";
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

// Drop ask cards whose questions are already in the user's seen set.
// Non-ask cards pass through unchanged. The server already dedupes
// during static / dynamic generation, but this is still useful on the
// client:
//   1. A prefetched buffer may have been generated against a smaller
//      seen set than the user's current state (user answered while the
//      prefetch was in flight).
//   2. Defensively on the fresh-fetch path, in case the profile
//      snapshot passed to the server was stale for the same reason.
export function filterSeenAskCards(cards: Card[], profile: UserProfile): Card[] {
  const seen = buildSeenIds(profile);
  return cards.filter((c) => {
    if (c.type !== "ask") return true;
    return !seen.has((c.content as Question).id);
  });
}
