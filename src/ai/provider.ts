import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { config } from "../config.ts";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.LLM_API_KEY,
      baseURL: config.LLM_BASE_URL,
    });
  }
  return client;
}

export async function chat(opts: {
  system: string;
  user: string;
  jsonSchema?: { name: string; strict: boolean; schema: Record<string, unknown> };
}): Promise<string> {
  const params: ChatCompletionCreateParamsNonStreaming = {
    model: config.LLM_MODEL,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };

  if (opts.jsonSchema) {
    params.response_format = {
      type: "json_schema",
      json_schema: opts.jsonSchema,
    };
  }

  // kimi-k2.6 requires thinking disabled to return content in the content field
  (params as unknown as Record<string, unknown>).thinking = { type: "disabled" };

  const res = await getClient().chat.completions.create(params);
  const msg = res.choices[0]?.message;
  const text =
    msg?.content ??
    (msg as unknown as Record<string, string>)?.reasoning_content ??
    null;
  if (!text) throw new Error("LLM returned empty response");
  return text;
}

export async function chatWithRetry(
  opts: Parameters<typeof chat>[0],
  attempts = 3
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await chat(opts);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const retryable = status === undefined || status >= 500 || status === 429;
      if (!retryable || i === attempts - 1) throw err;
      const delay = Math.min(2000 * 2 ** i, 10000);
      console.log(`  LLM retry ${i + 1}/${attempts} in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}
