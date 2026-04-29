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

// ─────────────────────────────────────────────────────────────────────
// Weighted MBTI/Enneagram probe scorer.
// Parallel to applyProbeAnswer in lib/demographicState.ts but for
// ProbabilityState. Used by personality probes (lib/personalityProbes.ts)
// where each implication carries an explicit weight (0–1). The basic
// applyAnswer above uses a fixed STEP=0.04 nudge from question.tags,
// which is too soft for high-signal targeted probes like
// "have you reread a book in the past year just for the wording?"
// (mbti:N +0.6).
// ─────────────────────────────────────────────────────────────────────

export interface FrameworkImplication {
  // Tag form, e.g. "mbti:N" / "enneagram:5" / "disc:C". Same vocabulary
  // as question.tags so probe authors don't learn a new format.
  tag: string;
  weight: number; // 0–1
}

// Apply a single implication with explicit weight. For binary axes
// (MBTI letters, BigFive dims) we shift the named pole by `weight *
// (1 - current)` and pull the inverse pole proportionally. For n-way
// axes (Enneagram, DISC, Attachment) we add `weight * (1 - current)`
// to the named cell and re-normalize.
function applyWeightedImplication(
  state: ProbabilityState,
  imp: FrameworkImplication
): void {
  const [rawFramework, rawCode] = imp.tag.split(":");
  if (!rawFramework || !rawCode) return;
  const framework = rawFramework.toLowerCase();
  const code = rawCode.trim();
  const w = imp.weight;
  if (w <= 0) return;

  if (framework === "mbti") {
    const upper = code.toUpperCase() as keyof typeof MBTI_AXES;
    const axis = MBTI_AXES[upper];
    if (!axis) return;
    const [pos, neg] = axis;
    const current = state.mbti[pos];
    const delta = w * (1 - current);
    state.mbti[pos] = clamp01(current + delta);
    state.mbti[neg] = clamp01(state.mbti[neg] - delta);
    return;
  }

  if (framework === "bigfive") {
    const upper = code.toUpperCase();
    if (
      upper === "O" ||
      upper === "C" ||
      upper === "E" ||
      upper === "A" ||
      upper === "N"
    ) {
      const current = state.bigFive[upper];
      const delta = w * (1 - current);
      state.bigFive[upper] = clamp01(current + delta);
    }
    return;
  }

  if (framework === "enneagram") {
    const num = parseInt(code, 10);
    if (num < 1 || num > 9) return;
    const key = String(num) as keyof ProbabilityState["enneagram"];
    const current = state.enneagram[key];
    const delta = w * (1 - current);
    state.enneagram[key] = Math.max(0, current + delta);
    state.enneagram = normalize(state.enneagram);
    return;
  }

  if (framework === "disc") {
    const upper = code.toUpperCase();
    if (upper === "D" || upper === "I" || upper === "S" || upper === "C") {
      const current = state.disc[upper];
      const delta = w * (1 - current);
      state.disc[upper] = Math.max(0, current + delta);
      state.disc = normalize(state.disc);
    }
    return;
  }

  if (framework === "attachment") {
    const lower = code.toLowerCase();
    if (
      lower === "secure" ||
      lower === "anxious" ||
      lower === "avoidant" ||
      lower === "disorganized"
    ) {
      const current = state.attachment[lower];
      const delta = w * (1 - current);
      state.attachment[lower] = Math.max(0, current + delta);
      state.attachment = normalize(state.attachment);
    }
    return;
  }
}

// Apply a personality probe answer to the running state. Yes → run all
// onYes implications at full strength. No → run all onNo at full
// strength. Maybe → half-weight on both lists (soft ambiguity).
export function applyMBTIProbeAnswer(
  state: ProbabilityState,
  probe: { onYes: FrameworkImplication[]; onNo: FrameworkImplication[] },
  sentiment: FactSentiment
): ProbabilityState {
  const next: ProbabilityState = JSON.parse(
    JSON.stringify(state)
  ) as ProbabilityState;

  const halfWhenMaybe = sentiment === "neutral" ? 0.5 : 1;

  if (sentiment === "affirmative" || sentiment === "neutral") {
    for (const imp of probe.onYes) {
      applyWeightedImplication(next, {
        tag: imp.tag,
        weight: imp.weight * halfWhenMaybe,
      });
    }
  }
  if (sentiment === "non-affirmative" || sentiment === "neutral") {
    for (const imp of probe.onNo) {
      applyWeightedImplication(next, {
        tag: imp.tag,
        weight: imp.weight * halfWhenMaybe,
      });
    }
  }
  return next;
}

// Shannon entropy over a 2-key MBTI axis pair. Higher = more uncertain
// = better target for the next personality probe.
export function mbtiAxisEntropy(
  state: ProbabilityState,
  axis: "IE" | "NS" | "TF" | "JP"
): number {
  const map: Record<typeof axis, [keyof ProbabilityState["mbti"], keyof ProbabilityState["mbti"]]> = {
    IE: ["I", "E"],
    NS: ["N", "S"],
    TF: ["T", "F"],
    JP: ["J", "P"],
  };
  const [a, b] = map[axis];
  let h = 0;
  for (const v of [state.mbti[a], state.mbti[b]]) {
    if (v <= 0) continue;
    h -= v * Math.log2(v);
  }
  return h;
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
