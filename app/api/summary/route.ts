import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { PersonalityParams, UserProfile } from "@/lib/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface SummaryRequest {
  userProfile: UserProfile;
  // "short" = terse 2-3 sentence summary (for headline / milestone).
  // "full"  = full personality portrait (multi-paragraph + highlights).
  mode?: "short" | "full";
}

interface PortraitPayload {
  summary: string;
  portrait: string;
  highlights: string[];
  params?: Partial<Record<keyof PersonalityParams, number>>;
}

// Clamp any incoming number into [0, 1]; fall back to 0.5 (neutral) if
// the LLM omitted the key or returned something non-numeric.
function clampParam(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

function normalizeParams(
  raw: Partial<Record<keyof PersonalityParams, number>> | undefined
): PersonalityParams {
  const r = raw ?? {};
  return {
    warmth: clampParam(r.warmth),
    energy: clampParam(r.energy),
    structure: clampParam(r.structure),
    density: clampParam(r.density),
    extroversion: clampParam(r.extroversion),
    symmetry: clampParam(r.symmetry),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: SummaryRequest = await request.json();
    const { userProfile, mode = "short" } = body;

    if ((userProfile.facts?.length ?? 0) < 3) {
      return NextResponse.json({
        summary: null,
        portrait: null,
        highlights: [],
        reason: "Not enough data yet",
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const answeredText = userProfile.facts
      .map(
        (f, i) =>
          `${i + 1}. Q: ${f.question}\n   A: ${f.answer} (${f.positive ? "affirmative" : "non-affirmative"})`
      )
      .join("\n");

    if (mode === "short") {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 220,
        temperature: 0.7,
        system:
          "You write short, crisp inferences about a real person based on their answers to a personality quiz. Write 2-3 sentences in third person. No bullet points. Do not restate the questions. Lean into personality, temperament, taste, and quirks. Be specific, not generic. Avoid flattery.",
        messages: [
          {
            role: "user",
            content: `Tell me about a user who reports these answers to the questions below. What kind of person are they?\n\nANSWERS:\n${answeredText}`,
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
    }

    // Full portrait + highlights + visualization params
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1100,
      temperature: 0.8,
      system: [
        "You write vivid, specific personality portraits based on a user's answers to a personality quiz.",
        "Your output is STRICT JSON with keys: summary, portrait, highlights, params.",
        "- summary: 2-3 crisp sentences in third person (no bullet points).",
        "- portrait: 2-3 short paragraphs, third person, imagining this person as a real human. Speak to temperament, worldview, taste, and likely quirks. Be grounded and specific, not horoscopic.",
        "- highlights: 4-6 short bullet strings (no leading dashes, no emojis) naming notable traits or tensions.",
        "- params: an object of six floats in [0, 1] that summarize the person on these orthogonal dimensions — these drive a 3D visualization, so let the numbers meaningfully DIVERGE from 0.5 when the evidence supports it. Dimensions:",
        "    warmth (0 = cold/detached, 1 = warm/relational),",
        "    energy (0 = slow/contemplative, 1 = restless/fast),",
        "    structure (0 = organic/improvisational, 1 = structured/analytical),",
        "    density (0 = minimal/spare, 1 = rich/layered/complex),",
        "    extroversion (0 = introverted/inward, 1 = extroverted/outward),",
        "    symmetry (0 = asymmetric/experimental, 1 = symmetric/conventional).",
        "Never restate the question list. Never fabricate facts. Do not flatter. Mature subjects are fine; avoid sexual content.",
        "Return JSON only, no code fences.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Tell me about a user who reports these answers to the questions. What kind of person are they?\n\nANSWERS:\n${answeredText}\n\nRespond with JSON: {\"summary\": string, \"portrait\": string, \"highlights\": string[], \"params\": {\"warmth\": number, \"energy\": number, \"structure\": number, \"density\": number, \"extroversion\": number, \"symmetry\": number}}`,
        },
      ],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text content in response");
    }

    let jsonText = textContent.text.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    let parsed: PortraitPayload;
    try {
      parsed = JSON.parse(jsonText) as PortraitPayload;
    } catch {
      // Fallback: wrap as summary-only so UI still works. Params fall back
      // to neutral 0.5s — the 3D orb will render, just un-opinionated.
      return NextResponse.json({
        summary: textContent.text.trim().slice(0, 600),
        portrait: textContent.text.trim(),
        highlights: [],
        params: normalizeParams(undefined),
      });
    }

    return NextResponse.json({
      summary: parsed.summary ?? "",
      portrait: parsed.portrait ?? "",
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      params: normalizeParams(parsed.params),
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
