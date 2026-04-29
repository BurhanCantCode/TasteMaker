# Per-Request Static Shuffle Implementation Plan

**Goal:** Each `/api/generate` call with `source: "static"` returns a fresh random sample of N unseen questions from the 2651-question pool (was: deterministic iteration of a once-shuffled list).

**Architecture:** Move the Fisher-Yates shuffle out of module-load and into `getNextQuestionBatch`. After filtering the pool by `seenIds`, shuffle the remainder in place, take the first N. Same function signature, same return shape — drop-in replacement for every existing caller.

**Tech Stack:** TypeScript, Node (Next.js API route runtime).

---

## Task 1: Move shuffle from module load to `getNextQuestionBatch`

**Files:**
- Modify: `lib/personalityQuestions.ts`

- [ ] **Step 1: Drop the module-load shuffle; keep the filter**

  Current top-of-file block (roughly lines 21–34) is:

  ```ts
  // Fisher-Yates shuffle. The source JSON is front-loaded with LGBTQ+ /
  // drag / dating-app-audience questions in the first ~30 rows, so serving
  // in insertion order makes the quiz feel aggressively themed to a user
  // it's not targeted at. Shuffling once at module load means every user on
  // this server instance sees a representative cross-section from the
  // first batch, while still seeing every question eventually (the
  // seen-id guard in getNextQuestionBatch does the dedupe).
  function shuffleInPlace<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const INCLUDED_QUESTIONS: PersonalityQuestionRaw[] = shuffleInPlace(
    dataset.questions.filter(
      (q) => !q.content_tags?.some((tag) => EXCLUDED_TAGS.has(tag))
    )
  );
  ```

  Replace with this — shuffle helper stays (it's used later), but the module-level shuffle call is gone:

  ```ts
  // Fisher-Yates shuffle of a copy. We shuffle the UNSEEN POOL per
  // getNextQuestionBatch call (not once at module load) so every batch
  // is a fresh random sample for every user — different users don't
  // march through the same sequence, and a refresh gives new questions.
  // The seen-id guard in getNextQuestionBatch still handles uniqueness
  // within a single user's session.
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
  ```

  Note the three semantic shifts:
  1. Helper renamed `shuffleInPlace` → `shuffledCopy` and now returns a fresh array rather than mutating (module-level constant must stay stable).
  2. `INCLUDED_QUESTIONS` is now `readonly` — the type change documents the intent and will fail to compile if anything later tries to mutate it.
  3. No shuffle call at module load.

- [ ] **Step 2: Shuffle the unseen pool inside `getNextQuestionBatch`**

  Current function (around lines 113–129):

  ```ts
  export function getNextQuestionBatch(
    seenIds: Iterable<string>,
    batchSize: number
  ): { questions: Question[]; hasMore: boolean; totalServed: number } {
    const seen = new Set(seenIds);
    const out: Question[] = [];

    for (const raw of INCLUDED_QUESTIONS) {
      if (seen.has(raw.id)) continue;
      out.push(toQuestion(raw));
      if (out.length >= batchSize) break;
    }

    const totalServed = seen.size;
    const hasMore = seen.size + out.length < INCLUDED_QUESTIONS.length;
    return { questions: out, hasMore, totalServed };
  }
  ```

  Replace with:

  ```ts
  export function getNextQuestionBatch(
    seenIds: Iterable<string>,
    batchSize: number
  ): { questions: Question[]; hasMore: boolean; totalServed: number } {
    const seen = new Set(seenIds);

    // Build the unseen pool, shuffle it, then take the first batchSize.
    // Shuffling the whole unseen pool (vs shuffling INCLUDED_QUESTIONS
    // then slicing) guarantees a uniform-random sample of the remaining
    // questions on every call — not a sliding window over a fixed order.
    const unseen = INCLUDED_QUESTIONS.filter((q) => !seen.has(q.id));
    const shuffled = shuffledCopy(unseen);
    const picked = shuffled.slice(0, batchSize);

    const out: Question[] = picked.map(toQuestion);

    const totalServed = seen.size;
    const hasMore = unseen.length > picked.length;
    return { questions: out, hasMore, totalServed };
  }
  ```

  `hasMore` is computed off the unseen pool now (cleaner than the prior arithmetic that mixed `seen.size` with the full `INCLUDED_QUESTIONS.length`).

- [ ] **Step 3: Type-check**

  Run: `npx tsc --noEmit`
  Expected: exit code 0. If there's a type error it's almost certainly from something outside `personalityQuestions.ts` trying to mutate `INCLUDED_QUESTIONS` — grep for it with `grep -rn "INCLUDED_QUESTIONS" lib app hooks components` and fix (nothing in the current tree does).

- [ ] **Step 4: Smoke test — two empty-profile fetches return different first cards**

  With the dev server running:

  ```bash
  for i in 1 2; do
    curl -s -X POST http://localhost:3000/api/generate \
      -H "Content-Type: application/json" \
      -d '{"userProfile":{"facts":[],"likes":[],"skippedIds":[],"reports":[]},"batchSize":10,"mode":"ask","source":"static"}' \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print('first:', d['cards'][0]['content']['id'])"
  done
  ```

  Expected: two different question ids printed. (Probability of collision is 1/2651 ≈ 0.04%; run twice more if you hit the astronomical unlucky case.)

- [ ] **Step 5: Commit**

  ```bash
  git add lib/personalityQuestions.ts
  git commit -m "feat(questions): fresh per-request shuffle of unseen pool"
  ```

---

## Task 2: Regression test — two fresh-profile calls return different first cards

**Files:**
- Modify: `tests/e2e/api-generate.spec.ts`

- [ ] **Step 1: Append a new test at the end of the describe block**

  Locate the `test.describe("/api/generate source contract", () => { ... })` block in `tests/e2e/api-generate.spec.ts`. Before the closing `});`, add:

  ```ts
  test("two fresh-profile static calls return different first cards", async ({
    request,
  }) => {
    // Two independent calls with identical empty profiles. Per-request
    // shuffle should sample the pool independently each time, so the
    // probability both calls pick the same first card is 1/2651 (~0.04%).
    // If this test flakes every few thousand runs, rewrite to compare
    // multi-card set overlap — for now a single compare is enough
    // signal that the shuffle is per-call.
    const [a, b] = await Promise.all([
      request.post("/api/generate", {
        data: {
          userProfile: EMPTY_PROFILE,
          batchSize: 10,
          mode: "ask",
          source: "static",
        },
      }),
      request.post("/api/generate", {
        data: {
          userProfile: EMPTY_PROFILE,
          batchSize: 10,
          mode: "ask",
          source: "static",
        },
      }),
    ]);

    const bodyA = await a.json();
    const bodyB = await b.json();

    const idsA: string[] = bodyA.cards.map(
      (c: { content: { id: string } }) => c.content.id
    );
    const idsB: string[] = bodyB.cards.map(
      (c: { content: { id: string } }) => c.content.id
    );

    // Strong signal: the two 10-card sets should not be identical.
    // Even with pool size 2651, the chance of both calls picking the
    // same 10 cards in the same order is effectively zero.
    expect(idsA).not.toEqual(idsB);
  });
  ```

- [ ] **Step 2: Run the new test**

  ```bash
  npx playwright test tests/e2e/api-generate.spec.ts -g "different first cards"
  ```

  Expected: PASS.

- [ ] **Step 3: Run the whole E2E suite, 3× flake check**

  ```bash
  npx playwright test --repeat-each=3
  ```

  Expected: 27/27 passed (9 tests × 3 repeats). If the new test flakes in any run, you hit the 1-in-2651 case twice consecutively — extraordinarily unlikely; re-run to rule out a real regression.

- [ ] **Step 4: Commit**

  ```bash
  git add tests/e2e/api-generate.spec.ts
  git commit -m "test(e2e): assert fresh-profile static calls sample independently"
  ```

---

## Self-review checklist

- [x] **Spec coverage:** Goal = per-call shuffle; Task 1 moves the shuffle, Task 2 verifies it.
- [x] **No placeholders:** Every code block is complete, copy-pasteable.
- [x] **Type consistency:** `shuffledCopy` defined in Task 1 step 1, used in Task 1 step 2. `EMPTY_PROFILE` referenced in Task 2 exists at the top of `api-generate.spec.ts` already.
- [x] **Existing tests:** `seen questions are excluded` still passes (it only asserts no id overlap, which is preserved).
- [x] **Commits:** Each task = one commit, conventional message.

---

## Risk notes

- **Flake ceiling:** The new test compares two 10-card arrays for inequality. Probability of identical arrays from independent uniform samples of a 2651-pool is effectively 0. If this ever flakes legitimately, something is wrong with the shuffle (e.g., seeded RNG introduced accidentally).
- **Perf:** `INCLUDED_QUESTIONS.filter(...)` + `shuffledCopy(...)` on a 2651-item array runs in a fraction of a millisecond. Unmeasurable in the overall request latency.
- **Cold-start:** No module-load shuffle = module-load is slightly faster (microseconds). Worth nothing in practice.
