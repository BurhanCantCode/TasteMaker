import { NextRequest, NextResponse } from "next/server";
import { applyFeedbackAndUpdateLearning } from "@/lib/assumptions/db";
import {
  AssumptionFeedbackEntry,
  AssumptionsFeedbackRequest,
} from "@/lib/assumptions/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function normalizeFeedbackEntries(rawFeedback: unknown): AssumptionFeedbackEntry[] {
  if (!Array.isArray(rawFeedback)) {
    return [];
  }

  const feedback: AssumptionFeedbackEntry[] = [];

  for (const rawEntry of rawFeedback) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }

    const assumptionId =
      "assumptionId" in rawEntry && typeof rawEntry.assumptionId === "string"
        ? rawEntry.assumptionId.trim()
        : "";

    const vote =
      "vote" in rawEntry && typeof rawEntry.vote === "string"
        ? rawEntry.vote
        : "";

    if (!assumptionId || (vote !== "agree" && vote !== "disagree")) {
      continue;
    }

    feedback.push({
      assumptionId,
      vote,
    });
  }

  return feedback;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AssumptionsFeedbackRequest>;

    if (!body.userId || typeof body.userId !== "string") {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!body.runId || typeof body.runId !== "string") {
      return NextResponse.json(
        { error: "Missing required field: runId" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const feedback = normalizeFeedbackEntries(body.feedback);
    if (feedback.length === 0) {
      return NextResponse.json(
        { error: "No valid feedback entries provided" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const learningSummary = await applyFeedbackAndUpdateLearning({
      userId: body.userId,
      runId: body.runId,
      feedback,
    });

    return NextResponse.json(
      {
        ok: true,
        appliedCount: feedback.length,
        learningSummary,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("Error in /api/assumptions/feedback:", error);

    return NextResponse.json(
      {
        error: "Failed to process feedback",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
