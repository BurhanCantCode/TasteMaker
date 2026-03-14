import { NextRequest, NextResponse } from "next/server";
import { generateWildMagicAssumptions } from "@/lib/assumptions/service";
import { AssumptionsGenerateRequest, HistoryEvent } from "@/lib/assumptions/types";

const MAX_HISTORY_EVENTS = 20_000;
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

function normalizeHistory(history: unknown): HistoryEvent[] {
  if (!Array.isArray(history)) {
    return [];
  }

  const normalized: HistoryEvent[] = [];

  for (const rawEvent of history) {
    if (!rawEvent || typeof rawEvent !== "object") {
      continue;
    }

    const url =
      "url" in rawEvent && typeof rawEvent.url === "string"
        ? rawEvent.url.trim()
        : "";

    if (!url) {
      continue;
    }

    const title =
      "title" in rawEvent && typeof rawEvent.title === "string"
        ? rawEvent.title
        : "";

    const lastVisitTime =
      "lastVisitTime" in rawEvent && Number.isFinite(rawEvent.lastVisitTime)
        ? Number(rawEvent.lastVisitTime)
        : Date.now();

    const visitCount =
      "visitCount" in rawEvent && Number.isFinite(rawEvent.visitCount)
        ? Number(rawEvent.visitCount)
        : 1;

    normalized.push({
      url,
      title,
      lastVisitTime,
      visitCount,
    });

    if (normalized.length >= MAX_HISTORY_EVENTS) {
      break;
    }
  }

  return normalized;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AssumptionsGenerateRequest>;

    if (!body.userId || typeof body.userId !== "string") {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const history = normalizeHistory(body.history);

    if (history.length === 0) {
      return NextResponse.json(
        { error: "No valid history entries provided" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const response = await generateWildMagicAssumptions({
      userId: body.userId,
      windowDays:
        typeof body.windowDays === "number" && body.windowDays > 0
          ? Math.floor(body.windowDays)
          : 90,
      history,
      clientContext:
        body.clientContext && typeof body.clientContext === "object"
          ? body.clientContext
          : undefined,
    });

    return NextResponse.json(response, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Error in /api/assumptions/generate:", error);

    return NextResponse.json(
      {
        error: "Failed to generate assumptions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
