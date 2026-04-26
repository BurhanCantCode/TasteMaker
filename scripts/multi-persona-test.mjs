/**
 * Multi-persona gender convergence test.
 *
 * Runs 4 personas through the engine end-to-end and reports per-persona
 * gender / pronoun / state convergence. Used to find where gender
 * inference fails (different bodies, life stages, identities).
 *
 * Personas:
 *   - daniel  — 28yo cis male, software engineer, Austin
 *   - marcus  — 55yo cis male, retired, Phoenix suburbs
 *   - sam     — 26yo nonbinary, illustrator, Portland (AFAB)
 *   - aria    — 34yo trans woman, marketing manager, NYC
 *
 * Acceptance criteria per persona:
 *   - daniel: gender.male ≥ 0.80, pronouns he/him by fact 20
 *   - marcus: gender.male ≥ 0.85, age.50plus ≥ 0.60
 *   - sam:    max(gender) < 0.70 (engine should NOT commit to a binary),
 *             pronouns stay they/them
 *   - aria:   gender.female ≥ 0.70, pronouns she/her
 *
 * Cost: ~30 swipes × 4 personas × 1 LLM-answer/swipe + 4 reports.
 *       ~150 Claude calls per run, ~6–10 min wall time.
 *
 * Run: node scripts/multi-persona-test.mjs
 *      node scripts/multi-persona-test.mjs --persona daniel  (single)
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Manual dotenv parse.
for (const fname of [".env.local", ".env"]) {
  const p = join(root, fname);
  if (!existsSync(p)) continue;
  const env = readFileSync(p, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    if (process.env[k]) continue;
    process.env[k] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const BASE_URL = process.env.PERSONA_BASE_URL || "http://localhost:3001";
const ANSWER_MODEL = "claude-sonnet-4-6";
const TARGET_SWIPES = 30; // hit first-report milestone (CHUNK_SIZE)
const REPORT_AT = 30;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY missing");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ───────────────────────────────────────────────────────────────────────
// Personas
// ───────────────────────────────────────────────────────────────────────

const PERSONAS = {
  daniel: {
    label: "Daniel — 28, cis male, software engineer, Austin",
    truth: { gender: "male", ageBand: "20s", expectedPronouns: ["he", "him"] },
    accept: { genderKey: "male", genderMin: 0.8 },
    bio: `
Daniel is 28. He's a backend software engineer at a mid-sized company in
Austin, Texas. He lives in a two-bedroom apartment in East Austin with his
roommate Jake. He's single, has been on a few dates this year off Hinge
but nothing stuck. He grew up in suburban Dallas, went to UT for CS, and
moved to East Austin after graduation.

He has a beard he's been growing for the past two years — full, neat,
recognizably his look. He uses public men's restrooms regularly.
He's never been pregnant and never will be. He's never been catcalled
walking somewhere — strangers don't comment on his appearance.
He doesn't carry a purse; he uses pockets and a backpack on workdays.

He drives his Civic to work some days but often takes the bus.
He plays pickup basketball on weekends, likes hoppy IPAs, watches
Formula 1 highlights on YouTube. He pays his own rent, sets a 7am
alarm on weekdays, and has been in person-in-the-office for a real
work meeting this month.

Personality: ESTJ-ish, type 3, decisive, prefers logic over feelings.
He didn't get his first smartphone until he was 12 (2008). He was in
school during 9/11 (he was 4, doesn't remember it directly). His first
real concert was 14 years ago, give or take.
`.trim(),
  },

  marcus: {
    label: "Marcus — 55, cis male, retired Marine, Phoenix suburbs",
    truth: { gender: "male", ageBand: "50plus", expectedPronouns: ["he", "him"] },
    accept: { genderKey: "male", genderMin: 0.85, ageKey: "50plus", ageMin: 0.6 },
    bio: `
Marcus is 55. He retired from the Marine Corps four years ago after 22
years of service. He lives in a single-story house in a Phoenix-area
suburb with his wife of 28 years, Linda. Their two kids are grown —
their daughter just had her first baby (Marcus's first grandkid) in
Tucson, and their son lives in San Diego.

He has a salt-and-pepper beard, neatly trimmed, kept ever since
retirement. He uses public men's restrooms. He's never been pregnant.
He's never been catcalled walking somewhere. He doesn't carry a
purse — he carries a wallet, keys, and a folded knife in his pockets.

He drives a pickup truck most days — runs errands, drives to the
hardware store, drives Linda to her appointments. He doesn't walk to
groceries; he drives to the Costco. His afternoons are mostly free
post-retirement. He does volunteer work at the VA twice a week.
He's been to a kid's birthday this year (his grandkid's first).

He grew up before the internet existed. He remembers everyday life
before smartphones clearly. He was an adult during 9/11 — was at home
on leave, watched it on TV. His first real concert was over 35 years
ago. He has not seriously priced out a sailboat (his wife wants one
though). He doesn't use dating apps.

Personality: ISTJ, type 1, principled, structured, dry sense of humor.
`.trim(),
  },

  sam: {
    label: "Sam — 26, nonbinary, freelance illustrator, Portland (AFAB)",
    truth: { gender: "nonbinary", ageBand: "20s", expectedPronouns: ["they", "them"] },
    // For nonbinary, success = engine does NOT confidently commit to a
    // binary. Both male and female should stay below 0.70.
    accept: { genderMaxBinary: 0.70 },
    bio: `
Sam is 26, nonbinary (they/them, AFAB). They freelance as an illustrator
for indie zines and album covers. They live in a shared house in
Southeast Portland with three other people, all queer. They've been
single for a year and a half by choice.

Sam has never grown a full beard — they couldn't if they tried. They've
never been pregnant. They have been catcalled walking somewhere
this year (it happened twice — both bothered them deeply). They use
whichever restroom feels safer in the moment; if asked specifically
about a public men's restroom in the last week, the honest answer is
no, but they're ambivalent about the framing of the question itself.

They sometimes carry a small messenger bag, sometimes nothing — they'd
say "sometimes a small bag" rather than "yes, a purse." They don't wear
makeup most days; they keep their hair short and dye it.

They walk to the grocery store. They don't drive — they bike or take
the MAX. Their weekday afternoons are mostly free (freelance schedule).
They've sent invoices for their own work. They have not been to a
kid's birthday this year. They've never been pregnant. They use a
dating app sometimes when they're lonely.

Personality: INFP, type 4, deeply introspective, politically anti-binary
in their answers when they can be — but they answer questions honestly
when asked direct yes/no/maybe questions. They got their first smartphone
at 13. They were 1 year old during 9/11 (no memory of it).

When asked about gender-coded probes, they answer truthfully but the
answers aren't going to fit a neat binary pattern.
`.trim(),
  },

  aria: {
    label: "Aria — 34, trans woman, marketing manager, NYC",
    truth: { gender: "female", ageBand: "30s", expectedPronouns: ["she", "her"] },
    accept: { genderKey: "female", genderMin: 0.7 },
    bio: `
Aria is 34, a trans woman, post-transition for nine years. She works as
a marketing manager at a fintech company in NYC, lives in a one-bedroom
in Astoria, Queens. She's in a long-term relationship with her boyfriend
Marco (3 years), no kids, no immediate plans.

She has not grown a full beard — pre-transition she could have, but she
hasn't been on the testosterone side of things in nearly a decade and
the honest answer to "have you grown a full beard at some point" is
"never could" relative to her current self-conception. She has never
been pregnant and biologically cannot be. She has been catcalled
walking somewhere this year — it happens regularly and it's complicated
because the recognition is also a small affirmation.

She carries a real purse most days. She wears makeup most days. She
has not used a public men's restroom in the last week — she has not
used one in nine years.

She rides the subway daily, walks to the bodega, doesn't drive much
(the car's at her parents' place upstate). She has used a dating app
within the past year when she and Marco took a break (briefly). She
remembers life before smartphones (she was 17 when the iPhone came out).
She was 9 during 9/11 — yes, in school for it.

Personality: ENFJ-leaning, type 2, warm and attuned to social dynamics.
`.trim(),
  },

  katherine: {
    label: "Katherine — 32, cis female, freelance designer, Brooklyn",
    truth: { gender: "female", ageBand: "30s", expectedPronouns: ["she", "her"] },
    accept: { genderKey: "female", genderMin: 0.7 },
    bio: `
Katherine is 32, cis female, freelance graphic designer in Park Slope.
Married to Tom (4 years), one daughter Mia (3), rescue dog Pepper.
Has been pregnant. Has been catcalled. Carries a tote bag, not a purse.
Doesn't drive much. Walks to the food co-op daily. Bullet journal,
literary fiction, INFP / 4w5. Got her first smartphone at 17. Was 8
during 9/11 — was in school for it.
`.trim(),
  },
};

function buildPersonaPrompt(persona) {
  return `You are roleplaying ${persona.label.split(" — ")[0]}. Stay in character. The bio below is fixed truth — never contradict it. For each question, choose the label this person would honestly pick. If a question doesn't directly map to a bio fact, infer from their values, age, life stage, and how they actually move through the world. If they'd genuinely answer "maybe" / "sometimes," pick the middle option for 3-button questions. Output STRICT JSON ONLY: {"label_index": <integer>, "reasoning": "<one short sentence in their voice>"}.

BIO:
${persona.bio}`;
}

// ───────────────────────────────────────────────────────────────────────
// Local scorers (mirror lib/demographicState.ts and lib/probabilityState.ts)
// ───────────────────────────────────────────────────────────────────────

function emptyDemo() {
  return {
    gender: { male: 1 / 3, female: 1 / 3, nonbinary: 1 / 3 },
    ageBand: { teen: 0.2, "20s": 0.2, "30s": 0.2, "40s": 0.2, "50plus": 0.2 },
    relationshipStatus: { single: 0.25, partnered: 0.25, married: 0.25, divorced: 0.25 },
    hasKids: { yes: 0.5, no: 0.5 },
    geographyType: { urban: 1 / 3, suburban: 1 / 3, rural: 1 / 3 },
    workStatus: { student: 0.2, employed: 0.2, freelance: 0.2, retired: 0.2, unemployed: 0.2 },
  };
}
function emptyProb() {
  return {
    mbti: { I: 0.5, E: 0.5, N: 0.5, S: 0.5, T: 0.5, F: 0.5, J: 0.5, P: 0.5 },
    enneagram: { 1: 1/9, 2: 1/9, 3: 1/9, 4: 1/9, 5: 1/9, 6: 1/9, 7: 1/9, 8: 1/9, 9: 1/9 },
    disc: { D: 0.25, I: 0.25, S: 0.25, C: 0.25 },
    bigFive: { O: 0.5, C: 0.5, E: 0.5, A: 0.5, N: 0.5 },
    attachment: { secure: 0.25, anxious: 0.25, avoidant: 0.25, disorganized: 0.25 },
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function normBag(bag) {
  const keys = Object.keys(bag);
  let sum = 0;
  for (const k of keys) sum += bag[k];
  if (sum <= 0) {
    const u = 1 / keys.length;
    const o = {};
    for (const k of keys) o[k] = u;
    return o;
  }
  const o = {};
  for (const k of keys) o[k] = bag[k] / sum;
  return o;
}

function applyImp(state, imp) {
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
    for (const k of others) bag[k] = clamp01(bag[k] + (-delta) / others.length);
  } else {
    for (const k of others) {
      const share = bag[k] / othersTotal;
      bag[k] = clamp01(bag[k] - delta * share);
    }
  }
  const re = normBag(bag);
  for (const k of Object.keys(bag)) bag[k] = re[k];
}

function applyDemoProbe(state, probe, sentiment) {
  const next = JSON.parse(JSON.stringify(state));
  const half = sentiment === "neutral" ? 0.5 : 1;
  if (sentiment === "affirmative" || sentiment === "neutral") {
    for (const imp of probe.onYes) applyImp(next, { ...imp, weight: imp.weight * half });
  }
  if (sentiment === "non-affirmative" || sentiment === "neutral") {
    for (const imp of probe.onNo) applyImp(next, { ...imp, weight: imp.weight * half });
  }
  return next;
}

const MBTI_AXES = { I: ["I", "E"], E: ["E", "I"], N: ["N", "S"], S: ["S", "N"], T: ["T", "F"], F: ["F", "T"], J: ["J", "P"], P: ["P", "J"] };

function applyWeightedTag(state, tag, weight) {
  if (weight <= 0) return;
  const [rawF, rawC] = tag.split(":");
  if (!rawF || !rawC) return;
  const f = rawF.toLowerCase();
  const code = rawC.trim();
  if (f === "mbti") {
    const upper = code.toUpperCase();
    const axis = MBTI_AXES[upper];
    if (!axis) return;
    const [pos, neg] = axis;
    const cur = state.mbti[pos];
    const delta = weight * (1 - cur);
    state.mbti[pos] = clamp01(cur + delta);
    state.mbti[neg] = clamp01(state.mbti[neg] - delta);
  } else if (f === "bigfive") {
    const upper = code.toUpperCase();
    if (state.bigFive[upper] !== undefined) {
      const cur = state.bigFive[upper];
      const delta = weight * (1 - cur);
      state.bigFive[upper] = clamp01(cur + delta);
    }
  }
}

function applyMBTIProbe(state, probe, sentiment) {
  const next = JSON.parse(JSON.stringify(state));
  const half = sentiment === "neutral" ? 0.5 : 1;
  if (sentiment === "affirmative" || sentiment === "neutral") {
    for (const imp of probe.onYes) applyWeightedTag(next, imp.tag, imp.weight * half);
  }
  if (sentiment === "non-affirmative" || sentiment === "neutral") {
    for (const imp of probe.onNo) applyWeightedTag(next, imp.tag, imp.weight * half);
  }
  return next;
}

// Probe registries (mirror lib/indirectProbes.ts + lib/personalityProbes.ts).
// Updated 2026-04-26 with recalibrated age weights.
const DEMO_PROBES = {
  probe_beard: { onYes: [{ dim: "gender", key: "male", weight: 0.9 }], onNo: [{ dim: "gender", key: "female", weight: 0.4 }] },
  probe_pregnant: { onYes: [{ dim: "gender", key: "female", weight: 0.99 }, { dim: "ageBand", key: "20s", weight: 0.2 }, { dim: "ageBand", key: "30s", weight: 0.2 }], onNo: [{ dim: "gender", key: "male", weight: 0.5 }] },
  probe_catcalled: { onYes: [{ dim: "gender", key: "female", weight: 0.85 }], onNo: [{ dim: "gender", key: "male", weight: 0.4 }] },
  probe_purse: { onYes: [{ dim: "gender", key: "female", weight: 0.7 }], onNo: [{ dim: "gender", key: "male", weight: 0.5 }] },
  probe_mens_room: { onYes: [{ dim: "gender", key: "male", weight: 0.95 }], onNo: [{ dim: "gender", key: "female", weight: 0.6 }] },
  probe_pre_internet: { onYes: [{ dim: "ageBand", key: "30s", weight: 0.55 }, { dim: "ageBand", key: "40s", weight: 0.55 }, { dim: "ageBand", key: "50plus", weight: 0.4 }], onNo: [{ dim: "ageBand", key: "teen", weight: 0.5 }, { dim: "ageBand", key: "20s", weight: 0.7 }] },
  probe_911_school: { onYes: [{ dim: "ageBand", key: "30s", weight: 0.55 }, { dim: "ageBand", key: "40s", weight: 0.7 }, { dim: "ageBand", key: "50plus", weight: 0.7 }], onNo: [{ dim: "ageBand", key: "teen", weight: 0.5 }, { dim: "ageBand", key: "20s", weight: 0.65 }] },
  probe_dating_app: { onYes: [{ dim: "ageBand", key: "20s", weight: 0.6 }, { dim: "ageBand", key: "30s", weight: 0.5 }, { dim: "relationshipStatus", key: "single", weight: 0.7 }], onNo: [{ dim: "relationshipStatus", key: "married", weight: 0.4 }, { dim: "relationshipStatus", key: "partnered", weight: 0.3 }] },
  probe_first_concert_ago: { onYes: [{ dim: "ageBand", key: "30s", weight: 0.55 }, { dim: "ageBand", key: "40s", weight: 0.55 }, { dim: "ageBand", key: "50plus", weight: 0.4 }], onNo: [{ dim: "ageBand", key: "teen", weight: 0.45 }, { dim: "ageBand", key: "20s", weight: 0.65 }] },
  probe_in_school_now: { onYes: [{ dim: "workStatus", key: "student", weight: 0.85 }, { dim: "ageBand", key: "teen", weight: 0.4 }, { dim: "ageBand", key: "20s", weight: 0.5 }], onNo: [{ dim: "workStatus", key: "employed", weight: 0.5 }] },
  probe_anniversary: { onYes: [{ dim: "relationshipStatus", key: "married", weight: 0.55 }, { dim: "relationshipStatus", key: "partnered", weight: 0.45 }], onNo: [{ dim: "relationshipStatus", key: "single", weight: 0.6 }] },
  probe_wedding_ring: { onYes: [{ dim: "relationshipStatus", key: "married", weight: 0.9 }, { dim: "hasKids", key: "yes", weight: 0.2 }], onNo: [{ dim: "relationshipStatus", key: "single", weight: 0.4 }, { dim: "relationshipStatus", key: "partnered", weight: 0.3 }] },
  probe_ex_run_in: { onYes: [{ dim: "relationshipStatus", key: "single", weight: 0.45 }, { dim: "relationshipStatus", key: "divorced", weight: 0.35 }, { dim: "ageBand", key: "20s", weight: 0.3 }, { dim: "ageBand", key: "30s", weight: 0.3 }], onNo: [] },
  probe_split_dinner: { onYes: [{ dim: "relationshipStatus", key: "single", weight: 0.4 }, { dim: "relationshipStatus", key: "partnered", weight: 0.3 }], onNo: [{ dim: "relationshipStatus", key: "married", weight: 0.4 }] },
  probe_first_dates: { onYes: [{ dim: "relationshipStatus", key: "single", weight: 0.7 }, { dim: "relationshipStatus", key: "divorced", weight: 0.3 }], onNo: [{ dim: "relationshipStatus", key: "married", weight: 0.55 }, { dim: "relationshipStatus", key: "partnered", weight: 0.4 }] },
  probe_homework_help: { onYes: [{ dim: "hasKids", key: "yes", weight: 0.9 }, { dim: "ageBand", key: "30s", weight: 0.3 }, { dim: "ageBand", key: "40s", weight: 0.4 }], onNo: [{ dim: "hasKids", key: "no", weight: 0.4 }] },
  probe_kid_pickup: { onYes: [{ dim: "hasKids", key: "yes", weight: 0.85 }, { dim: "ageBand", key: "30s", weight: 0.3 }, { dim: "ageBand", key: "40s", weight: 0.3 }], onNo: [{ dim: "hasKids", key: "no", weight: 0.45 }] },
  probe_kid_birthday: { onYes: [{ dim: "hasKids", key: "yes", weight: 0.7 }, { dim: "ageBand", key: "30s", weight: 0.25 }], onNo: [{ dim: "hasKids", key: "no", weight: 0.35 }] },
  probe_baby_shower: { onYes: [{ dim: "ageBand", key: "20s", weight: 0.3 }, { dim: "ageBand", key: "30s", weight: 0.5 }, { dim: "ageBand", key: "40s", weight: 0.3 }], onNo: [] },
  probe_walk_grocery: { onYes: [{ dim: "geographyType", key: "urban", weight: 0.75 }], onNo: [{ dim: "geographyType", key: "suburban", weight: 0.5 }, { dim: "geographyType", key: "rural", weight: 0.4 }] },
  probe_drove_today: { onYes: [{ dim: "geographyType", key: "suburban", weight: 0.55 }, { dim: "geographyType", key: "rural", weight: 0.5 }], onNo: [{ dim: "geographyType", key: "urban", weight: 0.6 }] },
  probe_neighbor_name: { onYes: [{ dim: "geographyType", key: "suburban", weight: 0.5 }, { dim: "geographyType", key: "rural", weight: 0.55 }], onNo: [{ dim: "geographyType", key: "urban", weight: 0.55 }] },
  probe_subway_train: { onYes: [{ dim: "geographyType", key: "urban", weight: 0.85 }], onNo: [{ dim: "geographyType", key: "suburban", weight: 0.45 }, { dim: "geographyType", key: "rural", weight: 0.5 }] },
  probe_yard: { onYes: [{ dim: "geographyType", key: "suburban", weight: 0.55 }, { dim: "geographyType", key: "rural", weight: 0.5 }], onNo: [{ dim: "geographyType", key: "urban", weight: 0.6 }] },
  probe_set_alarm: { onYes: [{ dim: "workStatus", key: "employed", weight: 0.55 }], onNo: [{ dim: "workStatus", key: "freelance", weight: 0.4 }, { dim: "workStatus", key: "retired", weight: 0.5 }, { dim: "workStatus", key: "unemployed", weight: 0.4 }] },
  probe_invoice: { onYes: [{ dim: "workStatus", key: "freelance", weight: 0.85 }], onNo: [{ dim: "workStatus", key: "employed", weight: 0.4 }] },
  probe_office_meeting: { onYes: [{ dim: "workStatus", key: "employed", weight: 0.55 }], onNo: [{ dim: "workStatus", key: "freelance", weight: 0.4 }, { dim: "workStatus", key: "retired", weight: 0.4 }, { dim: "workStatus", key: "student", weight: 0.3 }] },
  probe_retired: { onYes: [{ dim: "workStatus", key: "retired", weight: 0.6 }, { dim: "workStatus", key: "freelance", weight: 0.4 }, { dim: "ageBand", key: "50plus", weight: 0.3 }], onNo: [{ dim: "workStatus", key: "employed", weight: 0.5 }] },
  probe_pay_rent: { onYes: [{ dim: "workStatus", key: "employed", weight: 0.55 }, { dim: "ageBand", key: "20s", weight: 0.2 }, { dim: "ageBand", key: "30s", weight: 0.3 }], onNo: [{ dim: "workStatus", key: "student", weight: 0.5 }, { dim: "ageBand", key: "teen", weight: 0.4 }] },
  probe_priced_van: { onYes: [{ dim: "ageBand", key: "30s", weight: 0.4 }, { dim: "ageBand", key: "40s", weight: 0.4 }, { dim: "ageBand", key: "50plus", weight: 0.3 }], onNo: [] },
  probe_grandkid: { onYes: [{ dim: "ageBand", key: "40s", weight: 0.4 }, { dim: "ageBand", key: "50plus", weight: 0.85 }], onNo: [] },
  probe_misgendered_recent: { onYes: [{ dim: "gender", key: "nonbinary", weight: 0.6 }], onNo: [] },
  probe_pronoun_correction: { onYes: [{ dim: "gender", key: "nonbinary", weight: 0.7 }], onNo: [] },
};

const MBTI_PROBES = {
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

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

async function answerAs(personaPrompt, question, labels) {
  const labelList = labels.map((l, i) => `  ${i}: "${l}"`).join("\n");
  const userMsg = `QUESTION: ${question}\n\nLABELS (pick the index this person would choose):\n${labelList}`;
  const res = await anthropic.messages.create({
    model: ANSWER_MODEL,
    max_tokens: 220,
    temperature: 0.4,
    system: personaPrompt,
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
      throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function deriveSentiment(question, idx) {
  const labels = question.answerLabels ?? [];
  if (question.answerType === "yes_no_maybe") {
    if (idx === 1) return "neutral";
    if (idx === labels.length - 1) return "affirmative";
    return "non-affirmative";
  }
  const tag = question.optionTags?.[idx];
  if (tag === "affirmative") return "affirmative";
  if (tag === "negative") return "non-affirmative";
  return idx === labels.length - 1 ? "affirmative" : "non-affirmative";
}

const fmt = (n) => (typeof n === "number" ? n.toFixed(2) : String(n));

// ───────────────────────────────────────────────────────────────────────
// Run one persona through TARGET_SWIPES and snapshot the report
// ───────────────────────────────────────────────────────────────────────

async function runPersona(name, persona) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▶ ${persona.label}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const personaPrompt = buildPersonaPrompt(persona);
  const profile = {
    facts: [], likes: [], skippedIds: [], reports: [],
    demographicState: emptyDemo(), probabilityState: emptyProb(),
  };
  const probesAnswered = [];
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
      { userProfile: profile, batchSize: 10, mode: "ask", source },
      90_000
    );

    for (const card of batch.cards) {
      if (profile.facts.length >= TARGET_SWIPES) break;
      const q = card.content;
      const ans = await answerAs(personaPrompt, q.title, q.answerLabels);
      const sentiment = deriveSentiment(q, ans.idx);
      const isProbe = q.id?.startsWith("probe_");
      const isMBTIProbe = q.id?.startsWith("mbtiprobe_");

      profile.facts.push({
        questionId: q.id, question: q.title, answer: ans.label,
        positive: sentiment === "affirmative", sentiment,
        timestamp: Date.now(), answerIndex: ans.idx,
      });

      if (isProbe) {
        const probe = DEMO_PROBES[q.id];
        if (probe) profile.demographicState = applyDemoProbe(profile.demographicState, probe, sentiment);
        probesAnswered.push({ id: q.id, type: "demo", title: q.title, answer: ans.label });
      } else if (isMBTIProbe) {
        const probe = MBTI_PROBES[q.id];
        if (probe) profile.probabilityState = applyMBTIProbe(profile.probabilityState, probe, sentiment);
        probesAnswered.push({ id: q.id, type: "mbti", title: q.title, answer: ans.label });
      }
    }
    batchNum++;
    if (batchNum > 5) break;
  }

  // Final report at TARGET_SWIPES
  const report = await postJson(
    "/api/summary",
    { userProfile: profile, mode: "full" },
    90_000
  );

  const text = `${report.portrait ?? ""}\n${report.summary ?? ""}`;
  const pronouns = {
    she: /\b(she|her|hers|herself)\b/i.test(text),
    he: /\b(he|him|his|himself)\b/i.test(text),
    they: /\b(they|them|their|theirs|themself|themselves)\b/i.test(text),
    you: /\byou\b/i.test(text),
  };
  const usedTags = Object.entries(pronouns).filter(([_, v]) => v).map(([k]) => k);

  // Acceptance check
  const demo = profile.demographicState;
  const a = persona.accept;
  let pass = true;
  const checks = [];

  if (a.genderKey && a.genderMin !== undefined) {
    const got = demo.gender[a.genderKey];
    const ok = got >= a.genderMin;
    pass = pass && ok;
    checks.push(`gender.${a.genderKey} ≥ ${a.genderMin} → got ${fmt(got)} ${ok ? "✅" : "❌"}`);
  }
  if (a.genderMaxBinary !== undefined) {
    const maxBinary = Math.max(demo.gender.male, demo.gender.female);
    const ok = maxBinary < a.genderMaxBinary;
    pass = pass && ok;
    checks.push(`max(male,female) < ${a.genderMaxBinary} → got ${fmt(maxBinary)} ${ok ? "✅" : "❌"}`);
  }
  if (a.ageKey && a.ageMin !== undefined) {
    const got = demo.ageBand[a.ageKey];
    const ok = got >= a.ageMin;
    pass = pass && ok;
    checks.push(`age.${a.ageKey} ≥ ${a.ageMin} → got ${fmt(got)} ${ok ? "✅" : "❌"}`);
  }

  // Pronoun check
  const expected = persona.truth.expectedPronouns;
  const expectedPronouns = expected[0] === "she" ? "she" : expected[0] === "he" ? "he" : "they";
  let pronounOk;
  if (expectedPronouns === "they") {
    // Nonbinary: report should NOT use binary pronouns confidently
    pronounOk = !pronouns.she && !pronouns.he;
  } else {
    pronounOk = pronouns[expectedPronouns];
  }
  pass = pass && pronounOk;
  checks.push(`pronouns expected ${expectedPronouns}/them → got [${usedTags.join(", ")}] ${pronounOk ? "✅" : "❌"}`);

  return {
    name, label: persona.label, pass, checks,
    finalDemo: demo,
    probesAnswered,
    pronounsUsed: usedTags,
    report,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Entry
// ───────────────────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);
  const single = args.indexOf("--persona");
  const targetNames =
    single >= 0 && args[single + 1]
      ? [args[single + 1]]
      : ["daniel", "marcus", "sam", "aria", "katherine"];

  console.log(`Multi-persona convergence — ${TARGET_SWIPES} swipes each, against ${BASE_URL}`);
  console.log(`Personas: ${targetNames.join(", ")}\n`);

  const results = [];
  for (const name of targetNames) {
    const persona = PERSONAS[name];
    if (!persona) {
      console.warn(`Unknown persona: ${name}`);
      continue;
    }
    try {
      const r = await runPersona(name, persona);
      results.push(r);
      console.log(`\n  Result: ${r.pass ? "✅ PASS" : "❌ FAIL"}`);
      for (const c of r.checks) console.log(`    ${c}`);
      console.log(`  Probes hit: ${r.probesAnswered.length} (${r.probesAnswered.filter((p) => p.type === "demo").length} demo, ${r.probesAnswered.filter((p) => p.type === "mbti").length} mbti)`);
    } catch (e) {
      console.error(`  ${name} FAILED:`, e.message);
      results.push({ name, label: persona.label, error: e.message, pass: false, checks: [] });
    }
  }

  // ── Summary ──
  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━ SUMMARY ━━━━━━━━━━━━━━━━━━━━\n`);
  const passCount = results.filter((r) => r.pass).length;
  console.log(`${passCount}/${results.length} personas passed acceptance criteria.\n`);
  console.log(`| persona  | gender top                    | pronouns        | pass |`);
  console.log(`| -------- | ----------------------------- | --------------- | ---- |`);
  for (const r of results) {
    if (r.error) {
      console.log(`| ${r.name.padEnd(8)} | ERROR: ${r.error.slice(0, 50)} | — | ❌ |`);
      continue;
    }
    const g = r.finalDemo.gender;
    const top = Object.entries(g).sort((a, b) => b[1] - a[1])[0];
    const genderStr = `${top[0]} ${fmt(top[1])} (m ${fmt(g.male)}, f ${fmt(g.female)}, nb ${fmt(g.nonbinary)})`;
    console.log(`| ${r.name.padEnd(8)} | ${genderStr.padEnd(29)} | ${r.pronounsUsed.join(",").padEnd(15)} | ${r.pass ? "✅" : "❌"} |`);
  }
  console.log();

  // Save full output for postmortem
  const outDir = resolve("scripts/output");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `multi-persona-${stamp}.json`);
  writeFileSync(file, JSON.stringify({ results }, null, 2));
  console.log(`Saved: ${file}\n`);
})().catch((err) => {
  console.error("\n[multi-persona-test] failed:", err);
  process.exit(1);
});
