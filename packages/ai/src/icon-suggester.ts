import { HAIKU_MODEL, getAnthropicClient } from "./client";

/**
 * Suggest a Lucide icon name for a PropertyType or Feature.
 *
 * Used by super-admin curation (Sprint 2). Admin can override the suggestion;
 * once overridden, AI never re-suggests for that entity (iconAdminOverrode flag).
 *
 * Sprint 0 stub — full curated icon list + retry/fallback wires up in Sprint 2.
 */
export type IconSuggestionInput = {
  /** Entity name in default locale (e.g., "Swimming Pool", "Villa"). */
  name: string;
  /** Constrained icon catalog (subset of Lucide). Empty = use full Lucide list. */
  catalog?: readonly string[];
  /** Optional context to disambiguate (e.g., "Feature" vs "PropertyType"). */
  hint?: string;
};

export async function suggestIcon(input: IconSuggestionInput): Promise<string | null> {
  const client = getAnthropicClient();
  const catalogStr = input.catalog?.length
    ? input.catalog.join(", ")
    : "(use any Lucide icon name)";

  const prompt = `Pick the single best Lucide icon name for this entity. Return ONLY the icon name (kebab-case), nothing else. If no good match exists, return "none".

Entity: ${input.name}
${input.hint ? `Context: ${input.hint}` : ""}

Allowed icons: ${catalogStr}`;

  const message = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 32,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((b) => b.text.trim())
    .join("");

  const cleaned = text.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!cleaned || cleaned === "none") return null;
  return cleaned;
}
