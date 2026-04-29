import { expect, test } from "@playwright/test";

// Browser-level test that verifies the CLIENT actually sends the
// correct `source` in /api/generate request bodies as answeredCount
// progresses. This catches regressions in the batchSourceFor plumbing
// in app/page.tsx — if someone accidentally hard-codes source:"static"
// or forgets to pass it to a call site, this test fails.
//
// CHUNK_SIZE = 30 (first report fires at 30 facts). The card-source
// pattern is:
//   batches 1-2 (0-19)   static  — broad signal, no LLM context yet
//   batch 3   (20-29)    dynamic — first personalized batch, anchors report
//   batch 4   (30-39)    static
//   batch 5   (40-49)    dynamic
//   batch 6   (50-59)    static  ← test target: mid-static-batch user
//   batch 7   (60-69)    dynamic ← prefetch target from a 35-fact seed

const EMPTY_PROFILE = {
  facts: [],
  likes: [],
  skippedIds: [],
  reports: [],
};

function fakeFacts(n: number, idPrefix = "fake") {
  return Array.from({ length: n }, (_, i) => ({
    questionId: `${idPrefix}-${i}`,
    question: `Fake question ${i}?`,
    answer: "Yes",
    positive: true,
    timestamp: Date.now() - (n - i) * 1000,
  }));
}

async function clearAndSeed(
  page: import("@playwright/test").Page,
  profile: object
) {
  await page.goto("/");
  await page.evaluate((p) => {
    localStorage.clear();
    localStorage.setItem("tastemaker_profile", JSON.stringify(p));
    document.cookie = "tastemaker_has_data=1; path=/";
  }, profile);
  await page.reload();
}

test.describe("question flow sends correct batch source", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("brand-new user's first batch is served client-side — no /api/generate call", async ({
    page,
  }) => {
    // Post never-wait refactor: static batches run entirely in the
    // browser (the question JSON is bundled). A brand-new user's first
    // batch is always static (facts.length=0), so /api/generate must NOT
    // be called at all. The onboarding useEffect fires a prefetch while
    // the welcome screen is up; after Phase A that runs client-side and
    // populates pending_cards in localStorage.
    const generateCalls: Array<{ source?: string; mode?: string }> = [];
    await page.route("**/api/generate", async (route) => {
      const body = route.request().postDataJSON();
      generateCalls.push({ source: body?.source, mode: body?.mode });
      await route.continue();
    });

    await clearAndSeed(page, EMPTY_PROFILE);

    // Wait for the client-side static path to populate localStorage.
    await expect
      .poll(
        () => page.evaluate(() => localStorage.getItem("tastemaker_pending_cards")),
        {
          timeout: 15_000,
          message: "expected pending_cards to be populated by the client-side static path",
        }
      )
      .toBeTruthy();

    // Small breath for any straggler request, then assert zero /api/generate.
    await page.waitForTimeout(250);
    expect(generateCalls, "static first batch should not hit /api/generate").toEqual([]);
  });

  test("mid-static-batch prefetch fires source:dynamic", async ({
    page,
  }) => {
    // Seed a user mid-static-batch (facts=35): they're inside batch 4
    // (cards 30-39, static). The Phase B prefetch useEffect fires on
    // batch mount and targets the NEXT batch (facts.length + BATCH_SIZE
    // = 45), which lands inside batch 5 (cards 40-49) → dynamic per
    // batchSourceFor. That prefetch is the only path today that sends
    // source=dynamic to /api/generate — the foreground ensureBatch
    // serves static client-side without touching the network.
    const profile = {
      facts: fakeFacts(35),
      likes: [],
      skippedIds: [],
      reports: [
        {
          id: "rep1",
          createdAt: Date.now() - 10_000,
          factsCount: 30,
          summary: "Seed summary for test",
          portrait: "Seed portrait",
          highlights: ["a", "b"],
        },
      ],
    };

    const generateBodies: Array<{ source?: string; facts?: number }> = [];
    await page.route("**/api/generate", async (route) => {
      const body = route.request().postDataJSON();
      generateBodies.push({
        source: body?.source,
        facts: body?.userProfile?.facts?.length,
      });
      // Stub so we don't depend on LLM availability in tests.
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          cards: Array.from({ length: 10 }, (_, i) => ({
            type: "ask",
            content: {
              id: `stub-${generateBodies.length}-${i}`,
              title: `Stub question ${i}`,
              answerType: "yes_no",
              answerLabels: ["No", "Yes"],
            },
          })),
          source: body?.source ?? "static",
          hasMore: true,
        }),
      });
    });

    await clearAndSeed(page, profile);
    generateBodies.length = 0;

    await page.getByRole("button", { name: /^Answer$/i }).click();

    // Wait for the background prefetch (source=dynamic) to fire. The
    // user's foreground batch is served client-side from the static
    // pool (no wait), so the only /api/generate POST is the dynamic
    // prefetch for the batch after next.
    await expect
      .poll(() => generateBodies.find((b) => b.source === "dynamic"), {
        timeout: 15_000,
        message:
          "expected a background /api/generate call with source=dynamic after entering Questions on a 35-fact profile",
      })
      .toBeTruthy();

    const dyn = generateBodies.find((b) => b.source === "dynamic");
    expect(dyn?.facts).toBe(35);
  });
});
