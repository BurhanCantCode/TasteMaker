/**
 * Adaptive ASK batch sizing.
 * < 20 facts  →  5 questions per batch (early exploration)
 * >= 20 facts → 10 questions per batch (user is engaged, bigger batches)
 */
export function getAskBatchSize(factsCount: number): number {
  return factsCount < 20 ? 5 : 10;
}
