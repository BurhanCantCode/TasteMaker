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
        "answerLabels": ["Label 1", "Label 2", ...],  // REQUIRED - see below
        "options": ["Option A", "Option B"]  // only for multiple_choice
      }
    }
  ]
}

ANSWER LABELS (CRITICAL - generate labels that match your question's context):
You MUST provide "answerLabels" for every question. Labels should feel natural for the specific question asked.
- yes_no: Exactly 2 labels [NEGATIVE first, POSITIVE second]. The first label (index 0) appears on the left ✗ button, the second (index 1) appears on the right ✓ button. Example: ["No pets for me", "Yes, I have one"] or ["Not really", "Definitely!"]
- like_scale: Exactly 4 labels (negative → positive). Example: ["Not interested", "Maybe", "I like it", "Love it!"]
- want_scale: Exactly 4 labels in button order: [dont_want, want, already_have, really_want]. Example: ["Pass", "I'd want this", "Already have it", "Need it now!"]
- rating_scale: Exactly 2 anchor labels (low, high). Example: ["Rarely", "Very often"] or ["Not at all", "Extremely"]
- multiple_choice: Use the "options" array instead (answerLabels not needed)
- text_input: No labels needed (answerLabels not needed)

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

  // NEW: Detect brand new users (no facts at all)
  const isNewUser = totalSignals === 0 && !userProfile.initialFacts;

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
    // NEW: Special seeding prompt for brand new users
    if (isNewUser) {
      return `STAGE: NEW USER ONBOARDING
You are starting to learn about a brand new user. This replaces a manual form, so ask friendly, conversational questions.

TASK: Generate ${batchSize} ESSENTIAL questions that cover core demographics and lifestyle basics.

PRIORITY QUESTIONS (ask these types first):
1. Location: "What city are you in?" (text_input, placeholder: "e.g., San Francisco, CA")
2. Demographics: Gender identity (multiple_choice: Male, Female, Non-binary, Prefer not to say, Other)
3. Living situation: (multiple_choice: Own my home, Rent, Living with family, Student housing, Other)
4. Tech preference: "What type of phone do you use?" (multiple_choice: iPhone, Android, Other)
5. Relationship status or work/lifestyle question (your choice)

REQUIREMENTS:
- Use conversational, friendly language (not formal or form-like)
- Mix answer types appropriately (text_input for open-ended, multiple_choice for categorical)
- Provide context-aware answerLabels for each question
- These questions establish the baseline before deeper discovery begins
- Make it feel like a conversation, not an interrogation

Remember: This is their first impression of Tastemaker. Be warm and engaging.`;
    }

    // Existing logic for users with some data
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

// Build prompt for web search recommendations (mix of categories: restaurants, products, activities, etc.)
export function buildWebSearchPrompt(
  userProfile: UserProfile,
  batchSize: number,
  extractedLocation?: { city: string; country?: string },
  categoryFilter?: string
): string {
  // Use extracted location OR stored location
  const location = extractedLocation || userProfile.userLocation;
  const city = location?.city || "their area";
  const country = location?.country;
  const totalSignals = userProfile.facts.length + userProfile.likes.length;
  const hasCity = city !== "their area";
  const stage = getProfileStage(userProfile);

  const factsText = userProfile.facts.length > 0
    ? userProfile.facts.map(f => `- ${f.question}: ${f.answer}`).join('\n')
    : "None yet";

  const likesText = userProfile.likes.length > 0
    ? userProfile.likes.map(l => `- ${l.item} (${l.category}): ${l.rating}`).join('\n')
    : "None yet";

  // Build explicit list of already-recommended items to prevent repeats
  const alreadyRecommendedItems = userProfile.likes.map(l => l.item);
  const alreadyRecommendedBlock = alreadyRecommendedItems.length > 0
    ? `\n\nALREADY RECOMMENDED (DO NOT REPEAT THESE):\n${alreadyRecommendedItems.map(item => `- ${item}`).join('\n')}\n\nCRITICAL: You must NOT recommend any item from the list above. Find NEW items only.`
    : '';

  const locationBlock = hasCity
    ? `\n\nLOCATION (for restaurant/location/activity only): The user is in ${city}${country ? `, ${country}` : ''}.
For any card with category "restaurant", "location", or "activity" that is a physical place, it MUST be in ${city} only. Use web search to verify it exists there. Do NOT suggest places from other cities.`
    : '';

  const stageGuidance = stage === "discovery"
    ? "We have few signals so far; recommend a diverse mix across categories."
    : "We have many signals; strongly tailor categories and items to likes/dislikes and facts.";

  const adaptBlock = `ADAPT TO WHAT YOU KNOW:
- From LIKES/DISLIKES: Prefer categories where the user has given like or superlike; reduce or avoid categories where they have given dislike. If they have not seen much of a category yet, it is okay to try it when the profile supports it.
- From FACTS: Use facts to choose which categories and types of items to recommend (e.g. demographics, interests; if they said "no X" or dislike something, avoid X-related recommendations).
- Stage: ${stageGuidance} The more signals we have, the more specific and tailored your recommendations should be.`;

  const categoryFilterBlock = categoryFilter && categoryFilter !== "all"
    ? `\n\nCATEGORY FILTER: Only recommend items in the "${categoryFilter}" category. All ${batchSize} results should be "${categoryFilter}" items.`
    : '';

  return `You are finding REAL recommendations that match this user's taste profile. Use web search to verify each item exists and is current.

CATEGORIES: Return a MIX of categories. Do not return only restaurants. Include at least 2-3 different categories from:
- restaurant (dining, cafes, bars)
- location (shops, venues, parks, neighbourhoods)
- product (physical products, apps, gadgets)
- brand (brands they might like)
- movie (films)
- book (books)
- band (music, artists)
- activity (hobbies, experiences, things to do)

Use the category that best fits each recommendation.${locationBlock}${categoryFilterBlock}${alreadyRecommendedBlock}

USER PROFILE (${totalSignals} signals):

FACTS ABOUT THEM:
${factsText}

THINGS THEY'VE LIKED/DISLIKED:
${likesText}

${adaptBlock}

TASK: Find ${batchSize} NEW real recommendations across the categories above using web search. Match their taste profile.${hasCity ? ` For restaurant, location, or local-activity items, restrict to ${city} only.` : ''} Do NOT repeat any previously recommended items.

REQUIREMENTS:
1. Use web search to confirm each recommendation is real and current
2. Mix categories (do not return only restaurants)
3. Match their profile based on the signals above
4. category must be one of: restaurant | location | product | brand | movie | book | band | activity
5. If you cannot find ${batchSize} real items, return fewer results

Return in this JSON format:
{
  "cards": [
    {
      "type": "result",
      "content": {
        "id": "unique-id",
        "name": "Item Name",
        "category": "restaurant",
        "description": "Why this matches (1-2 sentences)"
      }
    }
  ]
}

CRITICAL: Your response must be ONLY the JSON object. Do not write any text before or after it (no "I'll search...", no explanations). Output the raw JSON only.`;
}
