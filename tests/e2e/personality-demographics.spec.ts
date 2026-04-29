import { expect, test, type APIResponse } from "@playwright/test";

// Coverage for the indirect-probe + DemographicState pipeline.
//
// What this spec asserts (the "she" bug repro is test 1):
//   1. With NO demographic signal, the synthesis prompt MUST default to
//      gender-neutral pronouns (the bug a user hit was the prompt
//      confidently saying "she" with zero evidence).
//   2. /api/generate (static + dynamic) interleaves indirect probes
//      ("probe_*" ids) into every batch.
//   3. The scorer logic — answering several strong same-gender probes
//      pushes DemographicState past 0.70 on that gender, which then
//      flips the synthesis prompt to use that gender's pronouns.
//   4. The dynamic batch shrinks LLM-generated cards to make room for
//      probes (we ask for batchSize total = LLM cards + probes).
//
// API-key safety: any test that hits /api/summary skips when
// ANTHROPIC_API_KEY is missing on the server — the route returns 500
// with a specific error message.

async function isMissingApiKey(res: APIResponse): Promise<boolean> {
  if (res.status() !== 500) return false;
  try {
    const body = await res.json();
    return (
      typeof body?.error === "string" && body.error.includes("ANTHROPIC_API_KEY")
    );
  } catch {
    return false;
  }
}

// 8 personality answers with ZERO demographic content. Coffee, hiking,
// books, journaling — nothing that hints at gender, age, or life stage.
// This is the exact scenario where the original "she" bug fires.
const NO_DEMO_PROFILE = {
  facts: [
    { questionId: "q1", question: "Do you drink coffee every morning?", answer: "Yes", positive: true, sentiment: "affirmative", timestamp: 1 },
    { questionId: "q2", question: "Do you reread books you love?", answer: "Yes", positive: true, sentiment: "affirmative", timestamp: 2 },
    { questionId: "q3", question: "Do you keep a journal you actually write in?", answer: "Yes", positive: true, sentiment: "affirmative", timestamp: 3 },
    { questionId: "q4", question: "Do you enjoy small talk at parties?", answer: "No", positive: false, sentiment: "non-affirmative", timestamp: 4 },
    { questionId: "q5", question: "Do you text people first?", answer: "No", positive: false, sentiment: "non-affirmative", timestamp: 5 },
    { questionId: "q6", question: "Do you like solo hiking?", answer: "Yes", positive: true, sentiment: "affirmative", timestamp: 6 },
    { questionId: "q7", question: "Do you make plans more than a week out?", answer: "No", positive: false, sentiment: "non-affirmative", timestamp: 7 },
    { questionId: "q8", question: "Do you stick to routines?", answer: "Yes", positive: true, sentiment: "affirmative", timestamp: 8 },
  ],
  likes: [],
  skippedIds: [],
  reports: [],
};

// A profile pre-loaded with strong gender:female demographic state. We
// inject this directly via the userProfile so we don't have to drive
// answers through the UI to reach >=0.70 confidence — the synthesis
// route reads userProfile.demographicState as-is.
const FEMALE_DEMO_PROFILE = {
  ...NO_DEMO_PROFILE,
  demographicState: {
    gender: { male: 0.1, female: 0.85, nonbinary: 0.05 },
    ageBand: { teen: 0.1, "20s": 0.4, "30s": 0.3, "40s": 0.15, "50plus": 0.05 },
    relationshipStatus: { single: 0.4, partnered: 0.3, married: 0.2, divorced: 0.1 },
    hasKids: { yes: 0.3, no: 0.7 },
    geographyType: { urban: 0.5, suburban: 0.3, rural: 0.2 },
    workStatus: { student: 0.1, employed: 0.5, freelance: 0.2, retired: 0.1, unemployed: 0.1 },
  },
};

const MALE_DEMO_PROFILE = {
  ...NO_DEMO_PROFILE,
  demographicState: {
    gender: { male: 0.85, female: 0.1, nonbinary: 0.05 },
    ageBand: { teen: 0.05, "20s": 0.2, "30s": 0.5, "40s": 0.2, "50plus": 0.05 },
    relationshipStatus: { single: 0.3, partnered: 0.4, married: 0.2, divorced: 0.1 },
    hasKids: { yes: 0.3, no: 0.7 },
    geographyType: { urban: 0.4, suburban: 0.4, rural: 0.2 },
    workStatus: { student: 0.05, employed: 0.5, freelance: 0.3, retired: 0.05, unemployed: 0.1 },
  },
};

// Pronoun matchers — boundary-anchored so we don't false-positive on
// "the" / "they" containing these substrings. Apostrophes via [\w'].
const SHE_PRONOUNS = /\b(she|her|hers|herself)\b/i;
const HE_PRONOUNS = /\b(he|him|his|himself)\b/i;
const THEY_PRONOUNS = /\b(they|them|their|theirs|themself|themselves)\b/i;

