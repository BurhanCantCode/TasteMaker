import { expect, test } from "@playwright/test";

// Browser-level test that verifies the CLIENT actually sends the
// correct `source` in /api/generate request bodies as answeredCount
// progresses. This catches regressions in the batchSourceFor plumbing
// in app/page.tsx — if someone accidentally hard-codes source:"static"
// or forgets to pass it to a call site, this test fails.
//
// Strategy:
//   1. Intercept /api/generate via page.route().
//   2. Start on an empty profile.
//   3. Navigate to Questions tab.
//   4. Assert the first /api/generate call has source:"static".
//   5. Seed localStorage with 25 facts + 1 report (mid-chunk-2 state).
//   6. Reload + navigate to Questions tab.
//   7. Assert the next /api/generate call has source:"static" (first
//      batch of chunk 2 — at 25 facts, batchSourceFor = "static").
//   8. The mid-batch prefetch (fires once currentIndex passes halfBatch)
//      should fire with source:"dynamic" — we verify this when the
//      user answers past card 5.

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

  test("user with 30 facts entering Questions tab requests source:dynamic", async ({
    page,
  }) => {
    // Seed a user who has completed chunk 1 (20 facts) AND the first
    // batch of chunk 2 (10 more facts), so answeredCount=30. The NEXT
    // batch the app pulls — the second batch of chunk 2 — should be
    // dynamic per batchSourceFor(30).
    const profile = {
      facts: fakeFacts(30),
      likes: [],
      skippedIds: [],
      reports: [
        {
          id: "rep1",
          createdAt: Date.now() - 10_000,
          factsCount: 20,
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
      // Stub response so we don't depend on LLM availability in tests.
      // Echo back the requested source so the UI's freshness check
      // treats the buffer as valid.
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

    // Clear any captures that landed during the pre-seed load (the initial
    // goto("/") runs against an empty profile before the reload seeds
    // localStorage — those calls are noise for this assertion).
    generateBodies.length = 0;

    // The seeded profile has 30 facts — not a new user — so onboarding is
    // skipped and the app lands on the Me tab. Navigate to Questions to
    // trigger the fetch under test.
    await page.getByRole("button", { name: /^Questions$/i }).click();

    // Poll until we see a call carrying the seeded 30 facts. This is
    // tighter than waiting on generateBodies.length > 0 — any straggling
    // stale-profile calls can't satisfy this.
    await expect
      .poll(() => generateBodies.find((b) => b.facts === 30), {
        timeout: 15_000,
        message:
          "expected /api/generate call with 30-fact profile after clicking Questions tab",
      })
      .toBeTruthy();

    const callWithThirty = generateBodies.find((b) => b.facts === 30);
    expect(callWithThirty?.source).toBe("dynamic");
  });
});
