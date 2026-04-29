/**
 * Persona convergence test.
 *
 * What this does
 * --------------
 * Spins up a fixed persona (Katherine — concrete bio + behavioral facts),
 * uses Claude to roleplay her answers, and drives our engine through a
 * 30–40 swipe session. After every batch we snapshot what the engine
 * "knows" about her vs the ground truth and print a markdown convergence
 * report at the end.
 *
 * What it tells us
 * ----------------
 * - How many swipes before pronouns flip from they/them → she/her.
 * - Whether DemographicState dims actually move toward truth.
 * - When (if ever) the engine's MBTI / Enneagram prediction stabilizes.
 * - Whether the "predictions" array contains persona-consistent claims
 *   or stereotype-driven misses.
 * - Which dims the engine NEVER probes (unprobed = unknown territory).
 *
 * How to run
 * ----------
 *   1. `npm run dev` in another terminal (port 3001).
 *   2. `node --env-file=.env.local scripts/persona-test.mjs`
 *
 * Cost note: ~50 Claude calls per run (40 answers + 4 reports + a few
 * dynamic batches). Fine for an eval; don't loop in CI.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Manual dotenv parse — matches test-web-search.mjs. Node's --env-file
// behaves inconsistently for keys with `=` in their values.
for (const fname of [".env.local", ".env"]) {
  const p = join(root, fname);
  if (!existsSync(p)) continue;
  const env = readFileSync(p, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    if (process.env[k]) continue; // don't clobber inherited
    process.env[k] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const BASE_URL = process.env.PERSONA_BASE_URL || "http://localhost:3001";
const ANSWER_MODEL = "claude-sonnet-4-6";
const TARGET_SWIPES = 40;
const REPORT_EVERY = 10;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY missing in .env or .env.local");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ───────────────────────────────────────────────────────────────────────
// Ground truth — Katherine
// ───────────────────────────────────────────────────────────────────────
const KATHERINE = {
  name: "Katherine",
  bio: `
Katherine is 32. She lives in Park Slope, Brooklyn with her husband Tom (married four
years, owned the apartment for 18 months) and their three-year-old daughter Mia.
There's a rescue dog, Pepper, a six-year-old mutt. Katherine grew up in rural Vermont
and moved to NYC at 24. She freelances as a graphic designer for indie publishers,
mostly book covers — she has the kind of work that fills the morning hours while Mia
is at preschool.

She reads literary fiction (Marilynne Robinson, Ali Smith, Jenny Offill), keeps a
bullet journal she returns to in waves, and walks to the food co-op almost daily,
tote bag in hand. She doesn't drive much — has a license, used it twice this year.
She doesn't really drink anymore, though she used to in her early twenties. She's
done therapy on and off; quietly anxious but functional. Politically progressive,
keeps it off social media. Doesn't carry a purse; tote bag with everything in it.

Personality: INFP / Enneagram 4w5 / mostly secure attachment with anxious notes.
She'd rather have three deep friends than thirty acquaintances. She's been pregnant.
She's been catcalled walking somewhere this year. She helped Mia with a counting
worksheet this week. She wears her wedding ring most days. She has not used a
public men's restroom in the last week. She remembers a world before smartphones —
got her first one at 17. She has not seriously priced out a sailboat or van.
`.trim(),
  // Ground-truth labels (what the engine SHOULD eventually report).
  truth: {
    gender: "female",
    ageBand: "30s",
    relationshipStatus: "married",
    hasKids: "yes",
    geographyType: "urban",
    workStatus: "freelance",
    mbti: "INFP",
    enneagramType: 4,
  },
};

const PERSONA_SYSTEM_PROMPT = `You are roleplaying Katherine. Stay in character. Below are her fixed facts — never contradict them. For every question, choose the label that Katherine would honestly pick. If the question is ambiguous for her, pick the label that's *most* consistent with the bio. Output STRICT JSON ONLY: {"label_index": <integer>, "reasoning": "<one short sentence in Katherine's voice>"}.

KATHERINE'S BIO:
${KATHERINE.bio}

When the question doesn't directly map to a bio fact, infer from her values, age, life stage, and the things she would notice. Stay conservative — if she'd genuinely say "maybe" / "sometimes", pick the middle option for 3-button questions.`;

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

async function answerAsKatherine(question, labels) {
  const labelList = labels
    .map((l, i) => `  ${i}: "${l}"`)
    .join("\n");
  const userMsg = `QUESTION: ${question}\n\nLABELS (pick the index Katherine would choose):\n${labelList}`;

  const res = await anthropic.messages.create({
    model: ANSWER_MODEL,
    max_tokens: 200,
    temperature: 0.4,
    system: PERSONA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = res.content.find((c) => c.type === "text")?.text ?? "";
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const json = fence ? fence[1].trim() : text.trim();
  const parsed = JSON.parse(json);
  const idx = Math.max(0, Math.min(labels.length - 1, parsed.label_index));
  return { idx, reasoning: parsed.reasoning, label: labels[idx] };
}

async function postJson(path, body, timeoutMs = 90_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) {
      throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ───────────────────────────────────────────────────────────────────────
// Local DemographicState scorer — mirrors lib/demographicState.ts so the
// harness accumulates state between batches the same way UserProfileContext
// does in the browser. Without this, every batch sees uniform entropy and
// the round-robin selector + entropy-weighted fallback both run blind.
// ───────────────────────────────────────────────────────────────────────

function emptyDemo() {
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

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function normalizeBag(bag) {
  const keys = Object.keys(bag);
  let sum = 0;
  for (const k of keys) sum += bag[k];
  if (sum <= 0) {
    const u = 1 / keys.length;
    const out = {};
    for (const k of keys) out[k] = u;
    return out;
  }
  const out = {};
  for (const k of keys) out[k] = bag[k] / sum;
  return out;
}

function applyImplication(state, imp) {
  const bag = state[imp.dim];
  if (!bag || !(imp.key in bag)) return;
  const w = imp.weight;
  if (w === 0) return;
  const others = Object.keys(bag).filter((k) => k !== imp.key);
  if (others.length === 0) return;

  const delta = w >= 0 ? w * (1 - bag[imp.key]) : w * bag[imp.key];
  bag[imp.key] = clamp01(bag[imp.key] + delta);

  const othersTotal = others.reduce((s, k) => s + bag[k], 0);
  if (othersTotal <= 0) {
    const slice = -delta / others.length;
    for (const k of others) bag[k] = clamp01(bag[k] + slice);
  } else {
    for (const k of others) {
      const share = bag[k] / othersTotal;
      bag[k] = clamp01(bag[k] - delta * share);
    }
  }
  const renorm = normalizeBag(bag);
  for (const k of Object.keys(bag)) bag[k] = renorm[k];
}

function applyProbe(state, probe, sentiment) {
  const next = JSON.parse(JSON.stringify(state));
  const fullStrength = sentiment === "neutral" ? 0.5 : 1;
  if (sentiment === "affirmative" || sentiment === "neutral") {
    for (const imp of probe.onYes) {
      applyImplication(next, { ...imp, weight: imp.weight * fullStrength });
    }
  }
  if (sentiment === "non-affirmative" || sentiment === "neutral") {
    for (const imp of probe.onNo) {
      applyImplication(next, { ...imp, weight: imp.weight * fullStrength });
    }
  }
  return next;
}

// Pulled from lib/indirectProbes.ts. Kept inline so the harness can
// score probes without a TS-runner dep. If you add new probes, update
// here too — or refactor to a shared JSON manifest.
const PROBE_TABLE = {
  probe_beard: { primaryDim: "gender", onYes: [{ dim: "gender", key: "male", weight: 0.9 }], onNo: [{ dim: "gender", key: "female", weight: 0.4 }] },
  probe_pregnant: { primaryDim: "gender", onYes: [{ dim: "gender", key: "female", weight: 0.99 }, { dim: "ageBand", key: "20s", weight: 0.2 }, { dim: "ageBand", key: "30s", weight: 0.2 }], onNo: [{ dim: "gender", key: "male", weight: 0.5 }] },
  probe_catcalled: { primaryDim: "gender", onYes: [{ dim: "gender", key: "female", weight: 0.85 }], onNo: [{ dim: "gender", key: "male", weight: 0.4 }] },
  probe_purse: { primaryDim: "gender", onYes: [{ dim: "gender", key: "female", weight: 0.7 }], onNo: [{ dim: "gender", key: "male", weight: 0.5 }] },
  probe_mens_room: { primaryDim: "gender", onYes: [{ dim: "gender", key: "male", weight: 0.95 }], onNo: [{ dim: "gender", key: "female", weight: 0.6 }] },
  probe_pre_internet: { primaryDim: "ageBand", onYes: [{ dim: "ageBand", key: "30s", weight: 0.55 }, { dim: "ageBand", key: "40s", weight: 0.55 }, { dim: "ageBand", key: "50plus", weight: 0.4 }], onNo: [{ dim: "ageBand", key: "teen", weight: 0.5 }, { dim: "ageBand", key: "20s", weight: 0.7 }] },
  probe_911_school: { primaryDim: "ageBand", onYes: [{ dim: "ageBand", key: "30s", weight: 0.55 }, { dim: "ageBand", key: "40s", weight: 0.7 }, { dim: "ageBand", key: "50plus", weight: 0.7 }], onNo: [{ dim: "ageBand", key: "teen", weight: 0.5 }, { dim: "ageBand", key: "20s", weight: 0.65 }] },
  probe_dating_app: { primaryDim: "ageBand", onYes: [{ dim: "ageBand", key: "20s", weight: 0.6 }, { dim: "ageBand", key: "30s", weight: 0.5 }, { dim: "relationshipStatus", key: "single", weight: 0.7 }], onNo: [{ dim: "relationshipStatus", key: "married", weight: 0.4 }, { dim: "relationshipStatus", key: "partnered", weight: 0.3 }] },
  probe_first_concert_ago: { primaryDim: "ageBand", onYes: [{ dim: "ageBand", key: "30s", weight: 0.55 }, { dim: "ageBand", key: "40s", weight: 0.55 }, { dim: "ageBand", key: "50plus", weight: 0.4 }], onNo: [{ dim: "ageBand", key: "teen", weight: 0.45 }, { dim: "ageBand", key: "20s", weight: 0.65 }] },
  probe_in_school_now: { primaryDim: "workStatus", onYes: [{ dim: "workStatus", key: "student", weight: 0.85 }, { dim: "ageBand", key: "teen", weight: 0.4 }, { dim: "ageBand", key: "20s", weight: 0.5 }], onNo: [{ dim: "workStatus", key: "employed", weight: 0.5 }] },
  probe_anniversary: { primaryDim: "relationshipStatus", onYes: [{ dim: "relationshipStatus", key: "married", weight: 0.55 }, { dim: "relationshipStatus", key: "partnered", weight: 0.45 }], onNo: [{ dim: "relationshipStatus", key: "single", weight: 0.6 }] },
  probe_wedding_ring: { primaryDim: "relationshipStatus", onYes: [{ dim: "relationshipStatus", key: "married", weight: 0.9 }, { dim: "hasKids", key: "yes", weight: 0.2 }], onNo: [{ dim: "relationshipStatus", key: "single", weight: 0.4 }, { dim: "relationshipStatus", key: "partnered", weight: 0.3 }] },
  probe_ex_run_in: { primaryDim: "relationshipStatus", onYes: [{ dim: "relationshipStatus", key: "single", weight: 0.45 }, { dim: "relationshipStatus", key: "divorced", weight: 0.35 }, { dim: "ageBand", key: "20s", weight: 0.3 }, { dim: "ageBand", key: "30s", weight: 0.3 }], onNo: [] },
  probe_split_dinner: { primaryDim: "relationshipStatus", onYes: [{ dim: "relationshipStatus", key: "single", weight: 0.4 }, { dim: "relationshipStatus", key: "partnered", weight: 0.3 }], onNo: [{ dim: "relationshipStatus", key: "married", weight: 0.4 }] },
  probe_first_dates: { primaryDim: "relationshipStatus", onYes: [{ dim: "relationshipStatus", key: "single", weight: 0.7 }, { dim: "relationshipStatus", key: "divorced", weight: 0.3 }], onNo: [{ dim: "relationshipStatus", key: "married", weight: 0.55 }, { dim: "relationshipStatus", key: "partnered", weight: 0.4 }] },
  probe_homework_help: { primaryDim: "hasKids", onYes: [{ dim: "hasKids", key: "yes", weight: 0.9 }, { dim: "ageBand", key: "30s", weight: 0.3 }, { dim: "ageBand", key: "40s", weight: 0.4 }], onNo: [{ dim: "hasKids", key: "no", weight: 0.4 }] },
  probe_kid_pickup: { primaryDim: "hasKids", onYes: [{ dim: "hasKids", key: "yes", weight: 0.85 }, { dim: "ageBand", key: "30s", weight: 0.3 }, { dim: "ageBand", key: "40s", weight: 0.3 }], onNo: [{ dim: "hasKids", key: "no", weight: 0.45 }] },
  probe_kid_birthday: { primaryDim: "hasKids", onYes: [{ dim: "hasKids", key: "yes", weight: 0.7 }, { dim: "ageBand", key: "30s", weight: 0.25 }], onNo: [{ dim: "hasKids", key: "no", weight: 0.35 }] },
  probe_baby_shower: { primaryDim: "ageBand", onYes: [{ dim: "ageBand", key: "20s", weight: 0.3 }, { dim: "ageBand", key: "30s", weight: 0.5 }, { dim: "ageBand", key: "40s", weight: 0.3 }], onNo: [] },
  probe_walk_grocery: { primaryDim: "geographyType", onYes: [{ dim: "geographyType", key: "urban", weight: 0.75 }], onNo: [{ dim: "geographyType", key: "suburban", weight: 0.5 }, { dim: "geographyType", key: "rural", weight: 0.4 }] },
  probe_drove_today: { primaryDim: "geographyType", onYes: [{ dim: "geographyType", key: "suburban", weight: 0.55 }, { dim: "geographyType", key: "rural", weight: 0.5 }], onNo: [{ dim: "geographyType", key: "urban", weight: 0.6 }] },
  probe_neighbor_name: { primaryDim: "geographyType", onYes: [{ dim: "geographyType", key: "suburban", weight: 0.5 }, { dim: "geographyType", key: "rural", weight: 0.55 }], onNo: [{ dim: "geographyType", key: "urban", weight: 0.55 }] },
  probe_subway_train: { primaryDim: "geographyType", onYes: [{ dim: "geographyType", key: "urban", weight: 0.85 }], onNo: [{ dim: "geographyType", key: "suburban", weight: 0.45 }, { dim: "geographyType", key: "rural", weight: 0.5 }] },
  probe_yard: { primaryDim: "geographyType", onYes: [{ dim: "geographyType", key: "suburban", weight: 0.55 }, { dim: "geographyType", key: "rural", weight: 0.5 }], onNo: [{ dim: "geographyType", key: "urban", weight: 0.6 }] },
  probe_set_alarm: { primaryDim: "workStatus", onYes: [{ dim: "workStatus", key: "employed", weight: 0.55 }], onNo: [{ dim: "workStatus", key: "freelance", weight: 0.4 }, { dim: "workStatus", key: "retired", weight: 0.5 }, { dim: "workStatus", key: "unemployed", weight: 0.4 }] },
  probe_invoice: { primaryDim: "workStatus", onYes: [{ dim: "workStatus", key: "freelance", weight: 0.85 }], onNo: [{ dim: "workStatus", key: "employed", weight: 0.4 }] },
  probe_office_meeting: { primaryDim: "workStatus", onYes: [{ dim: "workStatus", key: "employed", weight: 0.55 }], onNo: [{ dim: "workStatus", key: "freelance", weight: 0.4 }, { dim: "workStatus", key: "retired", weight: 0.4 }, { dim: "workStatus", key: "student", weight: 0.3 }] },
  probe_retired: { primaryDim: "workStatus", onYes: [{ dim: "workStatus", key: "retired", weight: 0.6 }, { dim: "workStatus", key: "freelance", weight: 0.4 }, { dim: "ageBand", key: "50plus", weight: 0.3 }], onNo: [{ dim: "workStatus", key: "employed", weight: 0.5 }] },
  probe_pay_rent: { primaryDim: "workStatus", onYes: [{ dim: "workStatus", key: "employed", weight: 0.55 }, { dim: "ageBand", key: "20s", weight: 0.2 }, { dim: "ageBand", key: "30s", weight: 0.3 }], onNo: [{ dim: "workStatus", key: "student", weight: 0.5 }, { dim: "ageBand", key: "teen", weight: 0.4 }] },
  probe_priced_van: { primaryDim: "ageBand", onYes: [{ dim: "ageBand", key: "30s", weight: 0.4 }, { dim: "ageBand", key: "40s", weight: 0.4 }, { dim: "ageBand", key: "50plus", weight: 0.3 }], onNo: [] },
  probe_grandkid: { primaryDim: "ageBand", onYes: [{ dim: "ageBand", key: "40s", weight: 0.4 }, { dim: "ageBand", key: "50plus", weight: 0.85 }], onNo: [] },
  probe_misgendered_recent: { primaryDim: "gender", onYes: [{ dim: "gender", key: "nonbinary", weight: 0.6 }], onNo: [] },
  probe_pronoun_correction: { primaryDim: "gender", onYes: [{ dim: "gender", key: "nonbinary", weight: 0.7 }], onNo: [] },
};

// ───────────────────────────────────────────────────────────────────────
// Local ProbabilityState scorer for MBTI probes — mirrors
// applyMBTIProbeAnswer in lib/probabilityState.ts so the harness's
// /api/summary calls receive a populated FRAMEWORK STATE just like
// browser sessions do.
// ───────────────────────────────────────────────────────────────────────

function emptyProbState() {
  return {
    mbti: { I: 0.5, E: 0.5, N: 0.5, S: 0.5, T: 0.5, F: 0.5, J: 0.5, P: 0.5 },
    enneagram: { 1: 1/9, 2: 1/9, 3: 1/9, 4: 1/9, 5: 1/9, 6: 1/9, 7: 1/9, 8: 1/9, 9: 1/9 },
    disc: { D: 0.25, I: 0.25, S: 0.25, C: 0.25 },
    bigFive: { O: 0.5, C: 0.5, E: 0.5, A: 0.5, N: 0.5 },
    attachment: { secure: 0.25, anxious: 0.25, avoidant: 0.25, disorganized: 0.25 },
  };
}

const MBTI_AXES_LOCAL = {
  I: ["I", "E"], E: ["E", "I"], N: ["N", "S"], S: ["S", "N"],
  T: ["T", "F"], F: ["F", "T"], J: ["J", "P"], P: ["P", "J"],
};

function normBag(bag) {
  const keys = Object.keys(bag);
  let sum = 0;
  for (const k of keys) sum += bag[k];
  if (sum <= 0) {
    const u = 1 / keys.length;
    const out = {};
    for (const k of keys) out[k] = u;
    return out;
  }
  const out = {};
  for (const k of keys) out[k] = bag[k] / sum;
  return out;
}

function applyWeightedImp(state, tag, weight) {
  if (weight <= 0) return;
  const [rawF, rawC] = tag.split(":");
  if (!rawF || !rawC) return;
  const f = rawF.toLowerCase();
  const code = rawC.trim();
  if (f === "mbti") {
    const upper = code.toUpperCase();
    const axis = MBTI_AXES_LOCAL[upper];
    if (!axis) return;
    const [pos, neg] = axis;
    const current = state.mbti[pos];
    const delta = weight * (1 - current);
    state.mbti[pos] = clamp01(current + delta);
    state.mbti[neg] = clamp01(state.mbti[neg] - delta);
    return;
  }
  if (f === "bigfive") {
    const upper = code.toUpperCase();
    if (state.bigFive[upper] !== undefined) {
      const current = state.bigFive[upper];
      const delta = weight * (1 - current);
      state.bigFive[upper] = clamp01(current + delta);
    }
    return;
  }
}

function applyMBTIProbe(state, probe, sentiment) {
  const next = JSON.parse(JSON.stringify(state));
  const half = sentiment === "neutral" ? 0.5 : 1;
  if (sentiment === "affirmative" || sentiment === "neutral") {
    for (const imp of probe.onYes) applyWeightedImp(next, imp.tag, imp.weight * half);
  }
  if (sentiment === "non-affirmative" || sentiment === "neutral") {
    for (const imp of probe.onNo) applyWeightedImp(next, imp.tag, imp.weight * half);
  }
  return next;
}

// MBTI probe registry — must mirror lib/personalityProbes.ts. Same
// maintenance-debt caveat as PROBE_TABLE.
const MBTI_PROBE_TABLE = {
  mbtiprobe_small_talk_tiring: { onYes: [{ tag: "mbti:I", weight: 0.6 }], onNo: [{ tag: "mbti:E", weight: 0.5 }] },
  mbtiprobe_party_energy: { onYes: [{ tag: "mbti:E", weight: 0.6 }], onNo: [{ tag: "mbti:I", weight: 0.6 }] },
  mbtiprobe_solo_recharge: { onYes: [{ tag: "mbti:I", weight: 0.55 }], onNo: [{ tag: "mbti:E", weight: 0.4 }] },
  mbtiprobe_speak_up_first: { onYes: [{ tag: "mbti:E", weight: 0.55 }], onNo: [{ tag: "mbti:I", weight: 0.5 }] },
  mbtiprobe_reread_for_wording: { onYes: [{ tag: "mbti:N", weight: 0.65 }, { tag: "mbti:I", weight: 0.2 }], onNo: [{ tag: "mbti:S", weight: 0.4 }] },
  mbtiprobe_imagined_paths: { onYes: [{ tag: "mbti:N", weight: 0.65 }, { tag: "mbti:P", weight: 0.25 }], onNo: [{ tag: "mbti:S", weight: 0.5 }] },
  mbtiprobe_metaphor_first: { onYes: [{ tag: "mbti:N", weight: 0.6 }], onNo: [{ tag: "mbti:S", weight: 0.55 }] },
  mbtiprobe_concrete_steps: { onYes: [{ tag: "mbti:S", weight: 0.55 }], onNo: [{ tag: "mbti:N", weight: 0.5 }] },
  mbtiprobe_friend_upset_focus: { onYes: [{ tag: "mbti:F", weight: 0.6 }], onNo: [{ tag: "mbti:T", weight: 0.55 }] },
  mbtiprobe_decide_by_feeling: { onYes: [{ tag: "mbti:F", weight: 0.6 }], onNo: [{ tag: "mbti:T", weight: 0.55 }] },
  mbtiprobe_critical_objective: { onYes: [{ tag: "mbti:T", weight: 0.5 }], onNo: [{ tag: "mbti:F", weight: 0.45 }] },
  mbtiprobe_value_harmony: { onYes: [{ tag: "mbti:F", weight: 0.55 }], onNo: [{ tag: "mbti:T", weight: 0.5 }] },
  mbtiprobe_plan_before_starting: { onYes: [{ tag: "mbti:J", weight: 0.55 }], onNo: [{ tag: "mbti:P", weight: 0.6 }] },
  mbtiprobe_close_decisions_quickly: { onYes: [{ tag: "mbti:J", weight: 0.6 }], onNo: [{ tag: "mbti:P", weight: 0.55 }] },
  mbtiprobe_change_plans_late: { onYes: [{ tag: "mbti:P", weight: 0.55 }], onNo: [{ tag: "mbti:J", weight: 0.55 }] },
  mbtiprobe_keep_options_open: { onYes: [{ tag: "mbti:P", weight: 0.6 }, { tag: "mbti:N", weight: 0.2 }], onNo: [{ tag: "mbti:J", weight: 0.55 }] },
};

function deriveSentiment(question, idx) {
  const labels = question.answerLabels ?? [];
  if (question.answerType === "yes_no_maybe") {
    if (idx === 1) return "neutral";
    if (idx === labels.length - 1) return "affirmative";
    return "non-affirmative";
  }
  // yes_no: rely on optionTags, fall back to position
  const tag = question.optionTags?.[idx];
  if (tag === "affirmative") return "affirmative";
  if (tag === "negative") return "non-affirmative";
  return idx === labels.length - 1 ? "affirmative" : "non-affirmative";
}

function fmt(n) {
  return typeof n === "number" ? n.toFixed(2) : String(n);
}

function topOf(bag) {
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

// ───────────────────────────────────────────────────────────────────────
// Main loop
// ───────────────────────────────────────────────────────────────────────

async function run() {
  // Synthetic profile that mirrors what UserProfileContext would build —
  // we hand this to /api/generate and /api/summary unchanged. The server
  // computes scoring (probabilityState/demographicState) on its own only
  // for prompt construction; we maintain ours via the live route logic
  // by submitting facts back for the next batch.
  const profile = {
    facts: [],
    likes: [],
    skippedIds: [],
    reports: [],
    // Start with empty demographic priors. We update this LOCALLY after
    // every probe answer, mirroring what UserProfileContext.addFact does
    // in the browser. Without this, every batch sees uniform entropy and
    // the engine's selector + synthesis prompt both run blind to prior
    // probe signal — which is what the first Katherine run hit.
    demographicState: emptyDemo(),
    probabilityState: emptyProbState(),
  };

  const transcript = [];
  const reports = [];

  // First two batches static (cards 0-19), batch 3 (20-29) dynamic
  // — informs the first report at CHUNK_SIZE=30. After that, batches
  // alternate dynamic ↔ static per BATCH_SIZE-card window. Mirrors
  // sourceForAnsweredCount in lib/questionSequencer.ts.
  let batchNum = 1;
  while (profile.facts.length < TARGET_SWIPES) {
    const answered = profile.facts.length;
    const source =
      answered < 20
        ? "static"
        : Math.floor(answered / 10) % 2 === 0
          ? "dynamic"
          : "static";

    const batch = await postJson(
      "/api/generate",
      {
        userProfile: profile,
        batchSize: REPORT_EVERY,
        mode: "ask",
        source,
      },
      90_000
    );

    console.log(
      `\n━━━ Batch ${batchNum} (source=${batch.source}, ${batch.cards.length} cards, total facts=${profile.facts.length}) ━━━`
    );

    for (const card of batch.cards) {
      if (profile.facts.length >= TARGET_SWIPES) break;
      const q = card.content;
      const ans = await answerAsKatherine(q.title, q.answerLabels);
      const sentiment = deriveSentiment(q, ans.idx);
      const isProbe = q.id?.startsWith("probe_");
      const isMBTIProbe = q.id?.startsWith("mbtiprobe_");

      const fact = {
        questionId: q.id,
        question: q.title,
        answer: ans.label,
        positive: sentiment === "affirmative",
        sentiment,
        timestamp: Date.now(),
        answerIndex: ans.idx,
      };
      profile.facts.push(fact);

      // If this was a probe, score it locally so the next batch's
      // /api/generate call sees an updated demographicState — mirrors
      // the browser's UserProfileContext behavior exactly. MBTI probes
      // route to applyMBTIProbe → probabilityState, demographic probes
      // route to applyProbe → demographicState.
      if (q.id?.startsWith("mbtiprobe_")) {
        const mbtiProbe = MBTI_PROBE_TABLE[q.id];
        if (mbtiProbe) {
          profile.probabilityState = applyMBTIProbe(
            profile.probabilityState,
            mbtiProbe,
            sentiment
          );
        }
      } else if (isProbe) {
        const probe = PROBE_TABLE[q.id];
        if (probe) {
          profile.demographicState = applyProbe(
            profile.demographicState,
            probe,
            sentiment
          );
        }
      }
      transcript.push({
        batch: batchNum,
        n: profile.facts.length,
        type: isProbe ? "PROBE" : "    ",
        q: q.title,
        a: ans.label,
        sentiment,
        reasoning: ans.reasoning,
      });

      const tag = isProbe ? "[probe] " : isMBTIProbe ? "[mbti]  " : "        ";
      console.log(
        `  ${profile.facts.length.toString().padStart(2)}. ${tag}${q.title.slice(0, 80)}`
      );
      console.log(
        `      → ${ans.label} (${sentiment}) — "${ans.reasoning.slice(0, 90)}"`
      );
    }

    // Report at every milestone
    if (profile.facts.length % REPORT_EVERY === 0 && profile.facts.length >= 10) {
      console.log(
        `\n  Asking /api/summary?mode=full at ${profile.facts.length} facts…`
      );
      const report = await postJson(
        "/api/summary",
        { userProfile: profile, mode: "full" },
        90_000
      );
      reports.push({ atFacts: profile.facts.length, ...report });

      const text = `${report.portrait ?? ""}\n${report.summary ?? ""}`;
      console.log(`  → portrait pronouns: ${pronounsUsed(text)}`);
      console.log(
        `  → mbti: ${report.profile?.mbti?.type ?? "?"} (${fmt(report.profile?.mbti?.confidence)})`
      );
      console.log(
        `  → ageRange: ${report.profile?.ageRange ?? "?"}`
      );
      const demo = profile.demographicState;
      const probState = profile.probabilityState;
      const top = (b) => {
        const e = Object.entries(b).sort((a, b) => b[1] - a[1])[0];
        return `${e[0]} ${fmt(e[1])}`;
      };
      console.log(
        `  → demoState top: gender=${top(demo.gender)} | age=${top(demo.ageBand)} | rel=${top(demo.relationshipStatus)} | kids=${top(demo.hasKids)} | geo=${top(demo.geographyType)} | work=${top(demo.workStatus)}`
      );
      const m = probState.mbti;
      const ie = m.I >= m.E ? `I ${fmt(m.I)}` : `E ${fmt(m.E)}`;
      const ns = m.N >= m.S ? `N ${fmt(m.N)}` : `S ${fmt(m.S)}`;
      const tf = m.T >= m.F ? `T ${fmt(m.T)}` : `F ${fmt(m.F)}`;
      const jp = m.J >= m.P ? `J ${fmt(m.J)}` : `P ${fmt(m.P)}`;
      console.log(`  → MBTI state: ${ie} · ${ns} · ${tf} · ${jp}`);
      console.log(
        `  → predictions:\n${(report.predictions ?? []).map((p) => "      • " + p).join("\n")}`
      );
    }

    batchNum++;
    if (batchNum > 8) break; // safety
  }

  return { profile, transcript, reports };
}

function pronounsUsed(text) {
  const she = /\b(she|her|hers|herself)\b/i.test(text);
  const he = /\b(he|him|his|himself)\b/i.test(text);
  const they = /\b(they|them|their|theirs|themself|themselves)\b/i.test(text);
  const you = /\byou\b/i.test(text);
  const tags = [];
  if (she) tags.push("she/her");
  if (he) tags.push("he/him");
  if (they) tags.push("they/them");
  if (you) tags.push("you");
  return tags.length ? tags.join(" + ") : "none detected";
}

// ───────────────────────────────────────────────────────────────────────
// Final markdown report
// ───────────────────────────────────────────────────────────────────────

function findings({ transcript, reports }) {
  const probesAnswered = transcript.filter((t) => t.type === "PROBE");
  const probeIds = new Set(probesAnswered.map((p) => p.q));
  const probeCount = probeIds.size;

  // When did pronouns flip to she/her?
  let firstSheReport = null;
  for (const r of reports) {
    const text = `${r.portrait ?? ""}\n${r.summary ?? ""}`;
    if (/\b(she|her|hers)\b/i.test(text)) {
      firstSheReport = r.atFacts;
      break;
    }
  }

  // MBTI stability — first report whose MBTI matches truth, and whether
  // it stays stable in subsequent reports.
  const mbtiByReport = reports.map((r) => ({
    n: r.atFacts,
    mbti: r.profile?.mbti?.type ?? "?",
    conf: r.profile?.mbti?.confidence ?? 0,
  }));
  const firstCorrectMbti = mbtiByReport.find(
    (m) => m.mbti === KATHERINE.truth.mbti
  );
  const finalMbti = mbtiByReport[mbtiByReport.length - 1];

  const finalReport = reports[reports.length - 1] || {};

  const lines = [];
  lines.push("# Katherine Convergence Report\n");
  lines.push("## Ground Truth\n");
  lines.push("```json");
  lines.push(JSON.stringify(KATHERINE.truth, null, 2));
  lines.push("```\n");

  lines.push("## Convergence Timeline\n");
  lines.push(
    "| at facts | mbti (truth INFP) | enneagram (truth 4) | pronouns | first prediction |"
  );
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of reports) {
    const text = `${r.portrait ?? ""}\n${r.summary ?? ""}`;
    const enn = r.profile?.enneagram;
    lines.push(
      `| ${r.atFacts} | **${r.profile?.mbti?.type ?? "?"}** (${fmt(r.profile?.mbti?.confidence)}) | ${enn?.type}w${enn?.wing} (${fmt(enn?.confidence)}) | ${pronounsUsed(text)} | ${(r.predictions?.[0] ?? "—").slice(0, 80)} |`
    );
  }

  lines.push("\n## Probe Coverage\n");
  lines.push(`- Probes asked: ${probeCount}`);
  lines.push(
    `- Probe topics seen: ${[...probeIds].slice(0, 10).map((q) => `"${q.slice(0, 50)}"`).join(", ")}`
  );

  lines.push("\n## Pronoun Bug Regression\n");
  if (firstSheReport === null) {
    lines.push(
      "❌ **she/her never appeared** — engine stayed neutral. Either no female-implying probe landed, or weights are too low. Truth = female. Action: increase weight of strongest gender probes (`probe_pregnant`, `probe_purse`), and ensure at least 1 gender probe in the first 10 cards."
    );
  } else {
    lines.push(
      `✅ Pronouns flipped to she/her at fact #${firstSheReport}. Truth = female. Latency: ${firstSheReport} swipes.`
    );
  }

  lines.push("\n## MBTI Convergence\n");
  if (firstCorrectMbti) {
    lines.push(
      `✅ Engine landed on INFP at fact #${firstCorrectMbti.n} (confidence ${fmt(firstCorrectMbti.conf)}).`
    );
  } else {
    lines.push(
      `❌ Engine never converged to INFP. Final guess: ${finalMbti?.mbti} (${fmt(finalMbti?.conf)}). Likely because static-pool questions don't carry strong MBTI:F or MBTI:N tags — heuristic tagger's coverage gap.`
    );
  }

  lines.push("\n## Final Predictions vs Persona\n");
  for (const p of finalReport.predictions ?? []) {
    lines.push(`- ${p}`);
  }

  lines.push("\n## Gaps & Recommendations\n");
  lines.push(generateGapsAnalysis({ transcript, reports, probeCount, firstSheReport, firstCorrectMbti, finalMbti, finalReport }));

  return lines.join("\n");
}

function generateGapsAnalysis({ probeCount, firstSheReport, firstCorrectMbti, finalMbti, finalReport }) {
  const gaps = [];
  if (probeCount < 4) {
    gaps.push(
      `- **Too few probes hit (${probeCount} of 30 in ${TARGET_SWIPES} cards).** The entropy-weighted selector should be picking more aggressively early when every dim is at uniform 0.33. Consider raising PROBES_PER_BATCH from 2 → 3 for the first two batches.`
    );
  }
  if (firstSheReport && firstSheReport > 20) {
    gaps.push(
      `- **Gender inference took ${firstSheReport} swipes.** Goal was ≤ 20. Add 1–2 stronger gender probes that fire reliably in batch 1 (e.g. probe_purse, probe_catcalled).`
    );
  }
  if (!firstCorrectMbti) {
    gaps.push(
      `- **MBTI never converged to truth (INFP).** The static-pool keyword tagger covers obvious words ("alone", "creative") but misses the texture of INFP — the heuristic needs a few more rules around "imagined scenarios", "inner world", "reread books".`
    );
  }
  if ((finalReport.predictions ?? []).every((p) => !/parent|mother|kid|child|mia|daughter/i.test(p))) {
    gaps.push(
      `- **No parental prediction** despite Katherine having a 3yo. Either probe_homework_help didn't land or the synthesis prompt isn't leaning into hasKids confidence. Verify probe interleaving covers hasKids in early batches.`
    );
  }
  if (finalReport.profile?.ageRange && /20s.*40s|teen/i.test(finalReport.profile.ageRange)) {
    gaps.push(
      `- **Age range too wide** (\`${finalReport.profile.ageRange}\`). Engine has data to narrow but won't commit. Lower the age-band confidence threshold for narrow ranges from 0.60 to 0.55.`
    );
  }
  if (gaps.length === 0) {
    gaps.push("- No major gaps detected this run — the engine read Katherine cleanly within the swipe budget.");
  }
  return gaps.join("\n");
}

// ───────────────────────────────────────────────────────────────────────
// Entry
// ───────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\nKatherine convergence test against ${BASE_URL}`);
  console.log(`Target: ${TARGET_SWIPES} swipes, snapshots every ${REPORT_EVERY}\n`);

  const result = await run();
  const md = findings(result);

  // Write to disk + echo.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const outDir = path.resolve("scripts/output");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = path.join(outDir, `katherine-${stamp}.md`);
  const jsonFile = path.join(outDir, `katherine-${stamp}.json`);
  fs.writeFileSync(outFile, md);
  fs.writeFileSync(
    jsonFile,
    JSON.stringify(
      {
        ground_truth: KATHERINE.truth,
        transcript: result.transcript,
        reports: result.reports,
      },
      null,
      2
    )
  );

  console.log("\n\n" + md);
  console.log(`\nSaved: ${outFile}`);
  console.log(`Saved: ${jsonFile}`);
})().catch((err) => {
  console.error("\n[persona-test] failed:", err);
  process.exit(1);
});
