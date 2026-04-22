import { expect, test } from "@playwright/test";

// The card UI is now yes/no only. It must render exactly two primary
// answer buttons (no + yes) and — when the question is starred — a
// super button. No grid layouts, no "maybe" button, no MC pills.

const STARRED_YES_NO_CARD = {
  type: "ask" as const,
  content: {
    id: "stub-super-1",
    title: "Would you rearrange your room at 2am if inspiration hit?",
    answerType: "yes_no",
    answerLabels: ["No", "Yes"],
    superLikeEnabled: true,
    tags: [],
    optionTags: ["negative", "affirmative"],
  },
};

const PLAIN_YES_NO_CARD = {
  type: "ask" as const,
  content: {
    id: "stub-plain-1",
    title: "Do you drink coffee daily?",
    answerType: "yes_no",
    answerLabels: ["No", "Yes"],
    superLikeEnabled: false,
    tags: [],
    optionTags: ["negative", "affirmative"],
  },
};

function stubGenerateBatch(cards: typeof STARRED_YES_NO_CARD[]) {
  return {
    cards,
    source: "static" as const,
    hasMore: true,
    reasoning: "stub",
  };
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

test.describe("Card UI is yes/no only", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("starred yes_no card renders exactly 3 actions: no, super, yes", async ({
    page,
  }) => {
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          stubGenerateBatch(
            Array.from({ length: 10 }, (_, i) => ({
              ...STARRED_YES_NO_CARD,
              content: { ...STARRED_YES_NO_CARD.content, id: `stub-${i}` },
            }))
          )
        ),
      });
    });

    // Seed 30 facts to put the next batch in dynamic territory
    // (batchSourceFor(30)=dynamic). Post never-wait refactor, static
    // batches are served client-side and bypass /api/generate entirely,
    // so we need the dynamic path to get the stub to fire.
    await clearAndSeed(page, {
      facts: Array.from({ length: 30 }, (_, i) => ({
        questionId: `seed-${i}`,
        question: `seed ${i}?`,
        answer: i % 2 === 0 ? "Yes" : "No",
        positive: i % 2 === 0,
        timestamp: i,
      })),
      likes: [],
      skippedIds: [],
      reports: [
        {
          id: "rep1",
          createdAt: Date.now() - 10_000,
          factsCount: 20,
          summary: "Seed summary",
          portrait: "Seed portrait",
          highlights: ["a", "b"],
        },
      ],
    });

    await page.getByRole("button", { name: /^Questions$/i }).click();

    // The three action buttons we expect for a starred yes_no card.
    // aria-labels come from answerLabels ("No", "Yes") and the "Super Yes"
    // literal. Center "Maybe" or MC pills must NOT appear.
    const noBtn = page.locator('button[aria-label="No"]');
    const yesBtn = page.locator('button[aria-label="Yes"]');
    const superBtn = page.locator('button[aria-label="Super Yes"]');
    await expect(noBtn).toBeVisible();
    await expect(yesBtn).toBeVisible();
    await expect(superBtn).toBeVisible();

    // No middle "Maybe" action or MC-style pills.
    expect(await page.locator('button[aria-label="Maybe"]').count()).toBe(0);
    expect(await page.locator('[data-btn="center"]').count()).toBe(0);

    // Swipe/tap "Yes" commits an answer, which should advance the card
    // and thus keep the 2-button layout intact for the next card.
    await yesBtn.click();
    await expect(noBtn).toBeVisible();
    await expect(yesBtn).toBeVisible();
  });

  test("non-starred yes_no card renders exactly 2 actions: no, yes", async ({
    page,
  }) => {
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          stubGenerateBatch(
            Array.from({ length: 10 }, (_, i) => ({
              ...PLAIN_YES_NO_CARD,
              content: { ...PLAIN_YES_NO_CARD.content, id: `plain-${i}` },
            }))
          )
        ),
      });
    });

    await clearAndSeed(page, {
      facts: Array.from({ length: 5 }, (_, i) => ({
        questionId: `seed-${i}`,
        question: `seed ${i}?`,
        answer: "Yes",
        positive: true,
        timestamp: i,
      })),
      likes: [],
      skippedIds: [],
      reports: [],
    });

    await page.getByRole("button", { name: /^Questions$/i }).click();

    await expect(page.locator('button[aria-label="No"]')).toBeVisible();
    await expect(page.locator('button[aria-label="Yes"]')).toBeVisible();

    // No super, no maybe, no MC pills.
    expect(await page.locator('button[aria-label="Super Yes"]').count()).toBe(0);
    expect(await page.locator('button[aria-label="Maybe"]').count()).toBe(0);
  });
});
