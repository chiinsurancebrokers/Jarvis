import type { Llm } from "./types.js";

/** Calls the Anthropic Messages API. The key comes from the environment and is never logged. */
export function anthropicLlm(apiKey: string, model: string): Llm {
  return async (system, user) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Anthropic API answered ${res.status}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("Anthropic API returned no text");
    return text;
  };
}
