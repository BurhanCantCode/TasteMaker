/**
 * Test script: calls Anthropic with web_search tool to observe response behaviour.
 * Run from web/: node --env-file=.env.local scripts/test-web-search.mjs
 * Or: node -e "require('dotenv').config({path:'.env.local'}); require('./scripts/test-web-search.js')"
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load .env.local if present
if (existsSync(join(root, ".env.local"))) {
  const env = readFileSync(join(root, ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
if (existsSync(join(root, ".env"))) {
  const env = readFileSync(join(root, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Missing ANTHROPIC_API_KEY. Set it in .env.local or .env");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: apiKey });

const userPrompt = `Find 2 REAL restaurants in Karachi, Pakistan that serve Pakistani food.
Output ONLY valid JSON in this format, no other text:
{"cards":[{"type":"result","content":{"id":"1","name":"Place Name","category":"restaurant","description":"Why it matches"}}]}`;

console.log("--- Calling Anthropic with web_search (no user_location, like PK) ---\n");

try {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    temperature: 0.3,
    messages: [{ role: "user", content: userPrompt }],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
        // no user_location (simulating Pakistan / unsupported country)
      },
    ],
  });

  console.log("message.id:", message.id);
  console.log("message.stop_reason:", message.stop_reason);
  console.log("message.content length (blocks):", message.content.length);
  console.log("");

  message.content.forEach((block, i) => {
    console.log(`--- Block ${i} ---`);
    console.log("type:", block.type);
    if (block.type === "text") {
      console.log("text length:", block.text.length);
      console.log("text preview (first 300 chars):");
      console.log(block.text.slice(0, 300));
      if (block.text.length > 300) console.log("... [truncated]");
      console.log("");
    }
    if (block.type === "tool_use") {
      console.log("tool_use:", JSON.stringify(block, null, 2).slice(0, 400));
      console.log("");
    }
  });

  const textBlocks = message.content.filter((c) => c.type === "text");
  console.log("--- Summary ---");
  console.log("Block types in order:", message.content.map((c) => c.type).join(" -> "));
  console.log("Number of text blocks:", textBlocks.length);
  if (textBlocks.length > 0) {
    const lastText = textBlocks[textBlocks.length - 1].text;
    const hasJson = lastText.includes('"cards"') || lastText.includes("```json");
    console.log("Last text block contains JSON/cards:", hasJson);
    console.log("\n--- Full raw text (for parsing logic) ---");
    console.log(lastText);
  }
} catch (err) {
  console.error("Error:", err.message);
  if (err.response) console.error("Response:", err.response);
  process.exit(1);
}
