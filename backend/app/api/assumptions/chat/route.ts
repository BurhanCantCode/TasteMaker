import { NextRequest, NextResponse } from "next/server";
import { chatWithAssumptionProfile } from "@/lib/assumptions/chat";
import { AssumptionsChatRequest } from "@/lib/assumptions/types";

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<AssumptionsChatRequest>;

    if (!body.userId || typeof body.userId !== "string") {
      return NextResponse.json(
        { error: "Missing required field: userId" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Missing required field: message" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const response = await chatWithAssumptionProfile({
      userId: body.userId,
      message: body.message,
      runId: typeof body.runId === "string" ? body.runId : undefined,
    });

    return NextResponse.json(response, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("Error in /api/assumptions/chat:", error);

    return NextResponse.json(
      {
        error: "Failed to process chat message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