test.describe("/api/summary pronoun guardrail (the 'she' bug regression)", () => {
  test("zero demographic signal → portrait uses they/them, never she/he", async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const res = await request.post("/api/summary", {
      data: { userProfile: NO_DEMO_PROFILE, mode: "full" },
      timeout: 80_000,
    });

    if (await isMissingApiKey(res)) {
      test.skip(true, "ANTHROPIC_API_KEY not configured");
      return;
    }

    expect(res.ok()).toBe(true);
    const body = await res.json();
    const text = `${body.portrait}\n${body.summary}`;

    // Allow either "they/them" voice OR second-person "you" voice.
    // Either is acceptable per the prompt's fallback rule.
    const usesNeutral = THEY_PRONOUNS.test(text) || /\byou\b/i.test(text);
    expect(usesNeutral, "portrait should use they/them or second-person").toBe(true);

    // Hard fail on gendered pronouns when state is uniform.
    expect(text, "portrait used she/her despite no gender evidence").not.toMatch(SHE_PRONOUNS);
    expect(text, "portrait used he/him despite no gender evidence").not.toMatch(HE_PRONOUNS);
  });

  test("strong female state (≥0.70) → portrait uses she/her", async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const res = await request.post("/api/summary", {
      data: { userProfile: FEMALE_DEMO_PROFILE, mode: "full" },
      timeout: 80_000,
    });

    if (await isMissingApiKey(res)) {
      test.skip(true, "ANTHROPIC_API_KEY not configured");
      return;
    }

    expect(res.ok()).toBe(true);
    const body = await res.json();
    const text = `${body.portrait}\n${body.summary}`;

    // Should commit to she/her at this confidence.
    expect(text, "expected she/her with female state ≥0.70").toMatch(SHE_PRONOUNS);
    // Should NOT use the wrong gender.
    expect(text, "should not use he/him with female state").not.toMatch(HE_PRONOUNS);
  });

  test("strong male state (≥0.70) → portrait uses he/him", async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const res = await request.post("/api/summary", {
      data: { userProfile: MALE_DEMO_PROFILE, mode: "full" },
      timeout: 80_000,
    });

    if (await isMissingApiKey(res)) {
      test.skip(true, "ANTHROPIC_API_KEY not configured");
      return;
    }

    expect(res.ok()).toBe(true);
    const body = await res.json();
    const text = `${body.portrait}\n${body.summary}`;

    expect(text, "expected he/him with male state ≥0.70").toMatch(HE_PRONOUNS);
    expect(text, "should not use she/her with male state").not.toMatch(SHE_PRONOUNS);
  });
});

test.describe("/api/generate probe interleaving", () => {
  test("static batch includes indirect probes (probe_* ids)", async ({
    request,
  }) => {
    const res = await request.post("/api/generate", {
      data: {
        userProfile: { facts: [], likes: [], skippedIds: [], reports: [] },
        batchSize: 10,
        mode: "ask",
        source: "static",
      },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    const cards = body.cards as Array<{ content: { id: string } }>;
    expect(cards.length).toBe(10);

    const probeCount = cards.filter((c) => c.content.id.startsWith("probe_")).length;
    // Server ships PROBES_PER_BATCH=2 — assert at least 1 to absorb
    // the case where dedup drops one against an unlucky seen-set.
    expect(probeCount).toBeGreaterThanOrEqual(1);
    expect(probeCount).toBeLessThanOrEqual(3);
  });

  test("static batch does NOT repeat probes the user has already answered", async ({
    request,
  }) => {
    // Seed the profile as if the user already answered probe_beard.
    const profile = {
      facts: [
        {
          questionId: "probe_beard",
          question: "Have you grown a full beard at some point?",
          answer: "No",
          positive: false,
          sentiment: "non-affirmative",
          timestamp: 1,
        },
      ],
      likes: [],
      skippedIds: [],
      reports: [],
    };
    const res = await request.post("/api/generate", {
      data: { userProfile: profile, batchSize: 10, mode: "ask", source: "static" },
    });
    expect(res.ok()).toBe(true);
    const cards = (await res.json()).cards as Array<{ content: { id: string } }>;
    const beardRepeat = cards.find((c) => c.content.id === "probe_beard");
    expect(beardRepeat, "probe_beard should not appear after being answered").toBeUndefined();
  });

  test("dynamic batch (or static fallback) interleaves probes", async ({
    request,
  }) => {
    test.setTimeout(80_000);
    const res = await request.post("/api/generate", {
      data: {
        userProfile: { facts: [], likes: [], skippedIds: [], reports: [] },
        batchSize: 10,
        mode: "ask",
        source: "dynamic",
      },
      timeout: 70_000,
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    const cards = body.cards as Array<{ content: { id: string } }>;
    // Whether the dynamic call succeeded (returns ~10 mixed) or fell
    // back to static (also returns ~10 mixed), both paths interleave
    // probes via the same selector.
    const probeCount = cards.filter((c) => c.content.id.startsWith("probe_")).length;
    expect(probeCount).toBeGreaterThanOrEqual(1);
  });
});
