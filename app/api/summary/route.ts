import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import {
  FrameworkProfile,
  PersonalityParams,
  UserProfile,
} from "@/lib/types";
import {
  emptyDemographicState,
  summarizeForPrompt as summarizeDemographicState,
} from "@/lib/demographicState";
import {
  emptyState as emptyProbabilityState,
  summarizeForPrompt as summarizeProbabilityState,
} from "@/lib/probabilityState";

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
  predictions?: unknown;
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
        "You output STRICT JSON with keys: profile, predictions, summary, portrait, highlights, params. No code fences. No preamble.",
        "",
        "You will receive:",
        "- DEMOGRAPHIC STATE: probability vectors over gender / ageBand / relationshipStatus / hasKids / geographyType / workStatus, triangulated from indirect probes the user already answered",
        "- ANSWER LOG: every question asked and how the user responded (Yes / Maybe / No), with SUPER-LIKED answers marked",
        "- DISCOVERIES: patterns already noted from prior batches",
        "",
        "DEMOGRAPHIC ANCHORING — READ THIS BEFORE WRITING ONE WORD:",
        "",
        "PRONOUN COMMITMENT (HIGHEST PRIORITY — pronoun mistakes are the #1 visible failure mode of this engine):",
        "1. Locate the gender vector in DEMOGRAPHIC STATE.",
        "2. Find the largest of the three values: male / female / nonbinary.",
        "3. If that largest value is ≥ 0.70, use the matching binary pronouns (he/him or she/her). The largest must be male or female to use binary pronouns; if it's nonbinary at any level, use they/them.",
        "4. If the largest value is below 0.70, you MUST use they/them throughout — no exceptions, no hedging, no 'mostly she.' Do not let the answer log talk you out of this rule. The state is the authority; the answers are evidence the state has already absorbed.",
        "5. If gender values are split close to even (e.g. male 0.45 / female 0.50), DEFINITELY use they/them. A 5-point lead is not commitment-grade.",
        "6. NEVER infer gender from cooking, caretaking, emotion words, aesthetic preferences, hobbies, social patterns, or vibe — that is stereotype, not evidence. The demographic state has already done the inference work; respect its uncertainty.",
        "7. If you find yourself wanting to write 'she' or 'he' but the state confidence is below 0.70, you are about to make the engine's worst mistake. Use 'they/them' or rewrite the sentence in second person ('you ...').",
        "",
        "AGE: ageBand confidence ≥ 0.50 on one band → narrow range (e.g. 'late 20s–mid 30s'). Below 0.50 → wide range ('20s–30s') or omit. Don't stay vague when 2–3 corroborating signals already point at a band; commit.",
        "LIFE STAGE (kids, marriage, urban/rural, employment): only mention when the relevant dim has ≥ 0.70 on one value. Otherwise stay silent — do not guess.",
        "",
        "FALLBACK: If gender / age / life-stage are weak across the board (uniform priors, brand-new user), write the portrait in second-person ('You ...') instead of third-person. It sidesteps pronoun commitment entirely while still feeling personal. This is the correct fallback when the user has answered few or no demographic probes.",
        "",
        "FRAMEWORK ANCHORING — read this carefully (this is the authoritative source for the `profile` JSON output):",
        "You will receive a FRAMEWORK STATE block — probability vectors over MBTI (I/E, N/S, T/F, J/P), Enneagram (1–9), DISC (D/I/S/C), Big Five (O/C/E/A/N), and Attachment (secure/anxious/avoidant/disorganized).",
        "- When one value on an axis has confidence ≥ 0.55, lean toward it in the profile JSON output.",
        "- When the axis is uniform (all values within 0.10 of each other), DO NOT commit — emit the closest neutral type and set the framework's confidence ≤ 0.5.",
        "- NEVER override the framework state from \"vibe\" reading of answers. If the state says mbti:N is 0.62 and mbti:S is 0.38, write N — not S — even if the answers feel S-ish to you.",
        "- If FRAMEWORK STATE is uniform across the board (brand-new user, no tagged answers landed), it's fine to set every framework's confidence to 0.5 and pick the closest plausible type from the answer log alone — but FLAG it via low confidence.",
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
        "PREDICTIONS — 3 to 5 short, behaviorally specific guesses about this person that the evidence supports but they did NOT directly state. This is the section that should make them say \"how did it know that.\" Rules:",
        "- One short sentence each, ≤ 14 words, present tense, second person (start with \"You\").",
        "- Concrete behavior, not personality adjectives. \"You keep browser tabs open you'll never read\" beats \"You're curious.\"",
        "- Slightly transgressive or quietly vulnerable when the evidence supports it. Examples: \"You've stayed in a job past the point you knew it was over.\" \"You reread the same handful of books.\" \"You've ghosted someone you actually liked.\"",
        "- No \"tend to\", no \"often\", no \"sometimes\", no horoscope vocab. Direct claims only.",
        "- Don't repeat anything from HIGHLIGHTS or PORTRAIT. These are inferences sideways from the evidence, not summaries of it.",
        "- If the evidence is too thin to support a real prediction, write fewer — never fabricate.",
        "",
        "PROBE-CONDITIONED PREDICTIONS — when DEMOGRAPHIC STATE is highly confident on a dim (≥ 0.75), let predictions LEAN into that demographic's high-prior behaviors. The combination of behavioral specificity + correct demographic inference is what produces the WTF-HOW reaction. Examples:",
        "- confident male + 30s + restless: \"You've priced out a van or sailboat at least once.\"",
        "- confident parent of school-age: \"You've Googled 'toddler tantrum' at 2am.\"",
        "- confident urban + 20s + single: \"You looked up what 'situationship' means recently.\"",
        "- confident 40s+: \"You've kept a t-shirt past its prime because it 'still has wear in it'.\"",
        "- confident freelance: \"You've checked your bank app right after sending an invoice.\"",
        "Lean in only when the demographic state actually supports it. If the state is flat/uncertain, fall back to general specifics from the answer log — DO NOT guess demographics to enable a prediction.",
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
        'FORBIDDEN: "tend to", "many sides to them", "a complex person", "a part of them", any horoscope vocabulary. Never restate a question verbatim. Never fabricate. NEVER infer gender, age, parental status, or relationship status from domestic, emotional, caretaking, or aesthetic vocabulary — DEMOGRAPHIC STATE is the only authority. NEVER override FRAMEWORK STATE for the profile JSON output — if the state contradicts your reading of the answers, the state wins. NEVER use he/him or she/her when DEMOGRAPHIC STATE\'s top gender value is below 0.70 — use they/them or second person, no exceptions.',
        "",
        "OUTPUT: JSON only, no code fences, no prose.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `FRAMEWORK STATE (probability vectors per personality axis — these are the authority for the \`profile\` JSON output):\n${summarizeProbabilityState(userProfile.probabilityState ?? emptyProbabilityState())}\n\nDEMOGRAPHIC STATE (probability vectors per dim — read these carefully before choosing pronouns or making demographic claims):\n${summarizeDemographicState(userProfile.demographicState ?? emptyDemographicState())}\n\nANSWER LOG — numbered answers from this person:\n\n${answeredText}${skippedBlock}\n\nRespond with JSON only: {"profile": {"enneagram": {"type": number, "wing": number, "confidence": number}, "mbti": {"type": string, "confidence": number}, "disc": {"dominant": string, "secondary": string, "confidence": number}, "bigFive": {"O": number, "C": number, "E": number, "A": number, "N": number}, "attachmentStyle": {"type": string, "confidence": number}, "ageRange": string, "careerArchetypes": string[]}, "predictions": string[], "summary": string, "portrait": string, "highlights": string[], "params": {"warmth": number, "energy": number, "structure": number, "density": number, "extroversion": number, "symmetry": number}}`,
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

    // Sanitize predictions: strip non-strings, trim, drop blanks, cap at 5.
    // Empty array is fine — UI hides the section when there's nothing usable.
    const predictions = Array.isArray(parsed.predictions)
      ? (parsed.predictions as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 200)
          .slice(0, 5)
      : [];

    return NextResponse.json({
      summary: parsed.summary ?? "",
      portrait: parsed.portrait ?? "",
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      params: normalizeParams(parsed.params),
      profile: sanitizeProfile(parsed.profile),
      predictions,
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
