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
      system: "You are a concise profile summarizer. Write a 2-3 sentence summary of the user based on their answers and preferences. Be insightful but brief. Don't use bullet points. Write in third person (e.g., 'This person...' or 'They...'). Focus on personality traits and interests you can infer.",
      messages: [
        {
          role: "user",
          content: `Summarize this user based on their profile:

FACTS ABOUT THEM:
${factsText || "None yet"}

THINGS THEY'VE RATED:
${likesText || "None yet"}

Write a brief, insightful 2-3 sentence summary.`,
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
