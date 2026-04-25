import { DemographicState, Question, UserProfile } from "./types";
import {
  dimEntropy,
  emptyDemographicState,
  ProbeImplication,
} from "./demographicState";
import { normalizeQuestionText } from "./questionSequencer";

// Indirect probes — yes/no/maybe questions where one or both answers
// carry a strong demographic prior. Hand-curated so we control the
// weights; LLM-generated probes risk stereotype amplification without
// calibration. Each probe stores onYes / onNo implication arrays the
// scorer reads on commit.
//
// Weight calibration guide:
//   0.95+  Near-deterministic. "Have you been pregnant" → female.
//   0.80–0.94  Strong prior. "Have you grown a beard" → male.
//   0.60–0.79  Moderate. "Do you walk to a grocery store" → urban.
//   0.40–0.59  Soft. "Have you been to a baby shower" → ageBand mid+.
//   <0.40  Don't bother — too noisy for the budget; cut it.

export interface IndirectProbe {
  id: string; // stable, prefix "probe_"
  title: string;
  answerLabels: [string, string, string]; // [no, maybe, yes]
  superLikeEnabled?: boolean;
  onYes: ProbeImplication[];
  onNo: ProbeImplication[];
  // Primary dim this probe disambiguates — used by the entropy-weighted
  // selector to pick probes that target the noisiest current dim.
  primaryDim: keyof DemographicState;
}

