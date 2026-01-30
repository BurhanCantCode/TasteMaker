import { UserProfile } from "./types";

export const DEFAULT_SYSTEM_PROMPT = `You are Tastemaker, an AI that builds comprehensive user preference profiles through a guessing game.

RULES:
1. Generate questions to learn user attributes (demographics, lifestyle, interests)
2. Make predictions about things the user would like based on accumulated knowledge
3. Both positive AND negative responses are valuable signals
4. Output ONLY valid JSON matching the schema below
5. Be creative and conversational - make it fun!

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

For RESULT mode, predict nouns (locations, products, brands, movies, books, bands, restaurants, activities) the user would enjoy based on their profile.`;

export function buildUserPrompt(
  mode: "ask" | "result",
  batchSize: number,
  userProfile: UserProfile
): string {
  const factsText =
    userProfile.facts.length > 0
      ? userProfile.facts
          .map((f) => `- ${f.question}: ${f.answer} (${f.positive ? "positive" : "negative"})`)
          .join("\n")
      : "No facts yet";

  const likesText =
    userProfile.likes.length > 0
      ? userProfile.likes
          .map((l) => `- ${l.item} (${l.category}): ${l.rating}`)
          .join("\n")
      : "No likes yet";

  if (mode === "ask") {
    return `Generate ${batchSize} questions to learn more about the user.

USER FACTS SO FAR:
${factsText}

USER LIKES SO FAR:
${likesText}

Generate ${batchSize} diverse questions. Mix different answer types (yes_no, multiple_choice, want_scale, like_scale, text_input). Ask about things that will help you understand their preferences better.`;
  } else {
    return `Based on what you know about the user, predict ${batchSize} things they would like.

USER FACTS:
${factsText}

USER LIKES:
${likesText}

Generate ${batchSize} predictions across different categories (movies, books, restaurants, activities, brands, locations, etc.). Be creative and insightful based on their profile.`;
  }
}
