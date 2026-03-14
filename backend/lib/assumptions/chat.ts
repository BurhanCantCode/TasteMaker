import Anthropic from "@anthropic-ai/sdk";
import { getChatContextSnapshot } from "./db";
import { AssumptionsChatRequest, AssumptionsChatResponse } from "./types";

const MODEL = "claude-sonnet-4-6";
const MAX_INPUT_CHARS = 4000;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function buildChatSystemPrompt(): string {
  return `You are Tastemaker Chat, an optional conversational layer on top of wild-magic assumption profiling.

Behavior:
- Speak like a sharp profiling assistant.
- Be specific and grounded in known assumptions and feedback patterns.
- If evidence is weak or missing, say so directly.
- Keep answers concise and useful.
- Never claim you saw data that is not in provided context.`;
}

function buildChatUserPrompt(params: {
  message: string;
  context: Awaited<ReturnType<typeof getChatContextSnapshot>>;
}): string {
  return `USER MESSAGE:
${params.message}

PROFILE CONTEXT:
${JSON.stringify(params.context, null, 2)}

TASK:
Respond helpfully to the user's question using this context. If they ask for an assumption explanation, reference specific assumptions and votes.

OUTPUT:
Return plain text only.`;
}

export async function chatWithAssumptionProfile(
  request: AssumptionsChatRequest
): Promise<AssumptionsChatResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const message = request.message.trim();
  if (!message) {
    throw new Error("Message cannot be empty");
  }

  const clippedMessage =
    message.length > MAX_INPUT_CHARS
      ? message.slice(0, MAX_INPUT_CHARS)
      : message;

  const context = await getChatContextSnapshot(request.userId);

  const llmResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    temperature: 0.6,
    system: buildChatSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildChatUserPrompt({
          message: clippedMessage,
          context,
        }),
      },
    ],
  });

  const textBlock = llmResponse.content.find((entry) => entry.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Chat model returned no text");
  }

  return {
    reply: textBlock.text.trim(),
  };
}