export const INDIRECT_PROBES: readonly IndirectProbe[] = [
  // ===== GENDER (5) =====
  {
    id: "probe_beard",
    title: "Have you grown a full beard at some point?",
    answerLabels: ["Never could", "Patchy attempt", "Yes, the real thing"],
    primaryDim: "gender",
    onYes: [{ dim: "gender", key: "male", weight: 0.9 }],
    onNo: [{ dim: "gender", key: "female", weight: 0.4 }],
  },
  {
    id: "probe_pregnant",
    title: "Have you ever been pregnant?",
    answerLabels: ["No", "It's complicated", "Yes"],
    primaryDim: "gender",
    onYes: [
      { dim: "gender", key: "female", weight: 0.99 },
      { dim: "ageBand", key: "20s", weight: 0.2 },
      { dim: "ageBand", key: "30s", weight: 0.2 },
    ],
    onNo: [{ dim: "gender", key: "male", weight: 0.5 }],
  },
  {
    id: "probe_catcalled",
    title: "Have you been catcalled walking somewhere this year?",
    answerLabels: ["No", "Maybe?", "Yes"],
    primaryDim: "gender",
    onYes: [{ dim: "gender", key: "female", weight: 0.85 }],
    onNo: [{ dim: "gender", key: "male", weight: 0.4 }],
  },
  {
    id: "probe_purse",
    title: "Do you carry something resembling a purse most days?",
    answerLabels: ["No", "Sometimes a small bag", "Yes"],
    primaryDim: "gender",
    onYes: [{ dim: "gender", key: "female", weight: 0.7 }],
    onNo: [{ dim: "gender", key: "male", weight: 0.5 }],
  },
  {
    id: "probe_mens_room",
    title: "Have you used a public men's restroom in the last week?",
    answerLabels: ["No", "Just to wash hands", "Yes"],
    primaryDim: "gender",
    onYes: [{ dim: "gender", key: "male", weight: 0.95 }],
    onNo: [{ dim: "gender", key: "female", weight: 0.6 }],
  },

  // ===== AGE BAND (5) =====
  {
    id: "probe_pre_internet",
    title: "Do you remember everyday life before smartphones existed?",
    answerLabels: ["No", "Vaguely", "Yes, clearly"],
    primaryDim: "ageBand",
    // Recalibrated 2026-04-25: original weights overshot to 50plus on
    // Yes. iPhone hit 2007 — a 32yo was 13 then, so "vaguely remembers"
    // is the honest 30s answer. Peak at 30s/40s, only modest 50plus.
    onYes: [
      { dim: "ageBand", key: "30s", weight: 0.55 },
      { dim: "ageBand", key: "40s", weight: 0.55 },
      { dim: "ageBand", key: "50plus", weight: 0.4 },
    ],
    onNo: [
      { dim: "ageBand", key: "teen", weight: 0.5 },
      { dim: "ageBand", key: "20s", weight: 0.7 },
    ],
  },
  {
    id: "probe_911_school",
    title: "Were you in school when 9/11 happened?",
    answerLabels: ["No, before my time", "Wasn't around for it", "Yes"],
    primaryDim: "ageBand",
    onYes: [
      { dim: "ageBand", key: "30s", weight: 0.7 },
      { dim: "ageBand", key: "40s", weight: 0.5 },
    ],
    onNo: [
      { dim: "ageBand", key: "teen", weight: 0.7 },
      { dim: "ageBand", key: "20s", weight: 0.6 },
    ],
  },
  {
    id: "probe_dating_app",
    title: "Have you opened a dating app in the last month?",
    answerLabels: ["No", "Deleted it recently", "Yes"],
    primaryDim: "ageBand",
    onYes: [
      { dim: "ageBand", key: "20s", weight: 0.6 },
      { dim: "ageBand", key: "30s", weight: 0.5 },
      { dim: "relationshipStatus", key: "single", weight: 0.7 },
    ],
    onNo: [
      { dim: "relationshipStatus", key: "married", weight: 0.4 },
      { dim: "relationshipStatus", key: "partnered", weight: 0.3 },
    ],
  },
  {
    id: "probe_first_concert_ago",
    title: "Was your first real concert more than 15 years ago?",
    answerLabels: ["No", "Around then", "Definitely yes"],
    primaryDim: "ageBand",
    // Recalibrated 2026-04-25: a typical "first real concert" lands
    // around 14–16. >15yrs ago therefore implies 30+ but not necessarily
    // 50+. Spread weight across 30s/40s/50plus, peak slightly at 40s.
    onYes: [
      { dim: "ageBand", key: "30s", weight: 0.55 },
      { dim: "ageBand", key: "40s", weight: 0.55 },
      { dim: "ageBand", key: "50plus", weight: 0.4 },
    ],
    onNo: [
      { dim: "ageBand", key: "teen", weight: 0.45 },
      { dim: "ageBand", key: "20s", weight: 0.65 },
    ],
  },
  {
    id: "probe_in_school_now",
    title: "Are you currently a student of some kind?",
    answerLabels: ["No", "Sort of (online courses)", "Yes"],
    primaryDim: "workStatus",
    onYes: [
      { dim: "workStatus", key: "student", weight: 0.85 },
      { dim: "ageBand", key: "teen", weight: 0.4 },
      { dim: "ageBand", key: "20s", weight: 0.5 },
    ],
    onNo: [{ dim: "workStatus", key: "employed", weight: 0.5 }],
  },

  // ===== RELATIONSHIP STATUS (5) =====
  {
    id: "probe_anniversary",
    title: "Did you celebrate an anniversary with a partner this year?",
    answerLabels: ["No", "Kind of skipped it", "Yes"],
    primaryDim: "relationshipStatus",
    onYes: [
      { dim: "relationshipStatus", key: "married", weight: 0.55 },
      { dim: "relationshipStatus", key: "partnered", weight: 0.45 },
    ],
    onNo: [{ dim: "relationshipStatus", key: "single", weight: 0.6 }],
  },
  {
    id: "probe_wedding_ring",
    title: "Do you wear a wedding ring or equivalent most days?",
    answerLabels: ["No", "Sometimes", "Yes"],
    primaryDim: "relationshipStatus",
    onYes: [
      { dim: "relationshipStatus", key: "married", weight: 0.9 },
      { dim: "hasKids", key: "yes", weight: 0.2 },
    ],
    onNo: [
      { dim: "relationshipStatus", key: "single", weight: 0.4 },
      { dim: "relationshipStatus", key: "partnered", weight: 0.3 },
    ],
  },
  {
    id: "probe_ex_run_in",
    title: "Have you run into an ex unexpectedly this year?",
    answerLabels: ["No", "Almost did", "Yes"],
    primaryDim: "relationshipStatus",
    onYes: [
      { dim: "relationshipStatus", key: "single", weight: 0.45 },
      { dim: "relationshipStatus", key: "divorced", weight: 0.35 },
      { dim: "ageBand", key: "20s", weight: 0.3 },
      { dim: "ageBand", key: "30s", weight: 0.3 },
    ],
    onNo: [],
  },
  {
    id: "probe_split_dinner",
    title: "When you go out to dinner, do you usually split the bill with someone?",
    answerLabels: ["No, I cover or get covered", "Depends on who", "Yes, almost always"],
    primaryDim: "relationshipStatus",
    onYes: [
      { dim: "relationshipStatus", key: "single", weight: 0.4 },
      { dim: "relationshipStatus", key: "partnered", weight: 0.3 },
    ],
    onNo: [{ dim: "relationshipStatus", key: "married", weight: 0.4 }],
  },
  {
    id: "probe_first_dates",
    title: "Have you been on a first date with someone new in the last year?",
    answerLabels: ["No", "One that didn't really count", "Yes"],
    primaryDim: "relationshipStatus",
    onYes: [
      { dim: "relationshipStatus", key: "single", weight: 0.7 },
      { dim: "relationshipStatus", key: "divorced", weight: 0.3 },
    ],
    onNo: [
      { dim: "relationshipStatus", key: "married", weight: 0.55 },
      { dim: "relationshipStatus", key: "partnered", weight: 0.4 },
    ],
  },

  // ===== HAS KIDS (4) =====
  {
    id: "probe_homework_help",
    title: "Have you helped a child with homework this week?",
    answerLabels: ["No", "Just briefly", "Yes"],
    primaryDim: "hasKids",
    onYes: [
      { dim: "hasKids", key: "yes", weight: 0.9 },
      { dim: "ageBand", key: "30s", weight: 0.3 },
      { dim: "ageBand", key: "40s", weight: 0.4 },
    ],
    onNo: [{ dim: "hasKids", key: "no", weight: 0.4 }],
  },
  {
    id: "probe_kid_pickup",
    title: "Did you pick up a child from school or daycare this month?",
    answerLabels: ["No", "Maybe a niece/nephew", "Yes"],
    primaryDim: "hasKids",
    onYes: [
      { dim: "hasKids", key: "yes", weight: 0.85 },
      { dim: "ageBand", key: "30s", weight: 0.3 },
      { dim: "ageBand", key: "40s", weight: 0.3 },
    ],
    onNo: [{ dim: "hasKids", key: "no", weight: 0.45 }],
  },
  {
    id: "probe_kid_birthday",
    title: "Have you been to a kid's birthday party this year?",
    answerLabels: ["No", "A friend's kid", "Yes, my own kid's"],
    primaryDim: "hasKids",
    onYes: [
      { dim: "hasKids", key: "yes", weight: 0.7 },
      { dim: "ageBand", key: "30s", weight: 0.25 },
    ],
    onNo: [{ dim: "hasKids", key: "no", weight: 0.35 }],
  },
  {
    id: "probe_baby_shower",
    title: "Have you been to a baby shower this year?",
    answerLabels: ["No", "Just on Zoom", "Yes, in person"],
    primaryDim: "ageBand",
    onYes: [
      { dim: "ageBand", key: "20s", weight: 0.3 },
      { dim: "ageBand", key: "30s", weight: 0.5 },
      { dim: "ageBand", key: "40s", weight: 0.3 },
    ],
    onNo: [],
  },

  // ===== GEOGRAPHY (5) =====
  {
    id: "probe_walk_grocery",
    title: "Did you walk to a grocery store this week?",
    answerLabels: ["No", "Drove most of the way", "Yes"],
    primaryDim: "geographyType",
    onYes: [{ dim: "geographyType", key: "urban", weight: 0.75 }],
    onNo: [
      { dim: "geographyType", key: "suburban", weight: 0.5 },
      { dim: "geographyType", key: "rural", weight: 0.4 },
    ],
  },
  {
    id: "probe_drove_today",
    title: "Did you drive a car today?",
    answerLabels: ["No", "Just an errand", "Yes"],
    primaryDim: "geographyType",
    onYes: [
      { dim: "geographyType", key: "suburban", weight: 0.55 },
      { dim: "geographyType", key: "rural", weight: 0.5 },
    ],
    onNo: [{ dim: "geographyType", key: "urban", weight: 0.6 }],
  },
  {
    id: "probe_neighbor_name",
    title: "Do you know your immediate neighbor's first name?",
    answerLabels: ["No", "I know their face", "Yes"],
    primaryDim: "geographyType",
    onYes: [
      { dim: "geographyType", key: "suburban", weight: 0.5 },
      { dim: "geographyType", key: "rural", weight: 0.55 },
    ],
    onNo: [{ dim: "geographyType", key: "urban", weight: 0.55 }],
  },
  {
    id: "probe_subway_train",
    title: "Did you ride a subway, metro, or commuter train this week?",
    answerLabels: ["No", "Once or twice", "Yes, regularly"],
    primaryDim: "geographyType",
    onYes: [{ dim: "geographyType", key: "urban", weight: 0.85 }],
    onNo: [
      { dim: "geographyType", key: "suburban", weight: 0.45 },
      { dim: "geographyType", key: "rural", weight: 0.5 },
    ],
  },
  {
    id: "probe_yard",
    title: "Do you have a yard or outdoor space attached to where you live?",
    answerLabels: ["No", "A balcony", "Yes"],
    primaryDim: "geographyType",
    onYes: [
      { dim: "geographyType", key: "suburban", weight: 0.55 },
      { dim: "geographyType", key: "rural", weight: 0.5 },
    ],
    onNo: [{ dim: "geographyType", key: "urban", weight: 0.6 }],
  },

  // ===== WORK STATUS (5) =====
  {
    id: "probe_set_alarm",
    title: "Do you set a weekday alarm before 8am most weeks?",
    answerLabels: ["No", "Sometimes", "Yes"],
    primaryDim: "workStatus",
    onYes: [{ dim: "workStatus", key: "employed", weight: 0.55 }],
    onNo: [
      { dim: "workStatus", key: "freelance", weight: 0.4 },
      { dim: "workStatus", key: "retired", weight: 0.5 },
      { dim: "workStatus", key: "unemployed", weight: 0.4 },
    ],
  },
  {
    id: "probe_invoice",
    title: "Have you sent an invoice for your own work in the last month?",
    answerLabels: ["No", "Just a casual one", "Yes, a real one"],
    primaryDim: "workStatus",
    onYes: [{ dim: "workStatus", key: "freelance", weight: 0.85 }],
    onNo: [{ dim: "workStatus", key: "employed", weight: 0.4 }],
  },
  {
    id: "probe_office_meeting",
    title: "Have you been in a real-world (in-person) work meeting this month?",
    answerLabels: ["No", "Hybrid one", "Yes"],
    primaryDim: "workStatus",
    onYes: [{ dim: "workStatus", key: "employed", weight: 0.55 }],
    onNo: [
      { dim: "workStatus", key: "freelance", weight: 0.4 },
      { dim: "workStatus", key: "retired", weight: 0.4 },
      { dim: "workStatus", key: "student", weight: 0.3 },
    ],
  },
  {
    id: "probe_retired",
    title: "Are most of your weekday afternoons free?",
    answerLabels: ["No", "Some are", "Yes"],
    primaryDim: "workStatus",
    onYes: [
      { dim: "workStatus", key: "retired", weight: 0.6 },
      { dim: "workStatus", key: "freelance", weight: 0.4 },
      { dim: "ageBand", key: "50plus", weight: 0.3 },
    ],
    onNo: [{ dim: "workStatus", key: "employed", weight: 0.5 }],
  },
  {
    id: "probe_pay_rent",
    title: "Do you pay rent or a mortgage from your own income?",
    answerLabels: ["No", "Partly", "Yes"],
    primaryDim: "workStatus",
    onYes: [
      { dim: "workStatus", key: "employed", weight: 0.55 },
      { dim: "ageBand", key: "20s", weight: 0.2 },
      { dim: "ageBand", key: "30s", weight: 0.3 },
    ],
    onNo: [
      { dim: "workStatus", key: "student", weight: 0.5 },
      { dim: "ageBand", key: "teen", weight: 0.4 },
    ],
  },

  // ===== MISC (1, age-revealing) =====
  {
    id: "probe_priced_van",
    title: "Have you seriously priced out a sailboat, van, or RV?",
    answerLabels: ["No", "Just dreaming", "Yes, with a spreadsheet"],
    primaryDim: "ageBand",
    onYes: [
      { dim: "ageBand", key: "30s", weight: 0.4 },
      { dim: "ageBand", key: "40s", weight: 0.4 },
      { dim: "ageBand", key: "50plus", weight: 0.3 },
    ],
    onNo: [],
  },
];

