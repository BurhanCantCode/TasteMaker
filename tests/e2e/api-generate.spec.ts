import { expect, test } from "@playwright/test";

// Request-level tests for /api/generate. These verify the CORE contract of
// the dynamic-question-batching feature:
//   - A "static" request returns shuffled JSON-bank questions.
//   - A "dynamic" request either returns LLM-generated questions OR falls
//     back to static on any failure (never a hard error, never an empty
//     batch).
//   - Omitting `source` defaults to static (backward compat).
//
// We use Playwright's `request` fixture so these run in Node, no browser.
// They hit the dev server at baseURL (localhost:3000 by default, override
// via PLAYWRIGHT_BASE_URL).

const EMPTY_PROFILE = {
  facts: [],
  likes: [],
  skippedIds: [],
  reports: [],
};

const PROFILE_WITH_FACTS = {
  facts: [
    {
      questionId: "f-coffee",
      question: "Do you drink coffee daily?",
      answer: "Yes",
      positive: true,
      timestamp: 0,
    },
    {
      questionId: "f-hiking",
      question: "Do you enjoy hiking?",
      answer: "No",
      positive: false,
      timestamp: 0,
    },
    {
      questionId: "f-cooking",
      question: "Do you like cooking?",
      answer: "Yes",
      positive: true,
      timestamp: 0,
    },
  ],
  likes: [],
  skippedIds: [],
  reports: [],
};

test.describe("/api/generate source contract", () => {
  test("source:static returns shuffled static cards with source echoed", async ({
    request,
  }) => {
    const res = await request.post("/api/generate", {
      data: {
        userProfile: EMPTY_PROFILE,
        batchSize: 10,
        mode: "ask",
        source: "static",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.source).toBe("static");
    expect(Array.isArray(body.cards)).toBe(true);
    expect(body.cards.length).toBe(10);
    // Every static card is an ask card with a UUID-shaped id from the JSON
    // bank, NOT the "dyn_*" prefix the LLM uses.
    for (const card of body.cards) {
      expect(card.type).toBe("ask");
      expect(typeof card.content.id).toBe("string");
      expect(card.content.id.startsWith("dyn_")).toBe(false);
      expect(typeof card.content.title).toBe("string");
      expect(
        ["yes_no", "yes_no_maybe", "multiple_choice"].includes(
          card.content.answerType
        )
      ).toBe(true);
    }
  });

  test("missing source defaults to static (backward compat)", async ({
    request,
  }) => {
    const res = await request.post("/api/generate", {
      data: {
        userProfile: EMPTY_PROFILE,
        batchSize: 10,
        mode: "ask",
        // source omitted on purpose
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.source).toBe("static");
    expect(body.cards.length).toBeGreaterThan(0);
  });

  test(
    "source:dynamic returns dynamic cards OR falls back to static; never errors",
    async ({ request }) => {
      // This test is tolerant: if ANTHROPIC_API_KEY is set and Claude
      // responds with valid JSON, we get source="dynamic" and ids
      // prefixed "dyn_". If not, the server falls back to static.
      // EITHER outcome is acceptable — the contract is "never break the
      // UI". We assert the cards list is non-empty and source is one of
      // the two valid values.
      const res = await request.post("/api/generate", {
        data: {
          userProfile: PROFILE_WITH_FACTS,
          batchSize: 10,
          mode: "ask",
          source: "dynamic",
        },
        timeout: 60_000, // LLM can take 3–8s cold
      });
      expect(res.ok()).toBe(true);
      const body = await res.json();
      expect(["static", "dynamic"]).toContain(body.source);
      expect(Array.isArray(body.cards)).toBe(true);
      expect(body.cards.length).toBeGreaterThan(0);
      for (const card of body.cards) {
        expect(card.type).toBe("ask");
        expect(typeof card.content.title).toBe("string");
      }
      if (body.source === "dynamic") {
        // Dynamic cards must carry the reserved id prefix so they're
        // visually distinct from the static bank — useful for debugging
        // and for the seen-id dedupe in the prefetch buffer.
        expect(
          body.cards.every((c: { content: { id: string } }) =>
            c.content.id.startsWith("dyn_")
          )
        ).toBe(true);
      }
    }
  );

  test("seen questions are excluded from the static batch", async ({
    request,
  }) => {
    // First call: grab 10 static cards with an empty profile.
    const first = await request.post("/api/generate", {
      data: {
        userProfile: EMPTY_PROFILE,
        batchSize: 10,
        mode: "ask",
        source: "static",
      },
    });
    const firstBody = await first.json();
    const firstIds: string[] = firstBody.cards.map(
      (c: { content: { id: string } }) => c.content.id
    );

    // Simulate those being answered.
    const profile = {
      facts: firstIds.map((id) => ({
        questionId: id,
        question: "q",
        answer: "Yes",
        positive: true,
        timestamp: 0,
      })),
      likes: [],
      skippedIds: [],
      reports: [],
    };

    // Second call: should NOT contain any of the first 10 ids.
    const second = await request.post("/api/generate", {
      data: {
        userProfile: profile,
        batchSize: 10,
        mode: "ask",
        source: "static",
      },
    });
    const secondBody = await second.json();
    const secondIds: string[] = secondBody.cards.map(
      (c: { content: { id: string } }) => c.content.id
    );
    const overlap = secondIds.filter((id) => firstIds.includes(id));
    expect(overlap).toEqual([]);
  });

  test("rejects modes other than 'ask'", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {
        userProfile: EMPTY_PROFILE,
        batchSize: 10,
        mode: "result",
        source: "static",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects missing required fields", async ({ request }) => {
    const res = await request.post("/api/generate", {
      data: {
        userProfile: EMPTY_PROFILE,
        // batchSize and mode missing
      },
    });
    expect(res.status()).toBe(400);
  });

  test("two fresh-profile static calls return different card sets (per-request shuffle)", async ({
    request,
  }) => {
    // Two independent calls with identical empty profiles. Per-request
    // shuffle should sample the pool independently each time, so the
    // probability both calls pick the same 10 cards in the same order
    // is effectively zero (pool size 2651). If this test starts flaking
    // legitimately, the shuffle has regressed to module-load or got a
    // seeded RNG bolted onto it.
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

    expect(idsA).not.toEqual(idsB);
  });
});
