import OpenAI from "openai";
import type { LlmClient } from "./generation.service";

export function openAiClient(apiKey: string, model: string): LlmClient {
  const client = new OpenAI({ apiKey, timeout: 60_000, maxRetries: 1 });
  return {
    model,
    async complete({ system, user, schema }) {
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_schema", json_schema: { name: "content_draft", strict: true, schema } },
      });
      const content = res.choices[0]?.message?.content;
      if (!content) throw new Error("empty completion");
      return JSON.parse(content);
    },
  };
}
