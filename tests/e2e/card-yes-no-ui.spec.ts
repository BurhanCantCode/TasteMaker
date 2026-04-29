import { expect, test } from "@playwright/test";

// The card UI is yes/no (binary) or yes_no_maybe (ternary). The
// "super" concept has been removed from the frontend — even when a
// question carries `superLikeEnabled: true`, the UI must not surface a
// super button OR a super badge. The Maybe button (yes_no_maybe only)
// renders the ~ glyph in the center slot. Skip lives in the page
// header, not on the card.

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

const MAYBE_CARD = {
  type: "ask" as const,
  content: {
    id: "stub-maybe-1",
    title: "Do you keep a journal you actually write in?",
    answerType: "yes_no_maybe",
    answerLabels: ["No", "Maybe", "Yes"],
    superLikeEnabled: false,
    tags: [],
    optionTags: ["negative", "neutral", "affirmative"],
  },
};

async function clearAndSeed(
  page: import("@playwright/test").Page,
  profile: object,
  pendingCards?: { mode: string; batchSize: number; currentIndex: number; cards: unknown[] }
) {
  // Belt-and-suspenders: app/page.tsx's questions-tab effect races
  // between loadPendingCards() (the seed below) and ensureBatch() (a
  // fresh static fetch). If hydrate loses the race in CI, ensureBatch
  // would pull from /api/generate and replace our seeded cards. Stub
  // the endpoint so both branches converge on the seeded shape.
  if (pendingCards?.cards) {
    const stubBody = JSON.stringify({
      cards: pendingCards.cards,
      source: "static",
      hasMore: false,
    });
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({ contentType: "application/json", body: stubBody });
    });
  }
  await page.goto("/");
  await page.evaluate(
    ({ p, pc }) => {
      localStorage.clear();
      localStorage.setItem("tastemaker_profile", JSON.stringify(p));
      if (pc) {
        localStorage.setItem("tastemaker_pending_cards", JSON.stringify(pc));
      }
      document.cookie = "tastemaker_has_data=1; path=/";
    },
    { p: profile, pc: pendingCards }
  );
  await page.reload();
}

