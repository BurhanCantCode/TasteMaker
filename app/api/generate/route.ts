import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { GenerateRequest, GenerateResponse } from "@/lib/types";
import { DEFAULT_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { userProfile, batchSize, mode, systemPrompt } = body;

    // Validate request
    if (!mode || !batchSize) {
      return NextResponse.json(
        { error: "Missing required fields: mode, batchSize" },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Build prompts
    const systemMessage = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const userMessage = buildUserPrompt(mode, batchSize, userProfile);

    // Call Claude API
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      temperature: 0.8,
      system: systemMessage,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    // Parse response
    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in Claude response");
    }

    // Extract JSON from response (Claude might wrap it in markdown)
    let jsonText = textContent.text.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    const parsed = JSON.parse(jsonText) as GenerateResponse;

    // Validate response has cards
    if (!parsed.cards || !Array.isArray(parsed.cards)) {
      throw new Error("Invalid response format: missing cards array");
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Error in /api/generate:", error);
    
    return NextResponse.json(
      {
        error: "Failed to generate cards",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
