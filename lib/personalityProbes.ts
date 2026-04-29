import { ProbabilityState, Question } from "./types";
import {
  FrameworkImplication,
  mbtiAxisEntropy,
  emptyState as emptyProbabilityState,
} from "./probabilityState";
import { normalizeQuestionText } from "./questionSequencer";

// Personality (MBTI / Enneagram) behavior probes — parallel to the
// demographic probes in lib/indirectProbes.ts but targeting framework
// axes instead of demographic dims. Each probe carries weighted
// onYes/onNo implications consumed by `applyMBTIProbeAnswer` in
// lib/probabilityState.ts.
//
// Why these exist:
//   The static-pool keyword tagger (`inferFrameworkTags` in
//   personalityQuestions.ts) tags ~23% of dataset questions with
//   framework dimensions, but each tag only nudges by STEP=0.04 in the
//   default scorer. For personas with distinctive types (e.g. INFP),
//   that signal is too sparse to override the synthesis LLM's drift
//   toward modal types like ISFJ. Curated probes with explicit weights
//   land hard signal — one Yes can move an MBTI axis by 0.5–0.7 in a
//   single answer.
//
// Probe selection strategy:
//   At batch time, compute Shannon entropy per MBTI axis (I/E, N/S,
//   T/F, J/P). Pick the highest-entropy axis (most uncertain), then a
//   probe targeting it. Round-robin across axes to guarantee breadth
//   in early sessions where every axis starts uniform.

export interface MBTIProbe {
  id: string; // stable, prefix "mbtiprobe_"
  title: string;
  answerLabels: [string, string, string]; // [no, maybe, yes]
  // The MBTI axis this probe primarily disambiguates. Drives selector
  // round-robin coverage.
  primaryAxis: "IE" | "NS" | "TF" | "JP";
  onYes: FrameworkImplication[];
  onNo: FrameworkImplication[];
}

