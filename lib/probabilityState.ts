import {
  FactSentiment,
  ProbabilityState,
  Question,
  UserFact,
} from "./types";

// Tag-based scorer for the five-framework personality engine.
// Questions declare which dimensions they discriminate via `question.tags`,
// e.g. ["mbti:I", "enneagram:5", "disc:C", "bigfive:E", "attachment:avoidant"].
// Each Yes adds full weight to the tagged dimension; No subtracts it; Maybe
// applies half-weight in both directions (a soft signal of ambiguity).

type FrameworkKey = keyof ProbabilityState;

const MBTI_AXES: Record<string, ["I" | "E" | "N" | "S" | "T" | "F" | "J" | "P", "I" | "E" | "N" | "S" | "T" | "F" | "J" | "P"]> = {
  I: ["I", "E"],
  E: ["E", "I"],
  N: ["N", "S"],
  S: ["S", "N"],
  T: ["T", "F"],
  F: ["F", "T"],
  J: ["J", "P"],
  P: ["P", "J"],
};

export function emptyState(): ProbabilityState {
  return {
    mbti: { I: 0.5, E: 0.5, N: 0.5, S: 0.5, T: 0.5, F: 0.5, J: 0.5, P: 0.5 },
    enneagram: {
      "1": 1 / 9,
      "2": 1 / 9,
      "3": 1 / 9,
      "4": 1 / 9,
      "5": 1 / 9,
      "6": 1 / 9,
      "7": 1 / 9,
      "8": 1 / 9,
      "9": 1 / 9,
    },
    disc: { D: 0.25, I: 0.25, S: 0.25, C: 0.25 },
    bigFive: { O: 0.5, C: 0.5, E: 0.5, A: 0.5, N: 0.5 },
    attachment: {
      secure: 0.25,
      anxious: 0.25,
      avoidant: 0.25,
      disorganized: 0.25,
    },
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Normalize a probability dict so its values sum to 1 (for n-way frameworks).
function normalize<K extends string>(
  bag: Record<K, number>
): Record<K, number> {
  const keys = Object.keys(bag) as K[];
  let sum = 0;
  for (const k of keys) sum += bag[k];
  if (sum <= 0) {
    const u = 1 / keys.length;
    const out = { ...bag };
    for (const k of keys) out[k] = u;
    return out;
  }
  const out = { ...bag };
  for (const k of keys) out[k] = bag[k] / sum;
  return out;
}

// Sentiment → signed weight in [-1, 1]. Maybe is half magnitude.
function weightFor(sentiment: FactSentiment): number {
  if (sentiment === "affirmative") return 1;
  if (sentiment === "non-affirmative") return -1;
  return 0; // neutral applies no net push but counts as engagement
}

// Soft-signal magnitude for Maybe — distributes a fraction of confidence
// across both poles rather than committing.
function maybeMagnitude(sentiment: FactSentiment): number {
  return sentiment === "neutral" ? 0.5 : 0;
}

// Step size per answer. Small enough that no single tag dominates; ~10
// strong answers move a binary axis from 0.5 to ~0.85.
const STEP = 0.04;

function nudgeMbtiAxis(
  state: ProbabilityState["mbti"],
  positivePole: keyof ProbabilityState["mbti"],
  negativePole: keyof ProbabilityState["mbti"],
  signed: number
): void {
  const delta = STEP * signed;
  state[positivePole] = clamp01(state[positivePole] + delta);
  state[negativePole] = clamp01(state[negativePole] - delta);
}

function nudgeNWay<K extends string>(
  bag: Record<K, number>,
  key: K,
  signed: number
): Record<K, number> {
  const delta = STEP * signed;
  const next = { ...bag };
  next[key] = Math.max(0, next[key] + delta);
  // Spread the opposing push across the other keys.
  const others = (Object.keys(next) as K[]).filter((k) => k !== key);
  for (const k of others) {
    next[k] = Math.max(0, next[k] - delta / others.length);
  }
  return normalize(next);
}

// Parse a tag like "mbti:I" → { framework: "mbti", code: "I" }.
function parseTag(tag: string): { framework: FrameworkKey | "bigfive"; code: string } | null {
  const [rawFramework, rawCode] = tag.split(":");
  if (!rawFramework || !rawCode) return null;
  const framework = rawFramework.toLowerCase();
  const code = rawCode.trim();
  if (
    framework === "mbti" ||
    framework === "enneagram" ||
    framework === "disc" ||
    framework === "bigfive" ||
    framework === "attachment"
  ) {
    return { framework: framework as FrameworkKey | "bigfive", code };
  }
  return null;
}

// Apply one answer to the running probability state.
export function applyAnswer(
  state: ProbabilityState,
  fact: UserFact,
  question: Pick<Question, "tags"> | undefined
): ProbabilityState {
  const tags = question?.tags ?? [];
  if (tags.length === 0) return state;

  const sentiment: FactSentiment =
    fact.sentiment ?? (fact.positive ? "affirmative" : "non-affirmative");

  const signed = weightFor(sentiment);
  const maybe = maybeMagnitude(sentiment);

  // Mutate a working copy so we can return a new reference.
  const next: ProbabilityState = {
    mbti: { ...state.mbti },
    enneagram: { ...state.enneagram },
    disc: { ...state.disc },
    bigFive: { ...state.bigFive },
    attachment: { ...state.attachment },
  };

  for (const tag of tags) {
    const parsed = parseTag(tag);
    if (!parsed) continue;
    const { framework, code } = parsed;

    if (framework === "mbti") {
      const upper = code.toUpperCase() as keyof typeof MBTI_AXES;
      const axis = MBTI_AXES[upper];
      if (!axis) continue;
      if (signed !== 0) {
        nudgeMbtiAxis(next.mbti, axis[0], axis[1], signed);
      } else if (maybe > 0) {
        // Maybe: pull both poles toward 0.5 slightly.
        const blendA = (next.mbti[axis[0]] + 0.5) / 2;
        const blendB = (next.mbti[axis[1]] + 0.5) / 2;
        next.mbti[axis[0]] = clamp01(
          next.mbti[axis[0]] * (1 - maybe * 0.2) + blendA * (maybe * 0.2)
        );
        next.mbti[axis[1]] = clamp01(
          next.mbti[axis[1]] * (1 - maybe * 0.2) + blendB * (maybe * 0.2)
        );
      }
      continue;
    }

    if (framework === "bigfive") {
      const upper = code.toUpperCase();
      if (upper === "O" || upper === "C" || upper === "E" || upper === "A" || upper === "N") {
        // Big Five is dimensional: high vs low on the same axis.
        // Yes pushes the dimension up, No pushes it down.
        const delta = STEP * signed;
        next.bigFive[upper] = clamp01(next.bigFive[upper] + delta);
      }
      continue;
    }

    if (framework === "enneagram") {
      const num = parseInt(code, 10);
      if (num >= 1 && num <= 9) {
        const key = String(num) as keyof ProbabilityState["enneagram"];
        next.enneagram = nudgeNWay(next.enneagram, key, signed);
      }
      continue;
    }

    if (framework === "disc") {
      const upper = code.toUpperCase();
      if (upper === "D" || upper === "I" || upper === "S" || upper === "C") {
        next.disc = nudgeNWay(next.disc, upper, signed);
      }
      continue;
    }

    if (framework === "attachment") {
      const lower = code.toLowerCase();
      if (
        lower === "secure" ||
        lower === "anxious" ||
        lower === "avoidant" ||
        lower === "disorganized"
      ) {
        next.attachment = nudgeNWay(next.attachment, lower, signed);
      }
      continue;
    }
  }

  return next;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

// Render the running state as a compact text block for the LLM prompt.
export function summarizeForPrompt(state: ProbabilityState): string {
  const lines: string[] = [];
  lines.push(
    `mbti: I ${fmt(state.mbti.I)} | E ${fmt(state.mbti.E)} · N ${fmt(state.mbti.N)} | S ${fmt(state.mbti.S)} · T ${fmt(state.mbti.T)} | F ${fmt(state.mbti.F)} · J ${fmt(state.mbti.J)} | P ${fmt(state.mbti.P)}`
  );
  lines.push(
    `enneagram: ${(Object.keys(state.enneagram) as Array<keyof ProbabilityState["enneagram"]>)
      .map((k) => `${k} ${fmt(state.enneagram[k])}`)
      .join(" · ")}`
  );
  lines.push(
    `disc: D ${fmt(state.disc.D)} · I ${fmt(state.disc.I)} · S ${fmt(state.disc.S)} · C ${fmt(state.disc.C)}`
  );
  lines.push(
    `bigFive: O ${fmt(state.bigFive.O)} · C ${fmt(state.bigFive.C)} · E ${fmt(state.bigFive.E)} · A ${fmt(state.bigFive.A)} · N ${fmt(state.bigFive.N)}`
  );
  lines.push(
    `attachment: secure ${fmt(state.attachment.secure)} · anxious ${fmt(state.attachment.anxious)} · avoidant ${fmt(state.attachment.avoidant)} · disorganized ${fmt(state.attachment.disorganized)}`
  );
  return lines.join("\n");
}