// Convert a probe into the on-wire `Question` shape so it can be served
// in the same card stream as personality questions. The static-pool
// `optionTags` field carries `[negative, neutral, affirmative]`; we keep
// that contract. The `tags` field carries probe markers so dedup and
// scoring can identify these on the answer path.
export function probeToQuestion(probe: IndirectProbe): Question {
  return {
    id: probe.id,
    title: probe.title,
    answerType: "yes_no_maybe",
    options: probe.answerLabels.slice(),
    answerLabels: probe.answerLabels.slice(),
    superLikeEnabled: probe.superLikeEnabled === true,
    tags: ["probe", `probe:${probe.primaryDim}`],
    optionTags: ["negative", "neutral", "affirmative"],
  };
}

// Lookup by id — used by the fact-recording branch in UserProfileContext
// to apply probe scoring when `question.id` starts with "probe_".
const PROBE_BY_ID = new Map<string, IndirectProbe>();
for (const p of INDIRECT_PROBES) PROBE_BY_ID.set(p.id, p);
export function getProbeById(id: string): IndirectProbe | undefined {
  return PROBE_BY_ID.get(id);
}

export function isProbeId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith("probe_");
}

const ALL_DIMS: Array<keyof DemographicState> = [
  "gender",
  "ageBand",
  "relationshipStatus",
  "hasKids",
  "geographyType",
  "workStatus",
];

