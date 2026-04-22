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

    // Enriched per-fact evidence. The richer the input, the more the model
    // has to echo back specifically — super-likes, option index, and
    // sentiment together let the portrait reference a single answer by
    // its flavor instead of only the question text.
    const answeredText = userProfile.facts
      .map((f, i) => {
        const isSuper =
          typeof f.answer === "string" && /\(super\)\s*$/i.test(f.answer);
        const superTag = isSuper ? " **SUPER-LIKED**" : "";
        const idxTag =
          typeof f.answerIndex === "number"
            ? ` [picked option ${f.answerIndex + 1}]`
            : "";
        const sentiment = f.positive ? "affirmative" : "non-affirmative";
        return `${i + 1}. Q: ${f.question}\n   A: ${f.answer} (${sentiment}${idxTag})${superTag}`;
      })
      .join("\n");

    const skippedCount = userProfile.skippedIds?.length ?? 0;
    const skippedBlock =
      skippedCount > 0
        ? `\n\nSKIPPED (refused to engage with ${skippedCount} question${skippedCount === 1 ? "" : "s"}) — a signal in itself.`
        : "";

    if (mode === "short") {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 240,
        temperature: 0.8,
        system: [
          "You write short, uncannily specific inferences about a real person based on their answers to a personality quiz.",
          "Third person. 2-3 sentences. No bullet points.",
          "RULES:",
          "- Reference one specific answer by paraphrase so the reader feels SEEN by a particular moment.",
          "- Name one small tension or contradiction the evidence supports.",
          "- Voice: sharp, slightly teasing, never sycophantic. Short sentences beat long.",
          "- Never write \"tend to\", \"many sides to you/them\", \"a complex person\", or any horoscope vocabulary.",
          "- Never restate a question title verbatim. Never flatter. No emojis.",
        ].join("\n"),
        messages: [
          {
            role: "user",
            content: `EVIDENCE — numbered answers from this person:\n\n${answeredText}${skippedBlock}\n\nWrite the 2-3 sentence inference now.`,
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
      temperature: 0.85,
      system: [
        "You write personality portraits that feel uncannily specific. You have numbered EVIDENCE in the user message. USE it.",
        "",
        "OUTPUT: strict JSON with keys: summary, portrait, highlights, params. No code fences. No preamble.",
        "",
        "PORTRAIT — 3 short paragraphs, ≤ 120 words total, third person. Follow ALL five rules:",
        "",
        "1. OBSERVATION ECHO. Reference at least TWO specific answers by paraphrase so the reader feels seen by a particular moment, not abstractly. Never list question numbers; weave evidence into sentences.",
        "2. TENSION. Name exactly ONE internal contradiction the evidence supports. Both sides acknowledged in one sentence. Example shape: \"Warm with the people who've earned it, but guarded with new ones.\"",
        "3. VANISHING NEGATIVE. Include one small, earned criticism and immediately reframe it as the source of a strength. Not flattery — honest insight.",
        "4. INTERIOR. At least one statement about a common-but-private internal experience — a quiet preference, a secret fear, a thing they don't say out loud. These hit hardest.",
        "5. SUPER-LIKE. If any answer is marked **SUPER-LIKED**, build the portrait around it. That is the single highest-weight signal in the evidence.",
        "",
        "SUMMARY — 2 crisp sentences. Same rules, condensed. No filler.",
        "",
        "HIGHLIGHTS — 4-6 short bullet strings naming notable traits or TENSIONS (not sentences, no leading dashes, no emojis).",
        "",
        "PARAMS — six floats in [0, 1] on these orthogonal dimensions. LET VALUES DIVERGE from 0.5 when the evidence supports it — neutral values waste the 3D visualization:",
        "  warmth (0 = cold/detached, 1 = warm/relational),",
        "  energy (0 = slow/contemplative, 1 = restless/fast),",
        "  structure (0 = organic/improvisational, 1 = structured/analytical),",
        "  density (0 = minimal/spare, 1 = rich/layered/complex),",
        "  extroversion (0 = introverted/inward, 1 = extroverted/outward),",
        "  symmetry (0 = asymmetric/experimental, 1 = symmetric/conventional).",
        "",
        "VOICE: sharp, slightly teasing, never sycophantic. Short sentences beat long ones.",
        "FORBIDDEN language (do not write these): \"tend to\", \"many sides to you\" or \"many sides to them\", \"a complex person\", \"a part of you\" or \"a part of them\", any horoscope vocabulary (\"the stars\", \"aligned\", \"cosmic\").",
        "Never restate a question title verbatim. Never fabricate facts. Mature subjects are fine; avoid sexual content.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `EVIDENCE — numbered answers from this person:\n\n${answeredText}${skippedBlock}\n\nRespond with JSON only: {\"summary\": string, \"portrait\": string, \"highlights\": string[], \"params\": {\"warmth\": number, \"energy\": number, \"structure\": number, \"density\": number, \"extroversion\": number, \"symmetry\": number}}`,
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
