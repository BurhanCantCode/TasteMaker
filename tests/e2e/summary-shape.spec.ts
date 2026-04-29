import { expect, test, type APIResponse } from "@playwright/test";

// Structural contract tests for the personality report voice. The LLM at
// temperature 0.8 varies in wording, so we only assert properties that
// the prompt guarantees by construction: shape, bounded length, presence
// of a tension connector, and absence of the anti-patterns the prompt
// explicitly forbids ("tend to", "many sides to you", horoscope-ese).
//
// If ANTHROPIC_API_KEY is not configured on the server, /api/summary
// returns 500 with a specific error — we skip those tests rather than
// fail, so CI without a key still passes the rest of the suite.

const FIXTURE_PROFILE = {
  facts: [
    {
      questionId: "q-coffee",
      question: "Do you drink coffee every morning?",
      answer: "Yes",
      positive: true,
      timestamp: 0,
      answerIndex: 1,
    },
    {
      questionId: "q-hiking",
      question: "Do you enjoy hiking alone?",
      answer: "No",
      positive: false,
      timestamp: 0,
      answerIndex: 0,
    },
    {
      questionId: "q-night",
      question: "Would you rearrange your room at 2am if inspiration hit?",
      answer: "Yes (super)",
      positive: true,
      timestamp: 0,
      answerIndex: 1,
    },
    {
      questionId: "q-smalltalk",
      question: "Do you genuinely enjoy small talk at parties?",
      answer: "No",
      positive: false,
      timestamp: 0,
      answerIndex: 0,
    },
    {
      questionId: "q-journal",
      question: "Do you keep a journal or notes app you actually write in?",
      answer: "Yes",
      positive: true,
      timestamp: 0,
      answerIndex: 1,
    },
    {
      questionId: "q-books",
      question: "Do you reread books you love?",
      answer: "Yes",
      positive: true,
      timestamp: 0,
      answerIndex: 1,
    },
    {
      questionId: "q-text",
      question: "Do you text people first?",
      answer: "No",
      positive: false,
      timestamp: 0,
      answerIndex: 0,
    },
    {
      questionId: "q-plans",
      question: "Do you make plans more than a week out?",
      answer: "No",
      positive: false,
      timestamp: 0,
      answerIndex: 0,
    },
  ],
  likes: [],
  skippedIds: ["q-skip-a", "q-skip-b"],
  reports: [],
};

const TENSION_CONNECTOR = / but | though | yet |—|, but |, though /i;

const ANTI_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /many sides to (you|them)/i, label: "'many sides to you/them' filler" },
  { pattern: /\btend to\b/i, label: "'tend to' abstract voice" },
  { pattern: /horoscop/i, label: "horoscope vocabulary" },
  { pattern: /complex (person|individual)/i, label: "'complex person' filler" },
  { pattern: /a part of (you|them)/i, label: "'a part of you/them' vague interior" },
];

async function isMissingApiKey(res: APIResponse): Promise<boolean> {
  if (res.status() !== 500) return false;
  try {
    const body = await res.json();
    return typeof body?.error === "string" && body.error.includes("ANTHROPIC_API_KEY");
  } catch {
    return false;
  }
}

test.describe("/api/summary voice contract", () => {
  test("full portrait meets structural contracts and avoids anti-patterns", async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const res = await request.post("/api/summary", {
      data: { userProfile: FIXTURE_PROFILE, mode: "full" },
      timeout: 80_000,
    });

    if (await isMissingApiKey(res)) {
      test.skip(true, "ANTHROPIC_API_KEY not configured on server");
      return;
    }

    expect(res.ok()).toBe(true);
    const body = await res.json();

    // Shape
    expect(typeof body.summary).toBe("string");
    expect(typeof body.portrait).toBe("string");
    expect(Array.isArray(body.highlights)).toBe(true);
    expect(body.params).toBeTruthy();

    // Bounded length — prompt asks for ~120 words / 3 short paragraphs.
    // 900 chars gives headroom; 50 is a sanity floor against empty output.
    expect(body.portrait.length).toBeLessThanOrEqual(900);
    expect(body.portrait.length).toBeGreaterThan(50);

    // Tension connector — the prompt's "Tension Rule" requires one.
    expect(body.portrait).toMatch(TENSION_CONNECTOR);

    // Anti-patterns the prompt explicitly forbids.
    for (const { pattern, label } of ANTI_PATTERNS) {
      expect(body.portrait, `portrait contained ${label}`).not.toMatch(pattern);
      expect(body.summary, `summary contained ${label}`).not.toMatch(pattern);
    }
  });

  test("short summary applies the same anti-pattern rules", async ({
    request,
  }) => {
    test.setTimeout(60_000);
    const res = await request.post("/api/summary", {
      data: { userProfile: FIXTURE_PROFILE, mode: "short" },
      timeout: 45_000,
    });

    if (await isMissingApiKey(res)) {
      test.skip(true, "ANTHROPIC_API_KEY not configured on server");
      return;
    }

    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(typeof body.summary).toBe("string");
    expect(body.summary.length).toBeGreaterThan(30);
    expect(body.summary.length).toBeLessThanOrEqual(500);

    for (const { pattern, label } of ANTI_PATTERNS) {
      expect(body.summary, `short summary contained ${label}`).not.toMatch(pattern);
    }
  });

  test("returns sentinel shape for profiles with too few facts", async ({
    request,
  }) => {
    const res = await request.post("/api/summary", {
      data: {
        userProfile: { facts: [FIXTURE_PROFILE.facts[0]], likes: [], skippedIds: [], reports: [] },
        mode: "full",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.summary).toBeNull();
    expect(body.portrait).toBeNull();
  });
});
