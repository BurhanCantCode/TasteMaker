import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { UserProfile } from "@/lib/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body: { userProfile: UserProfile } = await request.json();
    const { userProfile } = body;

    // Need at least some data to generate a summary
    if (userProfile.facts.length < 3 && userProfile.likes.length < 2) {
      return NextResponse.json({
        summary: null,
        reason: "Not enough data yet"
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Build context from profile
    const factsText = userProfile.facts
      .map(f => `Q: ${f.question} A: ${f.answer} (${f.positive ? "positive" : "negative"})`)
      .join("\n");

    const likesText = userProfile.likes
      .map(l => `${l.item} (${l.category}): ${l.rating}`)
      .join("\n");

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      temperature: 0.7,
      system: "You are a clinical summary generator for a diagnostic assessment tool. Write a 2-3 sentence summary of the patient's reported symptoms and clinical findings. Be concise and medically informative. Don't use bullet points. Write in third person (e.g., 'The patient reports...' or 'Based on responses...'). Focus on symptom patterns and potential areas of concern.\n\nIMPORTANT: Pay close attention to the (positive) and (negative) markers. If marked (positive), the patient confirmed YES to that symptom/question. If marked (negative), they answered NO — the symptom is absent. Accurately reflect which symptoms are present and absent.\n\nThis is not a medical diagnosis. Frame findings as observations, not conclusions.",
      messages: [
        {
          role: "user",
          content: `Summarize this patient's clinical profile based on their diagnostic interview:

CLINICAL FINDINGS:
${factsText || "None yet"}

CONDITIONS REVIEWED:
${likesText || "None yet"}

Write a brief, clinically informative 2-3 sentence summary. This is not a diagnosis — frame as observations and patterns noted.`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in response");
    }

    return NextResponse.json({
      summary: textContent.text.trim(),
    });
  } catch (error) {
    console.error("Error in /api/summary:", error);
    
    return NextResponse.json(
      {
        error: "Failed to generate summary",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
