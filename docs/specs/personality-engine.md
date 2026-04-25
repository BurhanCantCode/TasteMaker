# Tastemaker Personality Engine — Feature Spec

**Feature:** Universal Personality Typing via Dynamic Card Swiping
**Codebase:** Existing Tastemaker swipe engine + Dynamic Question Engine
**Target completion time:** ~3 minutes / ~40 questions

---

## Overview

Extend the existing Tastemaker card-swipe + dynamic question engine to deliver a universal personality assessment. Users swipe Yes / Maybe / No through a branching card sequence. The system synthesizes answers in real time and outputs a multi-framework personality profile.

---

## Frameworks to Map

| Framework           | Output                                     |
| ------------------- | ------------------------------------------ |
| Enneagram           | Primary type (1–9) + wing                  |
| Myers-Briggs (MBTI) | 4-letter type (e.g. ENFP)                  |
| DISC                | Dominant style (D / I / S / C)             |
| Big Five (OCEAN)    | High/low scores across 5 dimensions        |
| Attachment Style    | Secure / Anxious / Avoidant / Disorganized |

**Bonus inferences (soft signals, displayed with appropriate hedging):**

- Estimated age range
- Suggested career archetypes (3–5 roles that tend to fit the profile)

---

## Question Structure

### Phase 1 — Core Set (10 questions, everyone sees these)

Broad behavioral and preference questions designed to establish baseline signals across all frameworks simultaneously. Questions should feel warm, curious, and non-clinical — like a perceptive friend is asking.

Examples of tone/style (not final copy):

- _"You tend to know what you want before you walk into a room."_
- _"When something goes wrong, your first instinct is to figure out why."_
- _"You'd rather have a few deep friendships than a wide social circle."_

Each answer updates a running probability vector across all framework dimensions.

### Phase 2 — Adaptive Branching (up to ~30 questions)

After Phase 1, the engine generates the next batch of 10 questions dynamically, targeted to resolve the highest-uncertainty framework dimensions. This repeats in batches until:

- Confidence thresholds are met across all frameworks, **or**
- Total question count hits ~40, **or**
- ~3 minutes of elapsed time

**Branching logic:** Pass the full answer history + current probability state to the dynamic question engine. Prompt it to generate the next 10 questions that will most efficiently narrow remaining ambiguity. Questions should progressively feel more specific and personally reflective — users should feel increasingly _seen_ as the session continues.

### Phase 3 — Wrap-up (2–3 questions, optional)

If confidence is high but one or two signals are weak, close with targeted tie-breakers. These can be more direct (e.g. _"People would describe you as more of a thinker than a feeler."_).

---

## Swipe Mechanics

Reuse existing Tastemaker card UX verbatim:

- **Yes** → strong signal in the affirming direction
- **No** → strong signal in the opposing direction
- **Maybe** → weak/ambiguous signal, increases question count slightly

Too many Maybes in a row should trigger a gentle nudge card: _"Try to go with your gut — there's no wrong answer."_

---

## Scoring & Synthesis

- Maintain a probability state object updated after each swipe
- On session end, run a final synthesis pass: feed the full Q&A log to the LLM with a prompt to produce a structured JSON output

**Output schema:**

```json
{
  "enneagram": { "type": 4, "wing": 3, "confidence": 0.82 },
  "mbti": { "type": "INFJ", "confidence": 0.76 },
  "disc": { "dominant": "C", "secondary": "S", "confidence": 0.80 },
  "bigFive": { "O": 0.85, "C": 0.52, "E": 0.31, "A": 0.74, "N": 0.61 },
  "attachmentStyle": { "type": "Anxious", "confidence": 0.68 },
  "ageRange": "late 20s–mid 30s",
  "careerArchetypes": ["Therapist", "UX Researcher", "Writer", "Brand Strategist"]
}
```

---

## Results Screen

Display results in Tastemaker's existing reveal/results UI. Suggested layout:

1. **Hero type** — lead with whichever framework has highest confidence (likely Enneagram or MBTI). Short 2–3 sentence description that makes the user feel understood.
2. **Supporting types** — DISC, Big Five, Attachment Style in compact cards or a grid.
3. **Soft inferences** — Age range + career archetypes, labeled as "our read" to signal they're probabilistic.
4. **Share prompt** — "You're an INFJ / 4w3 / C-type" shareable card.

---

## Engineering Notes

- The dynamic question generation should reuse the existing DQE prompt structure — just swap in the personality-mapping system prompt and the running answer log as context.
- Confidence thresholds for early termination: suggest 0.75+ across primary outputs.
- Store the full answer log and output JSON to the user's profile for future personalization use.
- No major UI changes needed — this is a new _mode_ of the existing swipe engine, configured via a session type flag (e.g. `sessionType: "personality"`).

---

## Out of Scope (v1)

- Detailed sub-type descriptions or custom report PDFs
- Comparison against other users
- Retaking / answer history UI

---

_Questions? Ask Joshua._
