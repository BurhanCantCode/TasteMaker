import { expect, test } from "@playwright/test";

// Every card served by /api/generate must be yes_no — both the static
// (JSON bank) and dynamic (LLM-generated) paths. The static pool is
// filtered at load; the dynamic prompt + validator enforce yes_no only.

const EMPTY_PROFILE = {
  facts: [],
  likes: [],
  skippedIds: [],
  reports: [],
};

// 30 facts crosses chunk 1 → 2 so a dynamic request is plausible under
// the server's source-selection logic. Question/answer text is generic;
// we only care about the served card shapes, not what the LLM echoes back.
const FAT_PROFILE = {
  facts: Array.from({ length: 30 }, (_, i) => ({
    questionId: `f-${i}`,
    question: `Seed question ${i}?`,
    answer: i % 2 === 0 ? "Yes" : "No",
    positive: i % 2 === 0,
    timestamp: i,
  })),
  likes: [],
  skippedIds: [],
  reports: [
    {
      id: "seed-report",
      createdAt: Date.now() - 10_000,
      factsCount: 20,
      summary: "Seed summary",
      portrait: "Seed portrait",
      highlights: ["a", "b"],
    },
  ],
};

function expectYesNoCard(card: {
  type: string;
  content: {
    answerType: string;
    answerLabels?: string[];
    options?: string[];
  };
}) {
  expect(card.type).toBe("ask");
  expect(card.content.answerType).toBe("yes_no");
  expect(card.content.answerLabels).toHaveLength(2);
}

test.describe("/api/generate yes/no-only contract", () => {
  test("source:static returns only yes_no cards", async ({ request }) => {
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
    expect(body.cards.length).toBe(10);
    for (const card of body.cards) expectYesNoCard(card);
  });

  test("source:static with large seen-set still returns only yes_no", async ({
    request,
  }) => {
    const res = await request.post("/api/generate", {
      data: {
        userProfile: FAT_PROFILE,
        batchSize: 10,
        mode: "ask",
        source: "static",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.cards.length).toBeGreaterThan(0);
    for (const card of body.cards) expectYesNoCard(card);
  });

  test("source:dynamic returns only yes_no cards (or static fallback)", async ({
    request,
  }) => {
    const res = await request.post("/api/generate", {
      data: {
        userProfile: FAT_PROFILE,
        batchSize: 10,
        mode: "ask",
        source: "dynamic",
      },
      timeout: 60_000,
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    // Both dynamic and static paths must hand back yes_no only.
    expect(["static", "dynamic"]).toContain(body.source);
    expect(body.cards.length).toBeGreaterThan(0);
    for (const card of body.cards) expectYesNoCard(card);
  });
});
