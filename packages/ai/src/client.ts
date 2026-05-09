import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — AI features unavailable. Set env var or skip AI calls in your code path.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/** Default model for cheap, frequent tasks (PLAN §11.10). */
export const HAIKU_MODEL = "claude-haiku-4-5";
