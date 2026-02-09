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

    const systemMessage = systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const userMessage = buildUserPrompt(mode, batchSize, userProfile);

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
    const textBlocks = message.content.filter((c) => c.type === "text");
    if (textBlocks.length === 0 || textBlocks[0].type !== "text") {
      throw new Error("No text content in Claude response");
    }
    const rawText = textBlocks.length > 1
      ? (textBlocks[textBlocks.length - 1] as { type: "text"; text: string }).text
      : (textBlocks[0] as { type: "text"; text: string }).text;
    let jsonText = rawText.trim();

    // Extract JSON from response
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else if (!jsonText.startsWith("{") && jsonText.includes('"cards"')) {
      const start = jsonText.indexOf('{"cards"');
      if (start !== -1) {
        let depth = 0;
        let end = -1;
        for (let i = start; i < jsonText.length; i++) {
          if (jsonText[i] === "{") depth++;
          if (jsonText[i] === "}") {
            depth--;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }
        if (end !== -1) jsonText = jsonText.slice(start, end);
      }
    }

    let parsed: GenerateResponse;
    try {
      parsed = JSON.parse(jsonText) as GenerateResponse;
    } catch {
      throw new Error(
        "Model did not return valid JSON. Please try again."
      );
    }

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
