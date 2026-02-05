import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { GenerateRequest, GenerateResponse } from "@/lib/types";
import { 
  DEFAULT_SYSTEM_PROMPT, 
  buildUserPrompt, 
  buildWebSearchPrompt,
  buildLocationExtractionPrompt 
} from "@/lib/prompts";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { userProfile, batchSize, mode, systemPrompt, categoryFilter } = body;

    // Validate request
    if (!mode || !batchSize) {
      return NextResponse.json(
        { error: "Missing required fields: mode, batchSize" },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // For result mode, extract location if not present
    let locationData = userProfile.userLocation;

    if (mode === "result" && !locationData && userProfile.initialFacts) {
      // Step 1: Extract location from profile using LLM
      const extractionPrompt = buildLocationExtractionPrompt(userProfile);
      
      try {
        const extractionResponse = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 200,
          temperature: 0,
          messages: [{ role: "user", content: extractionPrompt }],
        });
        
        const extractionText = extractionResponse.content.find(c => c.type === "text");
        if (extractionText && extractionText.type === "text") {
          let jsonText = extractionText.text.trim();
          
          // Remove markdown code blocks if present
          if (jsonText.startsWith("```json")) {
            jsonText = jsonText.replace(/^```json\n/, "").replace(/\n```$/, "");
          } else if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```\n/, "").replace(/\n```$/, "");
          }
          
          const extracted = JSON.parse(jsonText);
          if (extracted.city) {
            locationData = {
              city: extracted.city,
              country: extracted.country || undefined,
            };
            console.log(`[Tastemaker] Extracted location: ${extracted.city}, ${extracted.country}`);
          }
        }
      } catch (e) {
        console.error("[Tastemaker] Failed to extract location:", e);
      }
    }

    // Use web search for all result-mode recommendations (products, activities, restaurants, etc.)
    const shouldUseWebSearch = mode === "result";

    // Anthropic web_search only supports certain country codes (e.g. US, UK). PK and others fail.
    const WEB_SEARCH_SUPPORTED_COUNTRIES = new Set(["US", "GB", "CA", "AU", "DE", "FR", "JP", "IN"]);
    const canPassUserLocation = locationData?.country && WEB_SEARCH_SUPPORTED_COUNTRIES.has(locationData.country.toUpperCase());

    let message;
    
    if (shouldUseWebSearch) {
      // Web search for real recommendations (mix of categories); pass location when available
      const searchPrompt = buildWebSearchPrompt(userProfile, batchSize, locationData ?? undefined, categoryFilter);
      const systemMessage = systemPrompt || DEFAULT_SYSTEM_PROMPT;
      
      const toolConfig = {
        type: "web_search_20250305" as const,
        name: "web_search" as const,
        max_uses: 5,
        ...(locationData && canPassUserLocation && locationData.country
          ? {
              user_location: {
                type: "approximate" as const,
                city: locationData.city,
                region: locationData.region,
                country: locationData.country.toUpperCase(),
                timezone: "America/New_York",
              },
            }
          : {}),
      };

      message = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        temperature: 0.8,
        system: systemMessage,
        messages: [
          {
            role: "user",
            content: searchPrompt,
          },
        ],
        tools: [toolConfig],
      });
    } else {
      // Standard generation without web search
      const systemMessage = systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const userMessage = buildUserPrompt(mode, batchSize, userProfile);

      message = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        temperature: 0.8,
        system: systemMessage,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });
    }

    // Parse response - use last text block (with web search, Claude may output prose then JSON)
    const textBlocks = message.content.filter((c) => c.type === "text");
    if (textBlocks.length === 0 || textBlocks[0].type !== "text") {
      throw new Error("No text content in Claude response");
    }
    const rawText = textBlocks.length > 1
      ? (textBlocks[textBlocks.length - 1] as { type: "text"; text: string }).text
      : (textBlocks[0] as { type: "text"; text: string }).text;
    let jsonText = rawText.trim();

    // Extract JSON from response so we never parse prose like "I'll search..."
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    } else if (!jsonText.startsWith("{") && jsonText.includes('"cards"')) {
      const start = jsonText.indexOf('{"cards"');
      if (start !== -1) {
        let depth = 0;
        let end = -1;
        for (let i = start; i < jsonText.length; i++) {
          if (jsonText[i] === "{") depth++;
          if (jsonText[i] === "}") {
            depth--;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }
        if (end !== -1) jsonText = jsonText.slice(start, end);
      }
    }

    let parsed: GenerateResponse;
    try {
      parsed = JSON.parse(jsonText) as GenerateResponse;
    } catch {
      throw new Error(
        "Model did not return valid JSON (e.g. returned prose like \"I'll search...\"). Please try again."
      );
    }

    // Validate response has cards
    if (!parsed.cards || !Array.isArray(parsed.cards)) {
      throw new Error("Invalid response format: missing cards array");
    }

    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Error in /api/generate:", error);
    
    return NextResponse.json(
      {
        error: "Failed to generate cards",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