// Pick `count` probes that target the highest-entropy dims in the user's
// current DemographicState, dedupe against questions they've already seen
// (by id and by normalized text), and return them as ready-to-serve
// Questions. Used by both the static and dynamic batch builders to
// interleave probes alongside personality questions.
//
// Two-tier selection:
//   1. ROUND-ROBIN COVERAGE — until every demographic dim has been
//      probed at least once, restrict candidates to dims the user has
//      never been asked about. Without this, when DemographicState is
//      uniform across all dims (a brand-new user), random jitter alone
//      decides which dims get touched — and starvation is real (in our
//      Katherine eval, gender / hasKids / geography never got probed
//      across 40 cards because work/age won the early tiebreakers).
//   2. ENTROPY-WEIGHTED — once all 6 dims have been touched, pick from
//      the highest-entropy remaining dim (i.e. the one we're still most
//      uncertain about).
export function selectProbesForBatch(
  userProfile: UserProfile,
  count: number,
  seenIds: ReadonlySet<string>,
  seenTexts: ReadonlySet<string>
): Question[] {
  if (count <= 0) return [];

  const state = userProfile.demographicState ?? emptyDemographicState();
  // Entropy per dim — higher means we need more signal there.
  const entropy: Record<keyof DemographicState, number> = {
    gender: dimEntropy(state, "gender"),
    ageBand: dimEntropy(state, "ageBand"),
    relationshipStatus: dimEntropy(state, "relationshipStatus"),
    hasKids: dimEntropy(state, "hasKids"),
    geographyType: dimEntropy(state, "geographyType"),
    workStatus: dimEntropy(state, "workStatus"),
  };

  // Which dims has the user already been asked about (any probe in that
  // dim is in seenIds)? Derived from the probe registry, so we don't
  // need any extra plumbing.
  const probedDims = new Set<keyof DemographicState>();
  for (const probe of INDIRECT_PROBES) {
    if (seenIds.has(probe.id)) probedDims.add(probe.primaryDim);
  }
  const unprobedDims = ALL_DIMS.filter((d) => !probedDims.has(d));

  // Round-robin tier: only consider probes targeting unprobed dims.
  // Falls through to full pool if we've already covered everything.
  const tierOnePool =
    unprobedDims.length > 0
      ? INDIRECT_PROBES.filter((p) => unprobedDims.includes(p.primaryDim))
      : INDIRECT_PROBES;

  const scoreProbes = (
    pool: readonly IndirectProbe[]
  ): Array<{ probe: IndirectProbe; score: number }> => {
    const out: Array<{ probe: IndirectProbe; score: number }> = [];
    for (const probe of pool) {
      if (seenIds.has(probe.id)) continue;
      if (seenTexts.has(normalizeQuestionText(probe.title))) continue;
      const jitter = Math.random() * 0.1;
      // Gender-first priority: while gender is still unprobed, give
      // gender probes a fixed score boost so they win the first slot.
      // Pronouns are the highest-impact UX decision in the report —
      // one strong gender probe (pregnant / catcalled / men's room)
      // crosses the 0.70 confidence threshold in a single answer, so
      // landing one early avoids 2-3 batches of gender-neutral
      // portraits. Boost decays to 0 as soon as gender has been probed.
      const isGenderProbe = probe.primaryDim === "gender";
      const genderUnprobed = unprobedDims.includes("gender");
      const genderBoost = isGenderProbe && genderUnprobed ? 1.0 : 0;
      out.push({
        probe,
        score: entropy[probe.primaryDim] + jitter + genderBoost,
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  };

  let scored = scoreProbes(tierOnePool);

  // If round-robin pool is too thin to fill `count` slots (e.g. all
  // unprobed-dim probes have been seen already, or text-dedup ate them),
  // fall back to the full pool so we never under-fill a batch.
  if (scored.length < count && tierOnePool !== INDIRECT_PROBES) {
    const usedIds = new Set(scored.map((s) => s.probe.id));
    const fallback = scoreProbes(
      INDIRECT_PROBES.filter((p) => !usedIds.has(p.id))
    );
    scored = scored.concat(fallback);
  }

  // Pick the top `count`, but avoid two probes targeting the same dim
  // back-to-back unless we run out of options — keeps probes feeling
  // varied rather than "the engine just asked me four gender questions".
  const picked: IndirectProbe[] = [];
  const usedDims = new Set<keyof DemographicState>();
  for (const { probe } of scored) {
    if (picked.length >= count) break;
    if (usedDims.has(probe.primaryDim)) continue;
    picked.push(probe);
    usedDims.add(probe.primaryDim);
  }
  // Fill any remaining slots from the leftover ranked list (allow dim
  // repeats once we've covered as many distinct dims as we can).
  if (picked.length < count) {
    for (const { probe } of scored) {
      if (picked.length >= count) break;
      if (picked.includes(probe)) continue;
      picked.push(probe);
    }
  }

  return picked.map(probeToQuestion);
}

// Fisher-Yates shuffle a copy. Used to interleave probes randomly into
// the personality-card list rather than always landing them at the end.
export function shuffleCards<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
