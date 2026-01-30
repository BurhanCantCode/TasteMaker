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
6. NEVER ask the same question twice or ask about topics you've already learned about
7. Each question batch should cover DIFFERENT topics than previous batches

ANSWER TYPE GUIDE (CRITICAL - match the type to your question):
- "yes_no": ONLY for true binary questions with no frequency/intensity aspect
  * Good: "Do you have a pet?", "Have you ever been to Japan?", "Are you married?"
  * BAD: "Do you often...", "Do you usually...", "Do you frequently..." (these are frequency questions!)
- "rating_scale": ANY question about frequency, intensity, or amount (1-5 scale)
  * Use when question contains: often, usually, frequently, sometimes, how much, how often, rarely
  * Example: "How often do you exercise?" or rephrase "Do you often cook?" to "How often do you cook?"
- "want_scale": Desire for specific items ("Would you want a...", products, experiences)
- "like_scale": Opinion/preference ("Do you like...", genres, activities, foods)
- "multiple_choice": Categorical options (provide options array)
- "text_input": Open-ended questions requiring free text

CRITICAL: If your question contains frequency words (often, usually, frequently, sometimes, rarely), 
you MUST use rating_scale, NOT yes_no. Rephrase "Do you often X?" to "How often do you X?"

OUTPUT SCHEMA FOR ASK MODE:
{
  "cards": [
    {
      "type": "ask",
      "content": {
        "id": "unique-id",
        "title": "Question text",
        "answerType": "yes_no" | "want_scale" | "text_input" | "multiple_choice" | "like_scale" | "rating_scale",
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
        "category": "product | restaurant | location | movie | book | band | brand | activity",
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

CRITICAL RULE: NEVER ask about topics you have already discovered above. Each question should explore something NEW about the user. If you've already asked about music preferences, move on to food, hobbies, lifestyle, travel, work, relationships, health, entertainment, shopping, technology, or other unexplored areas.

Based on your ${totalSignals} discoveries so far, ask questions that:
- Build on what you already know
- Test new hypotheses from patterns you see
- Help you make increasingly accurate predictions
- Mix answer types (yes_no, multiple_choice, want_scale, like_scale, text_input, rating_scale)
- Cover DIFFERENT topics than what you've already learned about

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

// Build prompt for web search recommendations (restaurants/locations)
export function buildWebSearchPrompt(userProfile: UserProfile, batchSize: number): string {
  const city = userProfile.userLocation?.city || "their area";
  const totalSignals = userProfile.facts.length + userProfile.likes.length;
  
  const factsText = userProfile.facts.length > 0
    ? userProfile.facts.map(f => `- ${f.question}: ${f.answer}`).join('\n')
    : "None yet";
    
  const likesText = userProfile.likes.length > 0
    ? userProfile.likes.map(l => `- ${l.item} (${l.category}): ${l.rating}`).join('\n')
    : "None yet";

  return `You are helping find real restaurants and places in ${city} that match this user's taste profile.

USER PROFILE (${totalSignals} signals):

FACTS ABOUT THEM:
${factsText}

THINGS THEY'VE LIKED/DISLIKED:
${likesText}

TASK: Search for ${batchSize} REAL restaurants, cafes, bars, or places in ${city} that would match their preferences.

For each place you find:
1. Search for actual establishments
2. Consider their taste signals when selecting
3. Explain WHY it matches their profile

Return results in this exact JSON format:
{
  "cards": [
    {
      "type": "result",
      "content": {
        "id": "unique-id",
        "name": "Actual Place Name",
        "category": "restaurant",
        "description": "Brief explanation of why this matches their taste (1-2 sentences)"
      }
    }
  ]
}

Use category "restaurant" for all dining/bar establishments and "location" for other places like shops, venues, parks, etc.`;
}