export const MBTI_PROBES: readonly MBTIProbe[] = [
  // ===== I/E axis (4 probes) =====
  {
    id: "mbtiprobe_small_talk_tiring",
    title: "Do you find small talk physically tiring?",
    answerLabels: ["No, I enjoy it", "Sometimes", "Yes, draining"],
    primaryAxis: "IE",
    onYes: [{ tag: "mbti:I", weight: 0.6 }],
    onNo: [{ tag: "mbti:E", weight: 0.5 }],
  },
  {
    id: "mbtiprobe_party_energy",
    title: "After a party, do you feel energized rather than drained?",
    answerLabels: ["Drained", "Mixed", "Energized"],
    primaryAxis: "IE",
    onYes: [{ tag: "mbti:E", weight: 0.6 }],
    onNo: [{ tag: "mbti:I", weight: 0.6 }],
  },
  {
    id: "mbtiprobe_solo_recharge",
    title: "When stressed, do you mostly want to be alone to recover?",
    answerLabels: ["No, I want company", "Mix", "Yes, alone"],
    primaryAxis: "IE",
    onYes: [{ tag: "mbti:I", weight: 0.55 }],
    onNo: [{ tag: "mbti:E", weight: 0.4 }],
  },
  {
    id: "mbtiprobe_speak_up_first",
    title: "In a group, are you usually one of the first to speak up?",
    answerLabels: ["I wait", "Depends", "Yes, usually"],
    primaryAxis: "IE",
    onYes: [{ tag: "mbti:E", weight: 0.55 }],
    onNo: [{ tag: "mbti:I", weight: 0.5 }],
  },

  // ===== N/S axis (4 probes) — the axis we got wrong on Katherine =====
  {
    id: "mbtiprobe_reread_for_wording",
    title:
      "Have you reread a sentence in a book in the past month just for the wording?",
    answerLabels: ["No", "Once or twice", "Often"],
    primaryAxis: "NS",
    onYes: [
      { tag: "mbti:N", weight: 0.65 },
      { tag: "mbti:I", weight: 0.2 },
    ],
    onNo: [{ tag: "mbti:S", weight: 0.4 }],
  },
  {
    id: "mbtiprobe_imagined_paths",
    title: "When you read a story, do you imagine the paths it didn't take?",
    answerLabels: ["No, I follow what's written", "Sometimes", "Yes, often"],
    primaryAxis: "NS",
    onYes: [
      { tag: "mbti:N", weight: 0.65 },
      { tag: "mbti:P", weight: 0.25 },
    ],
    onNo: [{ tag: "mbti:S", weight: 0.5 }],
  },
  {
    id: "mbtiprobe_metaphor_first",
    title:
      "When explaining something hard, do you reach for a metaphor before facts?",
    answerLabels: ["I stick to facts", "Both", "Metaphor first"],
    primaryAxis: "NS",
    onYes: [{ tag: "mbti:N", weight: 0.6 }],
    onNo: [{ tag: "mbti:S", weight: 0.55 }],
  },
  {
    id: "mbtiprobe_concrete_steps",
    title:
      "Do you prefer step-by-step instructions over a description of the goal?",
    answerLabels: ["No, just the goal", "Both", "Yes, step by step"],
    primaryAxis: "NS",
    onYes: [{ tag: "mbti:S", weight: 0.55 }],
    onNo: [{ tag: "mbti:N", weight: 0.5 }],
  },

  // ===== T/F axis (4 probes) =====
  {
    id: "mbtiprobe_friend_upset_focus",
    title:
      "When a friend is upset, do you sit with their feelings rather than try to fix the problem?",
    answerLabels: ["I try to fix it", "Both", "I sit with feelings"],
    primaryAxis: "TF",
    onYes: [{ tag: "mbti:F", weight: 0.6 }],
    onNo: [{ tag: "mbti:T", weight: 0.55 }],
  },
  {
    id: "mbtiprobe_decide_by_feeling",
    title:
      "When you make a decision, do you usually go with what feels right rather than what's logically optimal?",
    answerLabels: ["Logic wins", "Mix", "Feeling first"],
    primaryAxis: "TF",
    onYes: [{ tag: "mbti:F", weight: 0.6 }],
    onNo: [{ tag: "mbti:T", weight: 0.55 }],
  },
  {
    id: "mbtiprobe_critical_objective",
    title:
      "Are you comfortable being told your reasoning was wrong, even if it stings?",
    answerLabels: ["It really stings", "It's fine", "I welcome it"],
    primaryAxis: "TF",
    onYes: [{ tag: "mbti:T", weight: 0.5 }],
    onNo: [{ tag: "mbti:F", weight: 0.45 }],
  },
  {
    id: "mbtiprobe_value_harmony",
    title: "Is keeping group harmony more important than being right?",
    answerLabels: ["Being right matters more", "Depends", "Harmony first"],
    primaryAxis: "TF",
    onYes: [{ tag: "mbti:F", weight: 0.55 }],
    onNo: [{ tag: "mbti:T", weight: 0.5 }],
  },

  // ===== J/P axis (4 probes) — also wrong on Katherine =====
  {
    id: "mbtiprobe_plan_before_starting",
    title: "Do you usually have a plan before starting a project?",
    answerLabels: ["No, I figure it out", "Loose plan", "Yes, detailed"],
    primaryAxis: "JP",
    onYes: [{ tag: "mbti:J", weight: 0.55 }],
    onNo: [{ tag: "mbti:P", weight: 0.6 }],
  },
  {
    id: "mbtiprobe_close_decisions_quickly",
    title:
      "Do you prefer ending a discussion on a clear decision over leaving it open?",
    answerLabels: ["Leave it open", "Mix", "Close it out"],
    primaryAxis: "JP",
    onYes: [{ tag: "mbti:J", weight: 0.6 }],
    onNo: [{ tag: "mbti:P", weight: 0.55 }],
  },
  {
    id: "mbtiprobe_change_plans_late",
    title: "Are you comfortable changing plans last-minute?",
    answerLabels: ["No, it bothers me", "Sometimes", "Yes, easily"],
    primaryAxis: "JP",
    onYes: [{ tag: "mbti:P", weight: 0.55 }],
    onNo: [{ tag: "mbti:J", weight: 0.55 }],
  },
  {
    id: "mbtiprobe_keep_options_open",
    title:
      "Do you prefer to keep options open rather than commit to one path?",
    answerLabels: ["Commit early", "Depends", "Keep options open"],
    primaryAxis: "JP",
    onYes: [
      { tag: "mbti:P", weight: 0.6 },
      { tag: "mbti:N", weight: 0.2 },
    ],
    onNo: [{ tag: "mbti:J", weight: 0.55 }],
  },
];

