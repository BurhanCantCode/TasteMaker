import { UserProfile, ProfileStage, getProfileStage } from "./types";

const STAGE_INSTRUCTIONS = {
  discovery: `STAGE: DISCOVERY (early exploration)
You're just getting to know this user. Focus on broad questions:
- Demographics and lifestyle basics
- General preferences across major categories
- Lifestyle patterns and habits
Aim for ~60-70% accuracy. Cast a wide net.`,

  refining: `STAGE: REFINING (building detailed model)
You have the basics. Now dig deeper:
- Follow up on their established interests
- Test specific hypotheses based on patterns
- Ask about nuances and subcategories
Aim for ~75-85% accuracy. Get more targeted.`,

  personalized: `STAGE: PERSONALIZED (high precision)
You know this person well. Get specific and creative:
- Niche interests within their preferences
- Novel suggestions they might not know about
- Specific brands, products, and experiences
Aim for ~85-95% accuracy. Be bold with your predictions.`,
};

export const DEFAULT_SYSTEM_PROMPT = `You are Tastemaker, an AI playing a sophisticated guessing game to build comprehensive user preference profiles.

CORE MISSION:
You're building a mental model of the user through progressive discovery. Each interaction should build on previous knowledge, making your questions and predictions increasingly accurate and personalized.

RULES:
1. You're having an ongoing conversation - remember what you've learned
2. Start broad, then get progressively more specific as you learn more
3. Both YES and NO answers are valuable signals (rejection teaches you too)
4. Your accuracy should improve over time as you gather more data
5. Output ONLY valid JSON matching the schemas below

OUTPUT SCHEMA FOR ASK MODE:
{
  "cards": [
    {
      "type": "ask",
      "content": {
        "id": "unique-id",
        "title": "Question text",
        "answerType": "yes_no" | "want_scale" | "text_input" | "multiple_choice" | "like_scale",
        "options": ["Option A", "Option B"]  // only for multiple_choice
      }
    }
  ]
}

OUTPUT SCHEMA FOR RESULT MODE:
{
  "cards": [
    {
      "type": "result",
      "content": {
        "id": "unique-id",
        "name": "Item name",
        "category": "location | product | brand | movie | book | band | restaurant | activity",
        "description": "Brief description of why they might like this"
      }
    }
  ]
}

For RESULT mode, predict specific things (restaurants, books, brands, apps, experiences, neighborhoods, etc.) they would enjoy based on your accumulated knowledge.`;

export function buildUserPrompt(
  mode: "ask" | "result",
  batchSize: number,
  userProfile: UserProfile
): string {
  const stage = getProfileStage(userProfile);
  const totalSignals = userProfile.facts.length + userProfile.likes.length;
  
  // Include initial facts if provided
  const initialContext = userProfile.initialFacts 
    ? `INITIAL USER DESCRIPTION:\n${userProfile.initialFacts}\n\n`
    : "";

  // Reframe facts as discoveries (what you've learned)
  const discoveriesText =
    userProfile.facts.length > 0
      ? userProfile.facts
          .map((f) => {
            if (f.positive) {
              return `- DISCOVERED: ${f.question} → ${f.answer}`;
            } else {
              return `- DISCOVERED: They do NOT ${f.question.toLowerCase()} (answered: ${f.answer})`;
            }
          })
          .join("\n")
      : "No discoveries yet";

  // Format likes as validation signals
  const validationText =
    userProfile.likes.length > 0
      ? userProfile.likes
          .map((l) => {
            const emoji = l.rating === "superlike" ? "⭐" : l.rating === "like" ? "✓" : "✗";
            return `- ${emoji} ${l.item} (${l.category}): ${l.rating}`;
          })
          .join("\n")
      : "No predictions validated yet";

  // Stage-specific instructions
  const stageGuidance = STAGE_INSTRUCTIONS[stage];

  if (mode === "ask") {
    return `${stageGuidance}

${initialContext}YOUR DISCOVERIES (${totalSignals} signals collected):

${discoveriesText}

PREDICTION VALIDATION:
${validationText}

TASK: Generate ${batchSize} questions to deepen your understanding.

Based on your ${totalSignals} discoveries so far, ask questions that:
- Build on what you already know
- Test new hypotheses from patterns you see
- Help you make increasingly accurate predictions
- Mix answer types (yes_no, multiple_choice, want_scale, like_scale, text_input)

Remember: Each answer helps you refine your mental model. Ask strategic questions that will unlock new insights.`;
  } else {
    return `${stageGuidance}

${initialContext}YOUR DISCOVERIES (${totalSignals} signals collected):

${discoveriesText}

PREDICTION VALIDATION:
${validationText}

TASK: Predict ${batchSize} things this user would enjoy.

Based on your discoveries, predict across categories:
- Restaurants, bars, cafes
- Books, movies, music
- Brands, products, apps
- Neighborhoods, travel destinations
- Activities, experiences

Your predictions should reflect the depth of your ${totalSignals} discoveries. Be creative and insightful - surprise them with things they didn't know they'd like, but that fit their pattern perfectly.`;
  }
}
