import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import {
  FrameworkProfile,
  PersonalityParams,
  UserProfile,
} from "@/lib/types";

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
  profile?: Partial<FrameworkProfile>;
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

// Pull a Partial<FrameworkProfile> out of the LLM response, dropping any
// piece that doesn't match the expected shape. Returns undefined if there
// isn't enough usable signal to render — UI gracefully hides the section.
function sanitizeProfile(
  raw: unknown
): FrameworkProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;

  const enn = r.enneagram as Record<string, unknown> | undefined;
  const mb = r.mbti as Record<string, unknown> | undefined;
  const disc = r.disc as Record<string, unknown> | undefined;
  const bf = r.bigFive as Record<string, unknown> | undefined;
  const att = r.attachmentStyle as Record<string, unknown> | undefined;

  if (!enn || !mb || !disc || !bf || !att) return undefined;

  const num = (v: unknown, fallback = 0): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" ? v : fallback;

  const archetypes = Array.isArray(r.careerArchetypes)
    ? (r.careerArchetypes as unknown[]).filter(
        (x): x is string => typeof x === "string"
      )
    : [];

  return {
    enneagram: {
      type: Math.round(num(enn.type, 0)),
      wing: Math.round(num(enn.wing, 0)),
      confidence: clampParam(num(enn.confidence, 0.5)),
    },
    mbti: {
      type: str(mb.type, ""),
      confidence: clampParam(num(mb.confidence, 0.5)),
    },
    disc: {
      dominant: str(disc.dominant, ""),
      secondary: str(disc.secondary, ""),
      confidence: clampParam(num(disc.confidence, 0.5)),
    },
    bigFive: {
      O: clampParam(num(bf.O, 0.5)),
      C: clampParam(num(bf.C, 0.5)),
      E: clampParam(num(bf.E, 0.5)),
      A: clampParam(num(bf.A, 0.5)),
      N: clampParam(num(bf.N, 0.5)),
    },
    attachmentStyle: {
      type: str(att.type, ""),
      confidence: clampParam(num(att.confidence, 0.5)),
    },
    ageRange: str(r.ageRange, ""),
    careerArchetypes: archetypes,
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
    // its flavor instead of only the question text. Sentiment now carries
    // the three-way Yes/Maybe/No signal for yes_no_maybe cards.
    const answeredText = userProfile.facts
      .map((f, i) => {
        const isSuper =
          typeof f.answer === "string" && /\(super\)\s*$/i.test(f.answer);
        const superTag = isSuper ? " **SUPER-LIKED**" : "";
        const idxTag =
          typeof f.answerIndex === "number"
            ? ` [picked option ${f.answerIndex + 1}]`
            : "";
        const sentiment =
          f.sentiment ?? (f.positive ? "affirmative" : "non-affirmative");
        const tag =
          sentiment === "neutral"
            ? "Maybe"
            : sentiment === "affirmative"
              ? "Yes"
              : "No";
        return `${i + 1}. Q: ${f.question}\n   A: ${tag} — "${f.answer}" (${sentiment}${idxTag})${superTag}`;
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

    // Full portrait + highlights + visualization params + framework profile
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1600,
      temperature: 0.85,
      system: [
        "You are generating a personality portrait and full psychological profile for a user you have learned about through a series of swipe-card responses.",
        "",
        "You output STRICT JSON with keys: profile, summary, portrait, highlights, params. No code fences. No preamble.",
        "",
        "You will receive:",
        "- ANSWER LOG: every question asked and how the user responded (Yes / Maybe / No), with SUPER-LIKED answers marked",
        "- DISCOVERIES: patterns already noted from prior batches",
        "",
        "SCORING NOTES:",
        "- Yes = full signal weight in the affirming direction",
        "- No = full signal weight in the opposing direction",
        "- Maybe = half-weight in both directions; treat as soft ambiguity, not absence of signal",
        "",
        "PROFILE — best-fit types across all frameworks:",
        "{",
        '  "enneagram": { "type": number (1–9), "wing": number, "confidence": float },',
        '  "mbti": { "type": string, "confidence": float },',
        '  "disc": { "dominant": string, "secondary": string, "confidence": float },',
        '  "bigFive": { "O": float, "C": float, "E": float, "A": float, "N": float },',
        '  "attachmentStyle": { "type": string, "confidence": float },',
        '  "ageRange": string,',
        '  "careerArchetypes": [string]',
        "}",
        'Confidence floats in [0,1] — let them diverge, 0.5 means genuinely uncertain. ageRange is a soft inference, express as a range ("late 20s–mid 30s"). careerArchetypes: 3–5 real role titles, not personality adjectives.',
        "",
        "PORTRAIT — 3 short paragraphs, ≤ 120 words total, third person. Follow ALL five rules:",
        "",
        "1. OBSERVATION ECHO. Reference at least TWO specific answers by paraphrase so the reader feels seen by a particular moment, not abstractly. Never mention question numbers; weave evidence into sentences.",
        '2. TENSION. Name exactly ONE internal contradiction the evidence supports. Both sides in one sentence. Shape: "Warm with the people who\'ve earned it, but guarded with new ones."',
        "3. VANISHING NEGATIVE. One small, earned criticism immediately reframed as the source of a strength. Not flattery — honest insight.",
        "4. INTERIOR. At least one statement about a private internal experience — a quiet preference, a secret fear, something they don't say out loud.",
        "5. SUPER-LIKE. If any answer is marked SUPER-LIKED, build the portrait around it. That is the single highest-weight signal.",
        "",
        "SUMMARY — 2 crisp sentences. Same rules, condensed. No filler.",
        "",
        "HIGHLIGHTS — 4–6 short strings naming notable traits or TENSIONS. Not sentences. No leading dashes. No emojis.",
        "",
        "PARAMS — six floats in [0,1]. Let values diverge — neutral values waste the visualization:",
        "  warmth (0 = cold/detached, 1 = warm/relational)",
        "  energy (0 = slow/contemplative, 1 = restless/fast)",
        "  structure (0 = organic/improvisational, 1 = structured/analytical)",
        "  density (0 = minimal/spare, 1 = rich/layered/complex)",
        "  extroversion (0 = introverted/inward, 1 = extroverted/outward)",
        "  symmetry (0 = asymmetric/experimental, 1 = symmetric/conventional)",
        "",
        "VOICE: sharp, slightly teasing, never sycophantic. Short sentences beat long ones.",
        'FORBIDDEN: "tend to", "many sides to them", "a complex person", "a part of them", any horoscope vocabulary. Never restate a question verbatim. Never fabricate.',
        "",
        "OUTPUT: JSON only, no code fences, no prose.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `ANSWER LOG — numbered answers from this person:\n\n${answeredText}${skippedBlock}\n\nRespond with JSON only: {"profile": {"enneagram": {"type": number, "wing": number, "confidence": number}, "mbti": {"type": string, "confidence": number}, "disc": {"dominant": string, "secondary": string, "confidence": number}, "bigFive": {"O": number, "C": number, "E": number, "A": number, "N": number}, "attachmentStyle": {"type": string, "confidence": number}, "ageRange": string, "careerArchetypes": string[]}, "summary": string, "portrait": string, "highlights": string[], "params": {"warmth": number, "energy": number, "structure": number, "density": number, "extroversion": number, "symmetry": number}}`,
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
      profile: sanitizeProfile(parsed.profile),
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
