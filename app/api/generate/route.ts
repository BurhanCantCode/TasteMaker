import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import {
  Card,
  GenerateRequest,
  GenerateResponse,
  Question,
  UserProfile,
} from "@/lib/types";
import {
  getNextQuestionBatch,
  TOTAL_QUESTIONS,
} from "@/lib/personalityQuestions";
import {
  DYNAMIC_BATCH_SYSTEM_PROMPT,
  buildDynamicBatchUserPrompt,
  validateDynamicCard,
} from "@/lib/personalityPrompts";
import {
  buildSeenIds,
  buildSeenTexts,
  normalizeQuestionText,
} from "@/lib/questionSequencer";
import {
  selectProbesForBatch,
  shuffleCards,
} from "@/lib/indirectProbes";
import { selectMBTIProbesForBatch } from "@/lib/personalityProbes";

// Per-batch probe budget. 2 demographic + 1 MBTI = 3 of 10 cards
// (~30%). The 2:1 demographic:MBTI ratio mirrors the inventory split
// (~30 demo probes vs 16 MBTI probes). The Katherine eval at 1+1
// starved gender coverage — one demo slot per batch round-robin'd
// across 6 dims, so gender frequently took 3+ batches to land. Two
// demo slots plus a gender-first priority in the selector get
// pronouns locked by batch 2 in most cases.
const DEMO_PROBES_PER_BATCH = 2;
const MBTI_PROBES_PER_BATCH = 1;
const PROBES_PER_BATCH = DEMO_PROBES_PER_BATCH + MBTI_PROBES_PER_BATCH;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Static batch: reserve demographic + MBTI probe slots, pull the rest
// from the shuffled JSON bank, shuffle the merged list. Per-axis
// round-robin lives inside the selectors themselves, so the call sites
// just ask for N probes each.
function serveStatic(
  userProfile: UserProfile,
  batchSize: number
): { cards: Card[]; hasMore: boolean } {
  const seenIds = buildSeenIds(userProfile);
  const seenTexts = buildSeenTexts(userProfile);

  const demoCount = Math.min(DEMO_PROBES_PER_BATCH, batchSize);
  const demoProbes = selectProbesForBatch(
    userProfile,
    demoCount,
    seenIds,
    seenTexts
  );
  const demoTexts = new Set(
    demoProbes.map((q) =>
      // Each probe is a distinct card; merging into seenTexts prevents
      // an MBTI probe from accidentally collision-matching a demo one.
      q.title.toLowerCase()
    )
  );

  const mbtiCount = Math.min(MBTI_PROBES_PER_BATCH, batchSize - demoCount);
  const mbtiProbes = selectMBTIProbesForBatch(
    userProfile.probabilityState,
    mbtiCount,
    seenIds,
    new Set([...seenTexts, ...demoTexts])
  );

  const probeCount = demoProbes.length + mbtiProbes.length;
  const remaining = Math.max(0, batchSize - probeCount);
  const { questions, hasMore } = getNextQuestionBatch(seenIds, remaining);

  const personalityCards: Card[] = questions.map((q) => ({
    type: "ask",
    content: q,
  }));
  const probeCards: Card[] = [...demoProbes, ...mbtiProbes].map((q) => ({
    type: "ask",
    content: q,
  }));
  const cards = shuffleCards([...personalityCards, ...probeCards]);
  return { cards, hasMore };
}

