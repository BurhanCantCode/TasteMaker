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

// Build prompt to extract location from user profile
export function buildLocationExtractionPrompt(userProfile: UserProfile): string {
  const initialFacts = userProfile.initialFacts || "";
  const factsText = userProfile.facts.length > 0
    ? userProfile.facts.map(f => `${f.question}: ${f.answer}`).join(', ')
    : "";

  return `Extract the user's city and country from their profile information.

USER'S PROFILE DATA:
Initial description: "${initialFacts}"
Answers given: ${factsText || "None"}

TASK: Identify which CITY the user lives in or is from.

Return ONLY valid JSON in this exact format:
{
  "city": "City Name",
  "country": "Country Code (2 letters, e.g., PK, US, UK)"
}

Rules:
- Extract the most specific location mentioned
- If they say "karachi pakistan", return {"city": "Karachi", "country": "PK"}
- If they say "from new york", return {"city": "New York", "country": "US"}
- Use proper capitalization for city names
- Use ISO 2-letter country codes
- If NO location is found, return {"city": null, "country": null}

Return ONLY the JSON, nothing else.`;
}

// Build prompt for web search recommendations (restaurants/locations)
export function buildWebSearchPrompt(
  userProfile: UserProfile, 
  batchSize: number,
  extractedLocation?: { city: string; country?: string }
): string {
  // Use extracted location OR stored location
  const location = extractedLocation || userProfile.userLocation;
  const city = location?.city || "their area";
  const country = location?.country;
  const totalSignals = userProfile.facts.length + userProfile.likes.length;
  
  const factsText = userProfile.facts.length > 0
    ? userProfile.facts.map(f => `- ${f.question}: ${f.answer}`).join('\n')
    : "None yet";
    
  const likesText = userProfile.likes.length > 0
    ? userProfile.likes.map(l => `- ${l.item} (${l.category}): ${l.rating}`).join('\n')
    : "None yet";

  const locationEmphasis = city !== "their area" 
    ? `\n\nCRITICAL LOCATION REQUIREMENT:
The user is in ${city}${country ? `, ${country}` : ''}.
EVERY SINGLE recommendation MUST be a real establishment physically located in ${city}.
Do NOT recommend places from ANY other city - not even nearby cities in the same country.
Use web search to verify each place actually exists in ${city}.`
    : '';

  return `You are finding real restaurants and places that match this user's taste profile.${locationEmphasis}

USER PROFILE (${totalSignals} signals):

FACTS ABOUT THEM:
${factsText}

THINGS THEY'VE LIKED/DISLIKED:
${likesText}

TASK: Find ${batchSize} REAL establishments in ${city} that match their preferences.

STRICT REQUIREMENTS:
1. Use web search to find actual businesses
2. Verify each place has a physical address in ${city}
3. Only recommend currently operating establishments
4. Match their taste profile based on the signals above
5. If ${city} is "Karachi", do NOT suggest places from Lahore, Islamabad, or other cities
6. If you cannot find ${batchSize} real places in ${city}, return fewer results

Return in this JSON format:
{
  "cards": [
    {
      "type": "result",
      "content": {
        "id": "unique-id",
        "name": "Place Name",
        "category": "restaurant",
        "description": "Why this matches (include ${city} location in description)"
      }
    }
  ]
}

Use category "restaurant" for all dining/bar establishments and "location" for other places like shops, venues, parks, etc.

CRITICAL: Your response must be ONLY the JSON object. Do not write any text before or after it (no "I'll search...", no explanations). Output the raw JSON only.`;
}
