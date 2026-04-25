import { DemographicState, FactSentiment } from "./types";

// Demographic-state scorer. Mirrors the shape of probabilityState.ts but
// uses **probe-specific weights** (not a fixed STEP) because probes carry
// wildly different priors — "have you been pregnant" pins a dim by 0.99,
// while "have you been to a baby shower" only nudges by 0.4. Each dim
// stays normalized so we can read confidence as a probability directly.

type Dim = keyof DemographicState;

// Uniform priors for every dim. A blank state means "we have no idea who
// this is" — the synthesis prompt reads this as a signal to default to
// neutral pronouns / wide age ranges.
export function emptyDemographicState(): DemographicState {
  return {
    gender: { male: 1 / 3, female: 1 / 3, nonbinary: 1 / 3 },
    ageBand: { teen: 0.2, "20s": 0.2, "30s": 0.2, "40s": 0.2, "50plus": 0.2 },
    relationshipStatus: {
      single: 0.25,
      partnered: 0.25,
      married: 0.25,
      divorced: 0.25,
    },
    hasKids: { yes: 0.5, no: 0.5 },
    geographyType: { urban: 1 / 3, suburban: 1 / 3, rural: 1 / 3 },
    workStatus: {
      student: 0.2,
      employed: 0.2,
      freelance: 0.2,
      retired: 0.2,
      unemployed: 0.2,
    },
  };
}

// One implication of a probe answer — "yes to 'have you grown a beard'
// implies gender:male with weight 0.9."
export interface ProbeImplication {
  dim: Dim;
  key: string;
  weight: number; // 0–1
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalize<T extends Record<string, number>>(bag: T): T {
  const keys = Object.keys(bag) as Array<keyof T>;
  let sum = 0;
  for (const k of keys) sum += bag[k];
  if (sum <= 0) {
    const u = 1 / keys.length;
    const out = { ...bag };
    for (const k of keys) (out as Record<string, number>)[k as string] = u;
    return out;
  }
  const out = { ...bag };
  for (const k of keys) (out as Record<string, number>)[k as string] = bag[k] / sum;
  return out;
}

// Apply one probe implication to the state. Pulls probability mass toward
// `key` and (proportionally) away from the other keys in the same dim.
// `weight` is the prior strength — 0.9 for a near-deterministic probe like
// "have you grown a beard," 0.4 for a softer one.
function applyImplication(
  state: DemographicState,
  imp: ProbeImplication,
  multiplier: number // 1 for Yes, -1 for No (when reading onYes), etc.
): void {
  const bag = state[imp.dim] as Record<string, number>;
  if (!(imp.key in bag)) return; // probe targets a key we don't track; skip

  const w = imp.weight * multiplier;
  // Move `w` probability mass from "everything else" into `imp.key`,
  // bounded so cells can't exit [0, 1].
  const others = Object.keys(bag).filter((k) => k !== imp.key);
  if (others.length === 0) return;

  // For positive w: take w * (1 - bag[key]) of the remaining headroom.
  // For negative w: take |w| * bag[key] of the existing mass and spread it.
  let delta: number;
  if (w >= 0) {
    delta = w * (1 - bag[imp.key]);
  } else {
    delta = w * bag[imp.key]; // negative
  }

  bag[imp.key] = clamp01(bag[imp.key] + delta);
  // Spread the opposite delta across other keys, weighted by their current mass.
  const othersTotal = others.reduce((s, k) => s + bag[k], 0);
  if (othersTotal <= 0) {
    // Edge case: every other cell is already 0. Spread evenly.
    const slice = -delta / others.length;
    for (const k of others) bag[k] = clamp01(bag[k] + slice);
  } else {
    for (const k of others) {
      const share = bag[k] / othersTotal;
      bag[k] = clamp01(bag[k] - delta * share);
    }
  }

  // Renormalize defensively — clamp01 above can break the sum.
  const renorm = normalize(bag);
  for (const k of Object.keys(bag)) bag[k] = renorm[k];
}

// Apply a probe answer to the running state. Yes → run all onYes
// implications at full strength. No → run all onNo at full strength.
// Maybe → run both lists at half strength, which is a softer signal that
// the dim still matters but the user wouldn't commit either way.
export function applyProbeAnswer(
  state: DemographicState,
  probe: { onYes: ProbeImplication[]; onNo: ProbeImplication[] },
  sentiment: FactSentiment
): DemographicState {
  // Mutate a working copy.
  const next: DemographicState = JSON.parse(
    JSON.stringify(state)
  ) as DemographicState;

  const fullStrength = sentiment === "neutral" ? 0.5 : 1;

  if (sentiment === "affirmative" || sentiment === "neutral") {
    for (const imp of probe.onYes) {
      applyImplication(next, { ...imp, weight: imp.weight * fullStrength }, 1);
    }
  }
  if (sentiment === "non-affirmative" || sentiment === "neutral") {
    for (const imp of probe.onNo) {
      applyImplication(next, { ...imp, weight: imp.weight * fullStrength }, 1);
    }
  }

  return next;
}

// Highest-confidence key for a dim. Used by the entropy-weighted probe
// selector and by the prompt-rendering helper.
export function topConfidence(
  state: DemographicState,
  dim: Dim
): { key: string; value: number } {
  const bag = state[dim] as Record<string, number>;
  let bestKey = "";
  let bestVal = -1;
  for (const [k, v] of Object.entries(bag)) {
    if (v > bestVal) {
      bestKey = k;
      bestVal = v;
    }
  }
  return { key: bestKey, value: bestVal };
}

// Shannon entropy (in bits) for a single dim. Higher = more uncertainty
// = better candidate for probe interleaving.
export function dimEntropy(state: DemographicState, dim: Dim): number {
  const bag = state[dim] as Record<string, number>;
  let h = 0;
  for (const v of Object.values(bag)) {
    if (v <= 0) continue;
    h -= v * Math.log2(v);
  }
  return h;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

// Render the demographic state as a compact prompt block. The synthesis
// prompt reads this verbatim to anchor pronouns and predictions.
export function summarizeForPrompt(state: DemographicState): string {
  const lines: string[] = [];
  const renderDim = (label: string, bag: Record<string, number>) => {
    const parts = Object.entries(bag)
      .map(([k, v]) => `${k} ${fmt(v)}`)
      .join(" · ");
    lines.push(`${label}: ${parts}`);
  };
  renderDim("gender", state.gender);
  renderDim("ageBand", state.ageBand);
  renderDim("relationshipStatus", state.relationshipStatus);
  renderDim("hasKids", state.hasKids);
  renderDim("geographyType", state.geographyType);
  renderDim("workStatus", state.workStatus);
  return lines.join("\n");
}
