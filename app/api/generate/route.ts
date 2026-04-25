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
import { buildSeenIds } from "@/lib/questionSequencer";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Static batch: pull next unseen questions from the shuffled JSON bank.
function serveStatic(
  userProfile: UserProfile,
  batchSize: number
): { cards: Card[]; hasMore: boolean } {
  const seenIds = buildSeenIds(userProfile);
  const { questions, hasMore } = getNextQuestionBatch(seenIds, batchSize);
  const cards: Card[] = questions.map((q) => ({ type: "ask", content: q }));
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
            batchSize,
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
    // already-seen question ids (LLM can occasionally echo an id it saw
    // in the prompt).
    const seenIds = buildSeenIds(userProfile);

    const validated: Question[] = [];
    for (const raw of rawCards) {
      const q = validateDynamicCard(raw);
      if (!q) continue;
      if (seenIds.has(q.id)) continue;
      validated.push(q);
    }

    if (validated.length === 0) return null;
    return validated;
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