test.describe("Card UI is yes/no only", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
  });

  test("starred yes_no card surfaces NO super UI (super concept removed from frontend)", async ({
    page,
  }) => {
    // Even when the data carries `superLikeEnabled: true`, the frontend
    // must not surface a super button or a "Super" badge. The card
    // renders exactly No + Yes.
    await clearAndSeed(
      page,
      {
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
      },
      {
        mode: "ask",
        batchSize: 10,
        currentIndex: 0,
        cards: Array.from({ length: 10 }, (_, i) => ({
          ...STARRED_YES_NO_CARD,
          content: { ...STARRED_YES_NO_CARD.content, id: `stub-${i}` },
        })),
      }
    );

    await page.getByRole("button", { name: /^Answer$/i }).click();

    const noBtn = page.locator('[data-tm-swipeable] button[aria-label="No"]').first();
    const yesBtn = page.locator('[data-tm-swipeable] button[aria-label="Yes"]').first();
    await expect(noBtn).toBeVisible();
    await expect(yesBtn).toBeVisible();

    // Super button + super badge + super data attribute must all be gone.
    expect(await page.locator('[data-tm-swipeable] button[aria-label="Super Yes"]').count()).toBe(0);
    expect(await page.locator('[data-btn="super"]').count()).toBe(0);
    expect(await page.getByText(/^Super$/).count()).toBe(0);

    // Tapping Yes still advances; the 2-button layout persists.
    await yesBtn.click();
    await expect(noBtn).toBeVisible();
    await expect(yesBtn).toBeVisible();
    expect(await page.locator('[data-tm-swipeable] button[aria-label="Super Yes"]').count()).toBe(0);
  });

  test("non-starred yes_no card renders exactly 2 actions: no, yes", async ({
    page,
  }) => {
    await clearAndSeed(
      page,
      {
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
      },
      {
        mode: "ask",
        batchSize: 10,
        currentIndex: 0,
        cards: Array.from({ length: 10 }, (_, i) => ({
          ...PLAIN_YES_NO_CARD,
          content: { ...PLAIN_YES_NO_CARD.content, id: `plain-${i}` },
        })),
      }
    );

    await page.getByRole("button", { name: /^Answer$/i }).click();

    await expect(page.locator('[data-tm-swipeable] button[aria-label="No"]').first()).toBeVisible();
    await expect(page.locator('[data-tm-swipeable] button[aria-label="Yes"]').first()).toBeVisible();

    // No super, no maybe, no MC pills.
    expect(await page.locator('[data-tm-swipeable] button[aria-label="Super Yes"]').count()).toBe(0);
    expect(await page.locator('[data-tm-swipeable] button[aria-label="Maybe"]').count()).toBe(0);
  });

  test("yes_no_maybe card renders no/maybe/yes with the ~ glyph in the center button", async ({
    page,
  }) => {
    await clearAndSeed(
      page,
      {
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
      },
      {
        mode: "ask",
        batchSize: 10,
        currentIndex: 0,
        cards: Array.from({ length: 10 }, (_, i) => ({
          ...MAYBE_CARD,
          content: { ...MAYBE_CARD.content, id: `maybe-${i}` },
        })),
      }
    );

    await page.getByRole("button", { name: /^Answer$/i }).click();

    // Wait for the seeded title before asserting buttons — guards against
    // a fresh-batch fetch that would otherwise replace our stub.
    await expect(page.getByText(MAYBE_CARD.content.title).first()).toBeVisible({
      timeout: 15_000,
    });

    const noBtn = page.locator('[data-tm-swipeable] button[aria-label="No"]').first();
    const maybeBtn = page.locator('[data-tm-swipeable] button[aria-label="Maybe"]').first();
    const yesBtn = page.locator('[data-tm-swipeable] button[aria-label="Yes"]').first();
    await expect(noBtn).toBeVisible();
    await expect(maybeBtn).toBeVisible();
    await expect(yesBtn).toBeVisible();

    // The center button must contain a literal ~ glyph (not a horizontal
    // line SVG). Anchor on the data-btn attribute so we don't depend on
    // text inside neighbour buttons.
    const centerText = await page
      .locator('[data-tm-swipeable] [data-btn="center"]')
      .first()
      .innerText();
    expect(centerText.trim()).toBe("~");

    // Super UI is still absent on the ternary variant.
    expect(await page.locator('[data-tm-swipeable] button[aria-label="Super Yes"]').count()).toBe(0);
    expect(await page.locator('[data-btn="super"]').count()).toBe(0);

    // Tapping Maybe commits an answer and advances; the 3-button layout
    // persists for the next card.
    await maybeBtn.click();
    await expect(maybeBtn).toBeVisible();
    await expect(noBtn).toBeVisible();
    await expect(yesBtn).toBeVisible();
  });

  test("action buttons live INSIDE the card (not in a separate row beneath it)", async ({
    page,
  }) => {
    // After the card-redesign, Yes/No/Maybe buttons render on the card
    // itself. The swipeable card root carries data-tm-swipeable; the
    // action buttons must be its descendants. If a future refactor
    // accidentally lifts them back out, this catches it.
    await clearAndSeed(
      page,
      {
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
      },
      {
        mode: "ask",
        batchSize: 10,
        currentIndex: 0,
        cards: Array.from({ length: 10 }, (_, i) => ({
          ...PLAIN_YES_NO_CARD,
          content: { ...PLAIN_YES_NO_CARD.content, id: `nest-${i}` },
        })),
      }
    );
    await page.getByRole("button", { name: /^Answer$/i }).click();
    await expect(page.locator('[data-tm-swipeable] button[aria-label="Yes"]').first()).toBeVisible();

    const inside = await page
      .locator('[data-tm-swipeable] button[aria-label="Yes"]')
      .count();
    expect(inside).toBeGreaterThan(0);
  });

  test("horizontal wheel scroll swipes the card right (commits 'Yes')", async ({
    page,
  }) => {
    // Track which answer index the queue commits when a card is
    // dismissed by horizontal wheel scroll. We watch the profile's
    // facts in localStorage — the right-swipe commit calls onAnswer
    // with the affirmative label, which writes a fact with positive=true.
    await clearAndSeed(
      page,
      {
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
      },
      {
        mode: "ask",
        batchSize: 10,
        currentIndex: 0,
        cards: Array.from({ length: 10 }, (_, i) => ({
          ...PLAIN_YES_NO_CARD,
          content: {
            ...PLAIN_YES_NO_CARD.content,
            id: `wheel-${i}`,
            title: `Wheel stub ${i}?`,
          },
        })),
      }
    );

    await page.getByRole("button", { name: /^Answer$/i }).click();
    // Active card lives inside [data-tm-swipeable]; peek does not. We
    // need to assert on the *active* card title because peek always
    // shows the NEXT card's title and would falsely satisfy a global
    // getByText("Wheel stub 1?") even before any commit fires.
    const activeCard = page.locator('[data-tm-swipeable]');
    await expect(activeCard.getByText("Wheel stub 0?")).toBeVisible({ timeout: 15_000 });

    const box = await activeCard.boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy);

    // Sustained rightward wheel deltas. Wheel commit waits for input
    // idle (≈280ms after the last event), so we burst a clear chain
    // past the wheel threshold and let the timer fire on its own.
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(60, 0);
      await page.waitForTimeout(20);
    }

    // After idle, the dismiss tween runs (~250ms) and the active card
    // advances. Assert on the active card swapping to "Wheel stub 1?".
    await expect(activeCard.getByText("Wheel stub 1?")).toBeVisible({
      timeout: 5_000,
    });

    // Verify the commit was a "Yes" (positive=true on a new fact).
    const facts = await page.evaluate(() => {
      const raw = localStorage.getItem("tastemaker_profile");
      const p = raw ? JSON.parse(raw) : { facts: [] };
      return p.facts as Array<{ questionId: string; positive: boolean }>;
    });
    const wheelFact = facts.find((f) => f.questionId === "wheel-0");
    expect(wheelFact?.positive).toBe(true);
  });

  test("vertical wheel scroll nudges but does NOT commit (capped at ~10% of card height)", async ({
    page,
  }) => {
    await clearAndSeed(
      page,
      {
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
      },
      {
        mode: "ask",
        batchSize: 10,
        currentIndex: 0,
        cards: Array.from({ length: 10 }, (_, i) => ({
          ...PLAIN_YES_NO_CARD,
          content: {
            ...PLAIN_YES_NO_CARD.content,
            id: `vnudge-${i}`,
            title: `Nudge stub ${i}?`,
          },
        })),
      }
    );

    await page.getByRole("button", { name: /^Answer$/i }).click();
    const activeCard = page.locator('[data-tm-swipeable]');
    await expect(activeCard.getByText("Nudge stub 0?")).toBeVisible({ timeout: 15_000 });

    const box = await activeCard.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    // Heavy sustained vertical scroll. The card should nudge but never
    // dismiss — same card title remains active afterward.
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(400); // let the idle-decay snap-back run

    // No commit happened: card 0 still active, no fact recorded.
    await expect(activeCard.getByText("Nudge stub 0?")).toBeVisible();
    const facts = await page.evaluate(() => {
      const raw = localStorage.getItem("tastemaker_profile");
      const p = raw ? JSON.parse(raw) : { facts: [] };
      return p.facts as Array<{ questionId: string }>;
    });
    expect(facts.find((f) => f.questionId === "vnudge-0")).toBeUndefined();
  });

  test("Skip lives in the page header next to Undo, not on the card", async ({
    page,
  }) => {
    await clearAndSeed(
      page,
      {
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
      },
      {
        mode: "ask",
        batchSize: 10,
        currentIndex: 0,
        cards: Array.from({ length: 10 }, (_, i) => ({
          ...PLAIN_YES_NO_CARD,
          content: {
            ...PLAIN_YES_NO_CARD.content,
            id: `skip-${i}`,
            title: `Skip stub ${i}?`,
          },
        })),
      }
    );

    await page.getByRole("button", { name: /^Answer$/i }).click();
    await expect(page.getByText("Skip stub 0?").first()).toBeVisible({ timeout: 15_000 });

    // Header Skip button must exist.
    const headerSkip = page.locator('button[aria-label="Skip question"]');
    await expect(headerSkip).toBeVisible();

    // Skip must NOT live on the card (no in-card skip element).
    expect(
      await page.locator('[data-tm-swipeable] button[aria-label="Skip question"]').count()
    ).toBe(0);

    // Tapping header Skip advances to the next card.
    await headerSkip.click();
    await expect(page.getByText("Skip stub 1?").first()).toBeVisible({ timeout: 5_000 });
  });
});