const MBTI_PROBE_BY_ID = new Map<string, MBTIProbe>();
for (const p of MBTI_PROBES) MBTI_PROBE_BY_ID.set(p.id, p);

export function getMBTIProbeById(id: string): MBTIProbe | undefined {
  return MBTI_PROBE_BY_ID.get(id);
}

export function isMBTIProbeId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith("mbtiprobe_");
}

// Convert an MBTI probe to the on-wire Question shape. Uses the same
// yes_no_maybe answer type as demographic probes so the swipe UI
// renders them identically. Tags carry probe markers for downstream
// dedup and routing.
export function mbtiProbeToQuestion(probe: MBTIProbe): Question {
  return {
    id: probe.id,
    title: probe.title,
    answerType: "yes_no_maybe",
    options: probe.answerLabels.slice(),
    answerLabels: probe.answerLabels.slice(),
    superLikeEnabled: false,
    tags: ["mbtiprobe", `mbtiprobe:${probe.primaryAxis}`],
    optionTags: ["negative", "neutral", "affirmative"],
  };
}

const ALL_AXES: Array<MBTIProbe["primaryAxis"]> = ["IE", "NS", "TF", "JP"];

// Pick `count` MBTI probes targeting the highest-entropy axes. Uses a
// two-tier strategy: round-robin coverage in early sessions (axes
// never probed get priority), then entropy-weighted once all 4 axes
// have at least one probe in seenIds.
export function selectMBTIProbesForBatch(
  probabilityState: ProbabilityState | undefined,
  count: number,
  seenIds: ReadonlySet<string>,
  seenTexts: ReadonlySet<string>
): Question[] {
  if (count <= 0) return [];
  const state = probabilityState ?? emptyProbabilityState();

  const entropy: Record<MBTIProbe["primaryAxis"], number> = {
    IE: mbtiAxisEntropy(state, "IE"),
    NS: mbtiAxisEntropy(state, "NS"),
    TF: mbtiAxisEntropy(state, "TF"),
    JP: mbtiAxisEntropy(state, "JP"),
  };

  // Which MBTI axes have already been probed? Derived from seenIds
  // matched against the registry.
  const probedAxes = new Set<MBTIProbe["primaryAxis"]>();
  for (const probe of MBTI_PROBES) {
    if (seenIds.has(probe.id)) probedAxes.add(probe.primaryAxis);
  }
  const unprobedAxes = ALL_AXES.filter((a) => !probedAxes.has(a));

  // Tier 1: probes targeting axes never touched yet. Falls back to
  // full pool once all 4 axes have at least one probe in history.
  const tierOnePool =
    unprobedAxes.length > 0
      ? MBTI_PROBES.filter((p) => unprobedAxes.includes(p.primaryAxis))
      : MBTI_PROBES;

  const score = (
    pool: readonly MBTIProbe[]
  ): Array<{ probe: MBTIProbe; score: number }> => {
    const out: Array<{ probe: MBTIProbe; score: number }> = [];
    for (const probe of pool) {
      if (seenIds.has(probe.id)) continue;
      if (seenTexts.has(normalizeQuestionText(probe.title))) continue;
      const jitter = Math.random() * 0.1;
      out.push({ probe, score: entropy[probe.primaryAxis] + jitter });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  };

  let scored = score(tierOnePool);
  if (scored.length < count && tierOnePool !== MBTI_PROBES) {
    const usedIds = new Set(scored.map((s) => s.probe.id));
    const fallback = score(
      MBTI_PROBES.filter((p) => !usedIds.has(p.id))
    );
    scored = scored.concat(fallback);
  }

  // Avoid two probes on the same axis back-to-back unless we run out.
  const picked: MBTIProbe[] = [];
  const usedAxes = new Set<MBTIProbe["primaryAxis"]>();
  for (const { probe } of scored) {
    if (picked.length >= count) break;
    if (usedAxes.has(probe.primaryAxis)) continue;
    picked.push(probe);
    usedAxes.add(probe.primaryAxis);
  }
  if (picked.length < count) {
    for (const { probe } of scored) {
      if (picked.length >= count) break;
      if (picked.includes(probe)) continue;
      picked.push(probe);
    }
  }

  return picked.map(mbtiProbeToQuestion);
}