// Dynamic batch: ask Claude for N personality questions tailored to the
// user's history. Returns parsed/validated Question[] or null on any
// failure so callers can fall back to static.
async function serveDynamic(
  userProfile: UserProfile,
  batchSize: number,
  batchNumber: number
): Promise<Question[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  // Reserve PROBES_PER_BATCH slots for indirect probes; ask the LLM for
  // the rest. The LLM never sees the probes — they live entirely in our
  // curated library and get appended after generation.
  const llmCount = Math.max(1, batchSize - PROBES_PER_BATCH);

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2200,
      temperature: 0.85,
      system: DYNAMIC_BATCH_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildDynamicBatchUserPrompt(
            userProfile,
            llmCount,
            batchNumber
          ),
        },
      ],
    });

    const textBlock = message.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    let jsonText = textBlock.text.trim();
    const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) jsonText = fence[1].trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.warn(
        "[generate] dynamic batch returned non-JSON",
        jsonText.slice(0, 200)
      );
      return null;
    }

    const rawCards = (parsed as { cards?: unknown }).cards;
    if (!Array.isArray(rawCards)) return null;

    // Validate each card, drop bad ones, and dedupe against the user's
    // already-seen questions. Two layers:
    //   1. id match — catches the rare case where the LLM echoes an id
    //      it saw in the prompt.
    //   2. normalized-text match — catches the much more common case of
    //      the LLM inventing a fresh dyn_xxxx id but asking a question
    //      that's textually identical (or punctuation-different) to one
    //      already in the user's history. Without this, "starred" pool
    //      questions like "Do you enjoy visiting libraries?" can come
    //      back via the dynamic batch the moment the LLM rephrases.
    const seenIds = buildSeenIds(userProfile);
    const seenTexts = buildSeenTexts(userProfile);

    const validated: Question[] = [];
    const dynamicTexts = new Set<string>(); // dedupe within the same batch too
    for (const raw of rawCards) {
      const q = validateDynamicCard(raw);
      if (!q) continue;
      if (seenIds.has(q.id)) continue;
      const norm = normalizeQuestionText(q.title);
      if (seenTexts.has(norm)) continue;
      if (dynamicTexts.has(norm)) continue;
      dynamicTexts.add(norm);
      validated.push(q);
    }

    if (validated.length === 0) return null;

    // Append DEMO + MBTI probes; dedupe each against already-seen ids
    // and texts AND against the in-batch LLM cards. Then shuffle so
    // probes don't always sit at the end of every batch.
    const inBatchTexts = new Set<string>(dynamicTexts);
    const demoProbes = selectProbesForBatch(
      userProfile,
      DEMO_PROBES_PER_BATCH,
      seenIds,
      new Set([...seenTexts, ...inBatchTexts])
    );
    const mbtiSeenTexts = new Set([
      ...seenTexts,
      ...inBatchTexts,
      ...demoProbes.map((q) => q.title.toLowerCase()),
    ]);
    const mbtiProbes = selectMBTIProbesForBatch(
      userProfile.probabilityState,
      MBTI_PROBES_PER_BATCH,
      seenIds,
      mbtiSeenTexts
    );

    return shuffleCards([...validated, ...demoProbes, ...mbtiProbes]);
  } catch (e) {
    console.warn("[generate] dynamic generation failed:", e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { userProfile, batchSize, mode, source = "static" } = body;

    if (!mode || !batchSize) {
      return NextResponse.json(
        { error: "Missing required fields: mode, batchSize" },
        { status: 400 }
      );
    }

    if (mode !== "ask") {
      return NextResponse.json(
        {
          error: `Only mode='ask' is supported in personality mode (got '${mode}')`,
        },
        { status: 400 }
      );
    }

    if (source === "dynamic") {
      // Round number = how many full batches the user has cleared so far +1.
      // Used by the system prompt to gate progressive intimacy / batch-1
      // breadth vs. batch-2+ tightening.
      const answered = userProfile.facts?.length ?? 0;
      const batchNumber = Math.floor(answered / batchSize) + 1;
      const dynamic = await serveDynamic(userProfile, batchSize, batchNumber);
      if (dynamic && dynamic.length > 0) {
        const cards: Card[] = dynamic.map((q) => ({
          type: "ask",
          content: q,
        }));
        const response: GenerateResponse = {
          cards,
          reasoning: `Served ${cards.length} dynamic LLM-generated questions.`,
          hasMore: true, // dynamic is effectively unbounded
          source: "dynamic",
        };
        return NextResponse.json(response);
      }
      // Fallback — dynamic generation failed; serve static so UI doesn't stall.
      console.warn("[generate] dynamic failed; falling back to static");
    }

    // Static path (also used for dynamic fallback).
    const { cards, hasMore } = serveStatic(userProfile, batchSize);
    const answeredCount =
      (userProfile.facts?.length ?? 0) +
      (userProfile.skippedIds?.length ?? 0);
    const response: GenerateResponse = {
      cards,
      reasoning: `Served ${cards.length} static personality questions (seen=${answeredCount}/${TOTAL_QUESTIONS}).`,
      hasMore,
      source: "static",
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error in /api/generate:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch personality questions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
